import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject, serializeProject, type Project, type SyncClient } from '@steckplan/core';
import { isManagedStore } from '../storage/types';
import { connect, login, sleep, startTestServer, waitFor, type TestServer } from '../test-utils';
import { downloadFileName } from './projects';

let server: TestServer | undefined;
const clients: SyncClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.destroy();
  await server?.close();
  server = undefined;
});

async function setup(overrides = {}) {
  server = await startTestServer(overrides);
  return { server, edit: await login(server, 'edit'), read: await login(server, 'read') };
}

describe('Projekt-Routen', () => {
  it('verlangt eine Anmeldung', async () => {
    const { server } = await setup();
    expect((await server.app.inject({ method: 'GET', url: '/api/projects' })).statusCode).toBe(401);
  });

  it('legt Projekte an und listet sie', async () => {
    const { server, edit, read } = await setup();
    const created = await server.app.inject({ method: 'POST', url: '/api/projects', headers: { cookie: edit }, payload: { name: 'Sommerfest' } });
    expect(created.statusCode).toBe(201);
    const list = await server.app.inject({ method: 'GET', url: '/api/projects', headers: { cookie: read } });
    expect(list.json().projects.map((p: { name: string }) => p.name)).toEqual(['Sommerfest']);
    expect(list.json().canManage).toBe(true);
    const one = await server.app.inject({ method: 'GET', url: `/api/projects/${created.json().id}`, headers: { cookie: read } });
    expect(one.json()).toMatchObject({ name: 'Sommerfest' });
  });

  it('Lese-Zugang darf nicht anlegen, hochladen, löschen oder den Papierkorb sehen', async () => {
    const { server, read } = await setup();
    const headers = { cookie: read };
    expect((await server.app.inject({ method: 'POST', url: '/api/projects', headers, payload: { name: 'x' } })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'POST', url: '/api/projects/upload', headers, payload: {} })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'DELETE', url: '/api/projects/abc', headers })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'GET', url: '/api/trash', headers })).statusCode).toBe(403);
  });

  it('prüft den Projektnamen', async () => {
    const { server, edit } = await setup();
    expect((await server.app.inject({ method: 'POST', url: '/api/projects', headers: { cookie: edit }, payload: { name: '  ' } })).statusCode).toBe(400);
  });

  it('lädt hoch (immer mit neuer id) und lehnt ungültige Dateien ab', async () => {
    const { server, edit } = await setup();
    const project = createEmptyProject({ name: 'Hochgeladen' });
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/projects/upload',
      headers: { cookie: edit, 'content-type': 'application/json' },
      payload: serializeProject(project),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).not.toBe(project.id);
    expect((await server.store.load(res.json().id)).meta.name).toBe('Hochgeladen');

    const bad = await server.app.inject({ method: 'POST', url: '/api/projects/upload', headers: { cookie: edit }, payload: { schemaVersion: 99 } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatch(/neueren Steckplan-Version/);
  });

  it('Download: mit Dateiname, ohne WLAN-Passwörter für Lese-Zugang', async () => {
    const { server, edit, read } = await setup();
    if (!isManagedStore(server.store)) throw new Error();
    const project: Project = {
      ...createEmptyProject({ name: 'Bühne Süd' }),
      network: { subnets: [], wifi: [{ id: 'w', ssid: 'Crew', security: 'WPA2', hidden: false }] },
      secrets: { wifiPasswords: [{ wifiId: 'w', password: 'supergeheim' }] },
    };
    const id = await server.store.create(project);

    const asEdit = await server.app.inject({ method: 'GET', url: `/api/projects/${id}/download`, headers: { cookie: edit } });
    expect(asEdit.statusCode).toBe(200);
    expect(asEdit.headers['content-disposition']).toContain("filename*=UTF-8''B%C3%BChne%20S%C3%BCd.steckplan");
    expect(asEdit.body).toContain('supergeheim');

    const asRead = await server.app.inject({ method: 'GET', url: `/api/projects/${id}/download`, headers: { cookie: read } });
    expect(asRead.body).not.toContain('supergeheim');
    expect(asRead.json().network.wifi[0].ssid).toBe('Crew');
  });

  it('Download enthält den aktuellen Live-Stand', async () => {
    const { server, edit } = await setup({ saveDelayMs: 60_000 });
    if (!isManagedStore(server.store)) throw new Error();
    const id = await server.store.create(createEmptyProject({ name: 'Live' }));
    const client = connect(server, id, edit);
    clients.push(client);
    await client.whenSynced();
    client.doc.getMap('meta').set('venue', 'noch nicht gespeichert');
    await waitFor(() => server.rooms.peek(id)?.doc.getMap('meta').get('venue') === 'noch nicht gespeichert');
    const res = await server.app.inject({ method: 'GET', url: `/api/projects/${id}/download`, headers: { cookie: edit } });
    expect(res.json().meta.venue).toBe('noch nicht gespeichert');
  });

  it('löscht in den Papierkorb, trennt Verbindungen und stellt wieder her', async () => {
    const { server, edit } = await setup();
    if (!isManagedStore(server.store)) throw new Error();
    const id = await server.store.create(createEmptyProject({ name: 'Weg' }));
    const client = connect(server, id, edit);
    clients.push(client);
    await client.whenSynced();

    const del = await server.app.inject({ method: 'DELETE', url: `/api/projects/${id}`, headers: { cookie: edit } });
    expect(del.statusCode).toBe(200);
    await waitFor(() => client.state.status === 'closed');
    expect(client.state.notice).toContain('gelöscht');

    const trash = await server.app.inject({ method: 'GET', url: '/api/trash', headers: { cookie: edit } });
    const [entry] = trash.json().entries;
    expect(entry).toMatchObject({ projectId: id, name: 'Weg' });
    const restored = await server.app.inject({ method: 'POST', url: `/api/trash/${entry.trashId}/restore`, headers: { cookie: edit } });
    expect(restored.json()).toEqual({ id });
  });

  it('erzeugt sichere Dateinamen', () => {
    expect(downloadFileName('Halle 1/2: "Test"')).toBe('Halle 1_2_ _Test_.steckplan');
    expect(downloadFileName('   ')).toBe('Projekt.steckplan');
  });
});

