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
  /** … oder aus einer Datei (mit ihrer Größe) */
  path?: string;
  size?: number;
}

/**
 * Größe der ZIP-Datei vorab (ohne Kompression steht sie fest): je Datei Kopf (30 + Name), Inhalt, Datenbeschreibung
 * (16), Eintrag im Verzeichnis (46 + Name), dazu das Ende (22). Über 4 GB (ZIP64) bzw. ohne bekannte Größe: undefined.
 */
export function zipSize(entries: ZipEntry[]): number | undefined {
  let total = 22;
  for (const e of entries) {
    const size = e.data ? e.data.length : e.size;
    if (size === undefined) return undefined;
    const name = Buffer.byteLength(e.name, 'utf8');
    total += 30 + name + size + 16 + 46 + name;
  }
  return total < 0xffffffff ? total : undefined;
}

const HIGH_WATER = 8 * 1024 * 1024;

/** expectedSize: angekündigte Größe – weicht das Ergebnis ab (Datei geändert), wird abgebrochen statt Falsches zu liefern */
export function zipStream(entries: ZipEntry[], expectedSize?: number): Readable {
  const out = new PassThrough({ highWaterMark: HIGH_WATER });
  let written = 0;
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      out.destroy(error);
      return;
    }
    written += chunk.length;
    if (expectedSize !== undefined && written > expectedSize) {
      out.destroy(new Error('ZIP größer als angekündigt'));
      return;
    }
    out.write(chunk);
    if (final) {
      if (expectedSize !== undefined && written !== expectedSize) out.destroy(new Error('ZIP kleiner als angekündigt'));
      else out.end();
    }
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
