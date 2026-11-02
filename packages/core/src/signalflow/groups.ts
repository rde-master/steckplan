// Gruppen im Signalfluss (seit Format 4): benannt, mit Farbe; jedes Gerät in höchstens einer Gruppe.
// Der Rahmen wird aus den Mitgliedern berechnet (Signalfluss: Kästen, Bühnenplan: Grundflächen).
import * as Y from 'yjs';
import { newId } from '../model/project';
import type { Group } from '../model/schema';

export const GROUP_COLORS = ['#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#ec4899', '#64748b'];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Umschließendes Rechteck mit Rand; null ohne Mitglieder. */
export function boundsOf(rects: Rect[], padding = 0): Rect | null {
  if (rects.length === 0) return null;
  const x1 = Math.min(...rects.map((r) => r.x)) - padding;
  const y1 = Math.min(...rects.map((r) => r.y)) - padding;
  const x2 = Math.max(...rects.map((r) => r.x + r.width)) + padding;
  const y2 = Math.max(...rects.map((r) => r.y + r.height)) + padding;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function readGroups(doc: Y.Doc): Group[] {
  return Object.values(doc.getMap('groups').toJSON() as Record<string, Group>).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Nächster freier Name „Gruppe n“. */
export function nextGroupName(groups: Pick<Group, 'name'>[]): string {
  let n = 1;
  const names = new Set(groups.map((g) => g.name));
  while (names.has(`Gruppe ${n}`)) n++;
  return `Gruppe ${n}`;
}

/** Neue Gruppe aus Geräten (sie verlassen ihre bisherige Gruppe). Leere Gruppen werden aufgeräumt. */
export function createGroup(doc: Y.Doc, deviceIds: string[], origin: unknown, name?: string): Group {
  const existing = readGroups(doc);
  const group: Group = { id: newId(), name: name?.trim() || nextGroupName(existing), color: GROUP_COLORS[existing.length % GROUP_COLORS.length] };
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    doc.getMap<Y.Map<unknown>>('groups').set(group.id, map);
    map.set('id', group.id);
    map.set('name', group.name);
    if (group.color) map.set('color', group.color);
    setDeviceGroup(doc, deviceIds, group.id);
    removeEmptyGroups(doc);
  }, origin);
  return group;
}

export function updateGroup(doc: Y.Doc, id: string, patch: Partial<Omit<Group, 'id'>>, origin: unknown): void {
  doc.transact(() => {
    const map = doc.getMap<Y.Map<unknown>>('groups').get(id);
    if (!map) return;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') map.delete(key);
      else map.set(key, value);
    }
  }, origin);
}

/** Geräte einer Gruppe zuordnen (groupId) oder aus ihr lösen (undefined). */
export function assignGroup(doc: Y.Doc, deviceIds: string[], groupId: string | undefined, origin: unknown): void {
  doc.transact(() => {
    setDeviceGroup(doc, deviceIds, groupId);
    removeEmptyGroups(doc);
  }, origin);
}

/** Gruppe auflösen: Geräte bleiben, nur die Zuordnung entfällt. */
export function removeGroup(doc: Y.Doc, id: string, origin: unknown): void {
  doc.transact(() => {
    for (const map of doc.getMap<Y.Map<unknown>>('devices').values()) if (map.get('groupId') === id) map.delete('groupId');
    doc.getMap('groups').delete(id);
  }, origin);
}

function setDeviceGroup(doc: Y.Doc, deviceIds: string[], groupId: string | undefined): void {
  const devices = doc.getMap<Y.Map<unknown>>('devices');
  for (const id of deviceIds) {
    const map = devices.get(id);
    if (!map) continue;
    if (groupId) map.set('groupId', groupId);
    else map.delete('groupId');
  }
}

function removeEmptyGroups(doc: Y.Doc): void {
  const used = new Set<string>();
  for (const map of doc.getMap<Y.Map<unknown>>('devices').values()) {
    const g = map.get('groupId');
    if (typeof g === 'string') used.add(g);
  }
  const groups = doc.getMap('groups');
  for (const id of [...groups.keys()]) if (!used.has(id)) groups.delete(id);
}
