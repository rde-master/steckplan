// Lichtaufbau (Regie, M11c): Raster je Projekt mit den Lichtgeräten, benannte Ziele.
// Welche Geräte dazugehören, steht an der Vorlage („In Lichtszenen anzeigen“).
import * as Y from 'yjs';
import { newId } from '../model/project';
import type { DeviceInstance, LightGrid, LightPlacement, LightTarget, Template } from '../model/schema';

export const DEFAULT_LIGHT_GRID: LightGrid = { cols: 12, rows: 6, rowLabels: [] };

export function isLightTemplate(template: Template | undefined): boolean {
  return template?.kind === 'device' && template.light?.showInScenes === true;
}

/** Lichtgeräte des Projekts (nach Kennung sortiert) */
export function lightDevices(devices: DeviceInstance[], templates: Map<string, Template>): DeviceInstance[] {
  return devices.filter((d) => isLightTemplate(templates.get(d.templateId))).sort((a, b) => a.label.localeCompare(b.label, 'de', { numeric: true }));
}

export function readLightGrid(doc: Y.Doc): LightGrid {
  const raw = doc.getMap('lightGrid').toJSON() as Partial<LightGrid>;
  return { ...DEFAULT_LIGHT_GRID, ...raw, rowLabels: raw.rowLabels ?? [] };
}

export function readLightPlacements(doc: Y.Doc): LightPlacement[] {
  return Object.values(doc.getMap('lightPlacements').toJSON() as Record<string, LightPlacement>);
}

export function readLightTargets(doc: Y.Doc): LightTarget[] {
  return Object.values(doc.getMap('lightTargets').toJSON() as Record<string, LightTarget>).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export interface GridLayout {
  /** im Raster (nur Felder innerhalb des Rasters; bei doppelter Belegung gewinnt das erste) */
  placed: { device: DeviceInstance; col: number; row: number }[];
  /** Lichtgeräte ohne Platz (oder außerhalb des verkleinerten Rasters) */
  unplaced: DeviceInstance[];
  hidden: DeviceInstance[];
}

export function gridLayout(devices: DeviceInstance[], placements: LightPlacement[], grid: LightGrid): GridLayout {
  const byId = new Map(placements.map((p) => [p.id, p]));
  const taken = new Set<string>();
  const layout: GridLayout = { placed: [], unplaced: [], hidden: [] };
  for (const device of devices) {
    const p = byId.get(device.id);
    if (p?.hidden) {
      layout.hidden.push(device);
      continue;
    }
    const key = p && p.col !== undefined && p.row !== undefined ? `${p.col}/${p.row}` : undefined;
    if (key && p!.col! < grid.cols && p!.row! < grid.rows && !taken.has(key)) {
      taken.add(key);
      layout.placed.push({ device, col: p!.col!, row: p!.row! });
    } else layout.unplaced.push(device);
  }
  return layout;
}

function placementsMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('lightPlacements');
}

function setPlacement(doc: Y.Doc, id: string, patch: Partial<Omit<LightPlacement, 'id'>>): void {
  const map = placementsMap(doc);
  let entry = map.get(id);
  if (!entry) {
    entry = new Y.Map<unknown>();
    map.set(id, entry);
    entry.set('id', id);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) entry.delete(key);
    else entry.set(key, value);
  }
  if ([...entry.keys()].every((k) => k === 'id')) map.delete(id);
}

/** Gerät auf ein Feld legen; liegt dort schon eines, tauschen die beiden die Plätze. */
export function placeLight(doc: Y.Doc, deviceId: string, col: number, row: number, origin: unknown): void {
  const placements = readLightPlacements(doc);
  const mine = placements.find((p) => p.id === deviceId);
  const other = placements.find((p) => p.id !== deviceId && p.col === col && p.row === row && !p.hidden);
  doc.transact(() => {
    if (other) setPlacement(doc, other.id, mine && mine.col !== undefined && mine.row !== undefined && !mine.hidden ? { col: mine.col, row: mine.row } : { col: undefined, row: undefined });
    setPlacement(doc, deviceId, { col, row, hidden: undefined });
  }, origin);
}

/** Aus dem Raster nehmen (bleibt in „nicht im Raster“). */
export function unplaceLight(doc: Y.Doc, deviceId: string, origin: unknown): void {
  doc.transact(() => setPlacement(doc, deviceId, { col: undefined, row: undefined }), origin);
}

/** Im Lichtaufbau aus- bzw. wieder einblenden. */
export function setLightHidden(doc: Y.Doc, deviceId: string, hidden: boolean, origin: unknown): void {
  doc.transact(() => setPlacement(doc, deviceId, hidden ? { hidden: true, col: undefined, row: undefined } : { hidden: undefined }), origin);
}

