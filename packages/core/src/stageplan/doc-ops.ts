// Änderungen am Live-Dokument für den Bühnenplan: Formen, Ebenen, Hintergrund, Einstellungen.
import * as Y from 'yjs';
import { newId } from '../model/project';
import type { Background, Layer, Project, ProjectSettings, Shape } from '../model/schema';

type Json = Record<string, unknown>;

function write(map: Y.Map<unknown>, values: Json): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) map.delete(key);
    else map.set(key, value);
  }
}

export function readShapes(doc: Y.Doc): Shape[] {
  return Object.values(doc.getMap('shapes').toJSON() as Record<string, Shape>);
}

export function readBackground(doc: Y.Doc): Background | undefined {
  return doc.getMap('root').get('background') as Background | undefined;
}

export function readSettings(doc: Y.Doc): Partial<ProjectSettings> {
  return doc.getMap('settings').toJSON() as Partial<ProjectSettings>;
}

export function addShape(doc: Y.Doc, shape: Omit<Shape, 'id'>, origin: unknown): Shape {
  const full = { ...shape, id: newId() } as Shape;
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    doc.getMap<Y.Map<unknown>>('shapes').set(full.id, map);
    write(map, full as unknown as Json);
  }, origin);
  return full;
}

export function updateShapes(doc: Y.Doc, patches: { id: string; patch: Partial<Shape> }[], origin: unknown): void {
  doc.transact(() => {
    const shapes = doc.getMap<Y.Map<unknown>>('shapes');
    for (const { id, patch } of patches) {
      const map = shapes.get(id);
      if (map) write(map, patch as Json);
    }
  }, origin);
}

export function removeShapes(doc: Y.Doc, ids: string[], origin: unknown): void {
  doc.transact(() => {
    const shapes = doc.getMap<Y.Map<unknown>>('shapes');
    for (const id of ids) shapes.delete(id);
  }, origin);
}

export function updateLayer(doc: Y.Doc, id: string, patch: Partial<Layer>, origin: unknown): void {
  doc.transact(() => {
    const map = doc.getMap<Y.Map<unknown>>('layers').get(id);
    if (map) write(map, patch as Json);
  }, origin);
}

export function addLayer(doc: Y.Doc, name: string, origin: unknown): Layer {
  const layers = Object.values(doc.getMap('layers').toJSON() as Record<string, Layer>);
  const layer: Layer = { id: newId(), name, visible: true, locked: false, order: Math.max(-1, ...layers.map((l) => l.order)) + 1 };
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    doc.getMap<Y.Map<unknown>>('layers').set(layer.id, map);
    write(map, layer as unknown as Json);
  }, origin);
  return layer;
}

/**
 * Ebene in der Zeichenreihenfolge verschieben: +1 = eine Stufe nach oben (wird über der nächsten gezeichnet), -1 = nach unten.
 * Die Reihenfolge wird dabei lückenlos neu durchnummeriert.
 */
export function moveLayer(doc: Y.Doc, id: string, direction: 1 | -1, origin: unknown): void {
  const layers = (Object.values(doc.getMap('layers').toJSON() as Record<string, Layer>)).sort((a, b) => a.order - b.order);
  const index = layers.findIndex((l) => l.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= layers.length) return;
  [layers[index], layers[target]] = [layers[target]!, layers[index]!];
  doc.transact(() => {
    layers.forEach((layer, order) => {
      const map = doc.getMap<Y.Map<unknown>>('layers').get(layer.id);
      if (map && map.get('order') !== order) map.set('order', order);
    });
  }, origin);
}

/** Ebene löschen – nur wenn leer. Gibt false zurück, wenn noch Objekte darauf liegen. */
export function removeLayer(doc: Y.Doc, project: Pick<Project, 'devices' | 'shapes'>, id: string, origin: unknown): boolean {
  if (project.devices.some((d) => d.layerId === id) || project.shapes.some((s) => s.layerId === id)) return false;
  doc.transact(() => doc.getMap('layers').delete(id), origin);
  return true;
}

export function setBackground(doc: Y.Doc, background: Background | undefined, origin: unknown): void {
  doc.transact(() => {
    const root = doc.getMap('root');
    if (background) root.set('background', background);
    else root.delete('background');
  }, origin);
}

export function updateSettings(doc: Y.Doc, patch: Partial<ProjectSettings>, origin: unknown): void {
  doc.transact(() => write(doc.getMap('settings'), patch as Json), origin);
}

/** Maßstab des Hintergrunds: Millimeter pro Bildpixel (ohne Kalibrierung: 10 mm/px). */
export function backgroundScale(background: Background): number {
  const c = background.calibration;
  if (!c) return 10;
  const px = Math.hypot(c.p2.x - c.p1.x, c.p2.y - c.p1.y);
  return px > 0 ? c.realDistanceMm / px : 10;
}
