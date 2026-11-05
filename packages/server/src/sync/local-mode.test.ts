import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject, serializeProject, type SyncClient } from '@steckplan/core';
import { SessionStore } from '../auth/sessions';
import { FileLock } from '../storage/lock-file';
import { LocalFileStore } from '../storage/local-file-store';
import { connect, sleep, startTestServer, waitFor, type TestServer } from '../test-utils';

let server: TestServer | undefined;
const clients: SyncClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.destroy();
  await server?.close();
  server = undefined;
});

describe('Desktop lokal', () => {
  it('lokale Sitzung bearbeitet die Datei, Autosave schreibt hinein', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lokal-'));
    const store = new LocalFileStore('Ralf');
    const sessions = new SessionStore();
    server = await startTestServer({ mode: 'desktop', store, sessions, passwords: null });
    const id = await store.create(join(dir, 'Fest.steckplan'), createEmptyProject({ name: 'Fest' }));
    const { token } = sessions.create('Ralf', 'local', 'desktop', { persistent: false, expires: false });

    const client = connect(server, id, `steckplan_session=${token}`);
    clients.push(client);
    await client.whenSynced();
    expect(client.state).toMatchObject({ access: 'local', readOnly: false });
    client.doc.getMap('meta').set('venue', 'Festwiese');
    const venue = () => {
      try {
        return JSON.parse(readFileSync(join(dir, 'Fest.steckplan'), 'utf8')).meta.venue;
      } catch {
        return undefined; // Datei wird gerade geschrieben
      }
    };
    await waitFor(() => venue() === 'Festwiese');
    expect(venue()).toBe('Festwiese');
    // Raum bleibt im lokalen Modus offen, auch ohne Verbindung
    client.destroy();
    await sleep(100);
    expect(server.rooms.peek(id)).toBeDefined();
  });

  it('gesperrte Datei: nur lesen, Änderungen werden verworfen und nicht gespeichert', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lokal-'));
    const file = join(dir, 'Gesperrt.steckplan');
    writeFileSync(file, serializeProject(createEmptyProject({ name: 'Gesperrt' })));
    const foreign = new FileLock(file, 'Anna');
    await foreign.acquire();

    const store = new LocalFileStore('Ralf');
    const sessions = new SessionStore();
    server = await startTestServer({ mode: 'desktop', store, sessions, passwords: null });
    const { id } = await store.open(file, { readOnly: true });
    const { token } = sessions.create('Ralf', 'local', 'desktop', { persistent: false, expires: false });

    const client = connect(server, id, `steckplan_session=${token}`);
    clients.push(client);
    await client.whenSynced();
    expect(client.state.readOnly).toBe(true);
    expect(client.state.readOnlyReason).toMatch(/nur zum Lesen/);

    await waitFor(() => server!.rooms.peek(id) !== undefined);
    expect(server.rooms.peek(id)!.doc.getMap('meta').get('name')).toBe('Gesperrt');
    await foreign.release();
  });
});
