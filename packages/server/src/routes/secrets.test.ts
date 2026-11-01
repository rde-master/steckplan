import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject, type Project, type SyncClient } from '@steckplan/core';
import { isManagedStore } from '../storage/types';
import { connect, login, sleep, startTestServer, type TestServer } from '../test-utils';

let server: TestServer | undefined;
const clients: SyncClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.destroy();
  await server?.close();
  server = undefined;
});

async function setup() {
  server = await startTestServer({ saveDelayMs: 20 });
  if (!isManagedStore(server.store)) throw new Error();
  const base = createEmptyProject({ name: 'WLAN' });
  const project: Project = {
    ...base,
    network: { subnets: [], wifi: [{ id: 'w1', ssid: 'Crew', security: 'WPA2', hidden: false }] },
    secrets: { wifiPasswords: [{ wifiId: 'w1', password: 'supergeheim' }] },
  };
  const id = await server.store.create(project);
  return { server, id, edit: await login(server, 'edit'), read: await login(server, 'read') };
}

describe('WLAN-Passwörter im geschützten Bereich', () => {
  it('nur Bearbeiten-Zugang liest und schreibt; Lese-Clients erhalten das Passwort nicht', async () => {
    const { server, id, edit, read } = await setup();
    expect((await server.app.inject({ method: 'GET', url: `/api/projects/${id}/secrets`, headers: { cookie: read } })).statusCode).toBe(403);
    const secrets = await server.app.inject({ method: 'GET', url: `/api/projects/${id}/secrets`, headers: { cookie: edit } });
    expect(secrets.json()).toEqual({ wifiPasswords: [{ wifiId: 'w1', password: 'supergeheim' }] });

    // Live-Dokument enthält kein Passwort
    const reader = connect(server, id, read);
    clients.push(reader);
    await reader.whenSynced();
    expect(JSON.stringify(reader.doc.toJSON())).not.toContain('supergeheim');
    expect((reader.doc.getMap('wifi').get('w1') as { get(k: string): unknown }).get('ssid')).toBe('Crew');

    expect((await server.app.inject({ method: 'PUT', url: `/api/projects/${id}/secrets/wifi/w1`, headers: { cookie: read }, payload: { password: 'x' } })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'PUT', url: `/api/projects/${id}/secrets/wifi/w1`, headers: { cookie: edit }, payload: { password: 'x'.repeat(64) } })).statusCode).toBe(400);
    expect((await server.app.inject({ method: 'PUT', url: `/api/projects/${id}/secrets/wifi/weg`, headers: { cookie: edit }, payload: { password: 'x' } })).statusCode).toBe(404);
    expect((await server.app.inject({ method: 'PUT', url: `/api/projects/${id}/secrets/wifi/w1`, headers: { cookie: edit }, payload: { password: 'neu;geheim' } })).statusCode).toBe(200);
    await sleep(100);
    expect((await server.store.load(id)).secrets.wifiPasswords).toEqual([{ wifiId: 'w1', password: 'neu;geheim' }]);
  });

  it('QR-Code kommt vom Server, auch für Lese-Zugang', async () => {
    const { server, id, read } = await setup();
    const res = await server.app.inject({ method: 'GET', url: `/api/projects/${id}/wifi/w1/qr.svg`, headers: { cookie: read } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
    expect(res.body).toContain('<svg');
    expect(res.body).not.toContain('supergeheim'); // nur als Muster, nicht als Text
    expect((await server.app.inject({ method: 'GET', url: `/api/projects/${id}/wifi/w1/qr.svg` })).statusCode).toBe(401);
  });

  it('Passwörter gelöschter WLAN-Netze werden beim Speichern entfernt', async () => {
    const { server, id, edit } = await setup();
    const editor = connect(server, id, edit);
    clients.push(editor);
    await editor.whenSynced();
    editor.doc.getMap('wifi').delete('w1');
    await sleep(150);
    expect((await server.store.load(id)).secrets.wifiPasswords).toEqual([]);
  });
});
