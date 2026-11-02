// Anmeldestatus (global, per Zustand).
import { create } from 'zustand';
import type { ServerMode } from '@steckplan/core';
import { api, type SessionInfo } from './api';

interface SessionState {
  status: 'loading' | 'anonymous' | 'authenticated' | 'error';
  session: SessionInfo | null;
  loginAvailable: boolean;
  /** Desktop mit Server-Verbindung: Schlüssel ungültig/widerrufen */
  keyRejected: 'invalid' | 'rateLimited' | null;
  /** Betriebsart des Servers (desktop = eingebettet, standalone = Docker) */
  mode: ServerMode | null;
  error?: string;
  refresh(): Promise<void>;
  setSession(session: SessionInfo): void;
  logout(): Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  session: null,
  loginAvailable: false,
  keyRejected: null,
  mode: null,
  async refresh() {
    try {
      const [{ session, loginAvailable, keyRejected }, health] = await Promise.all([api.session(), api.health().catch(() => null)]);
      set({ status: session ? 'authenticated' : 'anonymous', session, loginAvailable, keyRejected: keyRejected ?? null, ...(health ? { mode: health.mode } : {}) });
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  },
  setSession(session) {
    set({ status: 'authenticated', session });
  },
  async logout() {
    await api.logout().catch(() => undefined);
    set({ status: 'anonymous', session: null });
  },
}));
