// Dunkles Systemdesign (wie Tailwinds „dark:“ über prefers-color-scheme) – für Farben auf der Zeichenfläche (Konva).
import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-color-scheme: dark)';

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

const snapshot = () => (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches);

export function useDarkMode(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** Fläche der Zeichenfläche: „auto“ folgt dem Systemdesign */
export type CanvasTheme = 'auto' | 'light' | 'dark';

/** Ist die Zeichenfläche dunkel? (eigene Wahl oder Systemdesign) */
export function useCanvasDark(theme: CanvasTheme = 'auto'): boolean {
  const system = useDarkMode();
  return theme === 'auto' ? system : theme === 'dark';
}

/** Schrift auf dem Hintergrund der Zeichenfläche: weiß bei dunklem, schwarz bei hellem Hintergrund */
export function canvasInk(dark: boolean): string {
  return dark ? '#f8fafc' : '#0f172a';
}
