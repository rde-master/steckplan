import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, ProjectSchema } from './schema';
import { createEmptyProject, DEFAULT_LAYER_NAMES, serializeProject, withoutSecrets } from './project';

describe('Projekt-Schema', () => {
  it('füllt ein minimales Projekt mit Standardwerten auf', () => {
    const project = ProjectSchema.parse({ schemaVersion: CURRENT_SCHEMA_VERSION, id: 'p1' });
    expect(project.meta.name).toBe('');
    expect(project.settings).toEqual({ gridMm: 500, snap: true, defaultReservePercent: 10, defaultReservePerEndMm: 500 });
    expect(project.devices).toEqual([]);
    expect(project.network).toEqual({ subnets: [], wifi: [] });
    expect(project.secrets).toEqual({ wifiPasswords: [] });
    expect(project.views.stagePlan).toEqual({ zoom: 1, pan: { x: 0, y: 0 } });
  });

  it('lehnt ungültige Werte ab', () => {
    const base = { schemaVersion: CURRENT_SCHEMA_VERSION, id: 'p1' };
    const device = { id: 'd', templateId: 't', layerId: 'l', label: 'Spot 1' };
    expect(ProjectSchema.safeParse({ ...base, devices: [{ ...device, dmx: { modeName: 'x', universe: 1, address: 513 } }] }).success).toBe(false);
    expect(ProjectSchema.safeParse({ ...base, devices: [{ ...device, dmx: { modeName: 'x', universe: 1, address: 1 } }] }).success).toBe(true);
    expect(ProjectSchema.safeParse({ ...base, id: '' }).success).toBe(false);
  });

  it('erzeugt ein leeres Projekt mit Standard-Ebenen', () => {
    const project = createEmptyProject({ name: 'Sommerfest', libraryId: 'lib1' });
    expect(project.meta.name).toBe('Sommerfest');
    expect(project.libraryId).toBe('lib1');
    expect(project.layers.map((l) => l.name)).toEqual([...DEFAULT_LAYER_NAMES]);
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ProjectSchema.parse(JSON.parse(serializeProject(project)))).toEqual(project);
  });

  it('entfernt den geschützten Bereich', () => {
    const project = { ...createEmptyProject({ name: 'x' }), secrets: { wifiPasswords: [{ wifiId: 'w', password: 'geheim' }] } };
    expect(withoutSecrets(project).secrets.wifiPasswords).toEqual([]);
    expect(project.secrets.wifiPasswords).toHaveLength(1);
  });
});
