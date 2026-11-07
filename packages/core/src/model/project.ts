import { CURRENT_SCHEMA_VERSION, ProjectSchema, type Layer, type Project, type ProjectMeta } from './schema';

/**
 * Neue Kennung (UUID v4). crypto.randomUUID gibt es im Browser nur in sicherem Kontext (https, localhost) –
 * die Weboberfläche des Desktops läuft aber über http://<LAN-Adresse>. Dann aus getRandomValues (überall vorhanden).
 */
export function newId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  return uuidFromRandom(c.getRandomValues(new Uint8Array(16)));
}

/** 16 Zufallsbytes → UUID v4 „xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx“ */
export function uuidFromRandom(bytes: Uint8Array): string {
  const b = Uint8Array.from(bytes.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
