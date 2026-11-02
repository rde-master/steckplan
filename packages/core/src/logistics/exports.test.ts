import { describe, expect, it } from 'vitest';
import { createEmptyLibrary, type Library } from '../library/library';
import { createEmptyProject } from '../model/project';
import type { Project, Template } from '../model/schema';
import { buildBom, buildDeviceList, dmxCsv, listCsv, toCsv } from './exports';
import { packItems } from './lists';

const T0 = '2026-01-01T00:00:00.000Z';
const t = (x: Partial<Template> & Pick<Template, 'id' | 'kind' | 'name'>): Template => ({ version: 1, updatedAt: T0, ...x });

const library: Library = {
  ...createEmptyLibrary('l'),
  templates: [
    t({ id: 'spot', kind: 'device', name: 'Spot', categoryId: 'licht', dmxModes: [{ name: '16ch', channels: 16 }], ports: [{ id: 'eth', label: 'Netz', connector: 'RJ45', direction: 'bi', signal: 'Ethernet', isNetwork: true }] }),
    t({ id: 'stand', kind: 'stand', name: 'Stativ', shape: { form: 'circle', widthMm: 1000, depthMm: 1000, heightMm: 2500 } }),
    t({ id: 'xlr', kind: 'cableType', name: 'XLR', availableLengthsMm: [5000, 10000] }),
  ],
  masterData: { categories: [{ id: 'licht', name: 'Licht' }], owners: [{ id: 'r', name: 'Ralf; Verleih' }], trailers: [], cases: [] },
};

function project(): Pick<Project, 'devices' | 'cables' | 'settings' | 'network'> {
  const base = createEmptyProject({ name: 'P' });
  return {
    settings: { ...base.settings, defaultReservePercent: 0, defaultReservePerEndMm: 0 },
    network: { subnets: [], wifi: [] },
    devices: [
      { id: 's', templateId: 'stand', layerId: 'l', label: 'Stativ 1', stagePlan: { position: { x: 0, y: 0 }, rotationDeg: 0 } },
      { id: 'a', templateId: 'spot', layerId: 'l', label: 'Spot 1', ownerId: 'r', mountedOnId: 's', stagePlan: { position: { x: 0, y: 0 }, rotationDeg: 0 }, dmx: { modeName: '16ch', universe: 1, address: 1 }, network: [{ portId: 'eth', mode: 'static', ip: '10.0.0.5' }] },
      { id: 'b', templateId: 'spot', layerId: 'l', label: 'Spot 2', stagePlan: { position: { x: 4000, y: 0 }, rotationDeg: 0 }, check: { out: { at: T0, by: 'A', status: 'missing', note: 'nicht da' } } },
    ],
    cables: [
      { id: 'c1', templateId: 'xlr', from: { deviceId: 'a', portId: 'eth' }, to: { deviceId: 'b', portId: 'eth' }, waypoints: [] },
      { id: 'c2', templateId: 'xlr', from: { deviceId: 'a', portId: 'eth' }, to: { deviceId: 'b', portId: 'eth' }, waypoints: [] },
    ],
  };
}

describe('Stückliste und Geräteliste', () => {
  it('Stückliste zählt je Vorlage und Länge', () => {
    const rows = buildBom(packItems(project(), library), library);
    const summary = rows.map((r) => `${r.count}× ${r.name}${r.lengthMm ? ` ${r.lengthMm / 1000} m` : ''} (${r.kind})`);
    // sortiert nach Art, dann Name; Besitzer spielt keine Rolle
    expect(summary).toEqual(['2× Spot (Gerät)', '2× XLR 10 m (Kabel)', '1× Stativ (Stativ)']);
    expect(rows[0]!.category).toBe('Licht');
  });

  it('Geräteliste mit Träger, Höhe, DMX und IP', () => {
    const rows = buildDeviceList(project(), library);
    const spot = rows.find((r) => r.label === 'Spot 1')!;
    expect(spot).toMatchObject({ template: 'Spot', category: 'Licht', owner: 'Ralf; Verleih', carrier: 'Stativ 1', height: '2,50 m', dmx: '1.001 (16ch)', ip: '10.0.0.5' });
  });
});

describe('CSV', () => {
  it('für deutsches Excel: BOM, Semikolon, Anführungszeichen, CRLF', () => {
    const csv = toCsv(['A', 'B'], [['x;y', 'sagt "hallo"'], ['zeile\numbruch', 3]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿A;B\r\n"x;y";"sagt ""hallo"""\r\n"zeile\numbruch";3\r\n');
  });

  it('Listen als CSV', () => {
    const p = project();
    expect(listCsv('cables', p, library).split('\r\n')[1]).toContain('XLR;;Spot 1 · Netz;Spot 2 · Netz;4,00;2,50;0,00;6,50;10 m;;;'); // Höhe: Spot 1 hängt auf 2,50 m
    const packing = listCsv('packing', p, library);
    expect(packing).toContain('Spot 2;Spot;;Licht;;;;;;;fehlt;;nicht da');
    expect(packing).toContain('"Ralf; Verleih"');
    expect(listCsv('bom', p, library)).toContain('2;XLR;Kabel;10 m;');
    expect(listCsv('devices', p, library)).toContain('Spot 1;Spot;Gerät;Licht;"Ralf; Verleih";;;;;;Stativ 1;2,50 m;1.001 (16ch);10.0.0.5');
    expect(listCsv('network', p, library)).toContain('Spot 1;Netz;10.0.0.5;;');
    expect(dmxCsv([{ universe: 1, address: 1, end: 16, label: 'Spot 1', templateName: 'Spot', modeName: '16ch', channels: 16 }])).toContain('1;1;16;Spot 1;Spot;16ch;16;');
  });
});
