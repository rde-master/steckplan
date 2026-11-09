import { describe, expect, it } from 'vitest';
import type { Cable, DeviceInstance, Template } from '../model/schema';
import { autoAddress, buildDmxPatch, checkDmx, checkWirelessDmx, dmxChain, dmxUniverses, formatDmx, wirelessLinks, type DmxPatchRow } from './dmx';

const T0 = '2026-01-01T00:00:00.000Z';
const dmxPorts = [
  { id: 'in', label: 'DMX In', connector: 'XLR 5', direction: 'in' as const, signal: 'DMX' },
  { id: 'thru', label: 'DMX Thru', connector: 'XLR 5', direction: 'out' as const, signal: 'DMX' },
];
const spot: Template = { id: 'spot', kind: 'device', version: 1, updatedAt: T0, name: 'Spot', ports: dmxPorts, dmxModes: [{ name: '16ch', channels: 16 }, { name: '8ch', channels: 8 }] };
const big: Template = { id: 'big', kind: 'device', version: 1, updatedAt: T0, name: 'LED-Wand', ports: dmxPorts, dmxModes: [{ name: '300ch', channels: 300 }] };
const desk: Template = { id: 'desk', kind: 'device', version: 1, updatedAt: T0, name: 'Lichtpult', ports: [{ id: 'u1', label: 'DMX A', connector: 'XLR 5', direction: 'out', signal: 'DMX' }] };
const snake: Template = { id: 'snake', kind: 'cableType', version: 1, updatedAt: T0, name: 'MC', channels: [{ id: 'c1', label: 'DMX', connectorA: 'XLR 5', connectorB: 'XLR 5', direction: 'aToB', signal: 'DMX' }] };
const templates = new Map([spot, big, desk, snake].map((t) => [t.id, t]));

const dev = (id: string, templateId: string, dmx?: DeviceInstance['dmx']): DeviceInstance => ({ id, templateId, layerId: 'l', label: id, ...(dmx ? { dmx } : {}) });
const cable = (from: string, fromPort: string, to: string, toPort: string): Cable => ({ id: `${from}-${to}`, templateId: 'x', from: { deviceId: from, portId: fromPort }, to: { deviceId: to, portId: toPort }, waypoints: [] });

describe('DMX-Prüfungen', () => {
  it('Überlappung, Ende > 512, fehlende Adresse, unbekannter Modus', () => {
    const issues = checkDmx(
      {
        devices: [
          dev('a', 'spot', { modeName: '16ch', universe: 1, address: 1 }),
          dev('b', 'spot', { modeName: '16ch', universe: 1, address: 10 }),
          dev('c', 'spot', { modeName: '16ch', universe: 2, address: 10 }),
          dev('d', 'big', { modeName: '300ch', universe: 3, address: 300 }),
          dev('e', 'spot'),
          dev('f', 'spot', { modeName: 'gibtsnicht', universe: 1, address: 100 }),
          dev('g', 'desk'),
        ],
      },
      templates,
    );
    expect(issues.map((i) => i.id).sort()).toEqual(['dmx-end:d', 'dmx-missing:e', 'dmx-mode:f', 'dmx-overlap:a:b']);
    expect(issues.find((i) => i.id === 'dmx-end:d')!.message).toContain('300–599');
  });

  it('Formatierung Universum.Adresse', () => expect(formatDmx(1, 7)).toBe('1.007'));
});

describe('DMX-Kette und Auto-Adressierung', () => {
  const devices = [dev('pult', 'desk'), dev('s1', 'spot'), dev('mc', 'snake'), dev('s2', 'spot', { modeName: '8ch', universe: 9, address: 9 }), dev('s3', 'spot'), dev('w', 'big')];
  const cables = [cable('pult', 'u1', 's1', 'in'), cable('s1', 'thru', 'mc', 'c1:a'), cable('mc', 'c1:b', 's2', 'in'), cable('s2', 'thru', 's3', 'in'), cable('s3', 'thru', 'w', 'in')];

  it('folgt den DMX-Kabeln, auch durch Multicore-Adern', () => {
    expect(dmxChain('pult', { devices, cables }, templates)).toEqual(['pult', 's1', 's2', 's3', 'w']);
    expect(dmxChain('s2', { devices, cables }, templates)).toEqual(['s2', 's3', 'w']);
  });

  it('vergibt Adressen der Reihe nach, behält gewählte Modi, springt ins nächste Universum', () => {
    const chain = dmxChain('pult', { devices, cables }, templates);
    const result = autoAddress(chain, { universe: 1, address: 200 }, { devices }, templates);
    expect(result.patches.map((p) => `${p.id}:${p.dmx.modeName}@${formatDmx(p.dmx.universe, p.dmx.address)}`)).toEqual([
      's1:16ch@1.200',
      's2:8ch@1.216',
      's3:16ch@1.224',
      'w:300ch@2.001', // 240 + 300 > 512 → nächstes Universum
    ]);
    expect(result.wrapped).toEqual(['w']);
  });

  it('Patchliste sortiert nach Universum und Adresse', () => {
    const rows = buildDmxPatch({ devices: [dev('b', 'spot', { modeName: '8ch', universe: 2, address: 1 }), dev('a', 'spot', { modeName: '16ch', universe: 1, address: 17 }), dev('x', 'spot')] }, templates);
    expect(rows.map((r) => `${r.id}:${r.end ?? '-'}`)).toEqual(['a:32', 'b:8', 'x:-']);
  });
});

