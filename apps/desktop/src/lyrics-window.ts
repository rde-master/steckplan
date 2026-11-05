// Textfenster der Vorstellung: das einzige Fenster, das die Oberfläche selbst öffnen darf
// (leere Seite, Inhalt kommt per Portal aus dem Hauptfenster).
import type { BrowserWindowConstructorOptions, HandlerDetails } from 'electron';

export const LYRICS_WINDOW_NAME = 'steckplan-lyrics';

export function isLyricsWindow(details: Pick<HandlerDetails, 'url' | 'frameName'>): boolean {
  return details.frameName === LYRICS_WINDOW_NAME && (details.url === '' || details.url === 'about:blank');
}

export const lyricsWindowOptions: BrowserWindowConstructorOptions = {
  width: 1100,
  height: 560,
  autoHideMenuBar: true,
  backgroundColor: '#020617',
};
