import { CURRENT_SCHEMA_VERSION, ProjectSchema, type Layer, type Project, type ProjectMeta } from './schema';

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export const DEFAULT_LAYER_NAMES = ['Bühne', 'Licht', 'Ton', 'Strom', 'Netzwerk', 'Beschriftung'] as const;

export function createDefaultLayers(): Layer[] {
  return DEFAULT_LAYER_NAMES.map((name, order) => ({ id: newId(), name, visible: true, locked: false, order }));
}

export interface NewProjectOptions {
  name: string;
  libraryId?: string;
  meta?: Partial<ProjectMeta>;
}

export function createEmptyProject(options: NewProjectOptions): Project {
  return ProjectSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId(),
    libraryId: options.libraryId ?? '',
    meta: { ...options.meta, name: options.name },
    layers: createDefaultLayers(),
  });
}

/** Projekt ohne geschützten Bereich (z. B. Download mit Lese-Zugang). */
export function withoutSecrets(project: Project): Project {
  return { ...project, secrets: { wifiPasswords: [] } };
}

/** Dateiinhalt einer .steckplan-Datei (menschenlesbares JSON). */
export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2) + '\n';
}
