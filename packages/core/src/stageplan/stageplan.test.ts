import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import type { DeviceInstance, Template } from '../model/schema';
import { createYDocFromProject } from '../model/ydoc';
import { checkStagePlan } from './checks';
import { addLayer, addShape, backgroundScale, moveLayer, readBackground, readShapes, removeLayer, setBackground, updateLayer, updateShapes } from './doc-ops';
import { readLayers } from '../signalflow/doc-ops';
import { canDock, dependents, dockedPosition, findDockTarget, moveWithDependents, rotateWithDependents } from './docking';
import { containsPoint, footprint, polylineLength, projectOnTruss, rotate } from './geometry';
import { effectiveHeight } from './heights';

const T0 = '2026-01-01T00:00:00.000Z';
const spot: Template = { id: 'spot', kind: 'device', version: 1, updatedAt: T0, name: 'Spot', shape: { form: 'rect', widthMm: 400, depthMm: 300 } };
const stand: Template = { id: 'stand', kind: 'stand', version: 1, updatedAt: T0, name: 'Lichtstativ', shape: { form: 'circle', widthMm: 1200, depthMm: 1200, heightMm: 2500 }, maxMountedDevices: 2 };
const truss: Template = { id: 'truss', kind: 'truss', version: 1, updatedAt: T0, name: 'Traverse 3 m', lengthMm: 3000, shape: { form: 'rect', widthMm: 3000, depthMm: 290, heightMm: 4000 } };
const podest: Template = { id: 'podest', kind: 'stageElement', version: 1, updatedAt: T0, name: 'Podest 2×1', shape: { form: 'rect', widthMm: 2000, depthMm: 1000, heightMm: 400 } };
const templates = new Map([spot, stand, truss, podest].map((t) => [t.id, t]));

function dev(id: string, templateId: string, x: number, y: number, extra: Partial<DeviceInstance> = {}, stage: Partial<NonNullable<DeviceInstance['stagePlan']>> = {}): DeviceInstance {
  return { id, templateId, layerId: 'l', label: id, stagePlan: { position: { x, y }, rotationDeg: 0, ...stage }, ...extra };
}

