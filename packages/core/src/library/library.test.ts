import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import type { Project, Template } from '../model/schema';
import { differingFields, stableStringify, templateContentEqual } from './compare';
import { createEmptyLibrary, createLibraryExport, LibraryExportSchema, type Library } from './library';
import { analyze, analyzeProject, applyAnalysis, conflictKey, finishProject, missingResolutions } from './reconcile';
import { buildSnapshots, projectUsage } from './usage';

const T0 = '2026-01-01T00:00:00.000Z';

function spot(overrides: Partial<Template> = {}): Template {
  return {
    id: 'spot',
    kind: 'device',
    version: 1,
    updatedAt: T0,
    name: 'Spot 575',
    categoryId: 'licht',
    ports: [{ id: 'dmx-in', label: 'DMX In', connector: 'XLR 5', direction: 'in', signal: 'DMX' }],
    ...overrides,
  };
}

function library(templates: Template[] = [spot()], libraryId = 'meine'): Library {
  return {
    ...createEmptyLibrary(libraryId),
    templates,
    masterData: { categories: [{ id: 'licht', name: 'Licht', color: '#f59e0b' }], owners: [{ id: 'ralf', name: 'Ralf' }], trailers: [] },
  };
}

function projectWith(snapshot: Template[], libraryId: string, extra: Partial<Project> = {}): Project {
  const base = createEmptyProject({ name: 'P' });
  return {
    ...base,
    libraryId,
    devices: [{ id: 'd1', templateId: 'spot', layerId: base.layers[0]!.id, label: 'Spot 1', ownerId: 'ralf' }],
    templateSnapshot: snapshot,
    masterDataSnapshot: { categories: [{ id: 'licht', name: 'Licht', color: '#f59e0b' }], owners: [{ id: 'ralf', name: 'Ralf' }], trailers: [] },
    ...extra,
  };
}

describe('Vergleich', () => {
  it('ignoriert Version, Zeitstempel und Feldreihenfolge', () => {
    expect(templateContentEqual(spot(), spot({ version: 7, updatedAt: 'x', updatedBy: 'Anna' }))).toBe(true);
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe('{"a":[2,{"d":1}],"b":1}');
    expect(templateContentEqual(spot(), spot({ name: 'Spot 700' }))).toBe(false);
    expect(differingFields(spot(), spot({ name: 'X', powerW: 575 }), 'template')).toEqual(['name', 'powerW']);
  });
});

