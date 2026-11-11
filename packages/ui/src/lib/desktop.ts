// Brücke zur Desktop-App (nur vorhanden, wenn die Oberfläche in Electron läuft – siehe apps/desktop/src/preload.ts).

export interface RecentFile {
  path: string;
  name: string;
  exists: boolean;
}

export interface DesktopSettings {
  name: string;
}

export interface NetworkAddress {
  name: string;
  address: string;
}

export interface ConnectedPerson {
  sessionId: string;
  name: string;
  access: 'edit' | 'read' | 'direction' | 'local';
  via: string;
  projects: string[];
}

export interface WebAccessStatus {
  running: boolean;
  url: string | null;
  qrSvg: string | null;
  port: number;
  actualPort: number | null;
  address: string | null;
  interfaces: NetworkAddress[];
  hasPasswords: boolean;
  hasDirectionPassword: boolean;
  people: ConnectedPerson[];
}

/** Weboberfläche per QR & Handy (siehe apps/desktop/src/web-access.ts) */
export interface WebAccessBridge {
  status(): Promise<WebAccessStatus>;
  start(address: string): Promise<WebAccessStatus>;
  stop(): Promise<WebAccessStatus>;
  setPasswords(passwords: { edit: string; read: string; direction?: string }): Promise<WebAccessStatus>;
  setPort(port: number): Promise<WebAccessStatus>;
  disconnect(sessionId: string): Promise<WebAccessStatus>;
}

export interface ServerInfo {
  id: string;
  label: string;
  url: string;
  insecure: boolean;
}

/** Gespeicherte Server-Verbindungen (siehe apps/desktop/src/servers.ts) */
export interface ServersBridge {
  list(): Promise<ServerInfo[]>;
  add(input: { label: string; url: string; key: string }): Promise<ServerInfo>;
  remove(id: string): Promise<void>;
  open(id: string): Promise<void>;
  onChanged(callback: () => void): () => void;
}

/** Hinweis auf eine neue Version (siehe apps/desktop/src/main.ts) */
export interface UpdateBridge {
  get(): Promise<{ version: string; url: string } | null>;
  /** Download-Seite im Browser öffnen */
  open(): Promise<void>;
  onAvailable(callback: () => void): () => void;
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
  webAccess: WebAccessBridge;
  servers: ServersBridge;
  /** fehlt in älteren Desktop-Versionen (Oberfläche von einem neueren Server) */
  update?: UpdateBridge;
  /** Lokales Projekt auf einen Server hochladen; öffnet es dort im Server-Fenster */
  uploadToServer(projectId: string, serverId: string): Promise<string>;
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
