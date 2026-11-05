// Lichtszenen (Regie, M11d): je Lied/Schauspiel beliebig viele Szenen; Werte je Gerät und Szene.
// Nur Planung/Dokumentation – keine DMX-Ausgabe.
import * as Y from 'yjs';
import { newId } from '../model/project';
import type { FixtureState, FixtureValues, LightScene, TextLine } from '../model/schema';

const byOrder = (a: LightScene, b: LightScene) => a.order - b.order || a.id.localeCompare(b.id);

export function readScenes(doc: Y.Doc): LightScene[] {
  return Object.values(doc.getMap('lightScenes').toJSON() as Record<string, LightScene>)
    .map((s) => ({ ...s, name: s.name ?? '' }))
    .sort(byOrder);
}

export function readSceneStates(doc: Y.Doc): FixtureState[] {
  return Object.values(doc.getMap('sceneStates').toJSON() as Record<string, FixtureState>);
}

export function itemScenes(scenes: LightScene[], itemId: string): LightScene[] {
  return scenes.filter((s) => s.itemId === itemId).sort(byOrder);
}

/** Werte einer Szene je Gerät */
export function sceneStates(states: FixtureState[], sceneId: string): Map<string, FixtureState> {
  return new Map(states.filter((s) => s.sceneId === sceneId).map((s) => [s.deviceId, s]));
}

export function stateId(sceneId: string, deviceId: string): string {
  return `${sceneId}:${deviceId}`;
}

/** Zeitpunkt einer Szene: eigener Zeitpunkt, sonst der Zeitpunkt ihrer Textzeile */
export function sceneTime(scene: LightScene, lines: TextLine[]): number | undefined {
  if (scene.atSec !== undefined) return scene.atSec;
  return scene.lineId ? lines.find((l) => l.id === scene.lineId)?.atSec : undefined;
}

/** Aktuelle Szene zur Abspielzeit: die zuletzt begonnene (Szenen ohne Zeitpunkt zählen nicht). */
export function currentSceneId(scenes: LightScene[], lines: TextLine[], t: number): string | undefined {
  let best: { id: string; at: number } | undefined;
  for (const scene of scenes) {
    const at = sceneTime(scene, lines);
    if (at === undefined || at > t + 0.05) continue;
    if (!best || at >= best.at) best = { id: scene.id, at };
  }
  return best?.id;
}

// ---------- Änderungen am Live-Dokument ----------

function scenesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('lightScenes');
}
function statesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('sceneStates');
}

function setFields(map: Y.Map<unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) map.delete(key);
    else map.set(key, value);
  }
}

function renumber(doc: Y.Doc, ids: string[]): void {
  ids.forEach((id, i) => {
    const m = scenesMap(doc).get(id);
    if (m && m.get('order') !== i) m.set('order', i);
  });
}

/**
 * Neue Szene (am Ende bzw. nach afterId). Standard: übernimmt die Werte der vorigen Szene („wie vorige“);
 * copyFrom: null = leer beginnen.
 */
export function addScene(doc: Y.Doc, itemId: string, origin: unknown, options: { name?: string; afterId?: string; copyFrom?: string | null } = {}): string {
  const id = newId();
  doc.transact(() => {
    const existing = itemScenes(readScenes(doc), itemId);
    const ids = existing.map((s) => s.id);
    const index = options.afterId ? ids.indexOf(options.afterId) + 1 : ids.length;
    const previous = options.copyFrom === null ? undefined : (options.copyFrom ?? ids[index - 1]);
    const map = new Y.Map<unknown>();
    scenesMap(doc).set(id, map);
    setFields(map, { id, itemId, order: existing.length, name: options.name ?? `Szene ${existing.length + 1}` });
    ids.splice(index, 0, id);
    renumber(doc, ids);
    if (previous) copyStates(doc, previous, id);
  }, origin);
  return id;
}

function copyStates(doc: Y.Doc, fromScene: string, toScene: string): void {
  for (const state of readSceneStates(doc).filter((s) => s.sceneId === fromScene)) {
    const { id: _id, sceneId: _s, ...values } = state;
    const map = new Y.Map<unknown>();
    statesMap(doc).set(stateId(toScene, state.deviceId), map);
    setFields(map, { ...values, id: stateId(toScene, state.deviceId), sceneId: toScene });
  }
}

export function updateScene(doc: Y.Doc, id: string, patch: Partial<Omit<LightScene, 'id' | 'itemId'>>, origin: unknown): void {
  const map = scenesMap(doc).get(id);
  if (!map) return;
  doc.transact(() => setFields(map, patch), origin);
}

export function removeScene(doc: Y.Doc, id: string, origin: unknown): void {
  const scene = readScenes(doc).find((s) => s.id === id);
  if (!scene) return;
  doc.transact(() => {
    scenesMap(doc).delete(id);
    for (const s of readSceneStates(doc)) if (s.sceneId === id) statesMap(doc).delete(s.id);
    renumber(doc, itemScenes(readScenes(doc), scene.itemId).map((s) => s.id));
  }, origin);
}

