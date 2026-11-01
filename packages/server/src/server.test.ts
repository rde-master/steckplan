import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('funktioniert ohne UI-Ordner (nur API)', async () => {
    server = await startTestServer({ uiDir: '/gibt/es/nicht' });
    expect((await server.app.inject({ method: 'GET', url: '/' })).statusCode).toBe(404);
  });
});
