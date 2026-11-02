import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import type { Cable, DeviceInstance, Project, Template } from '../model/schema';
import { createYDocFromProject, readProjectFromYDoc } from '../model/ydoc';
import { createEmptyLibrary } from '../library/library';
import { listCsv } from '../logistics/exports';
import { buildPatchLists, checkNetworkChannels, entryForPort, setPortChannel, mixerNetworkRows, stageboxInputInfo, networkRoutes, patchId, readPatch, stageboxChannelLabels, updatePatchEntry, validAssignments, viaText } from './patch';

const T0 = '2026-01-01T00:00:00.000Z';
const t = (x: Partial<Template> & Pick<Template, 'id' | 'kind' | 'name'>): Template => ({ version: 1, updatedAt: T0, ...x });
const audio = (id: string, label: string, direction: 'in' | 'out') => ({ id, label, connector: 'XLR 3', direction, signal: 'Audio' });
const templates = [
  t({ id: 'kondensator', kind: 'device', name: 'Kondensatormikro', phantomPower: true, ports: [audio('out', 'Out', 'out')] }),
  t({ id: 'dyn', kind: 'device', name: 'SM58', ports: [audio('out', 'Out', 'out')] }),
  t({ id: 'iem', kind: 'device', name: 'In-Ear-Sender', usedByPerson: true, ports: [audio('in', 'In', 'in')] }),
  t({ id: 'stand', kind: 'stand', name: 'Galgenstativ' }),
  t({
    id: 'mc',
    kind: 'cableType',
    name: 'Multicore 8/4',
    endALabel: 'Bühne',
    endBLabel: 'FOH',
    channels: [
      { id: 's1', label: 'Send 1', connectorA: 'XLR', connectorB: 'XLR', direction: 'aToB', signal: 'Audio' },
      { id: 's2', label: 'Send 2', connectorA: 'XLR', connectorB: 'XLR', direction: 'aToB', signal: 'Audio' },
      { id: 'r1', label: 'Return 1', connectorA: 'XLR', connectorB: 'XLR', direction: 'bToA', signal: 'Audio' },
    ],
  }),
  t({
    id: 'pult',
    kind: 'device',
    name: 'Mischpult',
    mixer: true,
    ports: [audio('in1', 'In 1', 'in'), audio('in2', 'In 2', 'in'), audio('in3', 'In 3', 'in'), audio('out1', 'Aux 1', 'out'), { id: 'eth', label: 'Netz', connector: 'RJ45', direction: 'bi', signal: 'Ethernet', isNetwork: true }],
  }),
];

const dev = (id: string, templateId: string, extra: Partial<DeviceInstance> = {}): DeviceInstance => ({ id, templateId, layerId: 'l', label: id, ...extra });
const cable = (id: string, from: [string, string], to: [string, string], extra: Partial<Cable> = {}): Cable => ({
  id,
  templateId: 'xlr',
  from: { deviceId: from[0], portId: from[1] },
  to: { deviceId: to[0], portId: to[1] },
  waypoints: [],
  ...extra,
});

function project(extra: Partial<Project> = {}): Project {
  return {
    ...createEmptyProject({ name: 'Patch' }),
    people: [{ id: 'anna', lastName: 'Muster', firstName: 'Anna', kind: 'Sängerin' }],
    devices: [
      dev('Gesang', 'kondensator', { mountedOnId: 'St1' }),
      dev('St1', 'stand'),
      dev('Snare', 'dyn'),
      dev('MC 1', 'mc'),
      dev('FOH', 'pult'),
      dev('IEM Anna', 'iem', { personId: 'anna' }),
    ],
    cables: [
      cable('c1', ['Gesang', 'out'], ['MC 1', 's1:a']),
      cable('c2', ['MC 1', 's1:b'], ['FOH', 'in1'], { direct: true, templateId: undefined }),
      // falsch herum gezeichnet: wird trotzdem verfolgt
      cable('c3', ['FOH', 'in2'], ['Snare', 'out']),
      cable('c4', ['FOH', 'out1'], ['MC 1', 'r1:b']),
      cable('c5', ['MC 1', 'r1:a'], ['IEM Anna', 'in']),
    ],
    ...extra,
  };
}

