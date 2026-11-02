import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { createEmptyProject, readProjectFromYDoc, type SyncClient } from '@steckplan/core';
import { isManagedStore } from '../storage/types';
import { connect, login, startTestServer, waitFor, type TestServer } from '../test-utils';

let server: TestServer | undefined;
const clients: SyncClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.destroy();
  await server?.close();
  server = undefined;
});

async function setup() {
  server = await startTestServer();
  if (!isManagedStore(server.store)) throw new Error();
  const id = await server.store.create(createEmptyProject({ name: 'Live' }));
  return { server, id };
}

function track(client: SyncClient): SyncClient {
  clients.push(client);
  return client;
}

describe('Live-Sync', () => {
  it('zwei Clients bearbeiten live dasselbe Projekt', async () => {
    const { server, id } = await setup();
    const a = track(connect(server, id, await login(server, 'edit', 'Ralf')));
    const b = track(connect(server, id, await login(server, 'edit', 'Tom')));
    await Promise.all([a.whenSynced(), b.whenSynced()]);

    expect(b.doc.getMap('meta').get('name')).toBe('Live');
    a.doc.getMap('meta').set('venue', 'Stadthalle');
    await waitFor(() => b.doc.getMap('meta').get('venue') === 'Stadthalle');
    b.doc.getMap('meta').set('planner', 'Tom');
    await waitFor(() => a.doc.getMap('meta').get('planner') === 'Tom');

    // Presence: beide sehen beide
    await waitFor(() => a.state.users.length === 2 && b.state.users.length === 2);
    expect(a.state.users.map((u) => u.name).sort()).toEqual(['Ralf', 'Tom']);
    expect(a.state).toMatchObject({ access: 'edit', readOnly: false });
  });

  it('speichert Änderungen in die Datei', async () => {
    const { server, id } = await setup();
    const a = track(connect(server, id, await login(server, 'edit')));
    await a.whenSynced();
    a.doc.getMap('meta').set('client', 'Stadt Musterhausen');
    await new Promise((r) => setTimeout(r, 150));
    expect((await server.store.load(id)).meta.client).toBe('Stadt Musterhausen');
  });

  it('verwirft Änderungen von Lese-Clients (serverseitig)', async () => {
    const { server, id } = await setup();
    const editor = track(connect(server, id, await login(server, 'edit')));
    const reader = track(connect(server, id, await login(server, 'read')));
    await Promise.all([editor.whenSynced(), reader.whenSynced()]);
    expect(reader.state).toMatchObject({ access: 'read', readOnly: true });

    // Der Client würde wegen readOnly nichts senden – wir senden trotzdem direkt (manipulierter Client).
    const rogueDoc = new Y.Doc();
    Y.applyUpdate(rogueDoc, Y.encodeStateAsUpdate(reader.doc));
    rogueDoc.getMap('meta').set('name', 'GEHACKT');
    const rogue = track(connect(server, id, await login(server, 'read', 'Mallory'), rogueDoc));
    await rogue.whenSynced();
    // Sync-Step 2 des Lese-Clients enthält die Änderung → muss verworfen werden
    (rogue as unknown as { state: { readOnly: boolean } }).state.readOnly = false;
    rogueDoc.getMap('meta').set('venue', 'auch gehackt');

    editor.doc.getMap('meta').set('notes', 'Marker');
    await waitFor(() => reader.doc.getMap('meta').get('notes') === 'Marker');
    await new Promise((r) => setTimeout(r, 100));
    expect(editor.doc.getMap('meta').get('name')).toBe('Live');
    expect(editor.doc.getMap('meta').get('venue')).toBe('');
    expect(server.rooms.peek(id)!.doc.getMap('meta').get('name')).toBe('Live');
  });

  it('lehnt Verbindungen ohne Anmeldung ab', async () => {
    const { server, id } = await setup();
    const client = track(connect(server, id, null));
    await waitFor(() => client.state.status === 'unauthorized');
  });

  it('meldet unbekannte Projekte', async () => {
    const { server } = await setup();
    const client = track(connect(server, 'gibtsnicht', await login(server, 'edit')));
    await waitFor(() => client.state.status === 'notFound');
  });

  it('lehnt fremde Herkunft ab (Cross-Site-WebSocket)', async () => {
    const { server, id } = await setup();
    const cookie = await login(server, 'edit');
    const ws = new WebSocket(`${server.baseUrl.replace('http', 'ws')}/api/projects/${id}/sync`, {
      headers: { cookie, origin: 'https://boese.example' },
    });
    const code = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
    expect(code).toBe(4403);
  });

  it('trennt Verbindungen beim Abmelden', async () => {
    const { server, id } = await setup();
    const cookie = await login(server, 'edit');
    const client = track(connect(server, id, cookie));
    await client.whenSynced();
    await server.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    await waitFor(() => client.state.status === 'unauthorized');
  });

  it('gleicht nach Verbindungsabbruch wieder ab', async () => {
    const { server, id } = await setup();
    const a = track(connect(server, id, await login(server, 'edit')));
    const b = track(connect(server, id, await login(server, 'edit', 'Tom')));
    await Promise.all([a.whenSynced(), b.whenSynced()]);
    // Verbindung von b hart trennen
    for (const c of server.rooms.peek(id)!.connections) if (c.session.name === 'Tom') c.socket.terminate();
    await waitFor(() => b.state.status === 'disconnected' || b.state.status === 'connecting');
    a.doc.getMap('meta').set('venue', 'nach Abbruch');
    await waitFor(() => b.doc.getMap('meta').get('venue') === 'nach Abbruch', 5000);
  });

  it('schließt das Projekt nach Leerlauf und speichert', async () => {
    const { server, id } = await setup();
    const a = track(connect(server, id, await login(server, 'edit')));
    await a.whenSynced();
    a.doc.getMap('meta').set('version', '2');
    a.destroy();
    await waitFor(() => server.rooms.peek(id) === undefined);
    await server.rooms.whenClosed(id);
    expect((await server.store.load(id)).meta.version).toBe('2');
  });

  it('neu öffnen direkt nach dem Leerlauf-Schließen lädt den gespeicherten Stand', async () => {
    const { server, id } = await setup();
    const a = track(connect(server, id, await login(server, 'edit')));
    await a.whenSynced();
    a.doc.getMap('meta').set('version', '3');
    a.destroy();
    await waitFor(() => server.rooms.peek(id) === undefined, 3000, 'Raum nicht geschlossen');
    // sofort wieder öffnen, während das Speichern evtl. noch läuft
    const room = await server.rooms.get(id);
    expect(room.doc.getMap('meta').get('version')).toBe('3');
  });

  it('übernimmt Namensänderungen in die Anwesenheitsliste', async () => {
    const { server, id } = await setup();
    const cookie = await login(server, 'edit', 'Alt');
    const client = track(connect(server, id, cookie));
    await waitFor(() => client.state.users[0]?.name === 'Alt');
    server.sessions.rename(cookie.split('=')[1]!, 'Neu');
    await waitFor(() => client.state.users[0]?.name === 'Neu');
  });

  it('liefert ein gültiges Projekt aus dem Dokument', async () => {
    const { server, id } = await setup();
    const a = track(connect(server, id, await login(server, 'edit')));
    await a.whenSynced();
    const result = readProjectFromYDoc(a.doc);
    expect(result.ok && result.project.meta.name).toBe('Live');
  });
});
