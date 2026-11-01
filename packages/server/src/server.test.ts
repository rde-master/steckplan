import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { VERSION } from '@steckplan/core';
import { createServer } from './server';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

function makeUiDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'steckplan-ui-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Steckplan</title>');
  writeFileSync(join(dir, 'app.js'), 'console.log(1)');
  return dir;
}

describe('createServer', () => {
  it('liefert /api/health mit Name, Version und Betriebsart', async () => {
    app = await createServer({ mode: 'desktop' });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: 'Steckplan', version: VERSION, mode: 'desktop' });
  });

  it('liefert die UI und Dateien aus dem UI-Ordner aus', async () => {
    app = await createServer({ mode: 'standalone', uiDir: makeUiDir() });
    const index = await app.inject({ method: 'GET', url: '/' });
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain('<title>Steckplan</title>');
    const js = await app.inject({ method: 'GET', url: '/app.js' });
    expect(js.statusCode).toBe(200);
  });

  it('liefert für unbekannte UI-Pfade index.html (Single-Page-App)', async () => {
    app = await createServer({ mode: 'standalone', uiDir: makeUiDir() });
    const res = await app.inject({ method: 'GET', url: '/projekte/abc' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('antwortet auf unbekannte API-Pfade mit 404 als JSON', async () => {
    app = await createServer({ mode: 'standalone', uiDir: makeUiDir() });
    const res = await app.inject({ method: 'GET', url: '/api/gibtsnicht' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Nicht gefunden' });
  });

  it('funktioniert ohne UI-Ordner (nur API)', async () => {
    app = await createServer({ mode: 'standalone', uiDir: '/gibt/es/nicht' });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(404);
  });
});