describe('Ton-Patch: Input- und Output-Liste', () => {
  it('verfolgt die Kette über Multicore-Adern bis zur Quelle bzw. zum Ziel', () => {
    const [list] = buildPatchLists(project(), { templates });
    expect(list!.mixer.id).toBe('FOH');
    expect(list!.inputs.map((r) => [r.channel, r.port, r.device?.id ?? null, viaText(r)])).toEqual([
      [1, 'In 1', 'Gesang', 'MC 1 · Send 1 (Bühne) → FOH · In 1'],
      [2, 'In 2', 'Snare', 'FOH · In 2'],
      [3, 'In 3', null, ''],
    ]);
    // Netzwerk-Anschlüsse gehören nicht dazu
    expect(list!.outputs.map((r) => [r.port, r.device?.id, r.person, viaText(r)])).toEqual([['Aux 1', 'IEM Anna', 'Anna Muster', 'FOH · Aux 1 → MC 1 · Return 1 (Bühne)']]);
  });

  it('Vorschläge: Name mit Person, 48 V aus der Vorlage, Stativ vom Träger; Angaben überschreiben', () => {
    const [list] = buildPatchLists(project(), { templates });
    expect(list!.inputs[0]).toMatchObject({ name: 'Gesang', phantom: true, stand: 'Galgenstativ', edited: { name: false, phantom: false, stand: false } });
    expect(list!.outputs[0]!.name).toBe('IEM Anna (Anna Muster)');
    const edited = buildPatchLists(project({ patch: [{ id: patchId('FOH', 'in1'), name: 'Lead Vox', phantom: false, notes: 'Pop-Schutz' }] }), { templates })[0]!;
    expect(edited.inputs[0]).toMatchObject({ name: 'Lead Vox', phantom: false, stand: 'Galgenstativ', notes: 'Pop-Schutz', edited: { name: true, phantom: true, stand: false } });
  });

  it('CSV mit Ein- und Ausgängen', () => {
    const csv = listCsv('patch', project(), { ...createEmptyLibrary('l'), templates });
    expect(csv).toContain('FOH;Eingang;1;In 1;Gesang;Gesang · Out;Kondensatormikro;;MC 1 · Send 1 (Bühne) → FOH · In 1;ja;');
    expect(csv).toContain('FOH;Eingang;3;In 3;;offen;');
    expect(csv).toContain('FOH;Ausgang;1;Aux 1;IEM Anna (Anna Muster);IEM Anna · In;In-Ear-Sender;Anna Muster;FOH · Aux 1 → MC 1 · Return 1 (Bühne);;');
  });

  it('ohne Mischpult keine Liste; Kreise führen nicht in eine Endlosschleife', () => {
    expect(buildPatchLists({ devices: [dev('Snare', 'dyn')], cables: [] }, { templates })).toEqual([]);
    const loop = project({ cables: [cable('a', ['FOH', 'in1'], ['MC 1', 's1:b']), cable('b', ['MC 1', 's1:a'], ['MC 1', 's2:b']), cable('c', ['MC 1', 's2:a'], ['MC 1', 's1:a'])] });
    expect(() => buildPatchLists(loop, { templates })).not.toThrow();
  });

  it('Angaben im Live-Dokument setzen und wieder entfernen', () => {
    const doc = createYDocFromProject(project());
    updatePatchEntry(doc, patchId('FOH', 'in1'), { name: 'Lead Vox', stand: 'klein' }, null);
    expect(readPatch(doc)).toEqual([{ id: 'FOH:in1', name: 'Lead Vox', stand: 'klein' }]);
    updatePatchEntry(doc, patchId('FOH', 'in1'), { stand: undefined }, null);
    expect(readPatch(doc)).toEqual([{ id: 'FOH:in1', name: 'Lead Vox' }]);
    updatePatchEntry(doc, patchId('FOH', 'in1'), { name: undefined }, null);
    expect(readPatch(doc)).toEqual([]);
    expect(readProjectFromYDoc(doc).ok).toBe(true);
  });
});

