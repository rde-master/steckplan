import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/**
 * Schreibt eine Datei atomar: erst in eine temporäre Datei im selben Ordner, dann umbenennen.
 * Sync-Clients (z. B. Nextcloud) sehen so nie eine halb geschriebene Datei.
 * Die Temp-Datei beginnt mit einem Punkt, damit Sync-Clients sie meist ignorieren.
 */
export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${basename(path)}.${randomBytes(4).toString('hex')}.tmp`);
  try {
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

export function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}
