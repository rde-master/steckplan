// Automatische Versionen: <baseDir>/<projekt-id>/index.json + <versions-id>.steckplan
// Es werden die letzten 30 Stände behalten.
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { parseProjectFile, serializeProject, type Project } from '@steckplan/core';
import { isNotFound, writeFileAtomic } from './fs-utils';

export const MAX_VERSIONS = 30;
export const VERSION_INTERVAL_MS = 10 * 60 * 1000;

export interface VersionInfo {
  id: string;
  at: string;
  /** Namen der Personen, die seit dem vorigen Stand geändert haben */
  by: string[];
  note?: string;
}

const SAFE = /^[A-Za-z0-9-]{1,64}$/;

export class VersionStore {
  constructor(private readonly baseDir: string) {}

  private dir(projectId: string): string {
    if (!SAFE.test(projectId)) throw new Error('Ungültige Projekt-id');
    return join(this.baseDir, projectId);
  }

  async list(projectId: string): Promise<VersionInfo[]> {
    try {
      const index = JSON.parse(await readFile(join(this.dir(projectId), 'index.json'), 'utf8')) as VersionInfo[];
      return index.sort((a, b) => b.at.localeCompare(a.at));
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }

  async latest(projectId: string): Promise<VersionInfo | undefined> {
    return (await this.list(projectId))[0];
  }

  async add(projectId: string, project: Project, by: string[], note?: string, now = new Date()): Promise<VersionInfo> {
    const dir = this.dir(projectId);
    await mkdir(dir, { recursive: true });
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const info: VersionInfo = { id: `${stamp}-${randomBytes(3).toString('hex')}`, at: now.toISOString(), by, ...(note ? { note } : {}) };
    await writeFileAtomic(join(dir, `${info.id}.steckplan`), serializeProject(project));

    const all = [info, ...(await this.list(projectId))];
    const keep = all.slice(0, MAX_VERSIONS);
    for (const old of all.slice(MAX_VERSIONS)) await rm(join(dir, `${old.id}.steckplan`), { force: true });
    await writeFileAtomic(join(dir, 'index.json'), JSON.stringify(keep, null, 2));
    return info;
  }

  async load(projectId: string, versionId: string): Promise<Project> {
    if (!SAFE.test(versionId)) throw new Error('Ungültige Versions-id');
    return parseProjectFile(await readFile(join(this.dir(projectId), `${versionId}.steckplan`), 'utf8'));
  }

  async removeAll(projectId: string): Promise<void> {
    await rm(this.dir(projectId), { recursive: true, force: true });
  }
}
