// Abbildung Projekt ↔ Yjs-Dokument (Live-Sync).
// - Einfache Objekte (meta, settings, views) → Y.Map mit JSON-Werten je Feld
// - Listen mit id (devices, cables, …) → Y.Map<id, Y.Map<Feld, JSON>>: gleichzeitige Änderungen
//   an verschiedenen Feldern desselben Objekts werden zusammengeführt
// - secrets und changeLog sind NICHT Teil des Dokuments
import * as Y from 'yjs';
import { ProjectSchema, type Project, type Secrets } from './schema';

export const Y_ROOT = 'root';
export const Y_OBJECT_MAPS = ['meta', 'settings', 'views'] as const;

type CollectionPath = readonly [string] | readonly [string, string];
export const Y_COLLECTIONS = {
  layers: ['layers'],
  shapes: ['shapes'],
  devices: ['devices'],
  cables: ['cables'],
  subnets: ['network', 'subnets'],
  wifi: ['network', 'wifi'],
  templateSnapshot: ['templateSnapshot'],
  categories: ['masterDataSnapshot', 'categories'],
  owners: ['masterDataSnapshot', 'owners'],
  trailers: ['masterDataSnapshot', 'trailers'],
} as const satisfies Record<string, CollectionPath>;
export type YCollectionName = keyof typeof Y_COLLECTIONS;

type Json = Record<string, unknown>;

function getPath(obj: Json, path: CollectionPath): unknown {
  let value: unknown = obj;
  for (const key of path) value = (value as Json | undefined)?.[key];
  return value;
}

function setPath(obj: Json, path: CollectionPath, value: unknown): void {
  if (path.length === 1) {
    obj[path[0]] = value;
  } else {
    const parent = (obj[path[0]] ??= {}) as Json;
    parent[path[1]] = value;
  }
}

function fillMap(map: Y.Map<unknown>, values: Json): void {
  for (const key of [...map.keys()]) if (!(key in values) || values[key] === undefined) map.delete(key);
  for (const [key, value] of Object.entries(values)) if (value !== undefined) map.set(key, value);
}

/**
 * Schreibt ein Projekt in ein Yjs-Dokument (ersetzt den bisherigen Inhalt vollständig, in einer Transaktion).
 * Für neue Dokumente und für „Version wiederherstellen“.
 */
export function writeProjectToYDoc(project: Project, doc: Y.Doc, origin: unknown = null): void {
  doc.transact(() => {
    const root = doc.getMap(Y_ROOT);
    fillMap(root, {
      schemaVersion: project.schemaVersion,
      id: project.id,
      libraryId: project.libraryId,
      background: project.background,
    });

    for (const name of Y_OBJECT_MAPS) fillMap(doc.getMap(name), project[name] as Json);

    for (const [name, path] of Object.entries(Y_COLLECTIONS) as [YCollectionName, CollectionPath][]) {
      const collection = doc.getMap<Y.Map<unknown>>(name);
      const items = (getPath(project as unknown as Json, path) as Json[] | undefined) ?? [];
      const ids = new Set(items.map((item) => item.id as string));
      for (const key of [...collection.keys()]) if (!ids.has(key)) collection.delete(key);
      for (const item of items) {
        let itemMap = collection.get(item.id as string);
        if (!(itemMap instanceof Y.Map)) {
          itemMap = new Y.Map();
          collection.set(item.id as string, itemMap);
        }
        fillMap(itemMap, item);
      }
    }
  }, origin);
}

export function createYDocFromProject(project: Project): Y.Doc {
  const doc = new Y.Doc();
  writeProjectToYDoc(project, doc);
  return doc;
}

/** Liest das Projekt (ohne Validierung) aus dem Dokument. */
export function readRawProjectFromYDoc(doc: Y.Doc): Json {
  const result: Json = { ...doc.getMap(Y_ROOT).toJSON() };
  for (const name of Y_OBJECT_MAPS) result[name] = doc.getMap(name).toJSON();
  for (const [name, path] of Object.entries(Y_COLLECTIONS) as [YCollectionName, CollectionPath][]) {
    const items = Object.values(doc.getMap(name).toJSON() as Record<string, Json>);
    // Stabile Reihenfolge in der Datei: Ebenen nach `order`, alles andere nach id
    items.sort((a, b) =>
      name === 'layers'
        ? Number(a.order ?? 0) - Number(b.order ?? 0)
        : String(a.id).localeCompare(String(b.id)),
    );
    setPath(result, path, items);
  }
  return result;
}

export type ReadProjectResult = { ok: true; project: Project } | { ok: false; error: string };

/** Liest und validiert das Projekt aus dem Dokument; secrets und changeLog werden ergänzt. */
export function readProjectFromYDoc(
  doc: Y.Doc,
  extra: { secrets?: Secrets; changeLog?: Project['changeLog'] } = {},
): ReadProjectResult {
  const raw = readRawProjectFromYDoc(doc);
  raw.secrets = extra.secrets ?? { wifiPasswords: [] };
  raw.changeLog = extra.changeLog ?? [];
  const parsed = ProjectSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'ungültig'}` };
  }
  return { ok: true, project: parsed.data };
}
