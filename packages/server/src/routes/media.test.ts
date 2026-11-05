import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { addItemMedia, addShowItem, createEmptyProject, removeItemMedia, type SyncClient } from '@steckplan/core';
import { MediaStore } from '../storage/media-store';
import { isManagedStore } from '../storage/types';
import { connect, login, startTestServer, waitFor, type TestServer } from '../test-utils';
import { parseRange } from './media';

let server: TestServer | undefined;
const clients: SyncClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.destroy();
  await server?.close();
  server = undefined;
});

const bytes = (n: number) => Buffer.from(Array.from({ length: n }, (_, i) => i % 251));

async function setup() {
  server = await startTestServer();
  if (!isManagedStore(server.store)) throw new Error();
  const id = await server.store.create(createEmptyProject({ name: 'Medien' }));
  return { server, id, edit: await login(server, 'edit') };
}

async function upload(s: TestServer, id: string, cookie: string, data: Buffer, chunk = 4): Promise<{ id: string; sizeBytes: number; sha256: string }> {
  const start = await s.app.inject({ method: 'POST', url: `/api/projects/${id}/media/uploads`, headers: { cookie }, payload: { size: data.length } });
  expect(start.statusCode).toBe(201);
  const { uploadId } = start.json() as { uploadId: string };
  for (let offset = 0; offset < data.length; offset += chunk) {
    const res = await s.app.inject({ method: 'PUT', url: `/api/projects/${id}/media/uploads/${uploadId}?offset=${offset}`, headers: { cookie, 'content-type': 'application/octet-stream' }, payload: data.subarray(offset, offset + chunk) });
    expect(res.statusCode).toBe(200);
  }
  const done = await s.app.inject({ method: 'POST', url: `/api/projects/${id}/media/uploads/${uploadId}/complete`, headers: { cookie } });
  expect(done.statusCode).toBe(200);
  return done.json();
}

