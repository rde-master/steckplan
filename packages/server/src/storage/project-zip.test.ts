import { mkdtempSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mediaDirFor } from './local-file-store';
import { extractProjectZip, ProjectZipError } from './project-zip';
import { zipStream } from './zip-stream';

async function makeZip(dir: string, entries: { name: string; data: Uint8Array }[]): Promise<string> {
  const path = join(dir, 'Test.steckplan.zip');
  await pipeline(zipStream(entries), createWriteStream(path));
  return path;
}

describe('Projekt mit Medien (.steckplan.zip) entpacken', () => {
  it('Projektdatei an den Zielort, Medien in den Ordner <Name>.medien', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'steckplan-zip-'));
    const big = new Uint8Array(3 * 1024 * 1024).map((_, i) => i % 251);
    const zip = await makeZip(dir, [
      { name: 'Mein Projekt.steckplan', data: new TextEncoder().encode('{"schemaVersion":9}') },
      { name: 'medien/abc-123', data: big },
      { name: 'medien/def-456', data: new TextEncoder().encode('bild') },
      { name: 'medien/../boese', data: new TextEncoder().encode('x') },
    ]);
    const target = join(dir, 'ziel', 'Konzert.steckplan');
    await import('node:fs/promises').then((fs) => fs.mkdir(join(dir, 'ziel')));
    expect(await extractProjectZip(zip, target)).toEqual({ media: 2 });
    expect(await readFile(target, 'utf8')).toBe('{"schemaVersion":9}');
    expect(mediaDirFor(target)).toBe(join(dir, 'ziel', 'Konzert.medien'));
    expect((await readdir(mediaDirFor(target))).sort()).toEqual(['abc-123', 'def-456']);
    expect(Buffer.compare(await readFile(join(mediaDirFor(target), 'abc-123')), Buffer.from(big))).toBe(0);
    // nichts außerhalb, keine Reste
    expect((await readdir(join(dir, 'ziel'))).sort()).toEqual(['Konzert.medien', 'Konzert.steckplan']);
  });

  it('ohne Projektdatei: Fehler, nichts geschrieben', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'steckplan-zip-'));
    const zip = await makeZip(dir, [{ name: 'medien/abc', data: new Uint8Array([1, 2, 3]) }]);
    const target = join(dir, 'Leer.steckplan');
    await expect(extractProjectZip(zip, target)).rejects.toBeInstanceOf(ProjectZipError);
    expect((await readdir(dir)).sort()).toEqual(['Leer.medien', 'Test.steckplan.zip'].filter((n) => n !== 'Leer.medien'));
  });
});
