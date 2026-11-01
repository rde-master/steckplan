// Änderungen am Live-Dokument (Yjs) für Geräte und Kabel.
// Jede Funktion ist eine Transaktion → ein Rückgängig-Schritt.
import * as Y from 'yjs';
import { newId } from '../model/project';
import type { Cable, DeviceInstance, Project, Template } from '../model/schema';

type Json = Record<string, unknown>;

function collection(doc: Y.Doc, name: 'devices' | 'cables'): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>(name);
}

function writeItem(map: Y.Map<unknown>, values: Json): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) map.delete(key);
    else map.set(key, value);
  }
}

export function readDevices(doc: Y.Doc): DeviceInstance[] {
  return Object.values(collection(doc, 'devices').toJSON() as Record<string, DeviceInstance>);
}

export function readCables(doc: Y.Doc): Cable[] {
  return Object.values(collection(doc, 'cables').toJSON() as Record<string, Cable>);
}

export function readLayers(doc: Y.Doc): Project['layers'] {
  return (Object.values(doc.getMap('layers').toJSON() as Record<string, Project['layers'][number]>)).sort((a, b) => a.order - b.order);
}

/** Nächste freie Kennung, z. B. „Spot 575 3“. */
export function nextLabel(base: string, existing: { label: string }[]): string {
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`);
  let max = 0;
  for (const item of existing) {
    const match = pattern.exec(item.label);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${base} ${max + 1}`;
}

export function addDevice(
  doc: Y.Doc,
  template: Template,
  position: { x: number; y: number },
  origin: unknown,
  options: { view?: 'signalFlow' | 'stagePlan'; layerId?: string; dock?: Partial<DeviceInstance> } = {},
): DeviceInstance {
  const layers = readLayers(doc);
  const pos = { x: Math.round(position.x), y: Math.round(position.y) };
  const device: DeviceInstance = {
    id: newId(),
    templateId: template.id,
    layerId: options.layerId ?? layers[0]?.id ?? 'layer',
    label: nextLabel(template.name, readDevices(doc)),
    ...(options.view === 'stagePlan' ? { stagePlan: { position: pos, rotationDeg: 0, ...(options.dock?.stagePlan ?? {}) } } : { signalFlow: { position: pos } }),
    ...(options.dock?.mountedOnId ? { mountedOnId: options.dock.mountedOnId } : {}),
    ...(template.defaultOwnerId ? { ownerId: template.defaultOwnerId } : {}),
    ...(template.defaultTrailerId ? { trailerId: template.defaultTrailerId } : {}),
  };
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    collection(doc, 'devices').set(device.id, map);
    writeItem(map, device as unknown as Json);
  }, origin);
  return device;
}

export function updateDevices(doc: Y.Doc, patches: { id: string; patch: Partial<DeviceInstance> }[], origin: unknown): void {
  doc.transact(() => {
    const devices = collection(doc, 'devices');
    for (const { id, patch } of patches) {
      const map = devices.get(id);
      if (map) writeItem(map, patch as Json);
    }
  }, origin);
}

/** Löscht Geräte samt angeschlossener Kabel. */
export function removeDevices(doc: Y.Doc, ids: string[], origin: unknown): void {
  const set = new Set(ids);
  doc.transact(() => {
    const devices = collection(doc, 'devices');
    const cables = collection(doc, 'cables');
    for (const id of ids) devices.delete(id);
    for (const cable of readCables(doc)) if (set.has(cable.from.deviceId) || set.has(cable.to.deviceId)) cables.delete(cable.id);
  }, origin);
}

/** Dupliziert Geräte (versetzt) samt Kabeln zwischen den duplizierten Geräten. Gibt die neuen ids zurück. */
export function duplicateDevices(
  doc: Y.Doc,
  ids: string[],
  offset: { x: number; y: number },
  origin: unknown,
  stageOffset: { x: number; y: number } = { x: 500, y: 500 },
): string[] {
  const all = readDevices(doc);
  const source = all.filter((d) => ids.includes(d.id));
  const idMap = new Map<string, string>();
  const created: DeviceInstance[] = [];
  for (const device of source) {
    const base = device.label.replace(/ \d+$/, '');
    const copy: DeviceInstance = {
      ...device,
      id: newId(),
      label: nextLabel(base, [...all, ...created]),
      signalFlow: device.signalFlow && { position: { x: device.signalFlow.position.x + offset.x, y: device.signalFlow.position.y + offset.y } },
      stagePlan: device.stagePlan && {
        ...device.stagePlan,
        position: { x: device.stagePlan.position.x + stageOffset.x, y: device.stagePlan.position.y + stageOffset.y },
      },
      check: undefined,
      lastModified: undefined,
      inventoryNo: undefined,
    };
    idMap.set(device.id, copy.id);
    created.push(copy);
  }
  // Andocken: an mitkopierte Träger umhängen, sonst lösen (Kopie liegt versetzt)
  for (const copy of created) {
    if (copy.mountedOnId) copy.mountedOnId = idMap.get(copy.mountedOnId);
    if (copy.stagePlan?.standsOnId) copy.stagePlan = { ...copy.stagePlan, standsOnId: idMap.get(copy.stagePlan.standsOnId) };
  }
  doc.transact(() => {
    for (const device of created) {
      const map = new Y.Map<unknown>();
      collection(doc, 'devices').set(device.id, map);
      writeItem(map, device as unknown as Json);
    }
    for (const cable of readCables(doc)) {
      const from = idMap.get(cable.from.deviceId);
      const to = idMap.get(cable.to.deviceId);
      if (!from || !to) continue;
      const copy: Cable = { ...cable, id: newId(), from: { ...cable.from, deviceId: from }, to: { ...cable.to, deviceId: to }, check: undefined, inventoryNo: undefined };
      const map = new Y.Map<unknown>();
      collection(doc, 'cables').set(copy.id, map);
      writeItem(map, copy as unknown as Json);
    }
  }, origin);
  return created.map((d) => d.id);
}

export function addCable(
  doc: Y.Doc,
  cable: Pick<Cable, 'from' | 'to'> & Partial<Cable>,
  origin: unknown,
): Cable {
  const full: Cable = { waypoints: [], ...cable, id: newId() };
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    collection(doc, 'cables').set(full.id, map);
    writeItem(map, full as unknown as Json);
  }, origin);
  return full;
}

export function updateCables(doc: Y.Doc, patches: { id: string; patch: Partial<Cable> }[], origin: unknown): void {
  doc.transact(() => {
    const cables = collection(doc, 'cables');
    for (const { id, patch } of patches) {
      const map = cables.get(id);
      if (map) writeItem(map, patch as Json);
    }
  }, origin);
}

export function removeCables(doc: Y.Doc, ids: string[], origin: unknown): void {
  doc.transact(() => {
    const cables = collection(doc, 'cables');
    for (const id of ids) cables.delete(id);
  }, origin);
}
