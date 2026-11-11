// Fängt Programmfehler beim Zeichnen ab: statt eines weißen Bildschirms eine Meldung mit „Neu laden“.
// Anzeige-Seiten ohne Bedienung (Textfenster, Player – meist am Beamer) bleiben dunkel und laden von selbst neu.
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { texts } from '../texts';
import { Button } from './ui';

const t = texts.errorScreen;
const RELOAD_KEY = 'steckplan.errorReloadAt';

/** Textfenster und Player: niemand steht davor, um einen Knopf zu drücken */
export function isDisplayPath(path: string): boolean {
  return /^\/player\/?$/.test(path) || /^\/projekt\/[^/]+\/text\/?$/.test(path);
}

/** Wartezeit bis zum Neuladen: erst kurz; kam der Fehler gleich nach einem Neuladen wieder, länger (keine Schleife) */
export function reloadDelayMs(lastReloadAt: number, now: number): number {
  return now - lastReloadAt < 60_000 ? 30_000 : 4_000;
}

function lastReload(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    return 0;
  }
}

function reloadNow(): void {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // ohne Speicher: dann eben ohne Merker
  }
  window.location.reload();
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Steckplan: Fehler in der Oberfläche', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return isDisplayPath(window.location.pathname) ? <DisplayError /> : <ErrorScreen error={error} />;
  }
}

/** Textfenster/Player: dunkel bleiben (Beamer), kleiner Hinweis, von selbst neu laden */
function DisplayError() {
  useEffect(() => {
    const timer = window.setTimeout(reloadNow, reloadDelayMs(lastReload(), Date.now()));
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="dark fixed inset-0 flex items-end justify-center bg-slate-950 p-6 text-sm text-slate-600" role="alert" data-testid="error-screen" data-mode="display">
      {t.displayReloading}
    </div>
  );
}

function ErrorScreen({ error }: { error: Error }) {
  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-4 p-6" role="alert" data-testid="error-screen" data-mode="page">
      <h1 className="text-xl font-semibold">{t.title}</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t.hint}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={reloadNow}>
          {t.reload}
        </Button>
        <Button onClick={() => window.location.assign('/')}>{t.home}</Button>
      </div>
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">{t.details}</summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-slate-100 p-2 whitespace-pre-wrap dark:bg-slate-900" data-testid="error-details">
          {error.message || String(error)}
        </pre>
      </details>
    </div>
  );
}