describe('Netzwerk-Kanäle (digitale Stagebox)', () => {
  const net = (id: string) => ({ id, label: 'Netz', connector: 'RJ45', direction: 'bi' as const, signal: 'Dante', isNetwork: true });
  const tpl = [
    ...templates,
    t({ id: 'dstage', kind: 'device', name: 'Digitale Stagebox', ports: [audio('i1', 'In 1', 'in'), audio('i2', 'In 2', 'in'), net('n')] }),
    t({ id: 'dpult', kind: 'device', name: 'Digitalpult', mixer: true, networkChannels: 32, ports: [net('n'), audio('l1', 'Local 1', 'in')] }),
  ];
  const base = (extra: Partial<Project> = {}) =>
    project({
      devices: [dev('Gesang', 'kondensator'), dev('Snare', 'dyn'), dev('Box', 'dstage'), dev('DFOH', 'dpult'), dev('St1', 'stand')],
      cables: [cable('a', ['Gesang', 'out'], ['Box', 'i1']), cable('b', ['Box', 'i2'], ['Snare', 'out']), cable('n', ['Box', 'n'], ['DFOH', 'n'])],
      ...extra,
    });

  it('Kette Quelle → Stagebox → Netzwerkkabel → Pult wird erkannt; ohne Netzwerkkabel keine Zuordnung möglich', () => {
    const p = base();
    const routes = networkRoutes(p.devices[0]!, p, { templates: tpl });
    expect(routes.map((r) => [r.mixer.id, r.stagebox.id, r.stageboxPort, r.sourcePort])).toEqual([['DFOH', 'Box', 'In 1', 'Out']]);
    expect(routes[0]).toMatchObject({ analogVia: [], networkVia: [] });
    const noNet = base({ cables: base().cables.filter((c) => c.id !== 'n') });
    expect(networkRoutes(noNet.devices[0]!, noNet, { templates: tpl })).toEqual([]);
  });

  it('Zuordnung erscheint als Netzwerk-Kanal in der Input-Liste und an der Stagebox', () => {
    const p = base({ devices: base().devices.map((d) => (d.id === 'Gesang' ? { ...d, mixerChannels: [{ mixerId: 'DFOH', channel: 12 }] } : d)) });
    const list = buildPatchLists(p, { templates: tpl }).find((l) => l.mixer.id === 'DFOH')!;
    expect(list.network).toHaveLength(32);
    expect(list.network[11]).toMatchObject({ channel: 12, port: 'Netz 12', name: 'Gesang', phantom: true, devicePort: 'Out' });
    expect(viaText(list.network[11]!)).toBe('Box · In 1 / Netz → DFOH · Netz');
    expect(list.network[0]!.device).toBeUndefined();
    expect(list.inputs.map((r) => r.port)).toEqual(['Local 1']);
    expect([...stageboxChannelLabels(p, { templates: tpl })]).toEqual([['Box/i1', 'DFOH 12']]);
    expect(checkNetworkChannels(p, { templates: tpl })).toEqual([]);
  });

  it('Prüfungen: Kette unterbrochen, Kanal fehlt, Kanal doppelt; Anzahl je Pult änderbar', () => {
    const assigned = base({
      devices: base().devices.map((d) =>
        d.id === 'Gesang' ? { ...d, mixerChannels: [{ mixerId: 'DFOH', channel: 5 }] } : d.id === 'Snare' ? { ...d, mixerChannels: [{ mixerId: 'DFOH', channel: 5 }] } : d.id === 'DFOH' ? { ...d, networkChannels: 8 } : d,
      ),
    });
    expect(checkNetworkChannels(assigned, { templates: tpl }).map((i) => i.message)).toEqual(['DFOH Kanal 5 ist doppelt belegt (Gesang, Snare).']);
    expect(buildPatchLists(assigned, { templates: tpl }).find((l) => l.mixer.id === 'DFOH')!.network).toHaveLength(8);
    const broken = { ...assigned, cables: assigned.cables.filter((c) => c.id !== 'n') };
    expect(checkNetworkChannels(broken, { templates: tpl }).map((i) => i.message)).toContain('Gesang: Kanal 5 auf DFOH – keine durchgehende Kette (Quelle → Stagebox → Netzwerk → Pult).');
    expect(validAssignments(broken, { templates: tpl })).toEqual([]);
    const outOfRange = { ...assigned, devices: assigned.devices.map((d) => (d.id === 'Gesang' ? { ...d, mixerChannels: [{ mixerId: 'DFOH', channel: 20 }] } : d)) };
    expect(checkNetworkChannels(outOfRange, { templates: tpl }).map((i) => i.message)).toContain('Gesang: DFOH hat keinen Kanal 20.');
  });
});

