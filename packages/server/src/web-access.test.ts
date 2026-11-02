import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { createEmptyProject, SyncClient, type SocketLike } from '@steckplan/core';
import { hashForStorage, PasswordChecker } from './auth/passwords';
import { SessionStore } from './auth/sessions';
import { startExtraListener, type ExtraListener } from './extra-listener';
import { LocalFileStore } from './storage/local-file-store';
import { isManagedStore } from './storage/types';
import { connect, login, sleep, startTestServer, waitFor, type TestServer } from './test-utils';

let server: TestServer | undefined;
let extra: ExtraListener | undefined;
const clients: SyncClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.destroy();
  await extra?.close();
  extra = undefined;
  await server?.close();
  server = undefined;
});

describe('Weboberfläche des Desktops (zusätzlicher Zugang)', () => {
  it('zweiter Zugang liefert dieselbe App inkl. Live-Sync; Passwörter sind zur Laufzeit veränderlich', async () => {
    const store = new LocalFileStore('Ralf');
    const sessions = new SessionStore();
    let checker: PasswordChecker | null = null;
    server = await startTestServer({ mode: 'desktop', store, sessions, passwords: () => checker });
    const id = await store.create(join(mkdtempSync(join(tmpdir(), 'web-')), 'Fest.steckplan'), createEmptyProject({ name: 'Fest' }));
    extra = await startExtraListener(server.app, '127.0.0.1', 0);
    const lan = `http://127.0.0.1:${extra.port}`;

    // ohne Passwörter keine Anmeldung
    expect((await fetch(`${lan}/api/auth/session`).then((r) => r.json())) as object).toMatchObject({ loginAvailable: false });
    checker = new PasswordChecker({ stored: { edit: hashForStorage('bearbeiten'), read: hashForStorage('lesen') } });
    expect((await fetch(`${lan}/api/auth/session`).then((r) => r.json())) as object).toMatchObject({ loginAvailable: true });

    const res = await fetch(`${lan}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Handy-Anna', password: 'lesen' }) });
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
    // nur die am Desktop geöffneten Projekte
    const list = (await fetch(`${lan}/api/projects`, { headers: { cookie } }).then((r) => r.json())) as { projects: { name: string }[]; canManage: boolean };
    expect(list.projects.map((p) => p.name)).toEqual(['Fest']);
    expect(list.canManage).toBe(false);

    // Live-Sync über den zweiten Zugang (WebSocket-Upgrade wird weitergereicht)
    const client = new SyncClient({
      url: `ws://127.0.0.1:${extra.port}/api/projects/${id}/sync`,
      doc: new Y.Doc(),
      createSocket: (u) => new WebSocket(u, { headers: { cookie } }) as unknown as SocketLike,
    });
    clients.push(client);
    await client.whenSynced();
    expect(client.state).toMatchObject({ access: 'read', readOnly: true });
    expect(client.doc.getMap('meta').get('name')).toBe('Fest');

    // Verbundene Personen + trennen
    await waitFor(() => server!.connectedPeople().length === 1);
    expect(server.connectedPeople()[0]).toMatchObject({ name: 'Handy-Anna', access: 'read', projects: ['Fest'] });
    expect(server.endSessions((s) => s.name === 'Handy-Anna', 'Getrennt')).toBe(1);
    await waitFor(() => client.state.status === 'unauthorized');
    expect((await fetch(`${lan}/api/projects`, { headers: { cookie } })).status).toBe(401);

    // Zugang schließen
    await extra.close();
    extra = undefined;
    await expect(fetch(`${lan}/api/health`)).rejects.toThrow();
  });

  it('nimmt den nächsten freien Port, wenn der gewünschte belegt ist', async () => {
    server = await startTestServer();
    const first = await startExtraListener(server.app, '127.0.0.1', 0);
    extra = await startExtraListener(server.app, '127.0.0.1', first.port);
    expect(extra.port).toBe(first.port + 1);
    await first.close();
  });

  it('gespeicherte Hashes enthalten kein Passwort', () => {
    const stored = hashForStorage('geheim');
    expect(JSON.stringify(stored)).not.toContain('geheim');
    const checker = new PasswordChecker({ stored: { edit: stored, read: hashForStorage('lesen') } });
    expect(checker.check('geheim')).toBe('edit');
    expect(checker.matchesAny('falsch')).toBe(false);
  });
});

