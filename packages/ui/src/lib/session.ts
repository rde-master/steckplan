// Anmeldestatus (global, per Zustand).
import { create } from 'zustand';
import { api, type SessionInfo } from './api';

interface SessionState {
  status: 'loading' | 'anonymous' | 'authenticated' | 'error';
  session: SessionInfo | null;
  loginAvailable: boolean;
  error?: string;
  refresh(): Promise<void>;
  setSession(session: SessionInfo): void;
  logout(): Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  session: null,
  loginAvailable: false,
  async refresh() {
    try {
      const { session, loginAvailable } = await api.session();
      set({ status: session ? 'authenticated' : 'anonymous', session, loginAvailable });
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
