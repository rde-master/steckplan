// Migrationen des Dateiformats. Jede Migration hebt ein Projekt von Version n auf n + 1.
// Neue Migration: Funktion unter dem Schlüssel der ALTEN Version eintragen, CURRENT_SCHEMA_VERSION erhöhen, Test schreiben.
import { CURRENT_SCHEMA_VERSION, ProjectSchema, type Project } from './schema';

type RawProject = Record<string, unknown>;
export type Migration = (project: RawProject) => RawProject;
export type MigrationRegistry = Record<number, Migration>;

export const migrations: MigrationRegistry = {
  // 1 → 2: Vorlagen haben optional `updatedBy` und `notes` – vorhandene Daten bleiben unverändert.
  1: (p) => ({ ...p, schemaVersion: 2 }),
  // 2 → 3: Kabeltypen können Multicore sein (channels, endALabel, endBLabel) – vorhandene Daten bleiben unverändert.
  2: (p) => ({ ...p, schemaVersion: 3 }),
  // 3 → 4: Personen, Gruppen, Cases, Lagerbestand, T-Bar, Ton-Patch (Mischpult, Input-/Output-Liste), Strom (Stromanschlüsse, Absicherung, Phase, Leistung je Gerät) – alles optional bzw. leere Listen; vorhandene Daten bleiben unverändert.
  3: (p) => ({ ...p, schemaVersion: 4 }),
  // 4 → 5: Netzwerk-Kanäle am Mischpult und Zuordnung Quelle → Pult-Kanal, Seiten im Signalfluss – optional; vorhandene Daten bleiben unverändert.
  4: (p) => ({ ...p, schemaVersion: 5 }),
  // 5 → 6: Pult-Kanal je Ausgang statt je Gerät – `mixerChannel` wird zu `mixerChannels: [{ mixerId, channel }]`
  // (ohne Anschluss = erster Ausgang mit durchgehender Kette).
  5: (p) => ({
    ...p,
    schemaVersion: 6,
    devices: Array.isArray(p.devices)
      ? p.devices.map((d: unknown) => {
          if (typeof d !== 'object' || d === null || !('mixerChannel' in d)) return d;
          const { mixerChannel, ...rest } = d as RawProject & { mixerChannel?: unknown };
          return mixerChannel ? { ...rest, mixerChannels: [mixerChannel] } : rest;
        })
      : p.devices,
  }),
};

export class ProjectFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectFormatError';
  }
}

/** Hebt ein beliebiges geladenes Projekt-JSON auf die aktuelle Version an (ohne Validierung). */
export function migrateRaw(
  input: unknown,
  registry: MigrationRegistry = migrations,
  target: number = CURRENT_SCHEMA_VERSION,
): RawProject {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ProjectFormatError('Die Datei ist kein Steckplan-Projekt.');
  }
  let project = input as RawProject;
  const initial = project.schemaVersion;
  if (typeof initial !== 'number' || !Number.isInteger(initial) || initial < 1) {
    throw new ProjectFormatError('Die Datei ist kein Steckplan-Projekt (Formatversion fehlt).');
  }
  let version: number = initial;
  if (version > target) {
    throw new ProjectFormatError(
      `Die Datei stammt aus einer neueren Steckplan-Version (Format ${version}, unterstützt bis ${target}). Bitte Steckplan aktualisieren.`,
    );
  }
  while (version < target) {
    const migrate = registry[version];
    if (!migrate) throw new ProjectFormatError(`Keine Migration von Format ${version} vorhanden.`);
    project = migrate(project);
    if (project.schemaVersion !== version + 1) {
      throw new ProjectFormatError(`Migration von Format ${version} hat die Version nicht erhöht.`);
    }
    version += 1;
  }
  return project;
}

/** Lädt ein Projekt: migrieren + validieren. Wirft ProjectFormatError mit verständlicher Meldung. */
export function parseProject(input: unknown): Project {
  const raw = migrateRaw(input);
  const result = ProjectSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.join('.') || 'Projekt';
    throw new ProjectFormatError(`Die Datei ist beschädigt oder ungültig (${where}: ${first?.message ?? 'unbekannt'}).`);
  }
  return result.data;
}

/** Text einer .steckplan-Datei laden. */
export function parseProjectFile(text: string): Project {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProjectFormatError('Die Datei ist kein gültiges JSON und kann nicht geöffnet werden.');
  }
  return parseProject(json);
}
