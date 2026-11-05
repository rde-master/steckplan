// Lokaler Modus der Desktop-App: Projekte sind frei gespeicherte .steckplan-Dateien.
// Jede geöffnete Datei bekommt für die Laufzeit eine id; der Server speichert in die Datei zurück.
import { cp, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { newId, parseProjectFile, serializeProject, type Project } from '@steckplan/core';
import { isNotFound, writeFileAtomic } from './fs-utils';
import { FileLock } from './lock-file';
import { ProjectNotFoundError, summarize, type ProjectStore, type ProjectSummary } from './types';

/** Medienordner neben der Datei: „Fest.steckplan“ → „Fest.medien“ */
export function mediaDirFor(path: string): string {
  return join(dirname(path), `${basename(path).replace(/\.steckplan$/i, '')}.medien`);
}

interface OpenFile {
  id: string;
  path: string;
  readOnlyReason?: string;
  lock: FileLock | null;
}

export interface OpenOptions {
  /** Nur lesen öffnen (keine Sperre, kein Speichern) */
  readOnly?: boolean;
  /** Vorhandene Sperre übernehmen */
  takeOverLock?: boolean;
}

export class LocalFileStore implements ProjectStore {
  readonly kind = 'localFiles' as const;
  private readonly files = new Map<string, OpenFile>();
  /** Laufende Schließvorgänge (Sperre wird freigegeben) – closeAll wartet darauf. */
  private readonly closing = new Map<string, Promise<void>>();

  /** userName: Name aus den Desktop-Einstellungen (steht in der Sperrdatei) */
  constructor(private userName: string) {}

  setUserName(name: string): void {
    this.userName = name;
    for (const file of this.files.values()) file.lock?.setName(name);
  }

  findByPath(path: string): string | undefined {
    const full = resolve(path);
    for (const file of this.files.values()) if (file.path === full) return file.id;
    return undefined;
  }

  pathOf(id: string): string | undefined {
    return this.files.get(id)?.path;
  }

  /**
   * Öffnet eine Datei. Prüft vorher, ob sie lesbar und gültig ist (ProjectFormatError),
   * und setzt die Sperre (LockedError, wenn ein anderer sie hat).
   */
  async open(path: string, options: OpenOptions = {}): Promise<{ id: string; project: Project }> {
    const full = resolve(path);
    const existing = this.findByPath(full);
    const project = parseProjectFile(await readFile(full, 'utf8'));
    if (existing) return { id: existing, project };

    let lock: FileLock | null = null;
    if (!options.readOnly) {
      lock = new FileLock(full, this.userName);
      await lock.acquire({ takeOver: options.takeOverLock });
    }
    const id = newId();
    this.files.set(id, {
      id,
      path: full,
      lock,
      ...(options.readOnly ? { readOnlyReason: 'Die Datei ist nur zum Lesen geöffnet.' } : {}),
    });
    return { id, project };
  }

  /** Legt eine neue Datei an und öffnet sie. */
  async create(path: string, project: Project): Promise<string> {
    const full = resolve(path);
    await writeFileAtomic(full, serializeProject(project));
    return (await this.open(full, { takeOverLock: true })).id;
  }

  /** „Speichern unter“: schreibt den Stand in eine neue Datei und arbeitet dort weiter. */
  async saveAs(id: string, newPath: string, project: Project): Promise<void> {
    const file = this.files.get(id);
    if (!file) throw new ProjectNotFoundError(id);
    const full = resolve(newPath);
    if (full === file.path) {
      await this.save(id, project);
      return;
    }
    await writeFileAtomic(full, serializeProject(project));
    // Medien neben die neue Datei kopieren (vorhandene Dateien dort bleiben)
    await cp(mediaDirFor(file.path), mediaDirFor(full), { recursive: true, force: false, errorOnExist: false }).catch((error: unknown) => {
      if (!isNotFound(error)) throw error;
    });
    const lock = new FileLock(full, this.userName);
    await lock.acquire({ takeOver: true });
    await file.lock?.release();
    file.path = full;
    file.lock = lock;
    delete file.readOnlyReason;
  }

  close(id: string): Promise<void> {
    const pending = this.closing.get(id);
    if (pending) return pending;
    const file = this.files.get(id);
    if (!file) return Promise.resolve();
    this.files.delete(id);
    const done = (file.lock?.release() ?? Promise.resolve()).finally(() => this.closing.delete(id));
    this.closing.set(id, done);
    return done;
  }

  /** Schließt alle Dateien und wartet auch auf bereits laufende Schließvorgänge. */
  async closeAll(): Promise<void> {
    await Promise.all([...[...this.files.keys()].map((id) => this.close(id)), ...this.closing.values()]);
  }

  async list(): Promise<ProjectSummary[]> {
    const result: ProjectSummary[] = [];
    for (const file of this.files.values()) {
      try {
        const [text, info] = await Promise.all([readFile(file.path, 'utf8'), stat(file.path)]);
        result.push(
          summarize(file.id, parseProjectFile(text), info.mtime, {
            path: file.path,
            ...(file.readOnlyReason ? { readOnlyReason: file.readOnlyReason } : {}),
          }),
        );
      } catch {
        // Datei zwischenzeitlich verschwunden – nicht auflisten
      }
    }
    return result;
  }

  async load(id: string): Promise<Project> {
    const file = this.files.get(id);
    if (!file) throw new ProjectNotFoundError(id);
    try {
      return parseProjectFile(await readFile(file.path, 'utf8'));
    } catch (error) {
      if (isNotFound(error)) throw new ProjectNotFoundError(id);
      throw error;
    }
  }

  async save(id: string, project: Project): Promise<void> {
    const file = this.files.get(id);
    if (!file) throw new ProjectNotFoundError(id);
    if (file.readOnlyReason) return;
    await writeFileAtomic(file.path, serializeProject(project));
  }

  readOnlyReason(id: string): string | undefined {
    return this.files.get(id)?.readOnlyReason;
  }

  persistentKey(id: string): string {
    return this.files.get(id)?.path ?? id;
  }
}
