// Seiten erst bei Bedarf laden (eigene Dateien je Seite).
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_KEY = 'steckplan.reloadedAt';
/** höchstens einmal je halbe Minute neu laden (sonst Schleife, wenn der Server nicht erreichbar ist) */
const RELOAD_PAUSE_MS = 30_000;

function lastReload(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Lädt eine Seite. Schlägt das fehl, wurde meist der Server aktualisiert, während die Seite offen war – die Dateien
 * der alten Version gibt es dann nicht mehr. Einmal neu laden holt die neue Version; hilft das nicht, der Fehler.
 */
export async function loadWithReload<T>(load: () => Promise<T>, now: () => number = Date.now, reload: () => void = () => window.location.reload()): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (now() - lastReload() < RELOAD_PAUSE_MS) throw error;
    try {
      sessionStorage.setItem(RELOAD_KEY, String(now()));
    } catch {
      // ohne Speicher lässt sich die Schleife nicht verhindern – dann lieber den Fehler zeigen
      throw error;
    }
    reload();
    // bis die Seite neu lädt, nichts anzeigen
    return new Promise<T>(() => undefined);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- wie React.lazy: beliebige Eigenschaften
export function lazyPage<C extends ComponentType<any>>(load: () => Promise<C>): LazyExoticComponent<C> {
  return lazy(() => loadWithReload(load).then((component) => ({ default: component })));
}
