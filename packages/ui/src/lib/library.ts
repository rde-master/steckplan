// Bibliothek im Client: geladen per REST, aktualisiert sich bei jeder Änderung (Ereignis-Kanal /api/events).
import { useEffect } from 'react';
import { create } from 'zustand';
import type { Library, MasterEntry, MasterKind, Template } from '@steckplan/core';
import { api, errorMessage } from './api';

interface LibraryState {
  library: Library | null;
  error: string | null;
  load(): Promise<void>;
}

export const useLibrary = create<LibraryState>((set) => ({
  library: null,
  error: null,
  async load() {
    try {
      set({ library: await api.library(), error: null });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },
}));

/** Verbindet sich mit dem Ereignis-Kanal und lädt die Bibliothek bei Änderungen neu. */
export function useLibraryEvents(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let attempts = 0;
    const load = useLibrary.getState().load;

    const connect = () => {
      socket = new WebSocket(api.eventsUrl());
      socket.onopen = () => {
        attempts = 0;
        void load(); // nach (Neu-)Verbindung sicherheitshalber neu laden
      };
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as { type?: string };
          if (data.type === 'library') void load();
        } catch {
          // ignorieren
        }
      };
      socket.onclose = (event) => {
        if (stopped || event.code === 4401) return;
        timer = setTimeout(connect, Math.min(10_000, 500 * 2 ** attempts++));
      };
    };
    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [enabled]);
}

export function masterName(library: Library | null, kind: MasterKind, id: string | undefined): string {
  if (!id) return '';
  const entry = (library?.masterData[kind] as MasterEntry[] | undefined)?.find((e) => e.id === id);
  return entry ? entry.name + (entry.archived ? ' (archiviert)' : '') : '(unbekannt)';
}

/** Vorschläge für Stecker und Signalarten aus der eigenen Bibliothek. */
export function suggestions(library: Library | null): { connectors: string[]; signals: string[] } {
  const connectors = new Set<string>();
  const signals = new Set<string>();
  for (const t of library?.templates ?? []) {
    for (const p of t.ports ?? []) {
      if (p.connector) connectors.add(p.connector);
      if (p.signal) signals.add(p.signal);
    }
    if (t.connectorA) connectors.add(t.connectorA);
    if (t.connectorB) connectors.add(t.connectorB);
    if (t.signal) signals.add(t.signal);
  }
  const sort = (set: Set<string>) => [...set].sort((a, b) => a.localeCompare(b, 'de'));
  return { connectors: sort(connectors), signals: sort(signals) };
}

export function templateById(library: Library | null, id: string | null): Template | undefined {
  return id ? library?.templates.find((t) => t.id === id) : undefined;
}
