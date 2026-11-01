// Subnetze und WLAN-Netze im Live-Dokument.
import * as Y from 'yjs';
import { newId } from '../model/project';
import type { Subnet, WifiNetwork } from '../model/schema';

type Name = 'subnets' | 'wifi';

function write(map: Y.Map<unknown>, values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === '') map.delete(key);
    else map.set(key, value);
  }
}

export function readSubnets(doc: Y.Doc): Subnet[] {
  return Object.values(doc.getMap('subnets').toJSON() as Record<string, Subnet>).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export function readWifi(doc: Y.Doc): WifiNetwork[] {
  return Object.values(doc.getMap('wifi').toJSON() as Record<string, WifiNetwork>).sort((a, b) => a.ssid.localeCompare(b.ssid, 'de'));
}

export function addNetworkItem<T extends Subnet | WifiNetwork>(doc: Y.Doc, name: Name, item: Omit<T, 'id'>, origin: unknown): T {
  const full = { ...item, id: newId() } as T;
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    doc.getMap<Y.Map<unknown>>(name).set(full.id, map);
    write(map, full as unknown as Record<string, unknown>);
  }, origin);
  return full;
}

export function updateNetworkItem(doc: Y.Doc, name: Name, id: string, patch: Record<string, unknown>, origin: unknown): void {
  doc.transact(() => {
    const map = doc.getMap<Y.Map<unknown>>(name).get(id);
    if (map) write(map, patch);
  }, origin);
}

export function removeNetworkItem(doc: Y.Doc, name: Name, id: string, origin: unknown): void {
  doc.transact(() => doc.getMap(name).delete(id), origin);
}
