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

  it('hebt Format 1 auf Format 2 an (Vorlagen bleiben unverändert)', () => {
    const v1 = {
      schemaVersion: 1,
      id: 'p1',
      meta: { name: 'Alt' },
      templateSnapshot: [{ id: 't1', kind: 'device', version: 3, updatedAt: '2026-01-01T00:00:00Z', name: 'Spot' }],
    };
    const project = parseProject(v1);
    expect(project.schemaVersion).toBe(2);
    expect(project.meta.name).toBe('Alt');
    expect(project.templateSnapshot[0]).toMatchObject({ id: 't1', version: 3, name: 'Spot' });
  });

  it('lädt eine gespeicherte Datei wieder', () => {
    const project = createEmptyProject({ name: 'Test' });
    expect(parseProjectFile(serializeProject(project))).toEqual(project);
  });
});