describe('DMX-Universum als Übersicht', () => {
  const row = (id: string, universe: number, address: number, channels: number): DmxPatchRow => ({ id, label: id, templateName: 'T', modeName: 'm', channels, universe, address, end: address + channels - 1 });
  it('Belegung, Überlappungen, freie Bereiche, Überlauf über 512; ohne Adresse nicht dabei', () => {
    const maps = dmxUniverses([
      row('a', 1, 1, 16),
      row('b', 1, 10, 10),
      row('c', 1, 500, 20),
      row('d', 2, 101, 4),
      { id: 'e', label: 'e', templateName: 'T', modeName: '' },
    ]);
    expect(maps.map((m) => m.universe)).toEqual([1, 2]);
    const [u1, u2] = maps;
    expect(u1!.used).toBe(19 + 13);
    expect(u1!.overlaps).toEqual([{ start: 10, end: 16 }]);
    expect(u1!.free).toEqual([{ start: 20, end: 499 }]);
    expect(u1!.segments.find((s) => s.row.id === 'c')).toMatchObject({ start: 500, end: 512, overflow: 7 });
    expect(u2!.free).toEqual([
      { start: 1, end: 100 },
      { start: 105, end: 512 },
    ]);
  });
});

describe('DMX per Funk', () => {
  const tx: Template = { id: 'tx', kind: 'device', version: 1, updatedAt: T0, name: 'Funk-Sender', ports: [{ id: 'in', label: 'DMX In', connector: 'XLR 5', direction: 'in', signal: 'DMX' }], wirelessDmx: { send: true } };
  const rx: Template = { id: 'rx', kind: 'device', version: 1, updatedAt: T0, name: 'Funk-Empfänger', ports: [{ id: 'out', label: 'DMX Out', connector: 'XLR 5', direction: 'out', signal: 'DMX' }], wirelessDmx: { receive: true } };
  const akku: Template = { ...spot, id: 'akku', name: 'Akku-Spot', wirelessDmx: { receive: true } };
  const all = new Map([...templates, [tx.id, tx], [rx.id, rx], [akku.id, akku]]);
  const devices: DeviceInstance[] = [
    dev('pult', 'desk'),
    { ...dev('sender', 'tx'), wirelessDmx: { universe: 2 } },
    { ...dev('box', 'rx'), wirelessDmx: { fromId: 'sender' } },
    dev('s1', 'spot', { modeName: '16ch', universe: 2, address: 1 }),
    { ...dev('a1', 'akku', { modeName: '8ch', universe: 2, address: 17 }), wirelessDmx: { fromId: 'sender' } },
    { ...dev('a2', 'akku', { modeName: '8ch', universe: 3, address: 1 }), wirelessDmx: { fromId: 'sender' } },
    { ...dev('a3', 'akku', { modeName: '8ch', universe: 2, address: 30 }), wirelessDmx: { fromId: 'weg' } },
    dev('box2', 'rx'),
    dev('sender2', 'tx'),
  ];
  const cables = [cable('pult', 'u1', 'sender', 'in'), cable('box', 'out', 's1', 'in')];

  it('Strecken Sender → Empfänger mit dem gesendeten Universum', () => {
    expect(wirelessLinks({ devices }, all)).toEqual([
      { senderId: 'sender', receiverId: 'box', universe: 2 },
      { senderId: 'sender', receiverId: 'a1', universe: 2 },
      { senderId: 'sender', receiverId: 'a2', universe: 2 },
    ]);
  });
  it('Kette läuft über die Funkstrecke weiter (auch zu Scheinwerfern mit eingebautem Empfänger)', () => {
    expect(dmxChain('pult', { devices, cables }, all)).toEqual(['pult', 'sender', 'box', 's1', 'a1', 'a2']);
  });
  it('Prüfungen: Sender ohne Universum, Empfänger ohne/mit fehlendem Sender, falsches Universum', () => {
    expect(checkWirelessDmx({ devices }, all).map((i) => i.id).sort()).toEqual(['wdmx-mismatch:a2', 'wdmx-nosender:box2', 'wdmx-sender:a3', 'wdmx-universe:sender2']);
  });
});
