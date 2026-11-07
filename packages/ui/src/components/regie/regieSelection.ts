// Gewählter Ablaufpunkt in der Regie – gemeinsam für Ablauf, Texte, Lichtszenen und Tonszenen, damit beim Wechsel
// zwischen den Seiten dasselbe Lied gewählt bleibt. Je Projekt; im Tab gemerkt (übersteht Neuladen).
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const values = new Map<string, string | null>();
const key = (projectId: string) => `steckplan.regie.selected.${projectId}`;

function read(projectId: string): string | null {
  if (!values.has(projectId)) {
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(key(projectId));
    } catch {
      // ohne Speicher: nur bis zum Neuladen
    }
    values.set(projectId, stored);
  }
  return values.get(projectId) ?? null;
}

export function setRegieSelection(projectId: string, id: string | null): void {
  values.set(projectId, id);
  try {
    if (id) sessionStorage.setItem(key(projectId), id);
    else sessionStorage.removeItem(key(projectId));
  } catch {
    // ohne Speicher: nur bis zum Neuladen
  }
  for (const l of listeners) l();
}

/** [gewählter Punkt, wählen] – wie useState, aber über alle Regie-Seiten des Projekts geteilt */
export function useRegieSelection(projectId: string): [string | null, (id: string | null) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => read(projectId),
  );
  return [value, (id) => setRegieSelection(projectId, id)];
}
