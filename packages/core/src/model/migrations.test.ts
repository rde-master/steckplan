import { describe, expect, it } from 'vitest';
import { migrateRaw, parseProject, parseProjectFile, ProjectFormatError, type MigrationRegistry } from './migrations';
import { createEmptyProject, serializeProject } from './project';

describe('Migrationen', () => {
  it('führt Migrationen der Reihe nach aus', () => {
    const registry: MigrationRegistry = {
      1: (p) => ({ ...p, schemaVersion: 2, a: 1 }),
      2: (p) => ({ ...p, schemaVersion: 3, b: (p.a as number) + 1 }),
    };
    expect(migrateRaw({ schemaVersion: 1 }, registry, 3)).toEqual({ schemaVersion: 3, a: 1, b: 2 });
    expect(migrateRaw({ schemaVersion: 2, a: 5 }, registry, 3)).toEqual({ schemaVersion: 3, a: 5, b: 6 });
  });

  it('meldet fehlende Migrationen und Migrationen ohne Versionssprung', () => {
    expect(() => migrateRaw({ schemaVersion: 1 }, {}, 2)).toThrow(/Keine Migration/);
    expect(() => migrateRaw({ schemaVersion: 1 }, { 1: (p) => p }, 2)).toThrow(/nicht erhöht/);
  });

  it('lehnt Dateien aus neueren Versionen ab', () => {
    expect(() => migrateRaw({ schemaVersion: 99 })).toThrow(/neueren Steckplan-Version/);
  });

  it('lehnt Nicht-Projekte ab', () => {
    expect(() => migrateRaw(null)).toThrow(ProjectFormatError);
    expect(() => migrateRaw([])).toThrow(ProjectFormatError);
    expect(() => migrateRaw({ foo: 1 })).toThrow(/Formatversion fehlt/);
    expect(() => parseProjectFile('kein json')).toThrow(/kein gültiges JSON/);
    expect(() => parseProject({ schemaVersion: 1 })).toThrow(/beschädigt oder ungültig \(id/);
  });

  it('hebt Format 1 über 2 auf das aktuelle Format an (Vorlagen bleiben unverändert)', () => {
    const v1 = {
      schemaVersion: 1,
      id: 'p1',
      meta: { name: 'Alt' },
      templateSnapshot: [{ id: 't1', kind: 'device', version: 3, updatedAt: '2026-01-01T00:00:00Z', name: 'Spot' }],
    };
    const project = parseProject(v1);
    expect(project.schemaVersion).toBe(5);
    expect(project.meta.name).toBe('Alt');
    expect(project.templateSnapshot[0]).toMatchObject({ id: 't1', version: 3, name: 'Spot' });
  });

  it('Format 3: Multicore-Kabeltyp mit Adern', () => {
    const project = parseProject({
      schemaVersion: 2,
      id: 'p',
      templateSnapshot: [{ id: 'mc', kind: 'cableType', version: 1, updatedAt: 'x', name: 'Multicore 8/8' }],
    });
    expect(project.schemaVersion).toBe(5);
    const withChannels = parseProject({
      ...project,
      templateSnapshot: [
        {
          ...project.templateSnapshot[0],
          endALabel: 'Bühne',
          endBLabel: 'FOH',
          channels: [{ id: 'c1', label: 'Send 1', connectorA: 'XLR 3 f', connectorB: 'XLR 3 m', direction: 'aToB', signal: 'Audio' }],
        },
      ],
    });
    expect(withChannels.templateSnapshot[0]!.channels![0]!.direction).toBe('aToB');
    expect(() => parseProject({ ...withChannels, templateSnapshot: [{ ...withChannels.templateSnapshot[0], channels: [{ id: 'c', label: 'x', connectorA: '', connectorB: '', direction: 'quer', signal: '' }] }] })).toThrow();
  });

  it('Format 4: Personen, Gruppen, Cases, Lager und T-Bar (Format 3 bleibt unverändert)', () => {
    const v3 = {
      schemaVersion: 3,
      id: 'p',
      devices: [{ id: 'd', templateId: 't', layerId: 'l', label: 'Mikro 1', ownerId: 'o' }],
      masterDataSnapshot: { categories: [], owners: [{ id: 'o', name: 'Ralf' }], trailers: [] },
    };
    const project = parseProject(v3);
    expect(project.schemaVersion).toBe(5);
    expect(project.people).toEqual([]);
    expect(project.groups).toEqual([]);
    expect(project.caseTrailers).toEqual([]);
    expect(project.masterDataSnapshot.cases).toEqual([]);
    expect(project.devices[0]).toMatchObject({ label: 'Mikro 1', ownerId: 'o' });

    const v4 = parseProject({
      ...project,
      people: [{ id: 'anna', lastName: 'Muster', firstName: 'Anna', kind: 'Sängerin' }],
      groups: [{ id: 'g', name: 'Drums', color: '#f00' }],
      caseTrailers: [{ id: 'c1', trailerId: 'a2' }],
      devices: [{ ...project.devices[0], usedByPerson: true, personId: 'anna', groupId: 'g', caseId: 'c1', mountSide: 'top' }],
      templateSnapshot: [{ id: 't', kind: 'cableType', version: 1, updatedAt: 'x', name: 'XLR', stockByLength: [{ lengthMm: 5000, count: 20 }] }],
      masterDataSnapshot: { ...project.masterDataSnapshot, cases: [{ id: 'c1', name: 'Kabelcase 1', defaultTrailerId: 'a1' }] },
    });
    expect(v4.devices[0]).toMatchObject({ personId: 'anna', caseId: 'c1', mountSide: 'top' });
    expect(v4.templateSnapshot[0]!.stockByLength).toEqual([{ lengthMm: 5000, count: 20 }]);
    expect(() => parseProject({ ...v4, devices: [{ ...v4.devices[0], mountSide: 'seitlich' }] })).toThrow();
  });

  it('Format 5: Netzwerk-Kanäle und Zuordnung zum Pult-Kanal', () => {
    const v4 = { schemaVersion: 4, id: 'p', devices: [{ id: 'd', templateId: 't', layerId: 'l', label: 'Mikro 1' }] };
    const project = parseProject(v4);
    expect(project.schemaVersion).toBe(5);
    const v5 = parseProject({ ...project, devices: [{ ...project.devices[0], mixerChannel: { mixerId: 'pult', channel: 12 } }, { id: 'pult', templateId: 'x', layerId: 'l', label: 'FOH', networkChannels: 48 }] });
    expect(v5.devices[0]!.mixerChannel).toEqual({ mixerId: 'pult', channel: 12 });
    expect(() => parseProject({ ...v5, devices: [{ ...v5.devices[0], mixerChannel: { mixerId: 'pult', channel: 0 } }] })).toThrow();
  });

  it('lädt eine gespeicherte Datei wieder', () => {
    const project = createEmptyProject({ name: 'Test' });
    expect(parseProjectFile(serializeProject(project))).toEqual(project);
  });
});
