// Speicherung im Docker-Datenordner:
//   <dataDir>/projects/<id>.steckplan
//   <dataDir>/trash/<id>__<gelöscht-am-ms>.steckplan   (30 Tage wiederherstellbar)
import { mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { newId, parseProjectFile, serializeProject, type Project } from '@steckplan/core';
import { isNotFound, writeFileAtomic } from './fs-utils';
import {
  ProjectNotFoundError,
  summarize,
  type ManagedProjectStore,
  type ProjectSummary,
  type TrashEntry,
} from './types';

const EXT = '.steckplan';
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export class DataDirProjectStore implements ManagedProjectStore {
  readonly kind = 'dataDir' as const;
  private readonly projectsDir: string;
  private readonly trashDir: string;
  private summaryCache = new Map<string, { mtimeMs: number; summary: ProjectSummary }>();

  constructor(dataDir: string) {
    this.projectsDir = join(dataDir, 'projects');
    this.trashDir = join(dataDir, 'trash');
  }

  async init(): Promise<void> {
    await mkdir(this.projectsDir, { recursive: true });
    await mkdir(this.trashDir, { recursive: true });
  }

  private file(id: string): string {
    if (!SAFE_ID.test(id)) throw new ProjectNotFoundError(id);
    return join(this.projectsDir, id + EXT);
  }

  async list(): Promise<ProjectSummary[]> {
    const names = (await readdir(this.projectsDir)).filter((n) => n.endsWith(EXT) && !n.startsWith('.'));
    const summaries: ProjectSummary[] = [];
    for (const name of names) {
      const id = name.slice(0, -EXT.length);
      try {
        const path = join(this.projectsDir, name);
        const { mtimeMs, mtime } = await stat(path);
        const cached = this.summaryCache.get(id);
        if (cached && cached.mtimeMs === mtimeMs) {
          summaries.push(cached.summary);
          continue;
        }
        const project = parseProjectFile(await readFile(path, 'utf8'));
        const summary = summarize(id, project, mtime);
        this.summaryCache.set(id, { mtimeMs, summary });
        summaries.push(summary);
      } catch {
        // beschädigte Datei überspringen – taucht nicht in der Liste auf
      }
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(id: string): Promise<Project> {
    try {
      return parseProjectFile(await readFile(this.file(id), 'utf8'));
    } catch (error) {
      if (isNotFound(error)) throw new ProjectNotFoundError(id);
      throw error;
    }
  }

  async save(id: string, project: Project): Promise<void> {
    await writeFileAtomic(this.file(id), serializeProject(project));
  }

  readOnlyReason(): undefined {
    return undefined;
  }

  persistentKey(id: string): string {
    return id;
  }

  /** Legt ein Projekt an; die Projekt-id wird als Speicher-id verwendet (bei Kollision neu vergeben). */
  async create(project: Project): Promise<string> {
    let id = SAFE_ID.test(project.id) ? project.id : newId();
    if (await this.exists(id)) id = newId();
    await this.save(id, { ...project, id });
    return id;
  }

  private async exists(id: string): Promise<boolean> {
    try {
      await stat(this.file(id));
      return true;
    } catch {
      return false;
    }
  }

  async trash(id: string): Promise<void> {
    const from = this.file(id);
    try {
      await rename(from, join(this.trashDir, `${id}__${Date.now()}${EXT}`));
    } catch (error) {
      if (isNotFound(error)) throw new ProjectNotFoundError(id);
      throw error;
    }
    this.summaryCache.delete(id);
  }

  async listTrash(): Promise<TrashEntry[]> {
    const entries: TrashEntry[] = [];
    for (const name of await readdir(this.trashDir)) {
      const match = /^([A-Za-z0-9-]+)__(\d+)\.steckplan$/.exec(name);
      if (!match) continue;
      let projectName: string;
      try {
        projectName = parseProjectFile(await readFile(join(this.trashDir, name), 'utf8')).meta.name;
      } catch {
        projectName = '(beschädigt)';
      }
      entries.push({
        trashId: name.slice(0, -EXT.length),
        projectId: match[1]!,
        name: projectName,
        deletedAt: new Date(Number(match[2])).toISOString(),
      });
    }
    return entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }

  async restoreFromTrash(trashId: string): Promise<string> {
    const match = /^([A-Za-z0-9-]+)__(\d+)$/.exec(trashId);
    if (!match) throw new ProjectNotFoundError(trashId);
    const source = join(this.trashDir, trashId + EXT);
    let project: Project;
    try {
      project = parseProjectFile(await readFile(source, 'utf8'));
    } catch (error) {
      if (isNotFound(error)) throw new ProjectNotFoundError(trashId);
      throw error;
    }
    let id = match[1]!;
    if (await this.exists(id)) {
      id = newId();
      await this.save(id, { ...project, id });
      await rm(source);
    } else {
      await rename(source, this.file(id));
    }
    return id;
  }

  /** Entfernt Papierkorb-Einträge, die älter als 30 Tage sind. Gibt die Projekt-ids zurück. */
  async purgeTrash(now = Date.now()): Promise<string[]> {
    const purged: string[] = [];
    for (const entry of await this.listTrash()) {
      if (now - Date.parse(entry.deletedAt) > TRASH_RETENTION_MS) {
        await rm(join(this.trashDir, entry.trashId + EXT), { force: true });
        purged.push(entry.projectId);
      }
    }
    return purged;
  }
}
