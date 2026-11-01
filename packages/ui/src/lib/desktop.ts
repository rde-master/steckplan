// Brücke zur Desktop-App (nur vorhanden, wenn die Oberfläche in Electron läuft – siehe apps/desktop/src/preload.ts).

export interface RecentFile {
  path: string;
  name: string;
  exists: boolean;
}

export interface DesktopSettings {
  name: string;
}

export interface DesktopBridge {
  platform: string;
  getSettings(): Promise<DesktopSettings>;
  setName(name: string): Promise<DesktopSettings>;
  newProject(): Promise<void>;
  openProject(): Promise<void>;
  openRecent(path: string): Promise<void>;
  listRecent(): Promise<RecentFile[]>;
  openLibrary(): Promise<void>;
  copyAsNew(projectId: string): Promise<void>;
  onRecentChanged(callback: () => void): () => void;
  /** Befehle aus dem Anwendungsmenü, z. B. „versions“ */
  onMenuCommand(callback: (command: string) => void): () => void;
}

declare global {
  interface Window {
    steckplanDesktop?: DesktopBridge;
  }
}

export function getDesktop(): DesktopBridge | null {
  return typeof window !== 'undefined' && window.steckplanDesktop && 'getSettings' in window.steckplanDesktop
    ? window.steckplanDesktop
    : null;
}
