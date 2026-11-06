// Projekt mit Medien (.steckplan.zip, aus „Mit Medien herunterladen“) für den lokalen Modus entpacken:
// Projektdatei an den gewählten Ort, Medien in den Ordner daneben (<Name>.medien/<Kennung>).
// Liest und schreibt stückweise – große Audiodateien kommen nie am Stück in den Speicher.
import { createReadStream, createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import { mediaDirFor } from './local-file-store';

const MEDIA_ENTRY = /^medien\/([A-Za-z0-9-]{1,64})$/;

export class ProjectZipError extends Error {}

/**
 * Entpackt die ZIP-Datei: Projekt nach projectPath, Medien nach mediaDirFor(projectPath).
 * Ergebnis: Zahl der Mediendateien. Ohne .steckplan-Datei in der ZIP: ProjectZipError (nichts geschrieben).
 */
export async function extractProjectZip(zipPath: string, projectPath: string): Promise<{ media: number }> {
  const mediaDir = mediaDirFor(projectPath);
  const staging = `${mediaDir}.entpacken-${process.pid}`;
  await mkdir(staging, { recursive: true });
  const writers: { stream: WriteStream; done: Promise<unknown> }[] = [];
  const mediaIds: string[] = [];
  let project: Uint8Array[] | undefined;
  let failure: unknown;

  const unzip = new Unzip((entry) => {
    const name = entry.name;
    const media = MEDIA_ENTRY.exec(name);
    if (!project && !name.includes('/') && name.toLowerCase().endsWith('.steckplan')) {
      const parts: Uint8Array[] = [];
      project = parts;
      entry.ondata = (error, data) => {
        if (error) failure ??= error;
        else parts.push(data);
      };
      entry.start();
    } else if (media) {
      const stream = createWriteStream(join(staging, media[1]!));
      writers.push({ stream, done: once(stream, 'close') });
      mediaIds.push(media[1]!);
      entry.ondata = (error, data, final) => {
        if (error) failure ??= error;
        else stream.write(data);
        if (final || error) stream.end();
      };
      entry.start();
    }
    // andere Einträge überspringen
  });
  unzip.register(UnzipPassThrough);
  unzip.register(UnzipInflate);

  try {
    for await (const chunk of createReadStream(zipPath, { highWaterMark: 1024 * 1024 })) {
      unzip.push(chunk as Buffer);
      // Gegendruck: warten, bis die Dateien hinterherkommen
      for (const w of writers) if (w.stream.writableNeedDrain) await once(w.stream, 'drain');
      if (failure) break;
    }
    if (!failure) unzip.push(new Uint8Array(0), true);
    for (const w of writers) {
      if (!w.stream.writableEnded) w.stream.end();
      await w.done;
    }
    if (failure) throw failure instanceof Error ? failure : new ProjectZipError(String(failure));
    if (!project) throw new ProjectZipError('In der ZIP-Datei ist keine .steckplan-Datei.');
    // erst jetzt an die richtige Stelle: Medien-Ordner, dann Projektdatei
    await mkdir(mediaDir, { recursive: true });
    for (const id of mediaIds) await rename(join(staging, id), join(mediaDir, id));
    await writeFile(projectPath, Buffer.concat(project));
    return { media: mediaIds.length };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
