// Stand der Steckplan Player für den Führen-Bildschirm: eine gemeinsame Abfrage jede Sekunde, solange etwas ihn zeigt
// (Kopfzeile, Einstellungen, Hinweis auf neue Kopplungen). Antwortet der Server nicht, gilt der Stand als veraltet.
import { useCallback, useSyncExternalStore } from 'react';
import type { PlayersOverview } from '@steckplan/core';
import { api } from './api';

export const PLAYERS_POLL_MS = 1000;
/** ohne Antwort so lange gilt der Stand als veraltet */
const STALE_MS = 3500;

interface Snapshot {
  overview: PlayersOverview | null;
  /** letzte Antwort zu alt (diese Seite erreicht den Server nicht) */
  stale: boolean;
}

let snapshot: Snapshot = { overview: null, stale: false };
let answeredAt = 0;
let inFlight = false;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function emit(next: Snapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

function poll(): void {
  if (inFlight) {
    // hängt die Abfrage (Netz), wenigstens „veraltet“ melden
    if (!snapshot.stale && answeredAt && Date.now() - answeredAt > STALE_MS) emit({ ...snapshot, stale: true });
    return;
  }
  inFlight = true;
  api
    .players()
    .then((overview) => {
      answeredAt = Date.now();
      emit({ overview, stale: false });
    })
    .catch(() => {
      if (answeredAt && Date.now() - answeredAt > STALE_MS && !snapshot.stale) emit({ ...snapshot, stale: true });
    })
    .finally(() => {
      inFlight = false;
    });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    poll();
    timer = setInterval(poll, PLAYERS_POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const none = (): (() => void) => () => undefined;
const empty: Snapshot = { overview: null, stale: false };

/** Stand der Player (null bis zur ersten Antwort); enabled = false: keine Abfrage */
export function usePlayersOverview(enabled = true): Snapshot & { refresh: () => void } {
  const value = useSyncExternalStore(enabled ? subscribe : none, () => (enabled ? snapshot : empty));
  const refresh = useCallback(() => poll(), []);
  return { ...value, refresh };
}
