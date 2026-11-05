// Audiodateien hochladen (Regie, M11b): in Teilen zu 4 MB, bei Netzfehlern automatisch weiter,
// nach Abbruch (auch nach Neuladen der Seite) an derselben Stelle fortsetzen – erkannt an Name, Größe und Änderungsdatum.
import { api, ApiError, type MediaFileInfo } from './api';

export const CHUNK_BYTES = 4 * 1024 * 1024;
const RETRIES = 6;

function resumeKey(projectId: string, file: File): string {
  return `steckplan.upload:${projectId}:${file.name}:${file.size}:${file.lastModified}`;
}

function remember(key: string, uploadId: string | null): void {
  try {
    if (uploadId) localStorage.setItem(key, uploadId);
    else localStorage.removeItem(key);
  } catch {
    // ohne Speicher kein Fortsetzen nach Neuladen
  }
}

function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function putChunk(projectId: string, uploadId: string, offset: number, data: Blob, signal?: AbortSignal): Promise<number> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/media/uploads/${encodeURIComponent(uploadId)}?offset=${offset}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: data,
    ...(signal ? { signal } : {}),
  });
  const body = (await res.json().catch(() => ({}))) as { received?: number; error?: string };
  // falsche Position (z. B. Antwort ging verloren): mit dem Stand des Servers weiter
  if (res.status === 409 && typeof body.received === 'number') return body.received;
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Fehler ${res.status}`);
  return body.received ?? offset + data.size;
}

export interface UploadOptions {
  /** feste Kennung (z. B. beim Hochladen eines Projekts mit Medien) */
  mediaId?: string;
  onProgress?: (received: number, total: number) => void;
  signal?: AbortSignal;
}

/** Lädt eine Datei hoch und gibt Kennung, Größe und Prüfsumme zurück. */
export async function uploadMedia(projectId: string, file: Blob & { name?: string; lastModified?: number }, options: UploadOptions = {}): Promise<MediaFileInfo> {
  const key = file instanceof File ? resumeKey(projectId, file) : null;
  let uploadId = key ? remembered(key) : null;
  let received = 0;
  if (uploadId) {
    try {
      received = (await api.mediaUploadStatus(projectId, uploadId)).received;
    } catch {
      uploadId = null;
    }
  }
  if (!uploadId) {
    const started = await api.startMediaUpload(projectId, file.size, options.mediaId);
    if (started.complete) return started.complete;
    uploadId = started.uploadId;
    received = started.received;
    if (key) remember(key, uploadId);
  }
  options.onProgress?.(received, file.size);
  let failures = 0;
  while (received < file.size) {
    if (options.signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
    try {
      received = await putChunk(projectId, uploadId, received, file.slice(received, received + CHUNK_BYTES), options.signal);
      failures = 0;
      options.onProgress?.(received, file.size);
    } catch (error) {
      if ((error as Error).name === 'AbortError' || (error instanceof ApiError && error.status < 500 && error.status !== 409)) throw error;
      if (++failures > RETRIES) throw error;
      await sleep(Math.min(15000, 500 * 2 ** failures));
      // Stand vom Server holen (vielleicht ist der Teil doch angekommen)
      received = (await api.mediaUploadStatus(projectId, uploadId).catch(() => ({ received })).then((s) => s)).received;
    }
  }
  const info = await api.completeMediaUpload(projectId, uploadId);
  if (key) remember(key, null);
  return info;
}

/** Dauer einer Audiodatei im Browser ermitteln (undefined, wenn der Browser sie nicht lesen kann). */
export function readAudioDuration(file: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | undefined) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : undefined);
    audio.onerror = () => done(undefined);
    setTimeout(() => done(undefined), 10000);
    audio.src = url;
  });
}
