// Tonszenen (Regie): je Lied/Stück Szenen mit Auslöser wie beim Licht, dazu eine formatierte Notiz für den Ton.
import * as Y from 'yjs';
import { newId } from '../model/project';
import type { SoundScene } from '../model/schema';
import { itemScenes, readScenes } from './scenes';

const byOrder = (a: SoundScene, b: SoundScene) => a.order - b.order || a.id.localeCompare(b.id);

function soundMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('soundScenes');
}

function setFields(map: Y.Map<unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) map.delete(key);
    else map.set(key, value);
  }
}

export function readSoundScenes(doc: Y.Doc): SoundScene[] {
  return Object.values(soundMap(doc).toJSON() as Record<string, SoundScene>)
    .map((s) => ({ ...s, name: s.name ?? '' }))
    .sort(byOrder);
}

export function itemSoundScenes(scenes: SoundScene[], itemId: string): SoundScene[] {
  return scenes.filter((s) => s.itemId === itemId).sort(byOrder);
}

function renumber(doc: Y.Doc, ids: string[]): void {
  ids.forEach((id, i) => {
    const m = soundMap(doc).get(id);
    if (m && m.get('order') !== i) m.set('order', i);
  });
}

/** Neue Tonszene (am Ende bzw. nach afterId) */
export function addSoundScene(doc: Y.Doc, itemId: string, origin: unknown, init: Partial<Omit<SoundScene, 'id' | 'itemId' | 'order'>> & { afterId?: string } = {}): string {
  const id = newId();
  const { afterId, ...fields } = init;
  doc.transact(() => {
    const ids = itemSoundScenes(readSoundScenes(doc), itemId).map((s) => s.id);
    const map = new Y.Map<unknown>();
    soundMap(doc).set(id, map);
    setFields(map, { name: `Szene ${ids.length + 1}`, ...fields, id, itemId, order: ids.length });
    ids.splice(afterId ? ids.indexOf(afterId) + 1 : ids.length, 0, id);
    renumber(doc, ids);
  }, origin);
  return id;
}

export function updateSoundScene(doc: Y.Doc, id: string, patch: Partial<Omit<SoundScene, 'id' | 'itemId'>>, origin: unknown): void {
  const map = soundMap(doc).get(id);
  if (!map) return;
  doc.transact(() => setFields(map, patch), origin);
}

export function removeSoundScene(doc: Y.Doc, id: string, origin: unknown): void {
  const scene = readSoundScenes(doc).find((s) => s.id === id);
  if (!scene) return;
  doc.transact(() => {
    soundMap(doc).delete(id);
    renumber(doc, itemSoundScenes(readSoundScenes(doc), scene.itemId).map((s) => s.id));
  }, origin);
}

export function moveSoundScene(doc: Y.Doc, id: string, delta: -1 | 1, origin: unknown): void {
  const scene = readSoundScenes(doc).find((s) => s.id === id);
  if (!scene) return;
  const ids = itemSoundScenes(readSoundScenes(doc), scene.itemId).map((s) => s.id);
  const from = ids.indexOf(id);
  const to = from + delta;
  if (to < 0 || to >= ids.length) return;
  ids.splice(from, 1);
  ids.splice(to, 0, id);
  doc.transact(() => renumber(doc, ids), origin);
}

/**
 * Lichtszenen des Eintrags als Tonszenen übernehmen: schon übernommene bekommen Name und Auslöser der Lichtszene
 * (ihre Notiz bleibt), neue kommen dazu; eigene Tonszenen bleiben. Reihenfolge wie beim Licht, eigene dahinter.
 * Ergebnis: Zahl der neu angelegten Szenen.
 */
export function importLightScenes(doc: Y.Doc, itemId: string, origin: unknown): number {
  const light = itemScenes(readScenes(doc), itemId);
  let created = 0;
  doc.transact(() => {
    const existing = itemSoundScenes(readSoundScenes(doc), itemId);
    const byLight = new Map(existing.filter((s) => s.lightSceneId).map((s) => [s.lightSceneId!, s]));
    const ordered: string[] = [];
    for (const l of light) {
      const fields = { name: l.name, atSec: l.atSec, lineId: l.lineId };
      const found = byLight.get(l.id);
      if (found) {
        setFields(soundMap(doc).get(found.id)!, fields);
        ordered.push(found.id);
      } else {
        const id = newId();
        const map = new Y.Map<unknown>();
        soundMap(doc).set(id, map);
        setFields(map, { ...fields, id, itemId, order: 0, lightSceneId: l.id });
        ordered.push(id);
        created++;
      }
    }
    for (const s of existing) if (!ordered.includes(s.id)) ordered.push(s.id);
    renumber(doc, ordered);
  }, origin);
  return created;
}

/** Tonszenen eines Eintrags löschen (beim Löschen des Eintrags) */
export function removeItemSoundScenes(doc: Y.Doc, itemId: string): void {
  for (const s of readSoundScenes(doc)) if (s.itemId === itemId) soundMap(doc).delete(s.id);
}

/** Tonszenen auf einen anderen Eintrag kopieren (beim Kopieren des Eintrags; Textzeilen umgeschlüsselt) */
export function copyItemSoundScenes(doc: Y.Doc, fromItem: string, toItem: string, lineIds: Map<string, string>): void {
  for (const scene of itemSoundScenes(readSoundScenes(doc), fromItem)) {
    const id = newId();
    const map = new Y.Map<unknown>();
    soundMap(doc).set(id, map);
    const { id: _id, itemId: _item, lineId, lightSceneId: _l, ...rest } = scene;
    const mapped = lineId ? lineIds.get(lineId) : undefined;
    setFields(map, { ...rest, id, itemId: toItem, ...(mapped ? { lineId: mapped } : {}) });
  }
}
