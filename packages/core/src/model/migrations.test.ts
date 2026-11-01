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

  it('lädt eine gespeicherte Datei wieder', () => {
    const project = createEmptyProject({ name: 'Test' });
    expect(parseProjectFile(serializeProject(project))).toEqual(project);
  });
});
