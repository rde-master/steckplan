import dgram from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject, DISCOVERY_REQUEST, parseDiscoveryReply, PLAYER_COOKIE, type PlayerCatalog, type PlayersOverview, type SyncClient } from '@steckplan/core';
import { PlayerStore } from './auth/players';
import { isManagedStore } from './storage/types';
import { connect, login, startTestServer, waitFor, type TestServer } from './test-utils';

let server: TestServer | undefined;
const clients: SyncClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.destroy();
  await server?.close();
  server = undefined;
});

const media = (id: string, mime: string) => ({ id, name: `${id}.bin`, mime, sizeBytes: 10, sha256: `sha-${id}`, addedAt: '', addedBy: '' });

async function setup(udpPort?: number) {
  const players = new PlayerStore();
  server = await startTestServer({ players, ...(udpPort ? { discovery: { port: () => 4321, udpPort } } : {}) });
  if (!isManagedStore(server.store)) throw new Error();
  const project = createEmptyProject({ name: 'Konzert' });
  project.show = {
    items: [{ id: 'song', order: 0, kind: 'song', title: 'Lied', personIds: [], lyricsBackground: { mediaId: 'v1', dim: 0.4, slides: ['v2'], loop: false } } as never],
    sections: [{ id: 's1', itemId: 'song', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'l1', text: 'Hallo' }], backgroundMediaId: 'bild' } as never],
  };
  project.showSettings = { ...project.showSettings, lyricsBackground: { mediaId: 'standard', dim: 0.5 } };
  project.media = [media('v1', 'video/mp4'), media('v2', 'video/webm'), media('bild', 'image/png'), media('standard', 'image/jpeg'), media('audio', 'audio/wav')];
  const id = await server.store.create(project);
  const empty = await server.store.create(createEmptyProject({ name: 'Ohne Regie' }));
  return { server, id, empty, players };
}

/** Koppeln wie ein Player: anfragen, (Regie) zulassen, Schlüssel abholen → Cookie */
async function pair(s: TestServer, name = 'Bühne links', deviceId = 'geraet-1'): Promise<string> {
  const req = await s.app.inject({ method: 'POST', url: '/api/player/pair', payload: { name, deviceId } });
  expect(req.statusCode).toBe(201);
  const { requestId, code } = req.json() as { requestId: string; code: string };
  expect(code).toMatch(/^\d{4}$/);
  const regie = await login(s, 'direction');
  expect((await s.app.inject({ method: 'POST', url: `/api/players/pairing/${requestId}/approve`, headers: { cookie: regie } })).statusCode).toBe(200);
  const done = (await s.app.inject({ method: 'GET', url: `/api/player/pair/${requestId}` })).json() as { state: string; token: string };
  expect(done.state).toBe('approved');
  return `${PLAYER_COOKIE}=${done.token}`;
}

