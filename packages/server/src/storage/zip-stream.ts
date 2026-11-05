// ZIP als Datenstrom (für „Herunterladen mit Medien“): Dateien werden ohne Kompression (Audio ist schon komprimiert)
// stückweise durchgereicht, mit Rücksicht auf langsame Empfänger (Gegendruck).
import { createReadStream } from 'node:fs';
import { once } from 'node:events';
import { PassThrough, type Readable } from 'node:stream';
import { Zip, ZipPassThrough } from 'fflate';

export interface ZipEntry {
  name: string;
  /** Inhalt direkt … */
  data?: Uint8Array;
  /** … oder aus einer Datei */
  path?: string;
}

const HIGH_WATER = 8 * 1024 * 1024;

export function zipStream(entries: ZipEntry[]): Readable {
  const out = new PassThrough({ highWaterMark: HIGH_WATER });
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      out.destroy(error);
      return;
    }
    out.write(chunk);
    if (final) out.end();
  });
  void (async () => {
    for (const entry of entries) {
      const file = new ZipPassThrough(entry.name);
      zip.add(file);
      if (entry.data) {
        file.push(entry.data, true);
        continue;
      }
      for await (const chunk of createReadStream(entry.path!)) {
        file.push(chunk as Buffer);
        if (out.writableLength > HIGH_WATER) await once(out, 'drain');
      }
      file.push(new Uint8Array(0), true);
    }
    zip.end();
  })().catch((error: unknown) => out.destroy(error as Error));
  return out;
}
