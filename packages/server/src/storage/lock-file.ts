// Sperrdatei neben einer lokal geöffneten .steckplan-Datei: <datei>.steckplan.lock
// Bewusst ohne führenden Punkt, damit Sync-Clients wie Nextcloud sie übertragen.
import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { readFile, rm } from 'node:fs/promises';
import { writeFileAtomic } from './fs-utils';

export const LOCK_STALE_MS = 10 * 60 * 1000;
export const LOCK_REFRESH_MS = 60 * 1000;

export interface LockInfo {
  app: 'Steckplan';
  host: string;
  name: string;
  pid: number;
  instance: string;
  startedAt: string;
  updatedAt: string;
}

export class LockedError extends Error {
  constructor(
    public readonly info: LockInfo,
    public readonly stale: boolean,
  ) {
    super(
      stale
        ? `Die Datei war zuletzt von ${info.name} (${info.host}) geöffnet; die Sperre ist veraltet.`
        : `Die Datei wird gerade von ${info.name} (${info.host}) bearbeitet.`,
    );
    this.name = 'LockedError';
  }
}

export function lockPathFor(file: string): string {
  return `${file}.lock`;
}

export async function readLock(file: string): Promise<LockInfo | null> {
  try {
    const info = JSON.parse(await readFile(lockPathFor(file), 'utf8')) as LockInfo;
    return info && typeof info.updatedAt === 'string' ? info : null;
  } catch {
    return null;
  }
}

export function isStale(info: LockInfo, now = Date.now()): boolean {
  const updated = Date.parse(info.updatedAt);
  return Number.isNaN(updated) || now - updated > LOCK_STALE_MS;
}

export class FileLock {
  private timer: ReturnType<typeof setInterval> | null = null;
  private info: LockInfo | null = null;
  private readonly instance = randomBytes(8).toString('hex');

  constructor(
    readonly file: string,
    private name: string,
  ) {}

  /** Sperre setzen. Wirft LockedError, wenn ein anderer die Datei gesperrt hat (außer takeOver). */
  async acquire(options: { takeOver?: boolean } = {}): Promise<void> {
    const existing = await readLock(this.file);
    if (existing && existing.instance !== this.instance && !options.takeOver) {
      throw new LockedError(existing, isStale(existing));
    }
    const now = new Date().toISOString();
    this.info = {
      app: 'Steckplan',
      host: hostname(),
      name: this.name,
      pid: process.pid,
      instance: this.instance,
      startedAt: now,
      updatedAt: now,
    };
    await this.write();
    this.timer = setInterval(() => void this.refresh(), LOCK_REFRESH_MS);
    this.timer.unref?.();
  }

  setName(name: string): void {
    this.name = name;
    if (this.info) {
      this.info.name = name;
      void this.write();
    }
  }

  private async refresh(): Promise<void> {
    if (!this.info) return;
    const current = await readLock(this.file);
    // Hat jemand anders die Sperre übernommen, nicht überschreiben.
    if (current && current.instance !== this.instance) return;
    this.info.updatedAt = new Date().toISOString();
    await this.write().catch(() => undefined);
  }

  private async write(): Promise<void> {
    if (this.info) await writeFileAtomic(lockPathFor(this.file), JSON.stringify(this.info, null, 2));
  }

  async release(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.info) return;
    this.info = null;
    const current = await readLock(this.file);
    if (current && current.instance === this.instance) await rm(lockPathFor(this.file), { force: true });
  }
}