export function updateLightGrid(doc: Y.Doc, patch: Partial<LightGrid>, origin: unknown): void {
  doc.transact(() => {
    const map = doc.getMap('lightGrid');
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) map.delete(key);
      else map.set(key, value);
    }
  }, origin);
}

// ---------- Aus dem Bühnenplan anordnen ----------

export interface StagePosition {
  deviceId: string;
  /** Position im Bühnenplan (mm; y wächst zum Publikum hin) */
  x: number;
  y: number;
  /** Traverse/Stativ, an dem das Gerät hängt (sonst Boden) */
  carrierId?: string;
  carrierLabel?: string;
}

const FLOOR = '__boden__';

/**
 * Raster aus dem Bühnenplan: je Traverse/Stativ eine Zeile (hinten oben), Geräte von links nach rechts,
 * Geräte ohne Träger in der Zeile „Boden“. Geräte ohne Position im Bühnenplan bleiben außerhalb des Rasters.
 */
export function arrangeFromStage(positions: StagePosition[], floorLabel = 'Boden'): { grid: LightGrid; placements: { id: string; col: number; row: number }[] } {
  const groups = new Map<string, StagePosition[]>();
  for (const p of positions) {
    const key = p.carrierId ?? FLOOR;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const avgY = (list: StagePosition[]) => list.reduce((s, p) => s + p.y, 0) / list.length;
  // hinten (kleines y) zuerst, Boden zuletzt
  const rows = [...groups.entries()].sort(([ka, a], [kb, b]) => (ka === FLOOR ? 1 : 0) - (kb === FLOOR ? 1 : 0) || avgY(a) - avgY(b));
  const cols = Math.min(48, Math.max(1, ...rows.map(([, list]) => list.length)));
  const placements: { id: string; col: number; row: number }[] = [];
  const rowLabels: string[] = [];
  rows.slice(0, 24).forEach(([key, list], row) => {
    rowLabels.push(key === FLOOR ? floorLabel : (list[0]!.carrierLabel ?? ''));
    const sorted = [...list].sort((a, b) => a.x - b.x);
    // Geräte über die Breite verteilen, damit kurze Zeilen nicht links kleben
    sorted.slice(0, cols).forEach((p, i) => {
      const col = sorted.length >= cols ? i : Math.round(((i + 0.5) * cols) / sorted.length - 0.5);
      placements.push({ id: p.deviceId, col, row });
    });
  });
  return { grid: { cols, rows: Math.max(1, rowLabels.length), rowLabels }, placements };
}

/** Ergebnis von arrangeFromStage übernehmen (andere Plätze werden gelöscht, Ausgeblendete bleiben ausgeblendet). */
export function applyArrangement(doc: Y.Doc, arrangement: ReturnType<typeof arrangeFromStage>, origin: unknown): void {
  doc.transact(() => {
    updateLightGrid(doc, arrangement.grid, origin);
    const hidden = new Set(readLightPlacements(doc).filter((p) => p.hidden).map((p) => p.id));
    for (const p of readLightPlacements(doc)) if (!p.hidden) placementsMap(doc).delete(p.id);
    for (const p of arrangement.placements) if (!hidden.has(p.id)) setPlacement(doc, p.id, { col: p.col, row: p.row });
  }, origin);
}

// ---------- Ziele ----------

export const TARGET_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

function targetsMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('lightTargets');
}

export function addLightTarget(doc: Y.Doc, name: string, origin: unknown): string {
  const id = newId();
  const existing = readLightTargets(doc);
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    targetsMap(doc).set(id, map);
    map.set('id', id);
    map.set('order', existing.length);
    map.set('name', name);
    map.set('color', TARGET_COLORS[existing.length % TARGET_COLORS.length]!);
  }, origin);
  return id;
}

export function updateLightTarget(doc: Y.Doc, id: string, patch: Partial<Omit<LightTarget, 'id'>>, origin: unknown): void {
  const map = targetsMap(doc).get(id);
  if (!map) return;
  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) map.delete(key);
      else map.set(key, value);
    }
  }, origin);
}

export function removeLightTarget(doc: Y.Doc, id: string, origin: unknown): void {
  doc.transact(() => {
    targetsMap(doc).delete(id);
    readLightTargets(doc).forEach((t, i) => targetsMap(doc).get(t.id)?.set('order', i));
  }, origin);
}

export function moveLightTarget(doc: Y.Doc, id: string, delta: -1 | 1, origin: unknown): void {
  const ids = readLightTargets(doc).map((t) => t.id);
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return;
  ids.splice(from, 1);
  ids.splice(to, 0, id);
  doc.transact(() => ids.forEach((tid, i) => targetsMap(doc).get(tid)?.set('order', i)), origin);
}
