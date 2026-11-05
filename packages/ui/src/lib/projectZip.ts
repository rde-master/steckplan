// Projekt mit Medien (.steckplan.zip) im Browser lesen und hochladen:
// erst das Projekt (bekommt eine neue Kennung), dann jede Datei fortsetzbar mit ihrer bisherigen Kennung.
import { Unzip, UnzipPassThrough, UnzipInflate } from 'fflate';
import { api } from './api';
import { uploadMedia } from './mediaUpload';

export interface ProjectZip {
  projectText: string;
  media: Map<string, Blob>;
}

/** Liest die ZIP-Datei stückweise (große Dateien werden nicht am Stück in den Speicher geladen). */
export async function readProjectZip(file: Blob): Promise<ProjectZip> {
  const chunks = new Map<string, Uint8Array[]>();
  const finished = new Set<string>();
  const unzip = new Unzip((entry) => {
    const parts: Uint8Array[] = [];
    chunks.set(entry.name, parts);
    entry.ondata = (error, data, final) => {
      if (error) throw error;
      parts.push(data);
      if (final) finished.add(entry.name);
    };
    entry.start();
  });
  unzip.register(UnzipPassThrough);
  unzip.register(UnzipInflate);
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    unzip.push(value);
  }
  unzip.push(new Uint8Array(0), true);
  let projectText: string | undefined;
  const media = new Map<string, Blob>();
  for (const [name, parts] of chunks) {
    if (!finished.has(name)) continue;
    if (name.toLowerCase().endsWith('.steckplan') && projectText === undefined) projectText = await new Blob(parts as BlobPart[]).text();
    const m = /^medien\/([A-Za-z0-9-]{1,64})$/.exec(name);
    if (m) media.set(m[1]!, new Blob(parts as BlobPart[]));
  }
  if (projectText === undefined) throw new Error('In der ZIP-Datei ist keine .steckplan-Datei.');
  return { projectText, media };
}

export function isZip(file: File): boolean {
  return file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';
}

/** Lädt ein Projekt mit Medien hoch; onProgress meldet (fertig, gesamt) für die Medien. */
export async function uploadProjectZip(file: File, onProgress: (done: number, total: number) => void): Promise<string> {
  const zip = await readProjectZip(file);
  const { id } = await api.uploadProject(zip.projectText);
  let done = 0;
  onProgress(done, zip.media.size);
  for (const [mediaId, blob] of zip.media) {
    await uploadMedia(id, blob, { mediaId });
    onProgress(++done, zip.media.size);
  }
  return id;
}