describe('Netzwerk-Kanäle: Kette mit Multicore davor und zweiter Stagebox dazwischen', () => {
  const net = (id: string) => ({ id, label: id, connector: 'RJ45', direction: 'bi' as const, signal: 'Dante', isNetwork: true });
  const tpl = [
    ...templates,
    t({ id: 'sb1', kind: 'device', name: 'Stagebox Bühne', ports: [audio('i5', 'In 5', 'in'), net('n1'), net('n2')] }),
    t({ id: 'sb2', kind: 'device', name: 'Stagebox FOH', ports: [net('a'), net('b')] }),
    t({ id: 'dp', kind: 'device', name: 'Digitalpult', mixer: true, networkChannels: 48, ports: [net('n')] }),
  ];
  // Mikro → Multicore Ader 1 (Bühne → FOH) → Stagebox 1 In 5 → Netzwerk → Stagebox 2 → Netzwerk → Pult
  const p = (extra: Partial<Project> = {}) =>
    project({
      devices: [dev('Mikro', 'kondensator', { mixerChannels: [{ mixerId: 'Pult', channel: 12 }] }), dev('MC', 'mc'), dev('SB1', 'sb1'), dev('SB2', 'sb2'), dev('Pult', 'dp')],
      cables: [
        cable('a', ['Mikro', 'out'], ['MC', 's1:a']),
        cable('b', ['MC', 's1:b'], ['SB1', 'i5']),
        cable('c', ['SB1', 'n1'], ['SB2', 'a']),
        cable('d', ['SB2', 'b'], ['Pult', 'n']),
      ],
      ...extra,
    });

  it('wird erkannt; Input-Liste zeigt den ganzen Weg; Anzeige an Stagebox 1', () => {
    const project1 = p();
    const routes = networkRoutes(project1.devices[0]!, project1, { templates: tpl });
    expect(routes).toHaveLength(1);
    expect(routes[0]!.networkVia.map((d) => d.id)).toEqual(['SB2']);
    const list = buildPatchLists(project1, { templates: tpl }).find((l) => l.mixer.id === 'Pult')!;
    expect(viaText(list.network[11]!)).toBe('MC · Send 1 (FOH) → SB1 · In 5 / n1 → SB2 · a / b → Pult · n');
    expect([...stageboxChannelLabels(project1, { templates: tpl })]).toEqual([['SB1/i5', 'Pult 12']]);
    // Anzeige: an der Stagebox Quelle mit Person und Kanal (ein Pult → nur Nummer), am Pult die belegten Kanäle
    const withPerson = { ...project1, devices: project1.devices.map((d) => (d.id === 'Mikro' ? { ...d, usedByPerson: true, personId: 'anna' } : d)) };
    expect([...stageboxInputInfo(withPerson, { templates: tpl })]).toEqual([['SB1/i5', { source: 'Mikro (Anna Muster)', channel: '12' }]]);
    expect(mixerNetworkRows(withPerson, { templates: tpl }).get('Pult')).toEqual([{ channel: 12, name: 'Mikro (Anna Muster)', source: 'Mikro', stagebox: 'SB1', stageboxPort: 'In 5' }]);
    expect(checkNetworkChannels(project1, { templates: tpl })).toEqual([]);
  });

  it('Unterbrechung irgendwo in der Kette → keine Zuordnung, Warnung', () => {
    for (const missing of ['a', 'b', 'c', 'd']) {
      const broken = p({ cables: p().cables.filter((c) => c.id !== missing) });
      expect(networkRoutes(broken.devices[0]!, broken, { templates: tpl })).toEqual([]);
      expect(checkNetworkChannels(broken, { templates: tpl }).some((i) => i.id.startsWith('netchannel-chain:Mikro:'))).toBe(true);
    }
  });
});