export function moveScene(doc: Y.Doc, id: string, delta: -1 | 1, origin: unknown): void {
  const scene = readScenes(doc).find((s) => s.id === id);
  if (!scene) return;
  const ids = itemScenes(readScenes(doc), scene.itemId).map((s) => s.id);
  const from = ids.indexOf(id);
  const to = from + delta;
  if (to < 0 || to >= ids.length) return;
  ids.splice(from, 1);
  ids.splice(to, 0, id);
  doc.transact(() => renumber(doc, ids), origin);
}

/** Szene mit ihren Werten kopieren (direkt dahinter). */
export function duplicateScene(doc: Y.Doc, id: string, origin: unknown): string | undefined {
  const scene = readScenes(doc).find((s) => s.id === id);
  if (!scene) return undefined;
  return addScene(doc, scene.itemId, origin, { name: `${scene.name} (Kopie)`, afterId: id, copyFrom: id });
}

/** Werte für mehrere Geräte in einer Szene setzen; undefined löscht die Angabe. */
export function setFixtureValues(doc: Y.Doc, sceneId: string, deviceIds: string[], patch: Partial<Record<keyof FixtureValues, unknown>>, origin: unknown): void {
  doc.transact(() => {
    for (const deviceId of deviceIds) {
      const key = stateId(sceneId, deviceId);
      let map = statesMap(doc).get(key);
      if (!map) {
        map = new Y.Map<unknown>();
        statesMap(doc).set(key, map);
        setFields(map, { id: key, sceneId, deviceId });
      }
      setFields(map, patch as Record<string, unknown>);
      if ([...map.keys()].every((k) => k === 'id' || k === 'sceneId' || k === 'deviceId')) statesMap(doc).delete(key);
    }
  }, origin);
}

/** Alle Werte der Geräte in dieser Szene löschen. */
export function clearFixtureValues(doc: Y.Doc, sceneId: string, deviceIds: string[], origin: unknown): void {
  doc.transact(() => {
    for (const deviceId of deviceIds) statesMap(doc).delete(stateId(sceneId, deviceId));
  }, origin);
}

/** Werte einer Szene ohne Kennungen – zum Kopieren und Einfügen (auch in Szenen anderer Stücke). */
export type SceneValues = Omit<FixtureState, 'id' | 'sceneId'>[];

export function sceneValues(states: FixtureState[], sceneId: string): SceneValues {
  return states.filter((s) => s.sceneId === sceneId).map(({ id: _id, sceneId: _s, ...values }) => values);
}

/** Werte der Zielszenen vollständig ersetzen (vorhandene Angaben fallen weg). */
export function replaceSceneValues(doc: Y.Doc, values: SceneValues, sceneIds: string[], origin: unknown): void {
  const known = new Set(readScenes(doc).map((s) => s.id));
  const targets = new Set(sceneIds.filter((id) => known.has(id)));
  if (targets.size === 0) return;
  doc.transact(() => {
    for (const s of readSceneStates(doc)) if (targets.has(s.sceneId)) statesMap(doc).delete(s.id);
    for (const sceneId of targets) {
      for (const v of values) {
        const id = stateId(sceneId, v.deviceId);
        const map = new Y.Map<unknown>();
        statesMap(doc).set(id, map);
        setFields(map, { ...v, id, sceneId });
      }
    }
  }, origin);
}

/** Szene komplett in andere Szenen kopieren. */
export function copySceneTo(doc: Y.Doc, fromScene: string, toScenes: string[], origin: unknown): void {
  replaceSceneValues(doc, sceneValues(readSceneStates(doc), fromScene), toScenes.filter((id) => id !== fromScene), origin);
}

/** Szenen eines Eintrags (mit Werten) löschen – beim Löschen des Eintrags. */
export function removeItemScenes(doc: Y.Doc, itemId: string): void {
  const ids = new Set(itemScenes(readScenes(doc), itemId).map((s) => s.id));
  for (const id of ids) scenesMap(doc).delete(id);
  for (const s of readSceneStates(doc)) if (ids.has(s.sceneId)) statesMap(doc).delete(s.id);
}

/** Szenen eines Eintrags auf einen anderen kopieren (beim Kopieren des Eintrags; Textzeilen umgeschlüsselt). */
export function copyItemScenes(doc: Y.Doc, fromItem: string, toItem: string, lineIds: Map<string, string>): void {
  const states = readSceneStates(doc);
  for (const scene of itemScenes(readScenes(doc), fromItem)) {
    const id = newId();
    const map = new Y.Map<unknown>();
    scenesMap(doc).set(id, map);
    const { id: _id, itemId: _item, lineId, ...rest } = scene;
    const mapped = lineId ? lineIds.get(lineId) : undefined;
    setFields(map, { ...rest, id, itemId: toItem, ...(mapped ? { lineId: mapped } : {}) });
    for (const state of states.filter((s) => s.sceneId === scene.id)) {
      const { id: _sid, sceneId: _sc, ...values } = state;
      const smap = new Y.Map<unknown>();
      statesMap(doc).set(stateId(id, state.deviceId), smap);
      setFields(smap, { ...values, id: stateId(id, state.deviceId), sceneId: id });
    }
  }
}
