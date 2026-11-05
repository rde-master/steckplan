// Textfenster der Regie: das einzige Fenster, das die Oberfläche selbst öffnen darf
// (eigene Seite /projekt/<id>/text derselben Oberfläche, Fenstername steckplan-text-<id>).
import type { BrowserWindowConstructorOptions, HandlerDetails } from 'electron';

export function isLyricsWindow(details: Pick<HandlerDetails, 'url' | 'frameName'>, base: string): boolean {
  if (!details.frameName.startsWith('steckplan-text-') || !details.url.startsWith(base)) return false;
  return /^\/projekt\/[^/]+\/text\/?$/.test(new URL(details.url).pathname);
}

export const lyricsWindowOptions: BrowserWindowConstructorOptions = {
  width: 1100,
  height: 600,
  autoHideMenuBar: true,
  backgroundColor: '#020617',
};
