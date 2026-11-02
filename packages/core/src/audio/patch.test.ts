import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import type { Cable, DeviceInstance, Project, Template } from '../model/schema';
import { createYDocFromProject, readProjectFromYDoc } from '../model/ydoc';
import { createEmptyLibrary } from '../library/library';
import { listCsv } from '../logistics/exports';
import { buildPatchLists, patchId, readPatch, updatePatchEntry, viaText } from './patch';

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
      [1, 'In 1', 'Gesang', 'MC 1 · Send 1 (Bühne)'],
      [2, 'In 2', 'Snare', ''],
      [3, 'In 3', null, ''],
    ]);
    // Netzwerk-Anschlüsse gehören nicht dazu
    expect(list!.outputs.map((r) => [r.port, r.device?.id, r.person, viaText(r)])).toEqual([['Aux 1', 'IEM Anna', 'Anna Muster', 'MC 1 · Return 1 (Bühne)']]);
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
    expect(csv).toContain('FOH;Eingang;1;In 1;Gesang;Gesang · Out;Kondensatormikro;;MC 1 · Send 1 (Bühne);ja;Galgenstativ;');
    expect(csv).toContain('FOH;Eingang;3;In 3;;offen;');
    expect(csv).toContain('FOH;Ausgang;1;Aux 1;IEM Anna (Anna Muster);IEM Anna · In;In-Ear-Sender;Anna Muster;MC 1 · Return 1 (Bühne);;;');
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
