// Vorlagen- und Stammdaten-Abgleich beim Öffnen, Importieren und Hochladen (PLAN.md, Abschnitt 6):
//  1. fehlt in der Bibliothek            → übernehmen
//  2. gleich                             → nichts tun
//  3. verschieden, eigene Bibliothek     → Bibliothek ist maßgeblich (automatisch)
//  4. verschieden, fremde Bibliothek     → Nachfrage: eigene behalten / fremde übernehmen / als Kopie anlegen
import { newId } from '../model/project';
import type { MasterData, Project, Template } from '../model/schema';
import { differingFields, masterEntryEqual, templateContentEqual } from './compare';
import { MASTER_KINDS, type Library, type MasterEntry, type MasterKind } from './library';
import { buildSnapshots } from './usage';

export type Resolution = 'keep' | 'theirs' | 'copy';

export type Conflict =
  | { key: string; kind: 'template'; id: string; ours: Template; theirs: Template; fields: string[] }
  | { key: string; kind: MasterKind; id: string; ours: MasterEntry; theirs: MasterEntry; fields: string[] };

export interface ReconcileSource {
  libraryId: string;
  templates: Template[];
  masterData: MasterData;
}

export interface Analysis {
  /** Fehlende Einträge, die ohne Nachfrage übernommen werden */
  additions: { templates: Template[]; masterData: MasterData };
  conflicts: Conflict[];
  /** Abweichungen, bei denen automatisch die Bibliothek gilt (eigene Bibliothek) */
  autoUpdated: number;
}

