import { describe, expect, it } from 'vitest';
import { createEmptyLibrary, type Library } from '../library/library';
import { createEmptyProject } from '../model/project';
import type { Cable, DeviceInstance, Project, Template } from '../model/schema';
import { createYDocFromProject, readProjectFromYDoc } from '../model/ydoc';
import { checkLogistics } from './checks';
import { copyAsNewProject, resetChecks, setCheck } from './doc-ops';
import { cableMatches, deviceMatches, EMPTY_FILTER, isFilterActive } from './filters';
import { formatCableLength, formatMeters } from './format';
import { chooseLength, computeCableLength, computeMulticoreLength, lengthContext } from './length';
import { aggregationKey, buildCableList, buildPackingList, nextUnchecked, packItems } from './lists';

const T0 = '2026-01-01T00:00:00.000Z';
const t = (x: Partial<Template> & Pick<Template, 'id' | 'kind' | 'name'>): Template => ({ version: 1, updatedAt: T0, ...x });
const spot = t({ id: 'spot', kind: 'device', name: 'Spot', categoryId: 'licht', ports: [{ id: 'out', label: 'Out', connector: 'XLR 3', direction: 'out', signal: 'DMX' }, { id: 'in', label: 'In', connector: 'XLR 3', direction: 'in', signal: 'DMX' }] });
const stand = t({ id: 'stand', kind: 'stand', name: 'Stativ', shape: { form: 'circle', widthMm: 1200, depthMm: 1200, heightMm: 3000 } });
const xlr = t({ id: 'xlr', kind: 'cableType', name: 'XLR', connectorA: 'XLR 3', connectorB: 'XLR 3', availableLengthsMm: [5000, 10000, 20000], maxLengthMm: 20000 });
const free = t({ id: 'free', kind: 'cableType', name: 'Frei' });
const snake = t({ id: 'snake', kind: 'cableType', name: 'Multicore', channels: [{ id: 's1', label: 'S1', connectorA: 'XLR', connectorB: 'XLR', direction: 'aToB', signal: 'A' }], availableLengthsMm: [30000, 50000] });
const templates = [spot, stand, xlr, free, snake];

function dev(id: string, templateId: string, pos?: { x: number; y: number }, extra: Partial<DeviceInstance> = {}): DeviceInstance {
  return { id, templateId, layerId: 'l', label: id, ...(pos ? { stagePlan: { position: pos, rotationDeg: 0 } } : {}), ...extra };
}

function cable(id: string, from: string, fromPort: string, to: string, toPort: string, extra: Partial<Cable> = {}): Cable {
  return { id, templateId: 'xlr', from: { deviceId: from, portId: fromPort }, to: { deviceId: to, portId: toPort }, waypoints: [], ...extra };
}

const settings = { defaultReservePercent: 10, defaultReservePerEndMm: 500 };

describe('Kabellänge (PLAN 7.1)', () => {
  const devices = [dev('s', 'stand', { x: 0, y: 0 }, { stagePlan: { position: { x: 0, y: 0 }, rotationDeg: 0, heightMm: 3000 } }), dev('a', 'spot', { x: 0, y: 0 }, { mountedOnId: 's' }), dev('b', 'spot', { x: 4000, y: 3000 }), dev('u', 'spot')];
  const ctx = lengthContext(devices, templates, settings);

  it('Planlänge + Höhe (zum Boden und wieder hoch) + Reserve, gerundet auf verfügbare Länge', () => {
    // Plan 5 m, Höhe 3 m + 0 m, Reserve 0,5 m + 2 × 0,5 m = 1,5 m → 9,5 m → 10 m
    expect(computeCableLength(cable('c', 'a', 'out', 'b', 'in'), ctx)).toEqual({
      status: 'computed',
      planMm: 5000,
      heightMm: 3000,
      reserveMm: 1500,
      totalMm: 9500,
      chosenMm: 10000,
      needsExtension: false,
      exceedsMax: false,
    });
  });

  it('Knickpunkte verlängern die Planlänge, Höhenregel „direkt“', () => {
    const r = computeCableLength(cable('c', 'a', 'out', 'b', 'in', { waypoints: [{ x: 0, y: 3000 }], heightRule: 'direct', reservePercent: 0, reservePerEndMm: 0 }), ctx);
    expect(r).toMatchObject({ planMm: 7000, heightMm: 3000, reserveMm: 0, totalMm: 10000, chosenMm: 10000 });
  });

  it('ohne konfigurierte Längen auf ganze Meter aufrunden', () => {
    expect(chooseLength(9200, free)).toEqual({ chosenMm: 10000, needsExtension: false, exceedsMax: false });
    expect(chooseLength(200, free).chosenMm).toBe(1000);
  });

  it('keine verfügbare Länge reicht → Verlängerung nötig', () => {
    expect(chooseLength(25000, xlr)).toEqual({ chosenMm: null, needsExtension: true, exceedsMax: true });
  });

  it('nicht platziert → offen; manuell → feste Länge; direkt gesteckt → keine Länge', () => {
    expect(computeCableLength(cable('c', 'u', 'out', 'b', 'in'), ctx).status).toBe('open');
    expect(computeCableLength(cable('c', 'u', 'out', 'b', 'in', { manualLengthMm: 15000 }), ctx)).toMatchObject({ status: 'manual', chosenMm: 15000 });
    expect(computeCableLength(cable('c', 'a', 'out', 'b', 'in', { direct: true }), ctx).status).toBe('direct');
  });

  it('Multicore: Länge aus Ende A, Knickpunkten und Ende B; Adern-Kabel messen bis zum Ende', () => {
    const mc = dev('m', 'snake', undefined, { stagePlan: { position: { x: 0, y: 0 }, rotationDeg: 0, endB: { x: 20000, y: 0 }, waypoints: [{ x: 10000, y: 5000 }] } });
    const r = computeMulticoreLength(mc, snake, settings);
    expect(r.planMm).toBe(Math.round(2 * Math.hypot(10000, 5000)));
    expect(r.chosenMm).toBe(30000);
    expect(computeMulticoreLength(dev('x', 'snake', { x: 0, y: 0 }), snake, settings).status).toBe('open');
    const ctx2 = lengthContext([...devices, mc], templates, settings);
    const toEndB = computeCableLength(cable('c', 'm', 's1:b', 'b', 'in', { reservePercent: 0, reservePerEndMm: 0 }), ctx2);
    expect(toEndB.planMm).toBe(Math.round(Math.hypot(16000, 3000)));
    expect(toEndB.heightMm).toBe(0);
  });
});

