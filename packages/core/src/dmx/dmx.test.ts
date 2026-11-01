import { describe, expect, it } from 'vitest';
import type { Cable, DeviceInstance, Template } from '../model/schema';
import { autoAddress, buildDmxPatch, checkDmx, dmxChain, formatDmx } from './dmx';

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
