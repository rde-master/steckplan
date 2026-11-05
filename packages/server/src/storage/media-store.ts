// Medienspeicher (Regie, M11b): Audiodateien je Projekt, getrennt von der Projektdatei.
//   Docker:        <dataDir>/media/<projektId>/<mediaId>
//   Desktop lokal: <Ordner der Datei>/<Name>.medien/<mediaId>
// Im Medienordner: .uploads/ (unfertige Uploads, fortsetzbar) und .papierkorb/ (30 Tage).
// Dateien werden unverändert gespeichert; Größe ist nicht begrenzt.
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, copyFile, link, mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MEDIA_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SAFE = /^[A-Za-z0-9-]{1,64}$/;
const UPLOADS = '.uploads';
const TRASH = '.papierkorb';

export interface MediaFileInfo {
  id: string;
  sizeBytes: number;
  sha256: string;
}

export interface UploadState {
  uploadId: string;
  mediaId: string;
  size: number;
  received: number;
}

export class MediaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly received?: number,
  ) {
    super(message);
    this.name = 'MediaError';
  }
}

const isNotFound = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

async function sizeOf(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export class MediaStore {
  /** locate: Medienordner eines Projekts (undefined = Projekt unbekannt / ohne Speicherort) */
  constructor(private readonly locate: (projectId: string) => string | undefined) {}

  private dir(projectId: string): string {
    const dir = this.locate(projectId);
    if (!dir) throw new MediaError('Projekt nicht gefunden', 404);
    return dir;
  }

  private static check(id: string): string {
    if (!SAFE.test(id)) throw new MediaError('Ungültige Kennung', 400);
    return id;
  }

  /** Pfad und Größe einer Datei; liegt sie im Papierkorb, wird sie zurückgeholt (z. B. nach „Version wiederherstellen“). */
  async open(projectId: string, mediaId: string): Promise<{ path: string; size: number } | undefined> {
    const dir = this.dir(projectId);
    const path = join(dir, MediaStore.check(mediaId));
    let size = await sizeOf(path);
    if (size === undefined && (await this.restoreFromTrash(projectId, mediaId))) size = await sizeOf(path);
    return size === undefined ? undefined : { path, size };
  }

  async has(projectId: string, mediaId: string): Promise<boolean> {
    return (await sizeOf(join(this.dir(projectId), MediaStore.check(mediaId)))) !== undefined;
  }

  // ---------- Hochladen in Teilen ----------

  /** Upload beginnen; mediaId vorgegeben (z. B. beim Hochladen eines Projekts mit Medien) oder neu. */
  async startUpload(projectId: string, input: { size: number; mediaId?: string | undefined }): Promise<UploadState & { complete?: MediaFileInfo }> {
    if (!Number.isSafeInteger(input.size) || input.size < 0) throw new MediaError('Ungültige Dateigröße', 400);
    const dir = this.dir(projectId);
    const mediaId = input.mediaId ? MediaStore.check(input.mediaId) : randomUUID();
    // schon vorhanden (gleiche Größe) → nichts zu tun
    const existing = await sizeOf(join(dir, mediaId));
    if (existing !== undefined && existing === input.size) {
      return { uploadId: '', mediaId, size: input.size, received: input.size, complete: { id: mediaId, sizeBytes: existing, sha256: await sha256Of(join(dir, mediaId)) } };
    }
    const uploads = join(dir, UPLOADS);
    await mkdir(uploads, { recursive: true });
    const uploadId = randomUUID();
    await writeFile(join(uploads, `${uploadId}.json`), JSON.stringify({ mediaId, size: input.size }));
    await writeFile(join(uploads, `${uploadId}.part`), '');
    return { uploadId, mediaId, size: input.size, received: 0 };
  }

  private async uploadMeta(projectId: string, uploadId: string): Promise<{ mediaId: string; size: number; part: string }> {
    const uploads = join(this.dir(projectId), UPLOADS);
    try {
      const meta = JSON.parse(await readFile(join(uploads, `${MediaStore.check(uploadId)}.json`), 'utf8')) as { mediaId: string; size: number };
      return { ...meta, part: join(uploads, `${uploadId}.part`) };
    } catch (error) {
      if (isNotFound(error)) throw new MediaError('Upload nicht gefunden', 404);
      throw error;
    }
  }

  async uploadStatus(projectId: string, uploadId: string): Promise<UploadState> {
    const meta = await this.uploadMeta(projectId, uploadId);
    return { uploadId, mediaId: meta.mediaId, size: meta.size, received: (await sizeOf(meta.part)) ?? 0 };
  }

  /** Teil anhängen; offset muss dem bisher Empfangenen entsprechen (sonst 409 mit dem richtigen Stand). */
  async appendChunk(projectId: string, uploadId: string, offset: number, data: Buffer): Promise<number> {
    const meta = await this.uploadMeta(projectId, uploadId);
    const received = (await sizeOf(meta.part)) ?? 0;
    if (offset !== received) throw new MediaError('Falsche Position', 409, received);
    if (received + data.length > meta.size) throw new MediaError('Mehr Daten als angekündigt', 400, received);
    await appendFile(meta.part, data);
    return received + data.length;
  }

  /** Upload abschließen: Größe prüfen, Prüfsumme bilden, Datei an ihren Platz. */
  async completeUpload(projectId: string, uploadId: string): Promise<MediaFileInfo> {
    const meta = await this.uploadMeta(projectId, uploadId);
    const received = (await sizeOf(meta.part)) ?? 0;
    if (received !== meta.size) throw new MediaError('Upload unvollständig', 409, received);
    const sha256 = await sha256Of(meta.part);
    const dir = this.dir(projectId);
    await rename(meta.part, join(dir, meta.mediaId));
    await unlink(join(dir, UPLOADS, `${uploadId}.json`)).catch(() => undefined);
    return { id: meta.mediaId, sizeBytes: received, sha256 };
  }

  async cancelUpload(projectId: string, uploadId: string): Promise<void> {
    const meta = await this.uploadMeta(projectId, uploadId);
    await rm(meta.part, { force: true });
    await rm(join(this.dir(projectId), UPLOADS, `${uploadId}.json`), { force: true });
  }

  // ---------- Aufräumen, Papierkorb, Kopieren ----------

  /** Dateien im Medienordner (ohne Uploads/Papierkorb). */
  async list(projectId: string): Promise<{ id: string; size: number; mtimeMs: number }[]> {
    const dir = this.locate(projectId);
    if (!dir) return [];
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const result: { id: string; size: number; mtimeMs: number }[] = [];
    for (const name of names) {
      if (!SAFE.test(name)) continue;
      const info = await stat(join(dir, name)).catch(() => undefined);
      if (info?.isFile()) result.push({ id: name, size: info.size, mtimeMs: info.mtimeMs });
    }
    return result;
  }

  /**
   * Nicht mehr verwendete Dateien in den Papierkorb, verwendete aus dem Papierkorb zurück.
   * minAgeMs schützt frisch hochgeladene Dateien, deren Verweis noch unterwegs ist.
   */
  async collect(projectId: string, referenced: ReadonlySet<string>, minAgeMs = 60 * 60 * 1000, now = Date.now()): Promise<{ trashed: string[]; restored: string[] }> {
    const dir = this.locate(projectId);
    if (!dir) return { trashed: [], restored: [] };
    const trashed: string[] = [];
    for (const file of await this.list(projectId)) {
      if (referenced.has(file.id) || now - file.mtimeMs < minAgeMs) continue;
      await mkdir(join(dir, TRASH), { recursive: true });
      await rename(join(dir, file.id), join(dir, TRASH, `${file.id}__${now}`));
      trashed.push(file.id);
    }
    const restored: string[] = [];
    for (const id of referenced) if (!(await this.has(projectId, id).catch(() => true)) && (await this.restoreFromTrash(projectId, id))) restored.push(id);
    return { trashed, restored };
  }

  private async restoreFromTrash(projectId: string, mediaId: string): Promise<boolean> {
    const trash = join(this.dir(projectId), TRASH);
    const names = (await readdir(trash).catch(() => [] as string[])).filter((n) => n.startsWith(`${mediaId}__`)).sort();
    const newest = names[names.length - 1];
    if (!newest) return false;
    await rename(join(trash, newest), join(this.dir(projectId), mediaId));
    return true;
  }

  /** Papierkorb (älter als 30 Tage) und liegen gebliebene Uploads (älter als 7 Tage) endgültig löschen. */
  async purge(projectId: string, now = Date.now()): Promise<number> {
    const dir = this.locate(projectId);
    if (!dir) return 0;
    let removed = 0;
    for (const name of await readdir(join(dir, TRASH)).catch(() => [] as string[])) {
      const at = Number(/__(\d+)$/.exec(name)?.[1] ?? NaN);
      if (Number.isFinite(at) && now - at > MEDIA_TRASH_RETENTION_MS) {
        await rm(join(dir, TRASH, name), { force: true });
        removed++;
      }
    }
    for (const name of await readdir(join(dir, UPLOADS)).catch(() => [] as string[])) {
      const info = await stat(join(dir, UPLOADS, name)).catch(() => undefined);
      if (info && now - info.mtimeMs > 7 * 24 * 60 * 60 * 1000) await rm(join(dir, UPLOADS, name), { force: true });
    }
    return removed;
  }

  /** Dateien in ein anderes Projekt übernehmen (fester Link, sonst Kopie) – z. B. „Neues Projekt aus diesem“. */
  async copyTo(fromProjectId: string, toProjectId: string, ids: Iterable<string>): Promise<number> {
    const target = this.dir(toProjectId);
    await mkdir(target, { recursive: true });
    let copied = 0;
    for (const id of ids) {
      const source = await this.open(fromProjectId, id);
      if (!source || (await this.has(toProjectId, id))) continue;
      const dest = join(target, MediaStore.check(id));
      await link(source.path, dest).catch(() => copyFile(source.path, dest));
      copied++;
    }
    return copied;
  }

  /** Ganzen Medienordner eines Projekts löschen (Projekt endgültig gelöscht). */
  async removeAll(projectId: string): Promise<void> {
    const dir = this.locate(projectId);
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