describe('Zuletzt geändert und Änderungsprotokoll', () => {
  async function setup() {
    server = await startTestServer({ saveDelayMs: 20, stampDelayMs: 20, changeLogWindowMs: 80 });
    if (!isManagedStore(server.store)) throw new Error();
    const base = createEmptyProject({ name: 'Protokoll' });
    const id = await server.store.create({
      ...base,
      devices: [{ id: 'd1', templateId: 't', layerId: base.layers[0]!.id, label: 'Spot 1', signalFlow: { position: { x: 0, y: 0 } } }],
    });
    return { server, id };
  }

  it('Server stempelt Änderungen mit dem Namen aus der Sitzung', async () => {
    const { server, id } = await setup();
    const tom = connect(server, id, await login(server, 'edit', 'Tom'));
    clients.push(tom);
    await tom.whenSynced();
    (tom.doc.getMap('devices').get('d1') as Y.Map<unknown>).set('label', 'Spot links');
    await waitFor(() => ((tom.doc.getMap('devices').get('d1') as Y.Map<unknown>).get('lastModified') as { by?: string } | undefined)?.by === 'Tom');
    // Abhaken ändert „zuletzt geändert“ nicht
    const before = (tom.doc.getMap('devices').get('d1') as Y.Map<unknown>).get('lastModified');
    const read = await login(server, 'read', 'Anna');
    await server.app.inject({ method: 'POST', url: `/api/projects/${id}/check`, headers: { cookie: read }, payload: { kind: 'device', id: 'd1', direction: 'out', status: 'ok' } });
    await sleep(80);
    expect((tom.doc.getMap('devices').get('d1') as Y.Map<unknown>).get('lastModified')).toEqual(before);
  });

  it('fasst Änderungen je Person zusammen und protokolliert wichtige Aktionen; Docker speichert getrennt', async () => {
    const { server, id } = await setup();
    const edit = await login(server, 'edit', 'Ralf');
    const ralf = connect(server, id, edit);
    clients.push(ralf);
    await ralf.whenSynced();
    const devices = ralf.doc.getMap('devices');
    (devices.get('d1') as Y.Map<unknown>).set('signalFlow', { position: { x: 100, y: 0 } });
    const added = new Y.Map<unknown>();
    ralf.doc.transact(() => {
      devices.set('d2', added);
      added.set('id', 'd2');
      added.set('templateId', 't');
      added.set('layerId', 'x');
      added.set('label', 'Spot 2');
    });
    ralf.doc.getMap('meta').set('venue', 'Halle');

    // offener Eintrag ist sofort sichtbar
    const changelog = async () => (await server.app.inject({ method: 'GET', url: `/api/projects/${id}/changelog`, headers: { cookie: edit } })).json().entries as { action: string }[];
    await waitFor(async () => (await changelog())[0]?.action.includes('1 Gerät hinzugefügt') ?? false);
    await sleep(150);
    await server.app.inject({ method: 'POST', url: `/api/projects/${id}/checks/reset`, headers: { cookie: edit }, payload: { direction: 'both' } });
    await server.app.inject({ method: 'POST', url: `/api/projects/${id}/check`, headers: { cookie: edit }, payload: { kind: 'device', id: 'd1', direction: 'out', status: 'ok' } });
    await server.app.inject({ method: 'POST', url: `/api/projects/${id}/checks/reset`, headers: { cookie: edit }, payload: { direction: 'out' } });
    const log = (await server.app.inject({ method: 'GET', url: `/api/projects/${id}/changelog`, headers: { cookie: edit } })).json().entries;
    expect(log[0]).toMatchObject({ by: 'Ralf', access: 'edit', via: 'browser', action: 'Häkchen zurückgesetzt (Hin, 1 Stück)' });
    const summary = log.find((e: { action: string }) => e.action.includes('hinzugefügt'));
    expect(summary.action).toBe('1 Gerät hinzugefügt, 1 Gerät verschoben, Projektdaten geändert (Spot 2, Spot 1)');
    expect(summary.objectIds.sort()).toEqual(['d1', 'd2']);

    await sleep(100);
    // Docker: Protokoll nicht in der Projektdatei, sondern getrennt
    expect((await server.store.load(id)).changeLog).toEqual([]);
    expect((await server.store.loadChangeLog!(id)).length).toBeGreaterThanOrEqual(2);
    const download = (await server.app.inject({ method: 'GET', url: `/api/projects/${id}/download`, headers: { cookie: edit } })).json();
    expect(download.changeLog).toEqual([]);
  });
});
