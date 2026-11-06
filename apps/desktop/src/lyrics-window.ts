// Fenster, die die Oberfläche selbst öffnen darf: Textfenster (/projekt/<id>/text) und Vorstellung
// (/projekt/<id>/vorstellung) derselben Oberfläche, Fensternamen steckplan-text-<id> bzw. steckplan-vorstellung-<id>.
import type { BrowserWindowConstructorOptions, HandlerDetails } from 'electron';

/** Erlaubtes eigenes Fenster? Ergebnis: Fenster-Einstellungen, sonst null */
export function appWindowOptions(details: Pick<HandlerDetails, 'url' | 'frameName'>, base: string): BrowserWindowConstructorOptions | null {
  if (!details.url.startsWith(base)) return null;
  const path = new URL(details.url).pathname;
  if (details.frameName.startsWith('steckplan-text-') && /^\/projekt\/[^/]+\/text\/?$/.test(path)) return lyricsWindowOptions;
  if (details.frameName.startsWith('steckplan-vorstellung-') && /^\/projekt\/[^/]+\/vorstellung\/?$/.test(path)) return performanceWindowOptions;
  if (details.frameName === 'steckplan-osc' && path === '/osc') return { width: 1100, height: 800, autoHideMenuBar: true };
  return null;
}

const lyricsWindowOptions: BrowserWindowConstructorOptions = {
  width: 1100,
  height: 600,
  autoHideMenuBar: true,
  backgroundColor: '#020617',
};

const performanceWindowOptions: BrowserWindowConstructorOptions = {
  width: 1440,
  height: 900,
  autoHideMenuBar: true,
  backgroundColor: '#020617',
};
