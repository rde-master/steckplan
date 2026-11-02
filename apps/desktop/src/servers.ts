// Desktop mit Server verbunden: gespeicherte Server, je Server ein Fenster mit der Oberfläche des Servers.
// Der Desktop-Zugangsschlüssel liegt mit safeStorage verschlüsselt (macOS Keychain, Windows DPAPI) in den Einstellungen
// und wird nur im Main-Prozess als Authorization-Header an Anfragen an diesen Server gehängt.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { app, BrowserWindow, safeStorage, session, shell, type Session } from 'electron';
import { formatAppTitle } from '@steckplan/core';
import type { SavedServer, SettingsStore } from './settings';

export interface ServerInfo {
  id: string;
  label: string;
  url: string;
  /** http:// zu einem anderen Rechner: Schlüssel und Daten unverschlüsselt */
  insecure: boolean;
}

export class ServerError extends Error {}

/** Adresse prüfen und vereinheitlichen (nur http/https, ohne Pfad-Ende-Schrägstrich). */
export function normalizeServerUrl(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) throw new ServerError('Bitte die Adresse des Servers eingeben.');
  let text = input.trim();
  if (!/^[a-z]+:\/\//i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new ServerError('Die Adresse ist ungültig.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ServerError('Nur http:// und https:// werden unterstützt.');
  if (url.username || url.password) throw new ServerError('Die Adresse darf keine Zugangsdaten enthalten.');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export function isInsecure(url: string): boolean {
  const { protocol, hostname } = new URL(url);
  return protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
}

export class ServerConnections {
  private readonly windows = new Map<string, BrowserWindow>();
  private readonly preparedSessions = new Set<string>();

  constructor(
    private readonly options: {
      settings: SettingsStore;
      userName: () => string;
      show: boolean;
      /** ein Server-Fenster wurde geschlossen */
      onWindowClosed: () => void;
    },
  ) {}

  list(): ServerInfo[] {
    return this.options.settings.servers.map((s) => ({ id: s.id, label: s.label, url: s.url, insecure: isInsecure(s.url) }));
  }

  get windowCount(): number {
    return [...this.windows.values()].filter((w) => !w.isDestroyed()).length;
  }

  /** Verbindung prüfen und speichern. */
  async add(input: unknown): Promise<ServerInfo> {
    const { label: rawLabel, url: rawUrl, key: rawKey } = (input ?? {}) as { label?: unknown; url?: unknown; key?: unknown };
    const url = normalizeServerUrl(rawUrl);
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!key) throw new ServerError('Bitte den Desktop-Zugangsschlüssel eingeben.');
    await this.check(url, key);
    if (!safeStorage.isEncryptionAvailable()) throw new ServerError('Der Schlüsselbund des Systems ist nicht verfügbar – der Schlüssel kann nicht sicher gespeichert werden.');
    const label = typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel.trim().slice(0, 60) : new URL(url).host;
    const entry: SavedServer = { id: randomUUID(), label, url, key: safeStorage.encryptString(key).toString('base64') };
    await this.options.settings.setServers([...this.options.settings.servers, entry]);
    return { id: entry.id, label, url, insecure: isInsecure(url) };
  }

  async remove(id: unknown): Promise<void> {
    const entry = this.find(id);
    this.windows.get(entry.id)?.close();
    await this.options.settings.setServers(this.options.settings.servers.filter((s) => s.id !== entry.id));
    await session.fromPartition(this.partition(entry.id)).clearStorageData();
  }

  /** Server-Fenster öffnen (oder nach vorne holen), optional mit Pfad, z. B. /projekt/… */
  open(id: unknown, path = '/'): BrowserWindow {
    const entry = this.find(id);
    const existing = this.windows.get(entry.id);
    if (existing && !existing.isDestroyed()) {
      if (path !== '/') void existing.loadURL(`${entry.url}${path}`);
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return existing;
    }
    const ses = session.fromPartition(this.partition(entry.id));
    this.prepareSession(ses, entry);
    const win = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 640,
      minHeight: 480,
      title: `${entry.label} – ${formatAppTitle()}`,
      show: this.options.show,
      webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    // Nur der Server im Fenster; alles andere im Standardbrowser
    win.webContents.setWindowOpenHandler(({ url: target }) => {
      if (/^https?:\/\//.test(target) && !target.startsWith(entry.url)) void shell.openExternal(target);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, target) => {
      if (!target.startsWith(entry.url)) {
        event.preventDefault();
        if (/^https?:\/\//.test(target)) void shell.openExternal(target);
      }
    });
    // Titel der Seite um den Servernamen ergänzen
    win.on('page-title-updated', (event, title) => {
      event.preventDefault();
      win.setTitle(`${title} · ${entry.label}`);
    });
    win.on('closed', () => {
      this.windows.delete(entry.id);
      this.options.onWindowClosed();
    });
    this.windows.set(entry.id, win);
    void win.loadURL(`${entry.url}${path}`);
    return win;
  }

  /** Lokales Projekt (Datei-Inhalt) auf den Server hochladen und dort öffnen. */
  async upload(id: unknown, projectJson: string): Promise<string> {
    const entry = this.find(id);
    const res = await fetch(`${entry.url}/api/projects/upload`, {
      method: 'POST',
      headers: { ...this.headers(entry), 'content-type': 'application/json' },
      body: projectJson,
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !data.id) throw new ServerError(data.error ?? `Hochladen fehlgeschlagen (${res.status}).`);
    this.open(entry.id, `/projekt/${encodeURIComponent(data.id)}`);
    return data.id;
  }

  closeAll(): void {
    for (const win of this.windows.values()) if (!win.isDestroyed()) win.close();
  }

  // ---------- intern ----------

  private find(id: unknown): SavedServer {
    const entry = this.options.settings.servers.find((s) => s.id === id);
    if (!entry) throw new ServerError('Diese Server-Verbindung gibt es nicht mehr.');
    return entry;
  }

  private partition(id: string): string {
    return `persist:server-${id}`;
  }

  private decryptKey(entry: SavedServer): string {
    try {
      return safeStorage.decryptString(Buffer.from(entry.key, 'base64'));
    } catch {
      throw new ServerError('Der gespeicherte Schlüssel kann nicht entschlüsselt werden. Bitte die Verbindung entfernen und neu anlegen.');
    }
  }

  private headers(entry: SavedServer): Record<string, string> {
    return {
      authorization: `Bearer ${this.decryptKey(entry)}`,
      'x-steckplan-name': encodeURIComponent(this.options.userName() || 'Desktop'),
    };
  }

  private async check(url: string, key: string): Promise<void> {
    let health: { name?: string; mode?: string };
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(10_000) });
      health = (await res.json()) as typeof health;
    } catch {
      throw new ServerError('Der Server ist nicht erreichbar. Adresse und Netzwerk prüfen.');
    }
    if (health.name !== 'Steckplan') throw new ServerError('Unter dieser Adresse läuft kein Steckplan-Server.');
    if (health.mode !== 'standalone') throw new ServerError('Das ist kein Steckplan-Server (sondern z. B. die Weboberfläche einer Desktop-App).');
    const res = await fetch(`${url}/api/auth/session`, {
      headers: { authorization: `Bearer ${key}`, 'x-steckplan-name': encodeURIComponent(this.options.userName() || 'Desktop') },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ServerError(res.status === 401 ? 'Der Desktop-Zugangsschlüssel ist ungültig oder wurde widerrufen.' : (data.error ?? `Anmeldung fehlgeschlagen (${res.status}).`));
    }
  }

  /** Header für alle Anfragen (auch WebSocket) an diesen Server; Downloads mit Speichern-Dialog. */
  private prepareSession(ses: Session, entry: SavedServer): void {
    if (this.preparedSessions.has(entry.id)) return;
    this.preparedSessions.add(entry.id);
    const origin = new URL(entry.url);
    const wsOrigin = `${origin.protocol === 'https:' ? 'wss:' : 'ws:'}//${origin.host}`;
    ses.webRequest.onBeforeSendHeaders({ urls: [`${origin.origin}/*`, `${wsOrigin}/*`] }, (details, callback) => {
      const current = this.options.settings.servers.find((s) => s.id === entry.id);
      if (!current) return callback({ cancel: true });
      try {
        callback({ requestHeaders: { ...details.requestHeaders, ...this.headers(current) } });
      } catch {
        callback({ requestHeaders: details.requestHeaders });
      }
    });
    ses.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({ title: 'Speichern unter', defaultPath: join(app.getPath('documents'), item.getFilename()) });
    });
  }
}
