// Einstellungen der Desktop-App (App-Datenordner/settings.json).
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { writeFileAtomic, type StoredPassword } from '@steckplan/server';

export const MAX_RECENT = 10;
export const DEFAULT_WEB_PORT = 8080;

/** Weboberfläche (QR & Handy): Passwörter nur als scrypt-Hash */
export interface WebAccessSettings {
  port: number;
  /** zuletzt gewählte IPv4-Adresse */
  address?: string;
  edit?: StoredPassword;
  read?: StoredPassword;
  /** optional: Regie-Passwort */
  direction?: StoredPassword;
}

/** Gespeicherte Server-Verbindung; key = Desktop-Zugangsschlüssel, mit safeStorage verschlüsselt (base64) */
export interface SavedServer {
  id: string;
  label: string;
  url: string;
  key: string;
}

export interface Settings {
  name: string;
  recentFiles: string[];
  webAccess: WebAccessSettings;
  servers: SavedServer[];
}

function readServers(value: unknown): SavedServer[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is SavedServer => !!s && typeof s.id === 'string' && typeof s.label === 'string' && typeof s.url === 'string' && typeof s.key === 'string',
  );
}

function isStored(value: unknown): value is StoredPassword {
  const v = value as StoredPassword | undefined;
  return !!v && typeof v.salt === 'string' && typeof v.hash === 'string' && /^[0-9a-f]+$/.test(v.salt + v.hash);
}

export function isValidPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1024 && port <= 65535;
}

function readWebAccess(value: unknown): WebAccessSettings {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    port: isValidPort(v.port) ? v.port : DEFAULT_WEB_PORT,
    ...(typeof v.address === 'string' ? { address: v.address } : {}),
    ...(isStored(v.edit) && isStored(v.read) ? { edit: v.edit, read: v.read, ...(isStored(v.direction) ? { direction: v.direction } : {}) } : {}),
  };
}

export interface RecentFile {
  path: string;
  name: string;
  exists: boolean;
}

export class SettingsStore {
  private settings: Settings = { name: '', recentFiles: [], webAccess: { port: DEFAULT_WEB_PORT }, servers: [] };
  private readonly file: string;

  constructor(userDataDir: string) {
    this.file = join(userDataDir, 'settings.json');
  }

  async load(): Promise<void> {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8')) as Partial<Settings>;
      this.settings = {
        name: typeof data.name === 'string' ? data.name : '',
        recentFiles: Array.isArray(data.recentFiles) ? data.recentFiles.filter((p) => typeof p === 'string').slice(0, MAX_RECENT) : [],
        webAccess: readWebAccess(data.webAccess),
        servers: readServers(data.servers),
      };
    } catch {
      // erste Benutzung
    }
  }

  get name(): string {
    return this.settings.name;
  }

  async setName(name: string): Promise<void> {
    this.settings.name = name;
    await this.save();
  }

  get webAccess(): WebAccessSettings {
    return this.settings.webAccess;
  }

  async updateWebAccess(change: Partial<WebAccessSettings>): Promise<void> {
    this.settings.webAccess = { ...this.settings.webAccess, ...change };
    await this.save();
  }

  get servers(): SavedServer[] {
    return this.settings.servers;
  }

  async setServers(servers: SavedServer[]): Promise<void> {
    this.settings.servers = servers;
    await this.save();
  }

  async addRecent(path: string): Promise<void> {
    this.settings.recentFiles = [path, ...this.settings.recentFiles.filter((p) => p !== path)].slice(0, MAX_RECENT);
    await this.save();
  }

  recent(): RecentFile[] {
    return this.settings.recentFiles.map((path) => ({
      path,
      name: basename(path).replace(/\.steckplan$/i, ''),
      exists: existsSync(path),
    }));
  }

  private async save(): Promise<void> {
    await writeFileAtomic(this.file, JSON.stringify(this.settings, null, 2));
  }
}