describe('Steckplan Player', () => {
  it('koppeln: Code, offene Anfrage im Führen-Bildschirm, zulassen, Schlüssel einmal abholen; ablehnen', async () => {
    const { server: s } = await setup();
    const regie = await login(s, 'direction');
    const first = (await s.app.inject({ method: 'POST', url: '/api/player/pair', payload: { name: 'Beamer', deviceId: 'b1' } })).json() as { requestId: string; code: string };
    // dieselbe Gerätekennung → dieselbe Anfrage
    const again = (await s.app.inject({ method: 'POST', url: '/api/player/pair', payload: { name: 'Beamer', deviceId: 'b1' } })).json() as { requestId: string; code: string };
    expect(again).toEqual(first);
    const overview = (await s.app.inject({ method: 'GET', url: '/api/players', headers: { cookie: regie } })).json() as PlayersOverview;
    expect(overview.pairing).toEqual([expect.objectContaining({ requestId: first.requestId, name: 'Beamer', code: first.code })]);
    expect(overview.discoverable).toBe(false);
    // ohne Regie keine Übersicht
    expect((await s.app.inject({ method: 'GET', url: '/api/players', headers: { cookie: await login(s, 'read') } })).statusCode).toBe(403);
    expect((await s.app.inject({ method: 'GET', url: `/api/player/pair/${first.requestId}` })).json()).toEqual({ state: 'pending' });

    await s.app.inject({ method: 'POST', url: `/api/players/pairing/${first.requestId}/approve`, headers: { cookie: regie } });
    const done = (await s.app.inject({ method: 'GET', url: `/api/player/pair/${first.requestId}` })).json() as { state: string; token: string };
    expect(done.state).toBe('approved');
    expect(done.token.length).toBeGreaterThan(30);
    // nur einmal
    expect((await s.app.inject({ method: 'GET', url: `/api/player/pair/${first.requestId}` })).statusCode).toBe(404);

    const other = (await s.app.inject({ method: 'POST', url: '/api/player/pair', payload: { name: 'Fremd', deviceId: 'x' } })).json() as { requestId: string };
    await s.app.inject({ method: 'POST', url: `/api/players/pairing/${other.requestId}/reject`, headers: { cookie: regie } });
    expect((await s.app.inject({ method: 'GET', url: `/api/player/pair/${other.requestId}` })).json()).toEqual({ state: 'rejected' });
    expect((await s.app.inject({ method: 'POST', url: '/api/player/pair', payload: { name: '' } })).statusCode).toBe(400);
  });

  it('Player-Zugang: nur lesen; Katalog mit Bildern/Videos des Textfensters; Lebenszeichen, Stand und neu synchronisieren; Entfernen sperrt', async () => {
    const { server: s, id, empty } = await setup();
    const cookie = await pair(s);
    const session = (await s.app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } })).json();
    expect(session).toMatchObject({ name: 'Bühne links', access: 'read', via: 'player' });
    // lesen ja, schreiben nein
    expect((await s.app.inject({ method: 'GET', url: `/api/projects/${id}/download`, headers: { cookie } })).statusCode).toBe(200);
    expect((await s.app.inject({ method: 'POST', url: '/api/projects', headers: { cookie }, payload: { name: 'x' } })).statusCode).toBe(403);
    expect((await s.app.inject({ method: 'POST', url: '/api/players/resync', headers: { cookie } })).statusCode).toBe(403);

    const catalog = (await s.app.inject({ method: 'GET', url: '/api/player/catalog', headers: { cookie } })).json() as PlayerCatalog;
    expect(catalog.projects.map((p) => p.id)).toEqual([id]);
    expect(catalog.projects.map((p) => p.id)).not.toContain(empty);
    expect(catalog.projects[0]).toMatchObject({ name: 'Konzert', items: 1, lines: 1 });
    expect(catalog.projects[0]!.media.map((m) => m.id).sort()).toEqual(['bild', 'standard', 'v1', 'v2']);

    const report = { phase: 'ready', version: '0.45.0', projects: 1, mediaDone: 4, mediaTotal: 4, bytesDone: 40, bytesTotal: 40 };
    const beat = async () => (await s.app.inject({ method: 'POST', url: '/api/player/heartbeat', headers: { cookie }, payload: report })).json() as { resync: boolean; leadProjectId: string | null };
    expect(await beat()).toEqual({ resync: false, leadProjectId: null });
    const regie = await login(s, 'direction');
    const overview = async () => (await s.app.inject({ method: 'GET', url: '/api/players', headers: { cookie: regie } })).json() as PlayersOverview;
    const player = (await overview()).players[0]!;
    expect(player).toMatchObject({ name: 'Bühne links', online: true, report: { phase: 'ready', mediaDone: 4 }, resyncPending: false });

    // neu synchronisieren: einmal abholen
    await s.app.inject({ method: 'POST', url: `/api/players/${player.id}/resync`, headers: { cookie: regie } });
    expect((await overview()).players[0]!.resyncPending).toBe(true);
    expect((await beat()).resync).toBe(true);
    expect((await beat()).resync).toBe(false);

    // wer führt: Projekt im Lebenszeichen und im Stand
    const lead = connect(s, id, regie);
    clients.push(lead);
    await lead.whenSynced();
    lead.sendCue({ itemId: 'song' });
    await waitFor(async () => (await beat()).leadProjectId === id);
    expect((await s.app.inject({ method: 'GET', url: '/api/player/state', headers: { cookie } })).json()).toEqual({ leadProjectId: id });
    lead.sendCue(null);
    await waitFor(async () => (await beat()).leadProjectId === null);

    // entfernen: Schlüssel gilt nicht mehr
    expect((await s.app.inject({ method: 'DELETE', url: `/api/players/${player.id}`, headers: { cookie: regie } })).statusCode).toBe(200);
    expect((await s.app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } })).statusCode).toBe(401);
    expect((await overview()).players).toEqual([]);
  });

  it('erneut koppeln: dasselbe Gerät behält seine Kennung, der alte Schlüssel gilt nicht mehr', async () => {
    const { server: s } = await setup();
    const old = await pair(s, 'Beamer', 'gleich');
    const fresh = await pair(s, 'Beamer 2', 'gleich');
    expect((await s.app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: old } })).statusCode).toBe(401);
    expect((await s.app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: fresh } })).json()).toMatchObject({ name: 'Beamer 2' });
    const overview = (await s.app.inject({ method: 'GET', url: '/api/players', headers: { cookie: await login(s, 'edit') } })).json() as PlayersOverview;
    expect(overview.players).toHaveLength(1);
  });

  it('Suche: antwortet auf den Rundruf mit Kennung und HTTP-Port', async () => {
    const udpPort = 42000 + Math.floor(Math.random() * 1000);
    const { players } = await setup(udpPort);
    const socket = dgram.createSocket('udp4');
    try {
      const reply = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('keine Antwort')), 2000);
        socket.on('message', (msg) => {
          clearTimeout(timer);
          resolve(msg.toString('utf8'));
        });
        socket.bind(0, '127.0.0.1', () => socket.send(DISCOVERY_REQUEST, udpPort, '127.0.0.1'));
      });
      expect(parseDiscoveryReply(reply)).toMatchObject({ app: 'steckplan', id: players.serverId, port: 4321, mode: 'standalone' });
      expect(server!.discovery?.active).toBe(true);
    } finally {
      socket.close();
    }
  });
});