describe('Listen', () => {
  const library: Library = {
    ...createEmptyLibrary('l'),
    templates,
    masterData: { categories: [{ id: 'licht', name: 'Licht', color: '#f59e0b' }], owners: [{ id: 'ralf', name: 'Ralf' }], trailers: [{ id: 'a1', name: 'Anhänger 1' }] },
  };
  const base = createEmptyProject({ name: 'P' });
  const project: Pick<Project, 'devices' | 'cables' | 'settings'> = {
    settings: { ...base.settings, defaultReservePercent: 0, defaultReservePerEndMm: 0 },
    devices: [dev('d1', 'spot', { x: 0, y: 0 }, { ownerId: 'ralf' }), dev('d2', 'spot', { x: 4000, y: 0 }, { ownerId: 'ralf' }), dev('d3', 'spot', { x: 8000, y: 0 })],
    cables: [
      cable('c1', 'd1', 'out', 'd2', 'in', { ownerId: 'ralf', trailerId: 'a1', check: { out: { at: T0, by: 'Anna', status: 'ok' } } }),
      cable('c2', 'd2', 'out', 'd3', 'in', { ownerId: 'ralf', trailerId: 'a1', check: { in: { at: T0, by: 'Anna', status: 'damaged', note: 'Stecker locker' } } }),
      cable('c3', 'd1', 'out', 'd3', 'in', { direct: true }),
    ],
  };

  it('Kabelliste ohne direkt gesteckte Verbindungen', () => {
    const rows = buildCableList(project, library);
    expect(rows.map((r) => r.id)).toEqual(['c1', 'c2']);
    expect(rows[0]).toMatchObject({ typeName: 'XLR', from: 'd1 · Out', to: 'd2 · In', length: { chosenMm: 5000 } });
  });

  it('Packliste zusammengefasst: gleiche Vorlage, Länge, Besitzer, Anhänger → eine Zeile mit Zähler', () => {
    const items = packItems(project, library);
    expect(items).toHaveLength(5);
    const list = buildPackingList(items, library, { groupBy: ['category'], mode: 'aggregated' });
    expect(list.groups.map((g) => g.label)).toEqual(['Licht', 'ohne Kategorie']);
    const licht = list.groups[0]!;
    // d1+d2 (Besitzer Ralf) und d3 (kein Besitzer) sind getrennt
    expect(licht.rows.map((r) => r.items.length)).toEqual([2, 1]);
    const cables = list.groups[1]!.rows;
    expect(cables).toHaveLength(1);
    expect(cables[0]).toMatchObject({ name: 'XLR', lengthMm: 5000, checkedOut: 1, checkedIn: 1 });
    expect(nextUnchecked(cables[0]!, 'out')?.id).toBe('c2');
    expect(list.problems).toEqual([expect.objectContaining({ direction: 'in', mark: expect.objectContaining({ status: 'damaged' }) })]);
  });

  it('einzeln und verschachtelt gruppiert', () => {
    const items = packItems(project, library);
    const single = buildPackingList(items, library, { groupBy: ['trailer', 'owner'], mode: 'single' });
    expect(single.groups.map((g) => g.label)).toEqual(['Anhänger 1', 'ohne Anhänger']);
    expect(single.groups[0]!.groups.map((g) => g.label)).toEqual(['Ralf']);
    expect(single.groups[1]!.groups.map((g) => g.label)).toEqual(['Ralf', 'ohne Besitzer']);
    expect(single.groups[1]!.groups[0]!.rows.every((r) => r.items.length === 1)).toBe(true);
    expect(aggregationKey(items[0]!)).toBe(aggregationKey(items[1]!));
  });
});