describe('Versionen', () => {
  it('legt beim Speichern Versionen an und stellt sie wieder her (nur Bearbeiten-Zugang)', async () => {
    const { server, edit, read } = await setup({ versionIntervalMs: 0 });
    if (!isManagedStore(server.store)) throw new Error();
    const id = await server.store.create(createEmptyProject({ name: 'V1' }));
    const editor = connect(server, id, edit);
    const reader = connect(server, id, read);
    clients.push(editor, reader);
    await Promise.all([editor.whenSynced(), reader.whenSynced()]);

    editor.doc.getMap('meta').set('venue', 'Erster Ort');
    const listVersions = async () => (await server.app.inject({ method: 'GET', url: `/api/projects/${id}/versions`, headers: { cookie: read } })).json().versions as unknown[];
    await waitFor(async () => (await listVersions()).length >= 1);
    let versions = (await server.app.inject({ method: 'GET', url: `/api/projects/${id}/versions`, headers: { cookie: read } })).json().versions;
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].by).toEqual(['Ralf']);
    const firstVersion = versions[0].id;

    editor.doc.getMap('meta').set('venue', 'Zweiter Ort');
    await sleep(200);

    // Vorschau
    const preview = await server.app.inject({ method: 'GET', url: `/api/projects/${id}/versions/${firstVersion}`, headers: { cookie: read } });
    expect(preview.json().meta.venue).toBe('Erster Ort');

    // Lese-Zugang darf nicht wiederherstellen
    const denied = await server.app.inject({ method: 'POST', url: `/api/projects/${id}/versions/${firstVersion}/restore`, headers: { cookie: read } });
    expect(denied.statusCode).toBe(403);

    const ok = await server.app.inject({ method: 'POST', url: `/api/projects/${id}/versions/${firstVersion}/restore`, headers: { cookie: edit } });
    expect(ok.statusCode).toBe(200);
    await waitFor(() => reader.doc.getMap('meta').get('venue') === 'Erster Ort');
    await waitFor(() => (reader.state.notice ?? '').includes('wiederhergestellt'));

    versions = (await server.app.inject({ method: 'GET', url: `/api/projects/${id}/versions`, headers: { cookie: edit } })).json().versions;
    expect(versions.some((v: { note?: string }) => v.note === 'Stand vor dem Wiederherstellen')).toBe(true);
  });

  it('höchstens eine Version pro Intervall', async () => {
    const { server, edit } = await setup({ versionIntervalMs: 60_000 });
    if (!isManagedStore(server.store)) throw new Error();
    const id = await server.store.create(createEmptyProject({ name: 'V' }));
    const editor = connect(server, id, edit);
    clients.push(editor);
    await editor.whenSynced();
    for (const venue of ['a', 'b', 'c']) {
      editor.doc.getMap('meta').set('venue', venue);
      await new Promise((r) => setTimeout(r, 80));
    }
    expect(await server.versions.list(id)).toHaveLength(1);
  });
});