export function conflictKey(kind: 'template' | MasterKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * Vergleicht die Einträge einer Quelle (Projekt-Snapshot oder Importdatei) mit der Bibliothek.
 * sameLibrary: Quelle wurde zuletzt mit dieser Bibliothek gespeichert → keine Nachfrage.
 */
export function analyze(source: ReconcileSource, library: Library, options: { sameLibrary: boolean }): Analysis {
  const analysis: Analysis = { additions: { templates: [], masterData: { categories: [], owners: [], trailers: [] } }, conflicts: [], autoUpdated: 0 };

  for (const theirs of source.templates) {
    const ours = library.templates.find((t) => t.id === theirs.id);
    if (!ours) analysis.additions.templates.push(theirs);
    else if (templateContentEqual(ours, theirs)) continue;
    else if (options.sameLibrary) analysis.autoUpdated++;
    else
      analysis.conflicts.push({
        key: conflictKey('template', theirs.id),
        kind: 'template',
        id: theirs.id,
        ours,
        theirs,
        fields: differingFields(ours, theirs, 'template'),
      });
  }

  for (const kind of MASTER_KINDS) {
    for (const theirs of source.masterData[kind] as MasterEntry[]) {
      const ours = (library.masterData[kind] as MasterEntry[]).find((e) => e.id === theirs.id);
      if (!ours) (analysis.additions.masterData[kind] as MasterEntry[]).push(theirs);
      else if (masterEntryEqual(ours, theirs)) continue;
      else if (options.sameLibrary) analysis.autoUpdated++;
      else
        analysis.conflicts.push({
          key: conflictKey(kind, theirs.id),
          kind,
          id: theirs.id,
          ours,
          theirs,
          fields: differingFields(ours, theirs, 'master'),
        });
    }
  }
  return analysis;
}

export function analyzeProject(project: Project, library: Library): Analysis {
  return analyze(
    { libraryId: project.libraryId, templates: project.templateSnapshot, masterData: project.masterDataSnapshot },
    library,
    { sameLibrary: project.libraryId !== '' && project.libraryId === library.libraryId },
  );
}

export function missingResolutions(analysis: Analysis, resolutions: Record<string, Resolution>): string[] {
  return analysis.conflicts.filter((c) => !resolutions[c.key]).map((c) => c.key);
}

export interface IdMap {
  templates: Map<string, string>;
  categories: Map<string, string>;
  owners: Map<string, string>;
  trailers: Map<string, string>;
}

export interface ApplyResult {
  library: Library;
  idMap: IdMap;
  changed: boolean;
  summary: { added: number; replaced: number; copied: number; kept: number };
}

const COPY_SUFFIX = ' (Kopie)';

/**
 * Wendet Ergänzungen und Entscheidungen auf die Bibliothek an.
 * Fehlende Entscheidungen gelten als „eigene behalten“.
 */
export function applyAnalysis(
  library: Library,
  analysis: Analysis,
  resolutions: Record<string, Resolution>,
  meta: { by: string; now?: Date },
): ApplyResult {
  const now = (meta.now ?? new Date()).toISOString();
  const idMap: IdMap = { templates: new Map(), categories: new Map(), owners: new Map(), trailers: new Map() };
  const summary = { added: 0, replaced: 0, copied: 0, kept: 0 };
  const next: Library = {
    ...library,
    templates: [...library.templates],
    masterData: {
      categories: [...library.masterData.categories],
      owners: [...library.masterData.owners],
      trailers: [...library.masterData.trailers],
    },
  };

  // Zuerst Stammdaten (Vorlagen können auf neu angelegte Kopien verweisen)
  for (const conflict of analysis.conflicts) {
    if (conflict.kind === 'template') continue;
    const list = next.masterData[conflict.kind] as MasterEntry[];
    const choice = resolutions[conflict.key] ?? 'keep';
    if (choice === 'keep') summary.kept++;
    else if (choice === 'theirs') {
      const index = list.findIndex((e) => e.id === conflict.id);
      list[index] = { ...conflict.theirs, archived: conflict.ours.archived };
      summary.replaced++;
    } else {
      const copy = { ...conflict.theirs, id: newId(), name: conflict.theirs.name + COPY_SUFFIX, archived: undefined };
      list.push(copy);
      idMap[conflict.kind].set(conflict.id, copy.id);
      summary.copied++;
    }
  }
  for (const kind of MASTER_KINDS) {
    for (const entry of analysis.additions.masterData[kind] as MasterEntry[]) {
      (next.masterData[kind] as MasterEntry[]).push(entry);
      summary.added++;
    }
  }

  const remapTemplate = (template: Template): Template => ({
    ...template,
    categoryId: template.categoryId && (idMap.categories.get(template.categoryId) ?? template.categoryId),
    defaultOwnerId: template.defaultOwnerId && (idMap.owners.get(template.defaultOwnerId) ?? template.defaultOwnerId),
    defaultTrailerId: template.defaultTrailerId && (idMap.trailers.get(template.defaultTrailerId) ?? template.defaultTrailerId),
  });

  for (const conflict of analysis.conflicts) {
    if (conflict.kind !== 'template') continue;
    const choice = resolutions[conflict.key] ?? 'keep';
    if (choice === 'keep') summary.kept++;
    else if (choice === 'theirs') {
      const index = next.templates.findIndex((t) => t.id === conflict.id);
      next.templates[index] = {
        ...remapTemplate(conflict.theirs),
        version: conflict.ours.version + 1,
        updatedAt: now,
        updatedBy: meta.by,
      };
      summary.replaced++;
    } else {
      const copy: Template = {
        ...remapTemplate(conflict.theirs),
        id: newId(),
        name: conflict.theirs.name + COPY_SUFFIX,
        version: 1,
        updatedAt: now,
        updatedBy: meta.by,
      };
      next.templates.push(copy);
      idMap.templates.set(conflict.id, copy.id);
      summary.copied++;
    }
  }
  for (const template of analysis.additions.templates) {
    next.templates.push(remapTemplate(template));
    summary.added++;
  }

  const changed = summary.added + summary.replaced + summary.copied > 0;
  if (changed) next.revision = library.revision + 1;
  return { library: changed ? next : library, idMap, changed, summary };
}

/** Schreibt die ids im Projekt um (bei „als Kopie anlegen“) und erneuert libraryId und Snapshots. */
export function finishProject(project: Project, library: Library, idMap: IdMap): Project {
  const remap = <T extends { templateId?: string; ownerId?: string; trailerId?: string; categoryOverride?: string }>(item: T): T => ({
    ...item,
    ...(item.templateId ? { templateId: idMap.templates.get(item.templateId) ?? item.templateId } : {}),
    ...(item.ownerId ? { ownerId: idMap.owners.get(item.ownerId) ?? item.ownerId } : {}),
    ...(item.trailerId ? { trailerId: idMap.trailers.get(item.trailerId) ?? item.trailerId } : {}),
    ...(item.categoryOverride ? { categoryOverride: idMap.categories.get(item.categoryOverride) ?? item.categoryOverride } : {}),
  });
  const remapped: Project = {
    ...project,
    libraryId: library.libraryId,
    devices: project.devices.map(remap),
    cables: project.cables.map(remap),
  };
  return { ...remapped, ...buildSnapshots(remapped, library) };
}
