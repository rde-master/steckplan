import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { zipSize, zipStream, type ZipEntry } from './zip-stream';

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

describe('ZIP als Datenstrom', () => {
  it('Größe steht vorab fest (auch mit Umlauten im Namen) und stimmt mit dem Ergebnis überein', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const big = Buffer.alloc(3 * 1024 * 1024 + 17, 7);
    writeFileSync(join(dir, 'a.bin'), big);
    const entries: ZipEntry[] = [
      { name: 'Hallenfest – Größe.steckplan', data: new TextEncoder().encode('{"x":1}') },
      { name: 'medien/abc', path: join(dir, 'a.bin'), size: big.length },
      { name: 'medien/leer', data: new Uint8Array(0) },
    ];
    const size = zipSize(entries)!;
    const zip = await collect(zipStream(entries, size));
    expect(zip.length).toBe(size);
    const files = unzipSync(new Uint8Array(zip));
    expect(Buffer.from(files['medien/abc']!).equals(big)).toBe(true);
    expect(zipSize([{ name: 'x', path: '/y' }])).toBeUndefined();
  });

  it('weicht die Datei von der angekündigten Größe ab, bricht der Datenstrom ab', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    writeFileSync(join(dir, 'a.bin'), Buffer.alloc(100));
    const entries: ZipEntry[] = [{ name: 'a', path: join(dir, 'a.bin'), size: 50 }];
    await expect(collect(zipStream(entries, zipSize(entries)))).rejects.toThrow(/angekündigt/);
  });
});
