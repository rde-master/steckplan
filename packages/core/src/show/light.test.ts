import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import { createYDocFromProject, readProjectFromYDoc } from '../model/ydoc';
import type { DeviceInstance, Template } from '../model/schema';
import {
  addLightTarget,
  applyArrangement,
  arrangeFromStage,
  gridLayout,
  isLightTemplate,
  lightDevices,
  moveLightTarget,
  placeLight,
  readLightGrid,
  readLightPlacements,
  readLightTargets,
  removeLightTarget,
  setLightHidden,
  unplaceLight,
  updateLightGrid,
  updateLightTarget,
} from './light';

const T0 = '2026-01-01T00:00:00.000Z';
const spot: Template = { id: 'spot', kind: 'device', name: 'Moving Head', version: 1, updatedAt: T0, light: { showInScenes: true, dimmer: true, colorMixing: 'cmy', colorWheels: [], goboWheels: [{ name: 'Rad 1', rotating: true, gobos: ['Sterne', 'Breakup'] }], moving: { panDeg: 540, tiltDeg: 270 } } };
const amp: Template = { id: 'amp', kind: 'device', name: 'Endstufe', version: 1, updatedAt: T0 };
const dev = (id: string, templateId = 'spot'): DeviceInstance => ({ id, templateId, layerId: 'l', label: id });

describe('Lichtaufbau', () => {
  it('Lichtgeräte über das Merkmal der Vorlage', () => {
    expect(isLightTemplate(spot)).toBe(true);
    expect(isLightTemplate(amp)).toBe(false);
    const templates = new Map([spot, amp].map((t) => [t.id, t]));
    expect(lightDevices([dev('MH 10'), dev('Amp', 'amp'), dev('MH 2')], templates).map((d) => d.id)).toEqual(['MH 2', 'MH 10']);
  });

  it('Raster: platzieren, tauschen, herausnehmen, ausblenden; außerhalb des verkleinerten Rasters = nicht im Raster', () => {
    const doc = createYDocFromProject(createEmptyProject({ name: 'Licht' }));
    const devices = [dev('A'), dev('B'), dev('C')];
    expect(readLightGrid(doc)).toEqual({ cols: 12, rows: 6, rowLabels: [] });
    placeLight(doc, 'A', 0, 0, null);
    placeLight(doc, 'B', 1, 0, null);
    // B auf A's Feld → tauschen
    placeLight(doc, 'B', 0, 0, null);
    let layout = gridLayout(devices, readLightPlacements(doc), readLightGrid(doc));
    expect(layout.placed.map((p) => [p.device.id, p.col, p.row])).toEqual([
      ['A', 1, 0],
      ['B', 0, 0],
    ]);
    expect(layout.unplaced.map((d) => d.id)).toEqual(['C']);
    // C (ohne Platz) auf B's Feld → B wird frei
    placeLight(doc, 'C', 0, 0, null);
    layout = gridLayout(devices, readLightPlacements(doc), readLightGrid(doc));
    expect(layout.unplaced.map((d) => d.id)).toEqual(['B']);
    setLightHidden(doc, 'B', true, null);
    unplaceLight(doc, 'A', null);
    layout = gridLayout(devices, readLightPlacements(doc), readLightGrid(doc));
    expect(layout).toMatchObject({ hidden: [{ id: 'B' }], unplaced: [{ id: 'A' }] });
    setLightHidden(doc, 'B', false, null);
    placeLight(doc, 'A', 5, 3, null);
    updateLightGrid(doc, { cols: 4, rowLabels: ['hinten'] }, null);
    layout = gridLayout(devices, readLightPlacements(doc), readLightGrid(doc));
    expect(layout.unplaced.map((d) => d.id).sort()).toEqual(['A', 'B']);
    expect(readProjectFromYDoc(doc).ok).toBe(true);
  });

  it('aus dem Bühnenplan: je Träger eine Zeile (hinten oben, Boden unten), links nach rechts, kurze Zeilen verteilt', () => {
    const { grid, placements } = arrangeFromStage([
      { deviceId: 'P1', x: 0, y: 3000, carrierId: 'tv', carrierLabel: 'Traverse vorne' },
      { deviceId: 'P2', x: 2000, y: 3000, carrierId: 'tv', carrierLabel: 'Traverse vorne' },
      { deviceId: 'P3', x: 4000, y: 3000, carrierId: 'tv', carrierLabel: 'Traverse vorne' },
      { deviceId: 'P4', x: 6000, y: 3000, carrierId: 'tv', carrierLabel: 'Traverse vorne' },
      { deviceId: 'M2', x: 5000, y: 500, carrierId: 'th', carrierLabel: 'Traverse hinten' },
      { deviceId: 'M1', x: 1000, y: 500, carrierId: 'th', carrierLabel: 'Traverse hinten' },
      { deviceId: 'L1', x: 3000, y: 5000 },
    ]);
    expect(grid).toEqual({ cols: 4, rows: 3, rowLabels: ['Traverse hinten', 'Traverse vorne', 'Boden'] });
    const at = Object.fromEntries(placements.map((p) => [p.id, [p.col, p.row]]));
    expect(at).toEqual({ M1: [1, 0], M2: [3, 0], P1: [0, 1], P2: [1, 1], P3: [2, 1], P4: [3, 1], L1: [2, 2] });

    const doc = createYDocFromProject(createEmptyProject({ name: 'Licht' }));
    setLightHidden(doc, 'L1', true, null);
    placeLight(doc, 'X', 9, 5, null); // alter Platz eines nicht mehr vorhandenen Plans
    applyArrangement(doc, arrangeFromStage([{ deviceId: 'M1', x: 0, y: 0 }, { deviceId: 'L1', x: 1, y: 0 }]), null);
    const placementsAfter = readLightPlacements(doc);
    expect(placementsAfter.find((p) => p.id === 'L1')).toEqual({ id: 'L1', hidden: true });
    expect(placementsAfter.find((p) => p.id === 'X')).toBeUndefined();
    expect(readLightGrid(doc)).toEqual({ cols: 2, rows: 1, rowLabels: ['Boden'] });
  });

  it('Ziele: anlegen mit Farbe, umbenennen, Punkt setzen, sortieren, löschen', () => {
    const doc = createYDocFromProject(createEmptyProject({ name: 'Licht' }));
    const a = addLightTarget(doc, 'Sängerin', null);
    const b = addLightTarget(doc, 'Publikum', null);
    expect(readLightTargets(doc).map((t) => [t.name, t.color])).toEqual([
      ['Sängerin', '#e11d48'],
      ['Publikum', '#2563eb'],
    ]);
    updateLightTarget(doc, a, { stagePoint: { x: 1200, y: 800 }, name: 'Gesang' }, null);
    moveLightTarget(doc, b, -1, null);
    expect(readLightTargets(doc).map((t) => t.name)).toEqual(['Publikum', 'Gesang']);
    expect(readLightTargets(doc)[1]!.stagePoint).toEqual({ x: 1200, y: 800 });
    removeLightTarget(doc, b, null);
    expect(readLightTargets(doc).map((t) => [t.name, t.order])).toEqual([['Gesang', 0]]);
    expect(readProjectFromYDoc(doc).ok).toBe(true);
  });
});