describe('Geometrie', () => {
  it('Grundflächen aus der Vorlage, Traverse = Länge × Querschnitt, Standard 0,3 m', () => {
    expect(footprint(spot)).toEqual({ widthMm: 400, depthMm: 300, form: 'rect' });
    expect(footprint(truss)).toEqual({ widthMm: 3000, depthMm: 290, form: 'rect' });
    expect(footprint(undefined)).toEqual({ widthMm: 300, depthMm: 300, form: 'rect' });
  });

  it('Punkt in gedrehter Grundfläche', () => {
    const t = dev('t', 'truss', 0, 0, {}, { rotationDeg: 90 });
    expect(containsPoint(t, truss, { x: 0, y: 1400 })).toBe(true);
    expect(containsPoint(t, truss, { x: 1400, y: 0 })).toBe(false);
    const s = dev('s', 'stand', 0, 0);
    expect(containsPoint(s, stand, { x: 500, y: 0 })).toBe(true);
    expect(containsPoint(s, stand, { x: 500, y: 500 })).toBe(false); // Kreis, nicht Quadrat
  });

  it('Projektion auf die Traversenachse innerhalb der Länge', () => {
    const t = dev('t', 'truss', 1000, 1000);
    expect(projectOnTruss(t, truss, { x: 1500, y: 1100 })).toEqual({ x: 1500, y: 1000 });
    expect(projectOnTruss(t, truss, { x: 9000, y: 1000 })).toEqual({ x: 2500, y: 1000 });
    const r = rotate({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(10);
    expect(polylineLength([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 4000 }])).toBe(7000);
  });
});

describe('Höhe', () => {
  const devices = [
    dev('s', 'stand', 0, 0, {}, { heightMm: 3200 }),
    dev('t', 'truss', 5000, 0),
    dev('p', 'podest', 0, 5000),
    dev('a', 'spot', 0, 0, { mountedOnId: 's' }),
    dev('b', 'spot', 5000, 0, { mountedOnId: 't' }),
    dev('c', 'spot', 0, 5000, {}, { standsOnId: 'p' }),
    dev('d', 'spot', 0, 5000, { mountedOnId: 's' }, { heightMm: 1800 }),
    dev('e', 'spot', 9000, 9000),
  ];
  const map = new Map(devices.map((d) => [d.id, d]));
  const h = (id: string) => effectiveHeight(map.get(id)!, map, templates);

  it('übernimmt die Instanz-Höhe des Stativs (ausgefahren auf 3,20 m)', () => expect(h('a')).toEqual({ heightMm: 3200, source: 'mount', fromId: 's' }));
  it('sonst die Standardhöhe der Traverse', () => expect(h('b')).toEqual({ heightMm: 4000, source: 'mount', fromId: 't' }));
  it('auf dem Podest dessen Höhe', () => expect(h('c')).toEqual({ heightMm: 400, source: 'standsOn', fromId: 'p' }));
  it('eigene Höhe hat Vorrang', () => expect(h('d')).toEqual({ heightMm: 1800, source: 'own' }));
  it('sonst 0', () => expect(h('e')).toEqual({ heightMm: 0, source: 'none' }));
  it('Träger selbst: Instanz- oder Standardhöhe', () => {
    expect(h('s')).toEqual({ heightMm: 3200, source: 'own' });
    expect(h('p')).toEqual({ heightMm: 400, source: 'template' });
  });
});

describe('Andocken und Mitbewegen', () => {
  const devices = [dev('p', 'podest', 0, 0), dev('s', 'stand', 0, 0), dev('t', 'truss', 5000, 0), dev('a', 'spot', 100, 100)];

  it('Stative/Traversen haben Vorrang vor Bühnenelementen', () => {
    expect(findDockTarget({ x: 100, y: 100 }, devices, templates, new Set(['a']))).toMatchObject({ kind: 'mount', carrier: { id: 's' } });
    expect(findDockTarget({ x: 900, y: 400 }, devices, templates, new Set(['a']))).toMatchObject({ kind: 'standsOn', carrier: { id: 'p' } });
    expect(findDockTarget({ x: 5800, y: 100 }, devices, templates, new Set(['a']))).toMatchObject({ kind: 'mount', carrier: { id: 't' } });
    expect(findDockTarget({ x: 20000, y: 0 }, devices, templates, new Set())).toBeNull();
    expect(canDock(spot)).toBe(true);
    expect(canDock(stand)).toBe(false);
  });

  it('Position nach dem Andocken: Stativ-Mitte bzw. auf der Traversenachse', () => {
    expect(dockedPosition({ kind: 'mount', carrier: devices[1]! }, templates, { x: 120, y: 80 })).toEqual({ x: 0, y: 0 });
    expect(dockedPosition({ kind: 'mount', carrier: devices[2]! }, templates, { x: 5800, y: 100 })).toEqual({ x: 5800, y: 0 });
  });

  it('abhängige Geräte bewegen und drehen sich mit', () => {
    const list = [dev('t', 'truss', 0, 0), dev('a', 'spot', 1000, 0, { mountedOnId: 't' }), dev('x', 'spot', 50, 50, { mountedOnId: 'a' }), dev('z', 'spot', 9, 9)];
    expect(dependents(['t'], list).map((d) => d.id)).toEqual(['a', 'x']);
    const moved = moveWithDependents(['t'], { x: 100, y: 200 }, list);
    expect(moved.map((m) => `${m.id}:${m.position.x},${m.position.y}`)).toEqual(['t:100,200', 'a:1100,200', 'x:150,250']);
    const rotated = rotateWithDependents(list[0]!, 90, list);
    const a = rotated.find((r) => r.id === 'a')!;
    expect(a.position.x).toBeCloseTo(0);
    expect(a.position.y).toBeCloseTo(1000);
    expect(a.rotationDeg).toBe(90);
  });
});

describe('Prüfungen Bühnenplan', () => {
  it('nicht platzierte Geräte, zu viele angehängt, fehlender Träger', () => {
    const issues = checkStagePlan(
      {
        devices: [
          dev('s', 'stand', 0, 0),
          dev('a', 'spot', 0, 0, { mountedOnId: 's' }),
          dev('b', 'spot', 0, 0, { mountedOnId: 's' }),
          dev('c', 'spot', 0, 0, { mountedOnId: 's' }),
          dev('d', 'spot', 0, 0, { mountedOnId: 'weg' }),
          { id: 'u', templateId: 'spot', layerId: 'l', label: 'Unplatziert' },
        ],
      },
      { templates: [...templates.values()] },
    );
    expect(issues.map((i) => i.id).sort()).toEqual(['mount-missing:d', 'overmounted:s', 'unplaced']);
    expect(issues.find((i) => i.id === 'unplaced')).toMatchObject({ severity: 'info', objectIds: ['u'] });
  });
});

describe('Dokument: Formen, Ebenen, Hintergrund', () => {
  it('Formen anlegen/ändern, Ebenen sperren/löschen nur leer, Hintergrund-Maßstab', () => {
    const project = createEmptyProject({ name: 'P' });
    const doc = createYDocFromProject(project);
    const wall = addShape(doc, { kind: 'wall', layerId: project.layers[0]!.id, points: [{ x: 0, y: 0 }, { x: 5000, y: 0 }], rotationDeg: 0, strokeWidthMm: 200 }, 'me');
    updateShapes(doc, [{ id: wall.id, patch: { strokeWidthMm: 300 } }], 'me');
    expect(readShapes(doc)[0]).toMatchObject({ kind: 'wall', strokeWidthMm: 300 });

    updateLayer(doc, project.layers[0]!.id, { locked: true, visible: false }, 'me');
    expect((doc.getMap('layers').get(project.layers[0]!.id) as { get(k: string): unknown }).get('locked')).toBe(true);
    const extra = addLayer(doc, 'Pyro', 'me');
    expect(extra.order).toBe(project.layers.length);
    // Reihenfolge: neue Ebene liegt oben; eine Stufe nach unten, dann wieder nach oben; am Rand passiert nichts
    const top = () => readLayers(doc).at(-1)!.id;
    expect(top()).toBe(extra.id);
    moveLayer(doc, extra.id, -1, 'me');
    expect(readLayers(doc).map((l) => l.order)).toEqual(readLayers(doc).map((_, i) => i));
    expect(top()).not.toBe(extra.id);
    moveLayer(doc, extra.id, 1, 'me');
    expect(top()).toBe(extra.id);
    moveLayer(doc, extra.id, 1, 'me');
    expect(top()).toBe(extra.id);
    expect(removeLayer(doc, { devices: [], shapes: readShapes(doc) }, project.layers[0]!.id, 'me')).toBe(false);
    expect(removeLayer(doc, { devices: [], shapes: readShapes(doc) }, extra.id, 'me')).toBe(true);

    setBackground(doc, { image: 'data:image/png;base64,AA', widthPx: 1000, heightPx: 500, calibration: { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, realDistanceMm: 5000 } }, 'me');
    const bg = readBackground(doc)!;
    expect(backgroundScale(bg)).toBe(50);
    expect(backgroundScale({ image: 'x' })).toBe(10);
    setBackground(doc, undefined, 'me');
    expect(readBackground(doc)).toBeUndefined();
  });
});
