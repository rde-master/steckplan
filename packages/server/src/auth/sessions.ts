// Sitzungen: Token im HttpOnly-Cookie; gespeichert wird nur ein SHA-256-Hash des Tokens.
// Browser-Sitzungen gelten 30 Tage und verlängern sich bei Benutzung.
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Access } from '@steckplan/core';
import { writeFileAtomic } from '../storage/fs-utils';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export type SessionVia = 'desktop' | 'browser' | 'desktopKey';

export interface Session {
  id: string;
  name: string;
  access: Access;
  via: SessionVia;
  createdAt: string;
  lastSeenAt: string;
  /** undefined = läuft nicht ab (lokale Desktop-Sitzung) */
  expiresAt?: string;
}

interface StoredSession extends Session {
  tokenHash: string;
  persistent: boolean;
}

interface SessionFile {
  installSalt: string;
  fingerprint: string;
  sessions: StoredSession[];
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const NAME_MAX_LENGTH = 40;

/** Prüft und bereinigt einen eingetippten Namen. */
export function normalizeName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const name = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > NAME_MAX_LENGTH) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

export interface SessionStoreOptions {
  /** Datei für dauerhafte Sitzungen (Docker: /data/sessions.json); ohne Datei nur im Speicher */
  file?: string;
  ttlMs?: number;
  now?: () => number;
}

export class SessionStore {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly listeners = new Set<(session: Session) => void>();
  private readonly file?: string;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private installSalt = randomBytes(16).toString('hex');
  private fingerprint = '';
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: SessionStoreOptions = {}) {
    this.file = options.file;
    this.ttlMs = options.ttlMs ?? SESSION_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  /** Salt für den Passwort-Fingerabdruck (bleibt pro Installation gleich). */
  get salt(): string {
    return this.installSalt;
  }

  /** Lädt gespeicherte Sitzungen. Passt der Fingerabdruck nicht (Passwörter geändert), werden alle verworfen. */
  async load(computeFingerprint?: (installSalt: string) => string): Promise<void> {
    let stored: SessionFile | null = null;
    if (this.file) {
      try {
        stored = JSON.parse(await readFile(this.file, 'utf8')) as SessionFile;
      } catch {
        stored = null;
      }
    }
    if (stored?.installSalt) this.installSalt = stored.installSalt;
    this.fingerprint = computeFingerprint?.(this.installSalt) ?? '';
    if (stored && stored.fingerprint === this.fingerprint) {
      const now = this.now();
      for (const s of stored.sessions ?? []) {
        if (!s.expiresAt || Date.parse(s.expiresAt) > now) this.sessions.set(s.tokenHash, s);
      }
    }
    await this.persist();
  }

  /** Meldet geänderte Sitzungen (z. B. neuer Name), damit verbundene Clients aktualisiert werden. */
  onChange(listener: (session: Session) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  create(name: string, access: Access, via: SessionVia, options: { persistent?: boolean; expires?: boolean } = {}): { token: string; session: Session } {
    const token = randomBytes(32).toString('base64url');
    const now = new Date(this.now()).toISOString();
    const stored: StoredSession = {
      id: randomBytes(8).toString('hex'),
      name,
      access,
      via,
      createdAt: now,
      lastSeenAt: now,
      ...(options.expires === false ? {} : { expiresAt: new Date(this.now() + this.ttlMs).toISOString() }),
      tokenHash: hashToken(token),
      persistent: options.persistent ?? true,
    };
    this.sessions.set(stored.tokenHash, stored);
    if (stored.persistent) this.schedulePersist();
    return { token, session: this.toSession(stored) };
  }

  /** Sitzung zu einem Token (verlängert die Gültigkeit bei Benutzung). */
  get(token: string | undefined): Session | undefined {
    if (!token) return undefined;
    const stored = this.sessions.get(hashToken(token));
    if (!stored) return undefined;
    const now = this.now();
    if (stored.expiresAt && Date.parse(stored.expiresAt) <= now) {
      this.sessions.delete(stored.tokenHash);
      this.schedulePersist();
      return undefined;
    }
    if (now - Date.parse(stored.lastSeenAt) > TOUCH_INTERVAL_MS) {
      stored.lastSeenAt = new Date(now).toISOString();
      if (stored.expiresAt) stored.expiresAt = new Date(now + this.ttlMs).toISOString();
      if (stored.persistent) this.schedulePersist();
    }
    return this.toSession(stored);
  }

  delete(token: string | undefined): void {
    if (!token) return;
    const hash = hashToken(token);
    const stored = this.sessions.get(hash);
    if (stored && this.sessions.delete(hash) && stored.persistent) this.schedulePersist();
  }

  /** Alle Sitzungen (ohne Token). */
  list(): Session[] {
    return [...this.sessions.values()].map((s) => this.toSession(s));
  }

  /** Beendet Sitzungen, auf die die Bedingung zutrifft; gibt sie zurück. */
  deleteWhere(predicate: (session: Session) => boolean): Session[] {
    const removed: Session[] = [];
    for (const [hash, stored] of this.sessions) {
      const session = this.toSession(stored);
      if (predicate(session)) {
        this.sessions.delete(hash);
        removed.push(session);
        if (stored.persistent) this.schedulePersist();
      }
    }
    return removed;
  }

  /** Ändert den Namen einer Sitzung (Desktop: Name in den Einstellungen geändert). */
  rename(token: string, name: string): void {
    const stored = this.sessions.get(hashToken(token));
    if (!stored) return;
    stored.name = name;
    if (stored.persistent) this.schedulePersist();
    for (const listener of this.listeners) listener(this.toSession(stored));
  }

  get size(): number {
    return this.sessions.size;
  }

  private toSession(stored: StoredSession): Session {
    const { tokenHash: _hash, persistent: _persistent, ...session } = stored;
    return { ...session };
  }

  private schedulePersist(): void {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persist();
    }, 1000);
    this.saveTimer.unref?.();
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.file) return;
    const data: SessionFile = {
      installSalt: this.installSalt,
      fingerprint: this.fingerprint,
      sessions: [...this.sessions.values()].filter((s) => s.persistent),
    };
    await writeFileAtomic(this.file, JSON.stringify(data, null, 2));
  }
}
