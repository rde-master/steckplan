import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { createEmptyProject, SyncClient, type SocketLike } from '@steckplan/core';
import { DesktopKeyStore } from './auth/desktop-keys';
import { isManagedStore } from './storage/types';
import { login, startTestServer, waitFor, type TestServer } from './test-utils';

let server: TestServer | undefined;
const clients: SyncClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.destroy();
  await server?.close();
  server = undefined;
});

const auth = (key: string, name = 'Ralf am MacBook') => ({ authorization: `Bearer ${key}`, 'x-steckplan-name': encodeURIComponent(name) });

async function setup() {
  server = await startTestServer();
  const edit = await login(server, 'edit');
  const create = async (label: string, access: string) =>
    server!.app.inject({ method: 'POST', url: '/api/settings/desktop-keys', headers: { cookie: edit }, payload: { label, access } });
  return { server, edit, create };
}

describe('Desktop-Zugangsschlüssel', () => {
  it('nur mit Bearbeiten-Zugang erzeugen; Schlüssel wird nur einmal gezeigt und nur gehasht gespeichert', async () => {
    const { server: srv, edit, create } = await setup();
    const read = await login(srv, 'read');
    expect((await srv.app.inject({ method: 'POST', url: '/api/settings/desktop-keys', headers: { cookie: read }, payload: { label: 'X', access: 'read' } })).statusCode).toBe(403);
    expect((await create('', 'edit')).statusCode).toBe(400);
    expect((await create('MacBook', 'admin')).statusCode).toBe(400);

    const res = await create('MacBook Ralf', 'edit');
    expect(res.statusCode).toBe(201);
    const { key, info } = res.json();
    expect(key).toMatch(/^stp_[A-Za-z0-9_-]{40,}$/);
    expect(info).toMatchObject({ label: 'MacBook Ralf', access: 'edit', createdBy: 'Ralf' });
    expect(info.keyHash).toBeUndefined();

    const list = (await srv.app.inject({ method: 'GET', url: '/api/settings/desktop-keys', headers: { cookie: edit } })).json().keys;
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(key);
    await srv.app.close();
    const file = readFileSync(join(srv.dataDir, 'desktop-keys.json'), 'utf8');
    expect(file).not.toContain(key);
    expect(file).toContain('keyHash');
    server = undefined;
  });

  it('Anmeldung per Header mit Name aus der Desktop-App; Lese-Schlüssel darf nur lesen', async () => {
    const { server, create } = await setup();
    const editKey = (await create('MacBook', 'edit')).json().key;
    const readKey = (await create('Tablet', 'read')).json().key;

    const session = await server.app.inject({ method: 'GET', url: '/api/auth/session', headers: auth(editKey, 'Jörg Müller') });
    expect(session.json()).toEqual({ name: 'Jörg Müller', access: 'edit', via: 'desktopKey' });
    // ohne Name: Bezeichnung des Schlüssels
    expect((await server.app.inject({ method: 'GET', url: '/api/auth/session', headers: { authorization: `Bearer ${readKey}` } })).json()).toMatchObject({ name: 'Tablet', access: 'read' });

    expect((await server.app.inject({ method: 'POST', url: '/api/projects', headers: auth(editKey), payload: { name: 'Vom Desktop' } })).statusCode).toBe(201);
    expect((await server.app.inject({ method: 'POST', url: '/api/projects', headers: auth(readKey), payload: { name: 'Nein' } })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'GET', url: '/api/settings/desktop-keys', headers: auth(readKey) })).statusCode).toBe(403);

    // „zuletzt benutzt“
    const list = (await server.app.inject({ method: 'GET', url: '/api/settings/desktop-keys', headers: auth(editKey) })).json().keys;
    expect(list.find((k: { label: string }) => k.label === 'MacBook').lastUsedAt).toBeTruthy();
  });

  it('ungültiger Schlüssel: 401 mit Hinweis, zählt als Fehlversuch (Rate-Limit)', async () => {
    const { server } = await setup();
    const bad = await server.app.inject({ method: 'GET', url: '/api/auth/session', headers: auth('stp_falsch') });
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toMatchObject({ keyRejected: 'invalid' });
    await server.app.inject({ method: 'GET', url: '/api/projects', headers: auth('stp_falsch2') });
    await server.app.inject({ method: 'GET', url: '/api/projects', headers: auth('stp_falsch3') });
    expect((await server.app.inject({ method: 'GET', url: '/api/auth/session', headers: auth('stp_falsch4') })).json()).toMatchObject({ keyRejected: 'rateLimited' });
  });

  it('Live-Sync per Schlüssel; Widerruf trennt sofort und sperrt den Schlüssel', async () => {
    const { server, edit, create } = await setup();
    if (!isManagedStore(server.store)) throw new Error();
    const id = await server.store.create(createEmptyProject({ name: 'Server-Projekt' }));
    const { key, info } = (await create('MacBook', 'edit')).json();

    const client = new SyncClient({
      url: `${server.baseUrl.replace('http', 'ws')}/api/projects/${id}/sync`,
      doc: new Y.Doc(),
      reconnectDelay: 20,
      createSocket: (u) => new WebSocket(u, { headers: auth(key) }) as unknown as SocketLike,
    });
    clients.push(client);
    await client.whenSynced();
    expect(client.state).toMatchObject({ access: 'edit', readOnly: false });
    client.doc.getMap('meta').set('venue', 'Halle');
    await waitFor(async () => (await server.store.load(id)).meta.venue === 'Halle', 5000);

    const revoked = await server.app.inject({ method: 'DELETE', url: `/api/settings/desktop-keys/${info.id}`, headers: { cookie: edit } });
    expect(revoked.json()).toMatchObject({ revoked: true });
    await waitFor(() => client.state.status === 'unauthorized');
    expect((await server.app.inject({ method: 'GET', url: '/api/projects', headers: auth(key) })).statusCode).toBe(401);

    // nur widerrufene Schlüssel lassen sich entfernen
    const other = (await create('Zweiter', 'read')).json().info;
    expect((await server.app.inject({ method: 'DELETE', url: `/api/settings/desktop-keys/${other.id}/entry`, headers: { cookie: edit } })).statusCode).toBe(409);
    expect((await server.app.inject({ method: 'DELETE', url: `/api/settings/desktop-keys/${info.id}/entry`, headers: { cookie: edit } })).statusCode).toBe(200);
    expect((await server.app.inject({ method: 'GET', url: '/api/settings/desktop-keys', headers: { cookie: edit } })).json().keys.map((k: { label: string }) => k.label)).toEqual(['Zweiter']);
  });

  it('Speicher lädt Schlüssel wieder; widerrufene bleiben ungültig', async () => {
    const dir = (await startTestServer()).dataDir;
    const file = join(dir, 'keys-test.json');
    const store = new DesktopKeyStore({ file });
    const a = await store.create('A', 'edit');
    const b = await store.create('B', 'read');
    await store.revoke(b.info.id);
    const reloaded = new DesktopKeyStore({ file });
    await reloaded.load();
    expect(reloaded.verify(a.key)?.label).toBe('A');
    expect(reloaded.verify(b.key)).toBeNull();
    expect(reloaded.verify('kein-schluessel')).toBeNull();
  });
});
