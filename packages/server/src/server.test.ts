import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { VERSION } from '@steckplan/core';
import { startTestServer, type TestServer } from './test-utils';

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

function makeUiDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'steckplan-ui-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Steckplan</title>');
  writeFileSync(join(dir, 'app.js'), 'console.log(1)');
  return dir;
}

describe('createServer', () => {
  it('liefert /api/health mit Name, Version und Betriebsart', async () => {
    server = await startTestServer({ mode: 'desktop' });
    const res = await server.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: 'Steckplan', version: VERSION, mode: 'desktop' });
  });

  it('liefert die UI und Dateien aus dem UI-Ordner aus', async () => {
    server = await startTestServer({ uiDir: makeUiDir() });
    const index = await server.app.inject({ method: 'GET', url: '/' });
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain('<title>Steckplan</title>');
    expect((await server.app.inject({ method: 'GET', url: '/app.js' })).statusCode).toBe(200);
  });

  it('liefert für unbekannte UI-Pfade index.html (Single-Page-App)', async () => {
    server = await startTestServer({ uiDir: makeUiDir() });
    const res = await server.app.inject({ method: 'GET', url: '/projekt/abc' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('antwortet auf unbekannte API-Pfade mit 404 als JSON', async () => {
    server = await startTestServer({ uiDir: makeUiDir() });
    const res = await server.app.inject({ method: 'GET', url: '/api/gibtsnicht' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Nicht gefunden' });
  });

  it('Dateien unter /assets: dauerhaft zwischenspeicherbar, vorab komprimiert ausgeliefert; index.html wird immer geprüft', async () => {
    const dir = makeUiDir();
    mkdirSync(join(dir, 'assets'));
    const source = `console.log(${JSON.stringify('x'.repeat(5000))})`;
    writeFileSync(join(dir, 'assets', 'index-abc123.js'), source);
    writeFileSync(join(dir, 'assets', 'index-abc123.js.gz'), gzipSync(source));
    writeFileSync(join(dir, 'assets', 'index-abc123.js.br'), brotliCompressSync(source));
    server = await startTestServer({ uiDir: dir });

    const plain = await server.app.inject({ method: 'GET', url: '/assets/index-abc123.js' });
    expect(plain.statusCode).toBe(200);
    expect(plain.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.headers.vary).toContain('accept-encoding');
    expect(plain.body).toBe(source);

    // ohne HTTPS bieten Browser nur gzip an
    const gzip = await server.app.inject({ method: 'GET', url: '/assets/index-abc123.js', headers: { 'accept-encoding': 'gzip, deflate' } });
    expect(gzip.headers['content-encoding']).toBe('gzip');
    expect(gzip.headers['content-type']).toContain('javascript');
    expect(gzip.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(gunzipSync(gzip.rawPayload).toString()).toBe(source);
    expect(gzip.rawPayload.length).toBeLessThan(source.length / 10);

    const br = await server.app.inject({ method: 'GET', url: '/assets/index-abc123.js', headers: { 'accept-encoding': 'gzip, deflate, br' } });
    expect(br.headers['content-encoding']).toBe('br');
    expect(brotliDecompressSync(br.rawPayload).toString()).toBe(source);

    // index.html: bei jedem Aufruf prüfen (neue Version nach einem Update), auch als Rückfall der Single-Page-App
    for (const url of ['/', '/projekt/abc']) {
      const index = await server.app.inject({ method: 'GET', url, headers: { 'accept-encoding': 'gzip' } });
      expect(index.statusCode).toBe(200);
      expect(index.headers['cache-control']).toBe('public, max-age=0');
      expect(index.body).toContain('<title>Steckplan</title>');
    }
  });

  it('fehlende Datei unter /assets: 404 statt index.html (alte Version nach einem Update)', async () => {
    server = await startTestServer({ uiDir: makeUiDir() });
    const res = await server.app.inject({ method: 'GET', url: '/assets/index-alt.js' });
    expect(res.statusCode).toBe(404);
  });

  it('funktioniert ohne UI-Ordner (nur API)', async () => {
    server = await startTestServer({ uiDir: '/gibt/es/nicht' });
    expect((await server.app.inject({ method: 'GET', url: '/' })).statusCode).toBe(404);
  });
});
