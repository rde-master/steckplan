// Verbindet ein Projekt live per Yjs mit dem Server.
import { useEffect, useState, useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import { SyncClient, type Cue, type SyncClientState } from '@steckplan/core';
import { api } from './api';

export interface ProjectDoc {
  doc: Y.Doc;
  state: SyncClientState;
  /** Vorstellung: führen (Stelle senden) bzw. Führen beenden */
  sendCue: (cue: Cue | null) => void;
}

export function useProjectDoc(projectId: string): ProjectDoc | null {
  const [value, setValue] = useState<ProjectDoc | null>(null);

  useEffect(() => {
    const doc = new Y.Doc();
    // onChange meldet auch den Startzustand (der Client verbindet sich sofort).
    // je Verbindung eine feste Funktion (sonst sendet „Führen“ bei jeder Zustandsänderung erneut)
    const sendCue = (cue: Cue | null) => client.sendCue(cue);
    const client: SyncClient = new SyncClient({
      url: api.syncUrl(projectId),
      doc,
      onChange: (state) => setValue({ doc, state, sendCue }),
    });
    return () => {
      client.destroy();
      doc.destroy();
    };
  }, [projectId]);

  return value;
}

/** Liest eine Y.Map als Objekt und rendert bei Änderungen neu. */
export function useYMap<T extends Record<string, unknown>>(doc: Y.Doc | undefined, name: string): Partial<T> {
  const [, force] = useState(0);
  const map = doc?.getMap(name);
  useEffect(() => {
    if (!map) return;
    const observer = () => force((n) => n + 1);
    map.observe(observer);
    return () => map.unobserve(observer);
  }, [map]);
  return (map?.toJSON() ?? {}) as Partial<T>;
}

/** Hilfsfunktion, um die aktuelle Breite zu kennen (Handy-Ansicht). */
export function useIsNarrow(maxWidth = 640): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('resize', cb);
      return () => window.removeEventListener('resize', cb);
    },
    () => window.innerWidth <= maxWidth,
  );
}
