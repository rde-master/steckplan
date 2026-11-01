// Einstellungen der Desktop-App (App-Datenordner/settings.json).
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { writeFileAtomic } from '@steckplan/server';

export const MAX_RECENT = 10;

export interface Settings {
  name: string;
  recentFiles: string[];
}

export interface RecentFile {
  path: string;
  name: string;
  exists: boolean;
}

export class SettingsStore {
  private settings: Settings = { name: '', recentFiles: [] };
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
