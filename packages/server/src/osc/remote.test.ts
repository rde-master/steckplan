import dgram from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject, type RemoteCommand, type SyncClient } from '@steckplan/core';
import { isManagedStore } from '../storage/types';
import { connect, login, startTestServer, waitFor, type TestServer } from '../test-utils';
import { OscSettingsStore } from './listener';

let server: TestServer | undefined;
const clients: SyncClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.destroy();
  await server?.close();
  server = undefined;
});

function oscString(address: string, text: string): Buffer {
  const pad = (s: string) => {
    const b = Buffer.from(`${s}\0`);
    return Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  };
  return Buffer.concat([pad(address), pad(',s'), pad(text)]);
}

function oscMessage(address: string, int?: number): Buffer {
  const pad = (s: string) => {
    const b = Buffer.from(`${s}\0`);
    return Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  };
  if (int === undefined) return Buffer.concat([pad(address), pad(',')]);
  const v = Buffer.alloc(4);
  v.writeInt32BE(int);
  return Buffer.concat([pad(address), pad(',i'), v]);
}

describe('Fernsteuerung der Vorstellung', () => {
  it('OSC per UDP und HTTP: Befehle kommen in den Projekten an, bevorzugt dort, wo jemand führt', async () => {
    const port = 40000 + Math.floor(Math.random() * 20000);
    const osc = new OscSettingsStore();
    await osc.update({ enabled: true, port });
    server = await startTestServer({ osc });
    if (!isManagedStore(server.store)) throw new Error();
    const a = await server.store.create(createEmptyProject({ name: 'A' }));
    const b = await server.store.create(createEmptyProject({ name: 'B' }));
    const got: Record<string, RemoteCommand[]> = { a: [], b: [] };
    const ca = connect(server, a, await login(server, 'direction', 'Regina'), undefined, (c) => got.a!.push(c));
    const cb = connect(server, b, await login(server, 'edit', 'Ralf'), undefined, (c) => got.b!.push(c));
    clients.push(ca, cb);
    await Promise.all([ca.whenSynced(), cb.whenSynced()]);

    const status = (await server.app.inject({ method: 'GET', url: '/api/settings/osc', headers: { cookie: await login(server, 'read') } })).json();
    expect(status).toMatchObject({ settings: { enabled: true, port }, status: { listening: true, port } });

    // niemand führt: an alle geöffneten Projekte
    const socket = dgram.createSocket('udp4');
    const send = (msg: Buffer) => new Promise<void>((r) => socket.send(msg, port, '127.0.0.1', () => r()));
    await send(oscMessage('/steckplan/play'));
    await waitFor(() => got.a!.length === 1 && got.b!.length === 1);
    expect(got.a![0]).toEqual({ action: 'play' });
    // Taster losgelassen (0): nichts
    await send(oscMessage('/steckplan/play', 0));
    // in A führt jemand: nur noch dorthin
    ca.sendCue({ itemId: 'song' });
    await waitFor(() => ca.state.lead !== null);
    await send(oscMessage('/steckplan/item', 3));
    await waitFor(() => got.a!.length === 2);
    expect(got.a![1]).toEqual({ action: 'item', value: 3 });
    expect(got.b).toHaveLength(1);
    socket.close();

    // HTTP: derselbe Befehl, Lesen darf nicht, Regie darf
    const post = async (cookie: string, body: object) => server!.app.inject({ method: 'POST', url: '/api/remote', headers: { cookie }, payload: body });
    expect((await post(await login(server, 'read'), { action: 'pause' })).statusCode).toBe(403);
    expect((await post(await login(server, 'direction'), { action: 'gibts-nicht' })).statusCode).toBe(400);
    expect((await post(await login(server, 'direction'), { action: 'forward', value: 2, projectId: b })).json()).toEqual({ rooms: 1 });
    await waitFor(() => got.b!.length === 2);
    expect(got.b![1]).toEqual({ action: 'forward', value: 2 });

    // ausschalten (nur Bearbeiten), Port wird frei
    expect((await server.app.inject({ method: 'PUT', url: '/api/settings/osc', headers: { cookie: await login(server, 'direction') }, payload: { enabled: false } })).statusCode).toBe(403);
    const off = (await server.app.inject({ method: 'PUT', url: '/api/settings/osc', headers: { cookie: await login(server, 'edit') }, payload: { enabled: false } })).json();
    expect(off.status.listening).toBe(false);
  });

  it('Lichtpult-Cue als Text per OSC und HTTP: alle geöffneten Projekte bekommen die letzten zehn, auch beim Verbinden', async () => {
    const port = 40000 + Math.floor(Math.random() * 20000);
    const osc = new OscSettingsStore();
    await osc.update({ enabled: true, port });
    server = await startTestServer({ osc });
    if (!isManagedStore(server.store)) throw new Error();
    const a = await server.store.create(createEmptyProject({ name: 'A' }));
    const edit = await login(server, 'edit', 'Ralf');
    const ca = connect(server, a, edit);
    clients.push(ca);
    await ca.whenSynced();
    const socket = dgram.createSocket('udp4');
    await new Promise<void>((r) => socket.send(oscString('/steckplan/cue', 'Cue 12 Intro'), port, '127.0.0.1', () => r()));
    socket.close();
    await waitFor(() => ca.state.deskCues[0]?.text === 'Cue 12 Intro');
    // HTTP: Lesen darf lesen, nicht senden
    const read = await login(server, 'read');
    expect((await server.app.inject({ method: 'POST', url: '/api/desk-cues', headers: { cookie: read }, payload: { text: 'x' } })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'POST', url: '/api/desk-cues', headers: { cookie: edit }, payload: { text: '  ' } })).statusCode).toBe(400);
    for (let i = 1; i <= 11; i++) await server.app.inject({ method: 'POST', url: '/api/desk-cues', headers: { cookie: edit }, payload: { text: `Cue ${i}` } });
    const list = (await server.app.inject({ method: 'GET', url: '/api/desk-cues', headers: { cookie: read } })).json() as { cues: { text: string }[] };
    expect(list.cues.map((c) => c.text)).toEqual(['Cue 11', 'Cue 10', 'Cue 9', 'Cue 8', 'Cue 7', 'Cue 6', 'Cue 5', 'Cue 4', 'Cue 3', 'Cue 2']);
    await waitFor(() => ca.state.deskCues[0]?.text === 'Cue 11');
    // neue Verbindung bekommt den Stand sofort
    const cb = connect(server, a, read);
    clients.push(cb);
    await waitFor(() => cb.state.deskCues.length === 10);
  });
});
