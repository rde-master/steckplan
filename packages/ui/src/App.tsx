import { useEffect, useState } from 'react';
import { formatAppTitle, type HealthInfo } from '@steckplan/core';
import { fetchHealth } from './api';
import { texts } from './texts';

type ServerState = { status: 'loading' } | { status: 'ok'; health: HealthInfo } | { status: 'error' };

export function App() {
  const [server, setServer] = useState<ServerState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((health) => setServer({ status: 'ok', health }))
      .catch(() => {
        if (!controller.signal.aborted) setServer({ status: 'error' });
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <img src="/icon.svg" alt="" className="h-8 w-8" />
        <div>
          <h1 className="text-lg font-semibold leading-tight">Steckplan</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{texts.app.tagline}</p>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-4">
        <p className="max-w-md text-center text-slate-500 dark:text-slate-400">{texts.start.emptyState}</p>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <span>
          {server.status === 'loading' && texts.start.serverConnecting}
          {server.status === 'error' && <span className="text-red-600">{texts.start.serverError}</span>}
          {server.status === 'ok' &&
            `${texts.start.serverConnected} · ${
              server.health.mode === 'desktop' ? texts.start.modeDesktop : texts.start.modeStandalone
            }`}
        </span>
        <span>{formatAppTitle(server.status === 'ok' ? server.health.version : undefined)}</span>
      </footer>
    </div>
  );
}
