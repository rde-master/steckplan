// Einstellungen des Players (im App-Datenordner): Gerätekennung, Name, Schlüssel je Steuersoftware, zuletzt genutzt.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface PlayerConfig {
  deviceId: string;
  /** Schlüssel je Steuersoftware (Kennung aus der Suche) */
  tokens: Record<string, string>;
  /** zuletzt verbundene Steuersoftware (wird bei der Suche bevorzugt) */
  lastServer?: { id: string; host: string; port: number };
}

export class ConfigStore {
  private data: PlayerConfig = { deviceId: randomUUID(), tokens: {} };
  private readonly file: string;

  constructor(dir: string) {
    this.file = join(dir, 'player.json');
  }

  get config(): PlayerConfig {
    return this.data;
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as Partial<PlayerConfig>;
      this.data = {
        deviceId: typeof raw.deviceId === 'string' && raw.deviceId ? raw.deviceId : this.data.deviceId,
        tokens: raw.tokens && typeof raw.tokens === 'object' ? Object.fromEntries(Object.entries(raw.tokens).filter(([, v]) => typeof v === 'string')) : {},
        ...(raw.lastServer && typeof raw.lastServer.id === 'string' ? { lastServer: raw.lastServer } : {}),
      };
    } catch {
      await this.save();
    }
  }

  async update(patch: Partial<PlayerConfig>): Promise<void> {
    this.data = { ...this.data, ...patch };
    await this.save();
  }

  async setToken(serverId: string, token: string | undefined): Promise<void> {
    const tokens = { ...this.data.tokens };
    if (token) tokens[serverId] = token;
    else delete tokens[serverId];
    await this.update({ tokens });
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2));
    await rename(tmp, this.file);
  }
}