describe('Abgleich beim Öffnen', () => {
  it('1: fehlende Vorlagen werden übernommen', () => {
    const lib = library([]);
    const analysis = analyzeProject(projectWith([spot()], 'fremd'), lib);
    expect(analysis.additions.templates.map((t) => t.id)).toEqual(['spot']);
    expect(analysis.conflicts).toEqual([]);
    const result = applyAnalysis(lib, analysis, {}, { by: 'Ralf' });
    expect(result.library.templates.map((t) => t.id)).toEqual(['spot']);
    expect(result.library.revision).toBe(1);
  });

  it('2: gleiche Vorlagen → nichts zu tun', () => {
    const analysis = analyzeProject(projectWith([spot({ version: 9 })], 'fremd'), library());
    expect(analysis).toMatchObject({ conflicts: [], autoUpdated: 0 });
    expect(applyAnalysis(library(), analysis, {}, { by: 'Ralf' }).changed).toBe(false);
  });

  it('3: eigene Bibliothek → Bibliothek ist maßgeblich, keine Nachfrage, Snapshot wird erneuert', () => {
    const lib = library([spot({ name: 'Spot NEU', version: 2 })]);
    const project = projectWith([spot()], 'meine');
    const analysis = analyzeProject(project, lib);
    expect(analysis.conflicts).toEqual([]);
    expect(analysis.autoUpdated).toBe(1);
    const finished = finishProject(project, lib, applyAnalysis(lib, analysis, {}, { by: 'R' }).idMap);
    expect(finished.templateSnapshot[0]!.name).toBe('Spot NEU');
  });

  it('4: fremde Bibliothek → Konflikt mit abweichenden Feldern', () => {
    const analysis = analyzeProject(projectWith([spot({ name: 'Spot (Verein)' })], 'fremd'), library());
    expect(analysis.conflicts).toHaveLength(1);
    expect(analysis.conflicts[0]).toMatchObject({ key: 'template:spot', kind: 'template', fields: ['name'] });
    expect(missingResolutions(analysis, {})).toEqual(['template:spot']);
  });

  it('4a: eigene behalten', () => {
    const lib = library();
    const project = projectWith([spot({ name: 'Fremd' })], 'fremd');
    const analysis = analyzeProject(project, lib);
    const result = applyAnalysis(lib, analysis, { 'template:spot': 'keep' }, { by: 'R' });
    expect(result.library.templates[0]!.name).toBe('Spot 575');
    const finished = finishProject(project, result.library, result.idMap);
    expect(finished.templateSnapshot[0]!.name).toBe('Spot 575');
    expect(finished.libraryId).toBe('meine');
  });

  it('4b: fremde übernehmen (überschreibt die eigene, Version steigt)', () => {
    const lib = library([spot({ version: 4 })]);
    const analysis = analyzeProject(projectWith([spot({ name: 'Fremd', version: 1 })], 'fremd'), lib);
    const result = applyAnalysis(lib, analysis, { 'template:spot': 'theirs' }, { by: 'Anna', now: new Date(T0) });
    expect(result.library.templates[0]).toMatchObject({ id: 'spot', name: 'Fremd', version: 5, updatedBy: 'Anna' });
    expect(result.summary.replaced).toBe(1);
  });

  it('4c: als Kopie anlegen → neue id, Projekt verwendet die Kopie', () => {
    const lib = library();
    const project = projectWith([spot({ name: 'Fremd' })], 'fremd');
    const analysis = analyzeProject(project, lib);
    const result = applyAnalysis(lib, analysis, { 'template:spot': 'copy' }, { by: 'R' });
    expect(result.library.templates).toHaveLength(2);
    const copy = result.library.templates[1]!;
    expect(copy.name).toBe('Fremd (Kopie)');
    expect(copy.id).not.toBe('spot');
    const finished = finishProject(project, result.library, result.idMap);
    expect(finished.devices[0]!.templateId).toBe(copy.id);
    expect(finished.templateSnapshot.map((t) => t.id)).toEqual([copy.id]);
  });

  it('Stammdaten: Konflikt und Kopie schreiben Instanzen und Vorlagen um', () => {
    const lib = library([]);
    const project = projectWith([spot()], 'fremd', {
      masterDataSnapshot: { categories: [{ id: 'licht', name: 'Beleuchtung' }], owners: [{ id: 'ralf', name: 'Ralf (Verein)' }], trailers: [] },
    });
    const analysis = analyzeProject(project, lib);
    expect(analysis.conflicts.map((c) => c.key).sort()).toEqual([conflictKey('categories', 'licht'), conflictKey('owners', 'ralf')]);
    const result = applyAnalysis(lib, analysis, { 'categories:licht': 'copy', 'owners:ralf': 'copy' }, { by: 'R' });
    const newCategory = result.idMap.categories.get('licht')!;
    const newOwner = result.idMap.owners.get('ralf')!;
    // neu übernommene Vorlage verweist auf die kopierte Kategorie
    expect(result.library.templates[0]!.categoryId).toBe(newCategory);
    const finished = finishProject(project, result.library, result.idMap);
    expect(finished.devices[0]!.ownerId).toBe(newOwner);
    expect(finished.masterDataSnapshot.categories.map((c) => c.name)).toEqual(['Beleuchtung (Kopie)']);
  });

  it('Stammdaten: archiviert-Status zählt nicht als Unterschied', () => {
    const lib = library();
    lib.masterData.categories[0]!.archived = true;
    expect(analyzeProject(projectWith([spot()], 'fremd'), lib).conflicts).toEqual([]);
  });
});

describe('Snapshots und Nutzung', () => {
  it('enthalten nur verwendete Vorlagen und deren Stammdaten', () => {
    const lib = library([spot(), spot({ id: 'unbenutzt', name: 'Wash' })]);
    const project = projectWith([], 'meine');
    const snapshots = buildSnapshots(project, lib);
    expect(snapshots.templateSnapshot.map((t) => t.id)).toEqual(['spot']);
    expect(snapshots.masterDataSnapshot.categories.map((c) => c.id)).toEqual(['licht']); // über die Vorlage
    expect(snapshots.masterDataSnapshot.owners.map((c) => c.id)).toEqual(['ralf']); // über die Instanz
  });

  it('behält die alte Kopie, wenn die Vorlage in der Bibliothek fehlt', () => {
    const project = projectWith([spot({ name: 'Nur im Projekt' })], 'meine');
    expect(buildSnapshots(project, library([])).templateSnapshot[0]!.name).toBe('Nur im Projekt');
  });

  it('ermittelt die Nutzung aus Geräten und Kabeln', () => {
    const usage = projectUsage(projectWith([], 'x'));
    expect([...usage.templates]).toEqual(['spot']);
    expect([...usage.owners]).toEqual(['ralf']);
  });
});

describe('Import einer Bibliotheksdatei', () => {
  it('Export → Import: gleiche Bibliothek ohne Konflikte, fremde Änderungen als Konflikt', () => {
    const lib = library();
    const exported = LibraryExportSchema.parse(JSON.parse(JSON.stringify(createLibraryExport(lib))));
    expect(analyze(exported, lib, { sameLibrary: false }).conflicts).toEqual([]);
    exported.templates[0]!.name = 'Geändert';
    expect(analyze(exported, lib, { sameLibrary: false }).conflicts).toHaveLength(1);
  });
});
