// Licht-Events: Zeitpunkte in einem Lied/Schauspiel, an denen etwas Besonderes passiert (Notiz) – als Marker in den
// Zeitleisten und mit Countdown in der Vorstellung.
import * as Y from 'yjs';
import { newId } from '../model/project';
import type { LightEvent } from '../model/schema';

function eventsMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('lightEvents');
}

const byTime = (a: LightEvent, b: LightEvent) => a.atSec - b.atSec || a.id.localeCompare(b.id);

export function readLightEvents(doc: Y.Doc): LightEvent[] {
  return Object.values(eventsMap(doc).toJSON() as Record<string, LightEvent>)
    .map((e) => ({ ...e, note: e.note ?? '' }))
    .sort(byTime);
}

export function itemLightEvents(events: LightEvent[], itemId: string): LightEvent[] {
  return events.filter((e) => e.itemId === itemId).sort(byTime);
}

const round = (sec: number) => Math.max(0, Math.round(sec * 10) / 10);

export function addLightEvent(doc: Y.Doc, itemId: string, atSec: number, note: string, origin: unknown): string {
  const id = newId();
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    eventsMap(doc).set(id, map);
    map.set('id', id);
    map.set('itemId', itemId);
    map.set('atSec', round(atSec));
    map.set('note', note);
  }, origin);
  return id;
}

export function updateLightEvent(doc: Y.Doc, id: string, patch: { atSec?: number; note?: string }, origin: unknown): void {
  const map = eventsMap(doc).get(id);
  if (!map) return;
  doc.transact(() => {
    if (patch.atSec !== undefined) map.set('atSec', round(patch.atSec));
    if (patch.note !== undefined) map.set('note', patch.note);
  }, origin);
}

export function removeLightEvent(doc: Y.Doc, id: string, origin: unknown): void {
  doc.transact(() => eventsMap(doc).delete(id), origin);
}

/** Events eines Eintrags löschen – beim Löschen des Eintrags */
export function removeItemLightEvents(doc: Y.Doc, itemId: string): void {
  for (const [key, map] of [...eventsMap(doc).entries()]) if (map.get('itemId') === itemId) eventsMap(doc).delete(key);
}

/** Events eines Eintrags auf einen anderen kopieren (beim Kopieren des Eintrags) */
export function copyItemLightEvents(doc: Y.Doc, fromItem: string, toItem: string): Map<string, string> {
  const ids = new Map<string, string>();
  for (const e of itemLightEvents(readLightEvents(doc), fromItem)) {
    const id = newId();
    ids.set(e.id, id);
    const map = new Y.Map<unknown>();
    eventsMap(doc).set(id, map);
    for (const [k, v] of Object.entries({ ...e, id, itemId: toItem })) map.set(k, v);
  }
  return ids;
}

/** Kommende Events ab Zeit t (gerade erreichte zählen noch kurz als „jetzt“) */
export function upcomingLightEvents(events: LightEvent[], t: number, nowWindow = 2): { event: LightEvent; inSec: number }[] {
  return events.filter((e) => e.atSec >= t - nowWindow).map((event) => ({ event, inSec: event.atSec - t }));
}
