// Desktop-Zugangsschlüssel (nur Docker-Server): zufällig, lang, nur als SHA-256-Hash gespeichert,
// mit Bezeichnung und Zugangsstufe; einzeln widerrufbar, „zuletzt benutzt“ wird vermerkt.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { writeFileAtomic } from '../storage/fs-utils';

export type KeyAccess = 'edit' | 'read';

export interface DesktopKey {
  id: string;
  label: string;
  access: KeyAccess;
  keyHash: string;
  createdAt: string;
  createdBy?: string;
  lastUsedAt?: string;
  revoked?: boolean;
  revokedAt?: string;
}

/** Was die Oberfläche sieht – nie der Hash. */
export type DesktopKeyInfo = Omit<DesktopKey, 'keyHash'>;

export const KEY_PREFIX = 'stp_';
export const LABEL_MAX_LENGTH = 60;
/** „zuletzt benutzt“ höchstens so oft schreiben */
const TOUCH_INTERVAL_MS = 60 * 1000;

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export class DesktopKeyStore {
  private keys: DesktopKey[] = [];
  private readonly file?: string;
  private readonly now: () => number;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSave: Promise<void> = Promise.resolve();

  constructor(options: { file?: string; now?: () => number } = {}) {
    this.file = options.file;
    this.now = options.now ?? Date.now;
  }

  async load(): Promise<void> {
    if (!this.file) return;
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8')) as { keys?: DesktopKey[] };
      this.keys = Array.isArray(data.keys) ? data.keys.filter((k) => typeof k.id === 'string' && typeof k.keyHash === 'string') : [];
    } catch {
      this.keys = [];
    }
  }

  list(): DesktopKeyInfo[] {
    return this.keys.map(({ keyHash: _hash, ...info }) => info).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Neuer Schlüssel; der Klartext wird nur hier einmal zurückgegeben. */
  async create(label: string, access: KeyAccess, createdBy?: string): Promise<{ key: string; info: DesktopKeyInfo }> {
    const key = KEY_PREFIX + randomBytes(32).toString('base64url');
    const entry: DesktopKey = {
      id: randomUUID(),
      label,
      access,
      keyHash: hashKey(key),
      createdAt: new Date(this.now()).toISOString(),
      ...(createdBy ? { createdBy } : {}),
    };
    this.keys.push(entry);
    await this.save();
    const { keyHash: _hash, ...info } = entry;
    return { key, info };
  }

  /** Widerrufen (bleibt zur Nachvollziehbarkeit in der Liste). */
  async revoke(id: string): Promise<DesktopKeyInfo | null> {
    const entry = this.keys.find((k) => k.id === id);
    if (!entry) return null;
    if (!entry.revoked) {
      entry.revoked = true;
      entry.revokedAt = new Date(this.now()).toISOString();
      await this.save();
    }
    const { keyHash: _hash, ...info } = entry;
    return info;
  }

  /** Widerrufenen Schlüssel endgültig aus der Liste entfernen. */
  async remove(id: string): Promise<boolean> {
    const entry = this.keys.find((k) => k.id === id);
    if (!entry || !entry.revoked) return false;
    this.keys = this.keys.filter((k) => k.id !== id);
    await this.save();
    return true;
  }

  /** Prüft einen Schlüssel; gültig → Eintrag (und „zuletzt benutzt“ wird aktualisiert). */
  verify(key: string | undefined): DesktopKey | null {
    if (!key || !key.startsWith(KEY_PREFIX) || key.length > 200) return null;
    const hash = hashKey(key);
    const entry = this.keys.find((k) => k.keyHash === hash && !k.revoked);
    if (!entry) return null;
    const now = this.now();
    if (!entry.lastUsedAt || now - Date.parse(entry.lastUsedAt) > TOUCH_INTERVAL_MS) {
      entry.lastUsedAt = new Date(now).toISOString();
      this.scheduleSave();
    }
    return entry;
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      await this.save();
    }
    await this.pendingSave;
  }

  private scheduleSave(): void {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, 5000);
    this.saveTimer.unref?.();
  }

  private save(): Promise<void> {
    if (!this.file) return Promise.resolve();
    const file = this.file;
    const data = JSON.stringify({ keys: this.keys }, null, 2);
    this.pendingSave = this.pendingSave.then(() => writeFileAtomic(file, data));
    return this.pendingSave;
  }
}
