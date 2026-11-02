import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import type { Cable, DeviceInstance, Project } from '../model/schema';
import { createYDocFromProject, readProjectFromYDoc } from '../model/ydoc';
import { readDevices } from './doc-ops';
import { addFlowPage, crossPageRefs, devicePageId, moveDevicesToPage, moveFlowPage, readFlowPages, removeFlowPage, renameFlowPage } from './pages';

const dev = (id: string, pageId?: string): DeviceInstance => ({ id, templateId: 't', layerId: 'l', label: id, signalFlow: { position: { x: 0, y: 0 }, ...(pageId ? { pageId } : {}) } });
const cable = (id: string, a: string, b: string): Cable => ({ id, from: { deviceId: a, portId: 'o' }, to: { deviceId: b, portId: 'i' }, waypoints: [] });

describe('Seiten im Signalfluss', () => {
  const pages = [
    { id: 'ton', name: 'Ton', order: 1 },
    { id: 'licht', name: 'Licht', order: 0 },
  ];

  it('Gerät ohne (gültige) Seite gehört zur ersten Seite; ohne Seiten gibt es nur die unbenannte', () => {
    expect(devicePageId(dev('a'), pages)).toBe('licht');
    expect(devicePageId(dev('a', 'gibtsnicht'), pages)).toBe('licht');
    expect(devicePageId(dev('a', 'ton'), pages)).toBe('ton');
    expect(devicePageId(dev('a', 'ton'), [])).toBe('');
  });

  it('Kabel zwischen Seiten ergeben Verweise an beiden Enden', () => {
    const refs = crossPageRefs([dev('Pult', 'ton'), dev('Dimmer', 'licht'), dev('Mikro', 'ton')], [cable('x', 'Pult', 'Dimmer'), cable('y', 'Mikro', 'Pult')], pages);
    expect(refs.map((r) => `${r.deviceId}/${r.portId} → ${r.targetPageName}: ${r.targetDeviceLabel}/${r.targetPortId}`)).toEqual(['Pult/o → Licht: Dimmer/i', 'Dimmer/i → Ton: Pult/o']);
    expect(crossPageRefs([dev('a'), dev('b')], [cable('x', 'a', 'b')], [])).toEqual([]);
  });

  it('anlegen, umbenennen, verschieben, löschen (Geräte ziehen um)', () => {
    const project: Project = { ...createEmptyProject({ name: 'P' }), devices: [dev('A'), dev('B')] };
    const doc = createYDocFromProject(project);
    const licht = addFlowPage(doc, 'Licht', null);
    const ton = addFlowPage(doc, ' Ton ', null);
    expect(readFlowPages(doc).map((p) => p.name)).toEqual(['Licht', 'Ton']);
    moveDevicesToPage(doc, ['B'], ton.id, null);
    expect(readDevices(doc).find((d) => d.id === 'B')!.signalFlow!.pageId).toBe(ton.id);
    moveFlowPage(doc, ton.id, -1, null);
    expect(readFlowPages(doc).map((p) => p.name)).toEqual(['Ton', 'Licht']);
    renameFlowPage(doc, licht.id, 'Beleuchtung', null);
    // A hat keine Seite → gehört jetzt zur ersten Seite (Ton); beim Löschen von Ton ziehen A und B nach Beleuchtung
    removeFlowPage(doc, ton.id, licht.id, null);
    expect(readFlowPages(doc).map((p) => p.name)).toEqual(['Beleuchtung']);
    expect(readDevices(doc).map((d) => d.signalFlow!.pageId).sort()).toEqual([licht.id, licht.id]);
    // die letzte Seite bleibt
    removeFlowPage(doc, licht.id, licht.id, null);
    expect(readFlowPages(doc)).toHaveLength(1);
    expect(readProjectFromYDoc(doc).ok).toBe(true);
  });
});
