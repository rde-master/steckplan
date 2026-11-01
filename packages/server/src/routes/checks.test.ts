import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject, type Project, type SyncClient } from '@steckplan/core';
import { isManagedStore } from '../storage/types';
import { connect, login, sleep, startTestServer, waitFor, type TestServer } from '../test-utils';

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
  const base = createEmptyProject({ name: 'Packen', meta: { date: '2026-07-04', version: '2' } });
  const project: Project = {
    ...base,
    devices: [{ id: 'd1', templateId: 't', layerId: base.layers[0]!.id, label: 'Spot 1' }],
    cables: [{ id: 'c1', templateId: 'x', from: { deviceId: 'd1', portId: 'a' }, to: { deviceId: 'd1', portId: 'b' }, waypoints: [] }],
  };
  const id = await server.store.create(project);
  return { server, id, edit: await login(server, 'edit', 'Ralf'), read: await login(server, 'read', 'Anna') };
}

describe('Packliste: Häkchen per Server-Befehl', () => {
  it('Lese-Zugang darf abhaken und „fehlt/defekt“ setzen; Name und Zeit vom Server', async () => {
    const { server, id, read } = await setup();
    const reader = connect(server, id, read);
    clients.push(reader);
    await reader.whenSynced();
    const post = (body: object) => server.app.inject({ method: 'POST', url: `/api/projects/${id}/check`, headers: { cookie: read }, payload: body });

    expect((await post({ kind: 'device', id: 'd1', direction: 'out', status: 'ok' })).statusCode).toBe(200);
    expect((await post({ kind: 'cable', id: 'c1', direction: 'in', status: 'damaged', note: '  Stecker locker ' })).statusCode).toBe(200);
    // Lese-Client sieht die Häkchen live
    await waitFor(() => (reader.doc.getMap('cables').get('c1') as { get(k: string): unknown } | undefined)?.get('check') !== undefined);
    await sleep(100);
    const saved = await server.store.load(id);
    expect(saved.devices[0]!.check?.out).toMatchObject({ by: 'Anna', status: 'ok' });
    expect(saved.cables[0]!.check?.in).toMatchObject({ by: 'Anna', status: 'damaged', note: 'Stecker locker' });

    // Häkchen entfernen
    expect((await post({ kind: 'device', id: 'd1', direction: 'out', status: null })).statusCode).toBe(200);
    // ungültige Angaben
    expect((await post({ kind: 'rakete', id: 'd1', direction: 'out', status: 'ok' })).statusCode).toBe(400);
    expect((await post({ kind: 'device', id: 'd1', direction: 'out', status: 'kaputt' })).statusCode).toBe(400);
    expect((await post({ kind: 'device', id: 'weg', direction: 'out', status: 'ok' })).statusCode).toBe(404);
  });

  it('Häkchen zurücksetzen nur mit Bearbeiten-Zugang', async () => {
    const { server, id, edit, read } = await setup();
    await server.app.inject({ method: 'POST', url: `/api/projects/${id}/check`, headers: { cookie: read }, payload: { kind: 'device', id: 'd1', direction: 'out', status: 'ok' } });
    await server.app.inject({ method: 'POST', url: `/api/projects/${id}/check`, headers: { cookie: read }, payload: { kind: 'device', id: 'd1', direction: 'in', status: 'ok' } });
    const denied = await server.app.inject({ method: 'POST', url: `/api/projects/${id}/checks/reset`, headers: { cookie: read }, payload: { direction: 'both' } });
    expect(denied.statusCode).toBe(403);
    const ok = await server.app.inject({ method: 'POST', url: `/api/projects/${id}/checks/reset`, headers: { cookie: edit }, payload: { direction: 'out' } });
    expect(ok.json()).toEqual({ removed: 1 });
    await sleep(100);
    expect((await server.store.load(id)).devices[0]!.check).toEqual({ in: expect.objectContaining({ by: 'Anna' }) });
  });

  it('Neues Projekt aus diesem: nur Bearbeiten-Zugang, ohne Häkchen, Datum/Version leer', async () => {
    const { server, id, edit, read } = await setup();
    await server.app.inject({ method: 'POST', url: `/api/projects/${id}/check`, headers: { cookie: read }, payload: { kind: 'device', id: 'd1', direction: 'out', status: 'ok' } });
    expect((await server.app.inject({ method: 'POST', url: `/api/projects/${id}/copy`, headers: { cookie: read } })).statusCode).toBe(403);
    const res = await server.app.inject({ method: 'POST', url: `/api/projects/${id}/copy`, headers: { cookie: edit }, payload: { name: 'Packen 2027' } });
    expect(res.statusCode).toBe(201);
    const copy = await server.store.load(res.json().id);
    expect(copy.meta).toMatchObject({ name: 'Packen 2027', date: '', version: '' });
    expect(copy.devices[0]!.check).toBeUndefined();
    expect(copy.cables).toHaveLength(1);
  });
});
