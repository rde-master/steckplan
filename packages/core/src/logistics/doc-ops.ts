// Häkchen der Packliste, Häkchen zurücksetzen, Projekt als Vorlage kopieren.
import * as Y from 'yjs';
import { newId } from '../model/project';
import type { CheckMark, Project } from '../model/schema';

export type CheckDirection = 'out' | 'in';

/** Setzt (mark) oder entfernt (null) ein Häkchen bei einem Gerät oder Kabel. Gibt false zurück, wenn es das Objekt nicht gibt. */
export function setCheck(doc: Y.Doc, kind: 'device' | 'cable', id: string, direction: CheckDirection, mark: CheckMark | null, origin: unknown): boolean {
  const map = doc.getMap<Y.Map<unknown>>(kind === 'device' ? 'devices' : 'cables').get(id);
  if (!map) return false;
  doc.transact(() => {
    const current = (map.get('check') as { out?: CheckMark; in?: CheckMark } | undefined) ?? {};
    const next = { ...current };
    if (mark) next[direction] = mark;
    else delete next[direction];
    if (next.out || next.in) map.set('check', next);
    else map.delete('check');
  }, origin);
  return true;
}

/** Häkchen zurücksetzen (Hin, Zurück oder beides). Gibt die Anzahl entfernter Häkchen zurück. */
export function resetChecks(doc: Y.Doc, direction: CheckDirection | 'both', origin: unknown): number {
  let removed = 0;
  doc.transact(() => {
    for (const name of ['devices', 'cables'] as const) {
      for (const map of doc.getMap<Y.Map<unknown>>(name).values()) {
        const current = map.get('check') as { out?: CheckMark; in?: CheckMark } | undefined;
        if (!current) continue;
        const next = { ...current };
        for (const d of direction === 'both' ? (['out', 'in'] as const) : [direction]) {
          if (next[d]) {
            delete next[d];
            removed++;
          }
        }
        if (next.out || next.in) map.set('check', next);
        else map.delete('check');
      }
    }
  }, origin);
  return removed;
}

/** „Neues Projekt aus diesem“: übernimmt Plan, Geräte, Kabel und Zuordnungen; Häkchen, Änderungsprotokoll und Meta-Daten (Datum, Version) werden zurückgesetzt. */
export function copyAsNewProject(project: Project, name?: string): Project {
  const strip = <T extends { check?: unknown; lastModified?: unknown }>(item: T): T => {
    const { check: _check, lastModified: _lastModified, ...rest } = item;
    return rest as T;
  };
  return {
    ...project,
    id: newId(),
    meta: { ...project.meta, name: name ?? `${project.meta.name} (Kopie)`, date: '', version: '' },
    devices: project.devices.map(strip),
    cables: project.cables.map(strip),
    changeLog: [],
  };
}