describe('Filter', () => {
  it('Kategorie, Besitzer, Anhänger, Stativ', () => {
    const filter = { ...EMPTY_FILTER, categories: ['licht'] };
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(deviceMatches(filter, dev('a', 'spot'), spot)).toBe(true);
    expect(deviceMatches(filter, dev('a', 'spot', undefined, { categoryOverride: 'ton' }), spot)).toBe(false);
    expect(deviceMatches({ ...EMPTY_FILTER, carriers: ['s'] }, dev('a', 'spot', undefined, { mountedOnId: 's' }), spot)).toBe(true);
    expect(deviceMatches({ ...EMPTY_FILTER, carriers: ['s'] }, dev('s', 'stand'), stand)).toBe(true);
    expect(deviceMatches({ ...EMPTY_FILTER, owners: [''] }, dev('a', 'spot'), spot)).toBe(true); // „ohne Besitzer“
    expect(cableMatches({ ...EMPTY_FILTER, trailers: ['a1'] }, cable('c', 'a', 'out', 'b', 'in', { trailerId: 'a1' }), xlr)).toBe(true);
    expect(cableMatches(filter, cable('c', 'a', 'out', 'b', 'in'), xlr)).toBe(false);
  });
});

describe('Prüfungen Logistik', () => {
  it('doppelte Inventarnummern und Verlängerung nötig', () => {
    const issues = checkLogistics(
      {
        settings: { gridMm: 500, snap: true, defaultReservePercent: 0, defaultReservePerEndMm: 0 },
        devices: [dev('a', 'spot', { x: 0, y: 0 }, { inventoryNo: 'LI-001' }), dev('b', 'spot', { x: 30000, y: 0 }, { inventoryNo: 'LI-001' })],
        cables: [cable('c', 'a', 'out', 'b', 'in', { inventoryNo: ' LI-001 ' })],
      },
      { templates },
    );
    expect(issues.map((i) => i.id).sort()).toEqual(['extension:c', 'inventory:LI-001']);
    expect(issues.find((i) => i.id === 'inventory:LI-001')!.objectIds).toHaveLength(3);
  });

  it('Formatierung', () => {
    expect(formatMeters(12345)).toBe('12,35 m');
    expect(formatCableLength(2500)).toBe('2,5 m');
    expect(formatCableLength(null)).toBe('–');
  });
});

describe('Häkchen und Kopie', () => {
  function setup() {
    const base = createEmptyProject({ name: 'Fest', meta: { date: '2026-07-04', version: '3' } });
    const project: Project = {
      ...base,
      devices: [dev('d1', 'spot', { x: 0, y: 0 }, { check: { out: { at: T0, by: 'A', status: 'ok' } }, lastModified: { at: T0, by: 'A' } })],
      cables: [cable('c1', 'd1', 'out', 'd1', 'in')],
      changeLog: [{ at: T0, by: 'A', access: 'edit', via: 'browser', action: 'x', objectIds: [] }],
    };
    return { project, doc: createYDocFromProject(project) };
  }

  it('setzt und entfernt Häkchen, setzt zurück', () => {
    const { doc } = setup();
    expect(setCheck(doc, 'cable', 'c1', 'in', { at: T0, by: 'Anna', status: 'missing', note: 'nicht da' }, 'srv')).toBe(true);
    expect(setCheck(doc, 'cable', 'weg', 'in', null, 'srv')).toBe(false);
    let read = readProjectFromYDoc(doc);
    expect(read.ok && read.project.cables[0]!.check?.in?.status).toBe('missing');
    setCheck(doc, 'device', 'd1', 'in', { at: T0, by: 'Anna', status: 'ok' }, 'srv');
    expect(resetChecks(doc, 'out', 'srv')).toBe(1);
    read = readProjectFromYDoc(doc);
    expect(read.ok && read.project.devices[0]!.check).toEqual({ in: expect.objectContaining({ status: 'ok' }) });
    expect(resetChecks(doc, 'both', 'srv')).toBe(2);
    read = readProjectFromYDoc(doc);
    expect(read.ok && [read.project.devices[0]!.check, read.project.cables[0]!.check]).toEqual([undefined, undefined]);
  });

  it('Neues Projekt aus diesem: neue id, ohne Häkchen/Protokoll, Datum und Version leer', () => {
    const { project } = setup();
    const copy = copyAsNewProject(project);
    expect(copy.id).not.toBe(project.id);
    expect(copy.meta).toMatchObject({ name: 'Fest (Kopie)', date: '', version: '' });
    expect(copy.devices[0]!.check).toBeUndefined();
    expect(copy.devices[0]!.lastModified).toBeUndefined();
    expect(copy.changeLog).toEqual([]);
    expect(copy.cables).toHaveLength(1);
  });
});
