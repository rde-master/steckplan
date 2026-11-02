// Seiten im Signalfluss (z. B. „Licht“, „Ton“), frei verwaltbar. Jedes Gerät steht auf genau einer Seite;
// ohne (gültige) Seite gehört es zur ersten. Ohne angelegte Seiten gibt es eine einzige, unbenannte Seite (id '').
import * as Y from 'yjs';
import { newId } from '../model/project';
import type { Cable, DeviceInstance, FlowPage } from '../model/schema';

export function sortPages(pages: FlowPage[]): FlowPage[] {
  return [...pages].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'de'));
}

/** Seite eines Geräts (id der Seite; '' wenn keine Seiten angelegt sind). */
export function devicePageId(device: Pick<DeviceInstance, 'signalFlow'>, pages: FlowPage[]): string {
  const sorted = sortPages(pages);
  const own = device.signalFlow?.pageId;
  if (own && sorted.some((p) => p.id === own)) return own;
  return sorted[0]?.id ?? '';
}

export interface CrossPageRef {
  /** Anschluss auf dieser Seite */
  deviceId: string;
  portId: string;
  /** Gegenstelle auf einer anderen Seite */
  targetPageId: string;
  targetPageName: string;
  targetDeviceId: string;
  targetDeviceLabel: string;
  targetPortId: string;
}

/** Kabel, deren Enden auf verschiedenen Seiten liegen – je Ende ein Verweis auf die andere Seite. */
export function crossPageRefs(devices: DeviceInstance[], cables: Cable[], pages: FlowPage[]): CrossPageRef[] {
  if (pages.length < 2) return [];
  const byId = new Map(devices.map((d) => [d.id, d]));
  const name = new Map(pages.map((p) => [p.id, p.name]));
  const refs: CrossPageRef[] = [];
  for (const cable of cables) {
    const a = byId.get(cable.from.deviceId);
    const b = byId.get(cable.to.deviceId);
    if (!a || !b) continue;
    const pa = devicePageId(a, pages);
    const pb = devicePageId(b, pages);
    if (pa === pb) continue;
    refs.push({ deviceId: a.id, portId: cable.from.portId, targetPageId: pb, targetPageName: name.get(pb) ?? '', targetDeviceId: b.id, targetDeviceLabel: b.label, targetPortId: cable.to.portId });
    refs.push({ deviceId: b.id, portId: cable.to.portId, targetPageId: pa, targetPageName: name.get(pa) ?? '', targetDeviceId: a.id, targetDeviceLabel: a.label, targetPortId: cable.from.portId });
  }
  return refs;
}

// ---------- Änderungen am Live-Dokument ----------

export function readFlowPages(doc: Y.Doc): FlowPage[] {
  return sortPages(Object.values(doc.getMap('flowPages').toJSON() as Record<string, FlowPage>));
}

/**
 * Neue Seite anlegen (am Ende). Ohne bisherige Seiten gehören alle vorhandenen Geräte zur ersten Seite.
 */
export function addFlowPage(doc: Y.Doc, name: string, origin: unknown): FlowPage {
  const existing = readFlowPages(doc);
  const page: FlowPage = { id: newId(), name: name.trim() || `Seite ${existing.length + 1}`, order: (existing.at(-1)?.order ?? -1) + 1 };
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    doc.getMap<Y.Map<unknown>>('flowPages').set(page.id, map);
    map.set('id', page.id);
    map.set('name', page.name);
    map.set('order', page.order);
  }, origin);
  return page;
}

export function renameFlowPage(doc: Y.Doc, id: string, name: string, origin: unknown): void {
  doc.transact(() => doc.getMap<Y.Map<unknown>>('flowPages').get(id)?.set('name', name), origin);
}

/** Seite um eine Stelle nach vorn (−1) oder hinten (+1) schieben. */
export function moveFlowPage(doc: Y.Doc, id: string, direction: -1 | 1, origin: unknown): void {
  const pages = readFlowPages(doc);
  const index = pages.findIndex((p) => p.id === id);
  const other = pages[index + direction];
  if (index < 0 || !other) return;
  doc.transact(() => {
    const map = doc.getMap<Y.Map<unknown>>('flowPages');
    pages.forEach((p, i) => map.get(p.id)?.set('order', i));
    map.get(id)?.set('order', index + direction);
    map.get(other.id)?.set('order', index);
  }, origin);
}

/** Seite löschen; ihre Geräte kommen auf `moveTo`. Die letzte Seite kann nicht gelöscht werden. */
export function removeFlowPage(doc: Y.Doc, id: string, moveTo: string, origin: unknown): void {
  const pages = readFlowPages(doc);
  if (pages.length < 2 || !pages.some((p) => p.id === moveTo) || moveTo === id) return;
  doc.transact(() => {
    for (const map of doc.getMap<Y.Map<unknown>>('devices').values()) {
      const sf = map.get('signalFlow') as { position: { x: number; y: number }; pageId?: string } | undefined;
      const current = sf?.pageId && pages.some((p) => p.id === sf.pageId) ? sf.pageId : pages[0]!.id;
      if (sf && current === id) map.set('signalFlow', { ...sf, pageId: moveTo });
    }
    doc.getMap('flowPages').delete(id);
  }, origin);
}

/** Geräte auf eine Seite verschieben (Position bleibt). */
export function moveDevicesToPage(doc: Y.Doc, deviceIds: string[], pageId: string, origin: unknown): void {
  doc.transact(() => {
    const devices = doc.getMap<Y.Map<unknown>>('devices');
    for (const id of deviceIds) {
      const map = devices.get(id);
      if (!map) continue;
      const sf = (map.get('signalFlow') as { position: { x: number; y: number }; pageId?: string } | undefined) ?? { position: { x: 40, y: 40 } };
      map.set('signalFlow', { ...sf, pageId });
    }
  }, origin);
}