describe('Netzwerk-Kanäle: je Ausgang ein Pult-Kanal', () => {
  const net = (id: string) => ({ id, label: id, connector: 'RJ45', direction: 'bi' as const, signal: 'Dante', isNetwork: true });
  const tpl = [
    ...templates,
    t({ id: 'kb', kind: 'device', name: 'Keyboard', ports: [audio('l', 'L', 'out'), audio('r', 'R', 'out')] }),
    t({ id: 'sb', kind: 'device', name: 'Stagebox', ports: [audio('i1', 'In 1', 'in'), audio('i2', 'In 2', 'in'), net('n')] }),
    t({ id: 'dp', kind: 'device', name: 'Digitalpult', mixer: true, networkChannels: 16, ports: [net('n')] }),
  ];
  const p = (mixerChannels?: NonNullable<Project['devices'][number]['mixerChannels']>) =>
    project({
      devices: [dev('Keys', 'kb', mixerChannels ? { mixerChannels } : {}), dev('SB', 'sb'), dev('Pult', 'dp')],
      cables: [cable('l', ['Keys', 'l'], ['SB', 'i1']), cable('r', ['Keys', 'r'], ['SB', 'i2']), cable('n', ['SB', 'n'], ['Pult', 'n'])],
    });
  const lib = { templates: tpl };

  it('jeder Ausgang hat eine eigene Kette und einen eigenen Kanal', () => {
    const project1 = p([
      { portId: 'l', mixerId: 'Pult', channel: 3 },
      { portId: 'r', mixerId: 'Pult', channel: 4 },
    ]);
    expect(networkRoutes(project1.devices[0]!, project1, lib).map((r) => [r.sourcePortId, r.stageboxPort])).toEqual([
      ['l', 'In 1'],
      ['r', 'In 2'],
    ]);
    const list = buildPatchLists(project1, lib)[0]!;
    expect(list.network.slice(2, 4).map((r) => [r.name, r.devicePort, viaText(r)])).toEqual([
      ['Keys · L', 'L', 'SB · In 1 / n → Pult · n'],
      ['Keys · R', 'R', 'SB · In 2 / n → Pult · n'],
    ]);
    expect([...stageboxInputInfo(project1, lib)]).toEqual([
      ['SB/i1', { source: 'Keys · L', channel: '3' }],
      ['SB/i2', { source: 'Keys · R', channel: '4' }],
    ]);
    expect(checkNetworkChannels(project1, lib)).toEqual([]);
  });

  it('ohne Ausgang (aus Format 5) gilt der erste Ausgang mit Kette; Setzen legt den Ausgang fest', () => {
    const legacy = p([{ mixerId: 'Pult', channel: 7 }]);
    const routes = networkRoutes(legacy.devices[0]!, legacy, lib);
    const entries = legacy.devices[0]!.mixerChannels!;
    expect(entryForPort(routes, entries, 'l')).toEqual({ mixerId: 'Pult', channel: 7 });
    expect(entryForPort(routes, entries, 'r')).toBeUndefined();
    expect(setPortChannel(routes, entries, 'r', { mixerId: 'Pult', channel: 8 })).toEqual([
      { portId: 'l', mixerId: 'Pult', channel: 7 },
      { portId: 'r', mixerId: 'Pult', channel: 8 },
    ]);
    expect(setPortChannel(routes, [{ portId: 'l', mixerId: 'Pult', channel: 7 }], 'l', undefined)).toBeUndefined();
  });

  it('Kette eines Ausgangs unterbrochen → Warnung mit Anschluss', () => {
    const project1 = p([{ portId: 'r', mixerId: 'Pult', channel: 4 }]);
    const broken = { ...project1, cables: project1.cables.filter((c) => c.id !== 'r') };
    expect(checkNetworkChannels(broken, lib).map((i) => i.message)).toEqual(['Keys · R: Kanal 4 auf Pult – keine durchgehende Kette (Quelle → Stagebox → Netzwerk → Pult).']);
  });
});