describe('Medien', () => {
  it('Hochladen in Teilen, falsche Position meldet den Stand, Fortsetzen, Prüfsumme', async () => {
    const { server, id, edit } = await setup();
    const data = bytes(10);
    const start = await server.app.inject({ method: 'POST', url: `/api/projects/${id}/media/uploads`, headers: { cookie: edit }, payload: { size: 10 } });
    const { uploadId, mediaId } = start.json() as { uploadId: string; mediaId: string };
    const put = (offset: number, part: Buffer) => server.app.inject({ method: 'PUT', url: `/api/projects/${id}/media/uploads/${uploadId}?offset=${offset}`, headers: { cookie: edit, 'content-type': 'application/octet-stream' }, payload: part });
    expect((await put(0, data.subarray(0, 4))).json()).toEqual({ received: 4 });
    // Wiederholung nach Verbindungsabbruch mit falscher Position → 409 mit Stand
    const wrong = await put(0, data.subarray(0, 4));
    expect(wrong.statusCode).toBe(409);
    expect(wrong.json().received).toBe(4);
    expect((await server.app.inject({ method: 'GET', url: `/api/projects/${id}/media/uploads/${uploadId}`, headers: { cookie: edit } })).json()).toMatchObject({ received: 4, size: 10, mediaId });
    // zu früh abschließen → 409
    expect((await server.app.inject({ method: 'POST', url: `/api/projects/${id}/media/uploads/${uploadId}/complete`, headers: { cookie: edit } })).statusCode).toBe(409);
    await put(4, data.subarray(4));
    const done = (await server.app.inject({ method: 'POST', url: `/api/projects/${id}/media/uploads/${uploadId}/complete`, headers: { cookie: edit } })).json();
    expect(done).toEqual({ id: mediaId, sizeBytes: 10, sha256: createHash('sha256').update(data).digest('hex') });
    // erneuter Start mit gleicher Kennung und Größe: schon vorhanden
    const again = (await server.app.inject({ method: 'POST', url: `/api/projects/${id}/media/uploads`, headers: { cookie: edit }, payload: { size: 10, mediaId } })).json();
    expect(again.complete).toMatchObject({ id: mediaId, sizeBytes: 10 });
  });

  it('Rechte: Regie lädt hoch, Lesen nicht; Abspielen nur mit Verweis im Projekt, mit Spulen (Range)', async () => {
    const { server, id, edit } = await setup();
    const read = await login(server, 'read');
    expect((await server.app.inject({ method: 'POST', url: `/api/projects/${id}/media/uploads`, headers: { cookie: read }, payload: { size: 3 } })).statusCode).toBe(403);
    const data = bytes(1000);
    const info = await upload(server, id, await login(server, 'direction'), data, 300);
    // ohne Verweis im Projekt nicht abrufbar
    expect((await server.app.inject({ method: 'GET', url: `/api/projects/${id}/media/${info.id}`, headers: { cookie: read } })).statusCode).toBe(404);

    const client = connect(server, id, edit);
    clients.push(client);
    await client.whenSynced();
    const item = addShowItem(client.doc, 'song', null, { title: 'Lied' });
    addItemMedia(client.doc, item, { ...info, name: 'Playback.mp3', mime: 'audio/mpeg', addedAt: '', addedBy: 'Ralf' }, 'Playback', null);
    await waitFor(() => (server.rooms.peek(id)?.doc.getMap('media').size ?? 0) === 1);

    const full = await server.app.inject({ method: 'GET', url: `/api/projects/${id}/media/${info.id}`, headers: { cookie: read } });
    expect(full.statusCode).toBe(200);
    expect(full.headers['content-type']).toBe('audio/mpeg');
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(full.rawPayload.equals(data)).toBe(true);
    const part = await server.app.inject({ method: 'GET', url: `/api/projects/${id}/media/${info.id}`, headers: { cookie: read, range: 'bytes=100-199' } });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe('bytes 100-199/1000');
    expect(part.rawPayload.equals(data.subarray(100, 200))).toBe(true);
    expect((await server.app.inject({ method: 'GET', url: `/api/projects/${id}/media/${info.id}`, headers: { cookie: read, range: 'bytes=5000-' } })).statusCode).toBe(416);

    // Herunterladen mit Medien (.steckplan.zip)
    const zip = await server.app.inject({ method: 'GET', url: `/api/projects/${id}/download?medien=1`, headers: { cookie: edit } });
    expect(zip.headers['content-type']).toBe('application/zip');
    expect(zip.headers['content-disposition']).toContain('Medien.steckplan.zip');
    const files = unzipSync(new Uint8Array(zip.rawPayload));
    expect(Object.keys(files).sort()).toEqual(['Medien.steckplan', `medien/${info.id}`]);
    expect(Buffer.from(files[`medien/${info.id}`]!).equals(data)).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(files['Medien.steckplan'])).media[0].name).toBe('Playback.mp3');

    // Neues Projekt aus diesem nimmt die Medien mit
    const copy = (await server.app.inject({ method: 'POST', url: `/api/projects/${id}/copy`, headers: { cookie: edit }, payload: { name: 'Kopie' } })).json() as { id: string };
    await waitFor(async () => ((await server.store.load(copy.id).catch(() => null))?.media.length ?? 0) === 1);
    const copied = await server.app.inject({ method: 'GET', url: `/api/projects/${copy.id}/media/${info.id}`, headers: { cookie: read } });
    expect(copied.rawPayload.equals(data)).toBe(true);

    // Lied löst die Datei → nach dem Schließen im Papierkorb; Abrufen eines wieder verwendeten Verweises holt sie zurück
    removeItemMedia(client.doc, item, info.id, null);
    await waitFor(() => (server.rooms.peek(id)?.doc.getMap('media').size ?? 1) === 0);
  });

  it('Aufräumen: nicht verwendete Dateien in den Papierkorb (frische geschützt), zurückholen, endgültig löschen nach 30 Tagen', async () => {
    const { server, id, edit } = await setup();
    const a = await upload(server, id, edit, bytes(5));
    const b = await upload(server, id, edit, bytes(6));
    const media = new MediaStore((pid) => join(server.dataDir, 'media', pid));
    // frisch hochgeladen: geschützt
    expect((await media.collect(id, new Set([a.id]))).trashed).toEqual([]);
    const now = Date.now() + 2 * 60 * 60 * 1000;
    expect(await media.collect(id, new Set([a.id]), undefined, now)).toEqual({ trashed: [b.id], restored: [] });
    expect(existsSync(join(server.dataDir, 'media', id, b.id))).toBe(false);
    // wieder verwendet (z. B. Version wiederhergestellt) → zurück
    expect((await media.collect(id, new Set([a.id, b.id]), undefined, now)).restored).toEqual([b.id]);
    expect(existsSync(join(server.dataDir, 'media', id, b.id))).toBe(true);
    await media.collect(id, new Set([a.id]), undefined, now);
    expect(await media.purge(id, now + 31 * 24 * 60 * 60 * 1000)).toBe(1);
    expect(readdirSync(join(server.dataDir, 'media', id, '.papierkorb'))).toEqual([]);
  });

  it('Range-Kopfzeile auswerten', () => {
    expect(parseRange(undefined, 10)).toBeNull();
    expect(parseRange('bytes=2-', 10)).toEqual({ start: 2, end: 9 });
    expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange('bytes=0-99', 10)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=10-', 10)).toBe('invalid');
    expect(parseRange('items=0-1', 10)).toBe('invalid');
  });
});
