// Welche Vorlagen und Stammdaten verwendet ein Projekt? Und: Snapshots für die Portabilität erzeugen.
import type { MasterData, Project, Template } from '../model/schema';
import type { Library, MasterKind } from './library';

export interface Usage {
  templates: Set<string>;
  categories: Set<string>;
  owners: Set<string>;
  trailers: Set<string>;
}

export function emptyUsage(): Usage {
  return { templates: new Set(), categories: new Set(), owners: new Set(), trailers: new Set() };
}

function addTemplateMasterUsage(usage: Usage, template: Template): void {
  if (template.categoryId) usage.categories.add(template.categoryId);
  if (template.defaultOwnerId) usage.owners.add(template.defaultOwnerId);
  if (template.defaultTrailerId) usage.trailers.add(template.defaultTrailerId);
}

/** Direkt im Projekt verwendete Vorlagen und Stammdaten (Instanzen von Geräten und Kabeln). */
export function projectUsage(project: Pick<Project, 'devices' | 'cables'>): Usage {
  const usage = emptyUsage();
  for (const item of [...project.devices, ...project.cables]) {
    if (item.templateId) usage.templates.add(item.templateId);
    if (item.ownerId) usage.owners.add(item.ownerId);
    if (item.trailerId) usage.trailers.add(item.trailerId);
    if (item.categoryOverride) usage.categories.add(item.categoryOverride);
  }
  return usage;
}

/** Stammdaten, die von Vorlagen verwendet werden. */
export function templatesMasterUsage(templates: Template[]): Usage {
  const usage = emptyUsage();
  for (const template of templates) addTemplateMasterUsage(usage, template);
  return usage;
}

export function usageToJson(usage: Usage): Record<keyof Usage, string[]> {
  return {
    templates: [...usage.templates].sort(),
    categories: [...usage.categories].sort(),
    owners: [...usage.owners].sort(),
    trailers: [...usage.trailers].sort(),
  };
}

export function usageFromJson(json: Partial<Record<keyof Usage, string[]>>): Usage {
  return {
    templates: new Set(json.templates ?? []),
    categories: new Set(json.categories ?? []),
    owners: new Set(json.owners ?? []),
    trailers: new Set(json.trailers ?? []),
  };
}

export function usageKey(kind: 'template' | MasterKind): keyof Usage {
  return kind === 'template' ? 'templates' : kind;
}

/**
 * Snapshots für die Datei: Kopien aller verwendeten Vorlagen und Stammdaten aus der Bibliothek
 * (fehlt etwas in der Bibliothek, bleibt die bisherige Kopie erhalten).
 */
export function buildSnapshots(
  project: Pick<Project, 'devices' | 'cables' | 'templateSnapshot' | 'masterDataSnapshot'>,
  library: Pick<Library, 'templates' | 'masterData'>,
): { templateSnapshot: Template[]; masterDataSnapshot: MasterData } {
  const usage = projectUsage(project);
  const templateSnapshot: Template[] = [];
  for (const id of [...usage.templates].sort()) {
    const template = library.templates.find((t) => t.id === id) ?? project.templateSnapshot.find((t) => t.id === id);
    if (template) {
      templateSnapshot.push(template);
      addTemplateMasterUsage(usage, template);
    }
  }
  const pick = <K extends MasterKind>(kind: K): MasterData[K] =>
    [...usage[kind]]
      .sort()
      .map((id) => library.masterData[kind].find((e) => e.id === id) ?? project.masterDataSnapshot[kind].find((e) => e.id === id))
      .filter((e): e is NonNullable<typeof e> => e !== undefined) as MasterData[K];
  return {
    templateSnapshot,
    masterDataSnapshot: { categories: pick('categories'), owners: pick('owners'), trailers: pick('trailers') },
  };
}
