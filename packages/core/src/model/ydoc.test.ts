import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createEmptyProject } from './project';
import type { Project } from './schema';
import { createYDocFromProject, readProjectFromYDoc, writeProjectToYDoc } from './ydoc';

function sampleProject(): Project {
  const project = createEmptyProject({ name: 'Stadtfest', meta: { venue: 'Marktplatz', date: '2026-07-04' } });
  return {
    ...project,
    devices: [
      { id: 'd2', templateId: 't1', layerId: project.layers[1]!.id, label: 'Spot 2', stagePlan: { position: { x: 1000, y: 2000 }, rotationDeg: 90 } },
      { id: 'd1', templateId: 't1', layerId: project.layers[1]!.id, label: 'Spot 1', dmx: { modeName: '16ch', universe: 1, address: 1 } },
    ],
    cables: [
      { id: 'c1', templateId: 'xlr', from: { deviceId: 'd1', portId: 'out' }, to: { deviceId: 'd2', portId: 'in' }, waypoints: [{ x: 0, y: 0 }] },
    ],
    network: { subnets: [{ id: 's1', name: 'Licht', cidr: '10.0.0.0/24' }], wifi: [{ id: 'w1', ssid: 'Crew', security: 'WPA2', hidden: false }] },
    secrets: { wifiPasswords: [{ wifiId: 'w1', password: 'geheim' }] },
    masterDataSnapshot: { categories: [{ id: 'k1', name: 'Licht' }], owners: [], trailers: [{ id: 'a1', name: 'Anhänger 1' }] },
  };
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

describe('Projekt ↔ Yjs-Dokument', () => {
  it('überträgt ein Projekt verlustfrei (ohne secrets)', () => {
    const project = sampleProject();
    const result = readProjectFromYDoc(createYDocFromProject(project), {
      secrets: project.secrets,
      masterDataSnapshot: project.masterDataSnapshot,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project).toEqual({ ...project, devices: sortById(project.devices) });
  });

  it('legt secrets und Snapshots nicht im Dokument ab', () => {
    const doc = createYDocFromProject(sampleProject());
    expect(JSON.stringify(doc.toJSON())).not.toContain('geheim');
    expect(JSON.stringify(doc.toJSON())).not.toContain('Anhänger 1');
    const result = readProjectFromYDoc(doc);
    expect(result.ok && result.project.secrets.wifiPasswords).toEqual([]);
  });

  it('ersetzt beim erneuten Schreiben den Inhalt vollständig (Version wiederherstellen)', () => {
    const project = sampleProject();
    const doc = createYDocFromProject(project);
    const restored = { ...project, devices: [project.devices[0]!], meta: { ...project.meta, name: 'Alt', venue: '' } };
    writeProjectToYDoc(restored, doc);
    const result = readProjectFromYDoc(doc);
    expect(result.ok && result.project.devices.map((d) => d.id)).toEqual(['d2']);
    expect(result.ok && result.project.meta.name).toBe('Alt');
  });

  it('führt gleichzeitige Änderungen an verschiedenen Feldern zusammen', () => {
    const a = createYDocFromProject(sampleProject());
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    (a.getMap('devices').get('d1') as Y.Map<unknown>).set('label', 'Spot links');
    (b.getMap('devices').get('d1') as Y.Map<unknown>).set('notes', 'Gobo prüfen');
    b.getMap('meta').set('planner', 'Ralf');

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    for (const doc of [a, b]) {
      const result = readProjectFromYDoc(doc);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const d1 = result.project.devices.find((d) => d.id === 'd1');
      expect(d1).toMatchObject({ label: 'Spot links', notes: 'Gobo prüfen' });
      expect(result.project.meta.planner).toBe('Ralf');
    }
  });

  it('meldet ungültigen Dokumentinhalt statt abzustürzen', () => {
    const doc = createYDocFromProject(sampleProject());
    doc.getMap('settings').set('gridMm', 'kaputt');
    const result = readProjectFromYDoc(doc);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('settings.gridMm');
  });
});
