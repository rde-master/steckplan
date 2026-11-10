// Zwischenspeicher der Medien (Bilder/Videos des Textfensters): beim Start bzw. „Neu synchronisieren“ geladen,
// danach nur noch von hier abgespielt. Gleiche Dateien (SHA-256) liegen nur einmal da; Unbenutztes wird gelöscht.
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { PlayerCatalog, PlayerCatalogMedia } from '@steckplan/core';

export interface CachedFile {
  file: string;
  size: number;
  mime: string;
}

export interface DownloadItem {
  projectId: string;
  media: PlayerCatalogMedia;
  file: string;
}

const key = (projectId: string, mediaId: string) => `${projectId}/${mediaId}`;

/** Dateiname im Zwischenspeicher: nach dem Inhalt (SHA-256), sonst nach Projekt und Datei */
export function cacheFileName(projectId: string, media: Pick<PlayerCatalogMedia, 'id' | 'sha256'>): string {
  if (/^[a-f0-9]{64}$/i.test(media.sha256)) return media.sha256.toLowerCase();
  return `${projectId}_${media.id}`.replace(/[^A-Za-z0-9_-]/g, '_');
}

/** „bytes=100-“ / „bytes=100-199“ / „bytes=-500“ → Bereich; null = ganze Datei; 'invalid' */
export function parseRange(header: string | null | undefined, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let start: number;
  let end: number;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}

export class MediaCache {
  private index = new Map<string, CachedFile>();

  constructor(private readonly dir: string) {}

  async load(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    try {
      const raw = JSON.parse(await readFile(join(this.dir, 'index.json'), 'utf8')) as Record<string, CachedFile>;
      this.index = new Map(Object.entries(raw).filter(([, v]) => typeof v?.file === 'string'));
    } catch {
      this.index = new Map();
    }
  }

  /** Datei für die Anzeige (falls vollständig geladen) */
  get(projectId: string, mediaId: string): (CachedFile & { path: string }) | undefined {
    const entry = this.index.get(key(projectId, mediaId));
    return entry ? { ...entry, path: join(this.dir, entry.file) } : undefined;
  }

  get count(): number {
    return this.index.size;
  }

  /** Was zu laden ist (fehlt oder hat eine andere Größe) und was schon da ist */
  async plan(catalog: PlayerCatalog): Promise<{ todo: DownloadItem[]; ready: number; total: number; bytesTotal: number; bytesReady: number }> {
    const todo: DownloadItem[] = [];
    let ready = 0;
    let total = 0;
    let bytesTotal = 0;
    let bytesReady = 0;
    const planned = new Set<string>();
    for (const project of catalog.projects) {
      for (const media of project.media) {
        total++;
        bytesTotal += media.sizeBytes;
        const file = cacheFileName(project.id, media);
        const size = await stat(join(this.dir, file)).then((s) => s.size).catch(() => -1);
        if (size === media.sizeBytes || planned.has(file)) {
          // schon da (bzw. kommt mit einer gleichen Datei eines anderen Projekts)
          if (size === media.sizeBytes) {
            this.index.set(key(project.id, media.id), { file, size, mime: media.mime });
            ready++;
            bytesReady += media.sizeBytes;
          } else todo.push({ projectId: project.id, media, file });
          continue;
        }
        planned.add(file);
        todo.push({ projectId: project.id, media, file });
      }
    }
    return { todo, ready, total, bytesTotal, bytesReady };
  }

  /** Eine Datei laden (erst in eine Zwischendatei, dann umbenennen); onBytes meldet den Fortschritt */
  async download(item: DownloadItem, fetchFile: () => Promise<Response>, onBytes: (n: number) => void): Promise<void> {
    const target = join(this.dir, item.file);
    const existing = await stat(target).then((s) => s.size).catch(() => -1);
    if (existing !== item.media.sizeBytes) {
      const res = await fetchFile();
      if (!res.ok || !res.body) throw new Error(`„${item.media.name}“ konnte nicht geladen werden (${res.status}).`);
      const tmp = `${target}.part`;
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(tmp);
        const input = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>);
        input.on('data', (chunk: Buffer) => onBytes(chunk.length));
        input.on('error', reject);
        out.on('error', reject);
        out.on('finish', () => resolve());
        input.pipe(out);
      });
      const size = (await stat(tmp)).size;
      if (size !== item.media.sizeBytes) {
        await rm(tmp, { force: true });
        throw new Error(`„${item.media.name}“ unvollständig geladen (${size} von ${item.media.sizeBytes} Bytes).`);
      }
      await rename(tmp, target);
    } else onBytes(item.media.sizeBytes);
    this.index.set(key(item.projectId, item.media.id), { file: item.file, size: item.media.sizeBytes, mime: item.media.mime });
  }

  /** Nach vollständigem Laden: Verweise und Dateien, die nicht mehr im Katalog stehen, entfernen */
  async cleanup(catalog: PlayerCatalog): Promise<void> {
    const wanted = new Set(catalog.projects.flatMap((p) => p.media.map((m) => key(p.id, m.id))));
    for (const k of [...this.index.keys()]) if (!wanted.has(k)) this.index.delete(k);
    const files = new Set([...this.index.values()].map((v) => v.file));
    for (const name of await readdir(this.dir)) {
      if (name === 'index.json' || files.has(name)) continue;
      await rm(join(this.dir, name), { force: true });
    }
    await this.saveIndex();
  }

  async saveIndex(): Promise<void> {
    const tmp = join(this.dir, 'index.json.tmp');
    await writeFile(tmp, JSON.stringify(Object.fromEntries(this.index)));
    await rename(tmp, join(this.dir, 'index.json'));
  }

  /** Antwort für die Anzeige (mit Bereichen, damit Videos spulen können) */
  respond(projectId: string, mediaId: string, range: string | null): Response | undefined {
    const entry = this.get(projectId, mediaId);
    if (!entry) return undefined;
    const headers: Record<string, string> = { 'Accept-Ranges': 'bytes', 'Content-Type': entry.mime || 'application/octet-stream' };
    const r = parseRange(range, entry.size);
    if (r === 'invalid') return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${entry.size}` } });
    const stream = (start?: number, end?: number) => Readable.toWeb(createReadStream(entry.path, start !== undefined ? { start, end } : {})) as unknown as ReadableStream;
    if (!r) return new Response(stream(), { status: 200, headers: { ...headers, 'Content-Length': String(entry.size) } });
    return new Response(stream(r.start, r.end), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${r.start}-${r.end}/${entry.size}`, 'Content-Length': String(r.end - r.start + 1) } });
  }
}
