import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createProjectDataStore } from './useProjectData';

function put(doc: Y.Doc, root: string, id: string, values: Record<string, unknown>): void {
  doc.transact(() => {
    const collection = doc.getMap<Y.Map<unknown>>(root);
    let item = collection.get(id);
    if (!item) {
      item = new Y.Map<unknown>();
      collection.set(id, item);
    }
    for (const [key, value] of Object.entries(values)) item.set(key, value);
  });
}

function filled(): Y.Doc {
  const doc = new Y.Doc();
  put(doc, 'devices', 'd1', { id: 'd1', templateId: 't', label: 'Pult' });
  put(doc, 'cables', 'c1', { id: 'c1' });
  put(doc, 'showItems', 'i1', { id: 'i1', kind: 'song', order: 0, title: 'Lied' });
  put(doc, 'showSections', 's1', { id: 's1', itemId: 'i1', kind: 'verse', order: 0, lines: [{ id: 'l1', text: 'Zeile' }] });
  put(doc, 'subnets', 'n1', { id: 'n1', name: 'Ton' });
  return doc;
}

describe('Projektdaten: nur geänderte Teile neu lesen', () => {
  it('liest nach einer Änderung nur den betroffenen Teil neu, die anderen behalten ihre Identität', () => {
    const doc = filled();
    const store = createProjectDataStore(doc);
    let calls = 0;
    store.subscribe(() => calls++);
    const before = store.get();

    put(doc, 'showSections', 's1', { lines: [{ id: 'l1', text: 'Zeile', atSec: 3 }] });
    const after = store.get();
    expect(calls).toBe(1);
    expect(after).not.toBe(before);
    expect(after.show.sections[0]!.lines[0]!.atSec).toBe(3);
    // Geräte, Kabel, Netzwerk: unverändert dieselben Objekte
    expect(after.devices).toBe(before.devices);
    expect(after.cables).toBe(before.cables);
    expect(after.network).toBe(before.network);
    expect(after.sceneStates).toBe(before.sceneStates);

    put(doc, 'devices', 'd1', { label: 'FOH' });
    const third = store.get();
    expect(calls).toBe(2);
    expect(third.devices[0]!.label).toBe('FOH');
    expect(third.show).toBe(after.show);
  });

  it('Teile aus mehreren Bereichen (Netzwerk: Subnetze und WLAN) und der Hintergrund (Wurzel)', () => {
    const doc = filled();
    const store = createProjectDataStore(doc);
    store.subscribe(() => undefined);
    const before = store.get();
    put(doc, 'wifi', 'w1', { id: 'w1', ssid: 'Technik' });
    expect(store.get().network.wifi.map((w) => w.ssid)).toEqual(['Technik']);
    expect(store.get().network.subnets).toEqual(before.network.subnets);
    doc.transact(() => doc.getMap('root').set('background', { mediaId: 'm' }));
    expect(store.get().background).toEqual({ mediaId: 'm' });
    expect(store.get().devices).toBe(before.devices);
  });

  it('eine Transaktion ohne Änderung rendert nicht neu; nach dem Abbestellen wird nicht mehr gelesen', () => {
    const doc = filled();
    const store = createProjectDataStore(doc);
    let calls = 0;
    const off = store.subscribe(() => calls++);
    const before = store.get();
    doc.transact(() => undefined);
    expect(calls).toBe(0);
    expect(store.get()).toBe(before);
    off();
    put(doc, 'devices', 'd2', { id: 'd2', label: 'Box' });
    expect(calls).toBe(0);
  });

  it('Änderungen zwischen Anlegen und Abonnieren gehen nicht verloren (und Unverändertes bleibt gleich)', () => {
    const doc = filled();
    const store = createProjectDataStore(doc);
    const before = store.get();
    put(doc, 'cables', 'c2', { id: 'c2' });
    store.subscribe(() => undefined);
    expect(store.get().cables).toHaveLength(2);
    expect(store.get().devices).toBe(before.devices);
  });

  it('entspricht nach vielen Änderungen dem vollständig neu gelesenen Stand', () => {
    const doc = filled();
    const store = createProjectDataStore(doc);
    store.subscribe(() => undefined);
    const roots = ['devices', 'cables', 'showItems', 'showSections', 'lightScenes', 'sceneStates', 'people', 'media', 'gigs', 'lightEvents', 'oscCommands', 'soundScenes'];
    for (let i = 0; i < 200; i++) {
      const root = roots[i % roots.length]!;
      put(doc, root, `x${i % 7}`, { id: `x${i % 7}`, order: i, itemId: 'i1', kind: 'song', label: `L${i}`, name: `N${i}`, firstName: 'A', lastName: `B${i}`, ssid: 'x', addedAt: `2026-01-${i}`, createdAt: 'x', date: '2026-01-01', time: '10:00', atSec: i, sceneId: 'a', deviceId: 'b' });
      if (i % 13 === 0) doc.transact(() => doc.getMap(root).delete(`x${(i + 3) % 7}`));
    }
    const fresh = createProjectDataStore(doc).get();
    expect(store.get()).toEqual(fresh);
  });
});
