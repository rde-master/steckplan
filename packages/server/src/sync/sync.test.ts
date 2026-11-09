import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { addLightEvent, addOscCommand, addScene, addShowItem, createEmptyProject, readProjectFromYDoc, readShow, type SyncClient } from '@steckplan/core';
import { isManagedStore } from '../storage/types';
import { connect, login, startTestServer, waitFor, type TestServer } from '../test-utils';
import { parseOsc } from '../osc/osc';

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

  it('Regie-Zugang: ändert nur die Regie; Änderungen außerhalb werden verworfen', async () => {
    const { server, id } = await setup();
    const editor = track(connect(server, id, await login(server, 'edit')));
    const regie = track(connect(server, id, await login(server, 'direction')));
    await Promise.all([editor.whenSynced(), regie.whenSynced()]);
    expect(regie.state).toMatchObject({ access: 'direction', readOnly: false });

    const itemId = addShowItem(regie.doc, 'song', null, { title: 'Opener' });
    await waitFor(() => readShow(editor.doc).items.some((i) => i.id === itemId));
    await waitFor(async () => ((await server.store.load(id).catch(() => null))?.show.items.length ?? 0) === 1);

    // außerhalb der Regie (manipulierter oder fehlerhafter Client) → verworfen, mit Hinweis
    regie.doc.getMap('meta').set('name', 'GEHACKT');
    await waitFor(() => regie.state.notice?.includes('außerhalb der Regie') ?? false);
    editor.doc.getMap('meta').set('notes', 'Marker');
    await waitFor(() => regie.doc.getMap('meta').get('notes') === 'Marker');
    expect(editor.doc.getMap('meta').get('name')).toBe('Live');
    expect(server.rooms.peek(id)!.doc.getMap('meta').get('name')).toBe('Live');
    // Änderungsprotokoll mit Regie-Zugang
    const log = (await server.app.inject({ method: 'GET', url: `/api/projects/${id}/changelog`, headers: { cookie: await login(server, 'edit') } })).json().entries as { by: string; access: string; action: string }[];
    expect(log.find((e) => e.by === 'Regina')).toMatchObject({ access: 'direction', action: expect.stringContaining('Regie: Ablauf geändert') });
  });

  it('Vorstellung: Regie führt, alle folgen; Nachzügler bekommen die Stelle; Lesen darf nicht führen; Gehen beendet das Führen', async () => {
    const { server, id } = await setup();
    const regie = track(connect(server, id, await login(server, 'direction', 'Regina')));
    const reader = track(connect(server, id, await login(server, 'read', 'Leo')));
    await Promise.all([regie.whenSynced(), reader.whenSynced()]);
    expect(reader.state.lead).toBeNull();

    regie.sendCue({ itemId: 'song', sceneId: 's2' });
    await waitFor(() => reader.state.lead?.sceneId === 's2');
    expect(reader.state.lead).toMatchObject({ itemId: 'song', sceneId: 's2', name: 'Regina', connectionId: regie.state.connectionId });

    // Lese-Zugang kann nicht übernehmen
    reader.sendCue({ itemId: 'anderes' });
    const late = track(connect(server, id, await login(server, 'edit', 'Tom')));
    await late.whenSynced();
    await waitFor(() => late.state.lead !== null);
    expect(late.state.lead).toMatchObject({ itemId: 'song', sceneId: 's2' });

    // ungültige Stelle wird ignoriert (Verbindung bleibt)
    regie.sendCue({ itemId: '' } as never);
    regie.sendCue({ itemId: 'song', sceneId: 's3' });
    await waitFor(() => reader.state.lead?.sceneId === 's3');

    // Abspielposition: läuft die Wiedergabe, bekommen Nachzügler die weitergerechnete Position
    regie.sendCue({ itemId: 'song', sceneId: 's3', at: 10, playing: true });
    await waitFor(() => reader.state.lead?.at === 10);
    expect(reader.state.lead).toMatchObject({ at: 10, playing: true });
    await new Promise((r) => setTimeout(r, 300));
    const later = track(connect(server, id, await login(server, 'read', 'Lea')));
    await later.whenSynced();
    await waitFor(() => later.state.lead !== null);
    expect(later.state.lead!.at!).toBeGreaterThan(10.25);
    expect(later.state.lead!.at!).toBeLessThan(12);
    // unsinnige Position wird verworfen, die Stelle bleibt gültig
    regie.sendCue({ itemId: 'song', sceneId: 's3', at: -5, playing: true });
    await waitFor(() => reader.state.lead?.at === undefined);
    expect(reader.state.lead).toMatchObject({ sceneId: 's3' });

    // führende Person geht → niemand führt
    regie.destroy();
    await waitFor(() => reader.state.lead === null);
  });

  it('Art-Net: Timecode aus der führenden Stelle, 25 Pakete/s beim Abspielen, einmal beim Anhalten, aus ohne Einstellung', async () => {
    const sent: { host: string; frames: number; sec: number; min: number; hour: number }[] = [];
    server = await startTestServer({ artnet: { send: (p, host) => void sent.push({ host, frames: p[14]!, sec: p[15]!, min: p[16]!, hour: p[17]! }), close: () => undefined } });
    if (!isManagedStore(server.store)) throw new Error();
    const id = await server.store.create(createEmptyProject({ name: 'Live' }));
    const regie = track(connect(server, id, await login(server, 'direction', 'Regina')));
    await regie.whenSynced();
    // ohne Einstellung: nichts
    regie.sendCue({ itemId: 'song', at: 1, playing: true });
    await new Promise((r) => setTimeout(r, 200));
    expect(sent).toHaveLength(0);
    // einschalten: sendet sofort weiter
    regie.doc.getMap('showSettings').set('artnet', { enabled: true, host: '192.168.1.255' });
    await waitFor(() => sent.length >= 10);
    expect(sent[0]!.host).toBe('192.168.1.255');
    expect(sent.at(-1)!.sec).toBeGreaterThanOrEqual(1);
    // Anhalten bei 61,52 s → genau ein Paket 00:01:01:13
    regie.sendCue({ itemId: 'song', at: 61.52, playing: false });
    await waitFor(() => sent.at(-1)!.min === 1);
    const count = sent.length;
    await new Promise((r) => setTimeout(r, 200));
    expect(sent.length).toBe(count);
    expect(sent.at(-1)).toMatchObject({ hour: 0, min: 1, sec: 1, frames: 13 });
    // Timecode getrennt von der Musik („Mit Musik“ aus): Art-Net folgt dem Timecode, nicht der Musik
    regie.sendCue({ itemId: 'song', at: 5, playing: false, tc: { at: 125, playing: false } });
    await waitFor(() => sent.at(-1)!.min === 2);
    expect(sent.at(-1)).toMatchObject({ min: 2, sec: 5, frames: 0 });
    // Führen beenden → kein Senden mehr
    regie.sendCue({ itemId: 'song', at: 0, playing: true });
    await waitFor(() => sent.length > count + 2);
    regie.sendCue(null);
    await new Promise((r) => setTimeout(r, 100));
    const after = sent.length;
    await new Promise((r) => setTimeout(r, 200));
    expect(sent.length).toBe(after);
  });

  it('OSC-Tempo: beim Führen /cmd mit Text, manuelles Tempo vor gespeichertem, nur bei Änderung, „jetzt senden“', async () => {
    const sent: { host: string; port: number; packet: Buffer }[] = [];
    server = await startTestServer({ oscOut: { send: (p, host, port) => void sent.push({ host, port, packet: Buffer.from(p) }), close: () => undefined } });
    if (!isManagedStore(server.store)) throw new Error();
    const id = await server.store.create(createEmptyProject({ name: 'Live' }));
    const cookie = await login(server, 'direction', 'Regina');
    const regie = track(connect(server, id, cookie));
    await regie.whenSynced();
    const items = regie.doc.getMap<Y.Map<unknown>>('showItems');
    const song = new Y.Map<unknown>();
    regie.doc.transact(() => {
      items.set('song', song);
      song.set('id', 'song');
      song.set('kind', 'song');
      song.set('order', 0);
      song.set('bpm', 120);
    });
    const texts = () => sent.map((m) => parseOsc(m.packet)[0]!).map((m) => `${m.address} ${String(m.args[0])}`);
    // ohne Einstellung bzw. ohne Führen: nichts
    regie.sendCue({ itemId: 'song', at: 0, playing: false });
    await new Promise((r) => setTimeout(r, 150));
    expect(sent).toHaveLength(0);
    regie.doc.getMap('showSettings').set('oscBpm', { enabled: true, host: '192.168.1.20', port: 8001, address: '/cmd', command: 'Master 3.1 At BPM {bpm}' });
    await waitFor(() => sent.length === 1);
    expect(sent[0]).toMatchObject({ host: '192.168.1.20', port: 8001 });
    expect(texts()).toEqual(['/cmd Master 3.1 At BPM 120']);
    // gleiche Stelle erneut: nichts Neues
    regie.sendCue({ itemId: 'song', at: 3, playing: true });
    await new Promise((r) => setTimeout(r, 150));
    expect(sent).toHaveLength(1);
    // getappt: manuelles Tempo hat Vorrang, das gespeicherte bleibt
    song.set('manualBpm', 121.46);
    await waitFor(() => sent.length === 2);
    expect(texts()[1]).toBe('/cmd Master 3.1 At BPM 121.5');
    expect(song.get('bpm')).toBe(120);
    // manuelles verworfen → wieder das gespeicherte
    song.delete('manualBpm');
    await waitFor(() => sent.length === 3);
    expect(texts()[2]).toBe('/cmd Master 3.1 At BPM 120');
    // jetzt senden: auch ohne Änderung
    const res = await server.app.inject({ method: 'POST', url: `/api/projects/${id}/osc-bpm`, headers: { cookie } });
    expect(res.json()).toEqual({ sent: 'Master 3.1 At BPM 120' });
    expect(sent).toHaveLength(4);
    // Führen beenden: „jetzt senden“ geht nicht
    regie.sendCue(null);
    await new Promise((r) => setTimeout(r, 100));
    expect((await server.app.inject({ method: 'POST', url: `/api/projects/${id}/osc-bpm`, headers: { cookie } })).statusCode).toBe(409);
  });

  it('OSC-Befehle der Regie: beim Führen mit „OSC senden“ Start, Szene und Event; von Hand per Route; ohne Schalter nichts', async () => {
    const sent: { host: string; port: number; packet: Buffer }[] = [];
    server = await startTestServer({ oscOut: { send: (p, host, port) => void sent.push({ host, port, packet: Buffer.from(p) }), close: () => undefined } });
    if (!isManagedStore(server.store)) throw new Error();
    const id = await server.store.create(createEmptyProject({ name: 'OSC' }));
    const cookie = await login(server, 'direction', 'Regina');
    const regie = track(connect(server, id, cookie));
    await regie.whenSynced();
    const doc = regie.doc;
    const a = addShowItem(doc, 'song', null, { title: 'Erstes' });
    const b = addShowItem(doc, 'song', null, { title: 'Zweites' });
    const scene = addScene(doc, a, null, { name: 'Intro' });
    const event = addLightEvent(doc, a, 0.4, 'Pyro', null);
    doc.getMap('showSettings').set('oscOut', { host: '192.168.1.30', port: 9000 });
    addOscCommand(doc, { itemId: a, trigger: 'item', address: '/a/start', args: '"Go Cue 1"' }, null);
    addOscCommand(doc, { itemId: a, trigger: 'scene', refId: scene, address: '/a/scene' }, null);
    addOscCommand(doc, { itemId: a, trigger: 'event', refId: event, address: '/a/event', args: '1' }, null);
    const manual = addOscCommand(doc, { itemId: a, trigger: 'manual', label: 'Blackout', address: '/a/manual', host: '10.0.0.9', port: 7000 }, null);
    const texts = () => sent.map((m) => { const msg = parseOsc(m.packet)[0]!; return [msg.address, ...msg.args].join(' '); });
    // ohne „OSC senden“: nichts
    regie.sendCue({ itemId: b, at: 0, playing: false });
    await new Promise((r) => setTimeout(r, 150));
    expect(sent).toHaveLength(0);
    // mit Schalter: Wechsel zu A → Start und Szene, beim Abspielen nach 0,4 s das Event
    regie.sendCue({ itemId: a, sceneId: scene, at: 0, playing: true, osc: true });
    await waitFor(() => sent.length >= 2);
    expect(texts().slice(0, 2)).toEqual(['/a/start Go Cue 1', '/a/scene']);
    expect(sent[0]).toMatchObject({ host: '192.168.1.30', port: 9000 });
    await waitFor(() => sent.length >= 3);
    expect(texts()[2]).toBe('/a/event 1');
    // gleiche Stelle erneut: nichts doppelt
    regie.sendCue({ itemId: a, sceneId: scene, at: 1, playing: true, osc: true });
    await new Promise((r) => setTimeout(r, 200));
    expect(sent).toHaveLength(3);
    // von Hand (eigenes Ziel)
    const res = await server.app.inject({ method: 'POST', url: `/api/projects/${id}/osc-commands/${manual}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(sent.at(-1)).toMatchObject({ host: '10.0.0.9', port: 7000 });
    expect(texts().at(-1)).toBe('/a/manual');
    // Protokoll an die Clients
    await waitFor(() => regie.state.oscLog.length === 4);
    expect(regie.state.oscLog[0]).toMatchObject({ source: 'Von Hand (Regina): Blackout', text: '/a/manual', target: '10.0.0.9:7000' });
    expect((await server.app.inject({ method: 'POST', url: `/api/projects/${id}/osc-commands/gibtsnicht`, headers: { cookie } })).statusCode).toBe(404);
  });

  it('Bearbeiter trennt ein verbundenes Gerät: kein automatisches Neuverbinden, nur auf Wunsch; Lesen/Regie dürfen nicht trennen', async () => {
    const { server, id } = await setup();
    const editCookie = await login(server, 'edit', 'Ralf');
    const editor = track(connect(server, id, editCookie));
    const reader = track(connect(server, id, await login(server, 'read', 'Leo')));
    await Promise.all([editor.whenSynced(), reader.whenSynced()]);
    const disconnect = async (cookie: string, connectionId: string) => server.app.inject({ method: 'POST', url: `/api/projects/${id}/connections/${connectionId}/disconnect`, headers: { cookie } });
    // Lesen und Regie dürfen nicht, die eigene Verbindung geht nicht
    expect((await disconnect(await login(server, 'read'), editor.state.connectionId!)).statusCode).toBe(403);
    expect((await disconnect(await login(server, 'direction'), reader.state.connectionId!)).statusCode).toBe(403);
    expect((await disconnect(editCookie, editor.state.connectionId!)).statusCode).toBe(400);
    expect((await disconnect(editCookie, 'gibt-es-nicht')).statusCode).toBe(404);
    // trennen
    expect((await disconnect(editCookie, reader.state.connectionId!)).statusCode).toBe(204);
    await waitFor(() => reader.state.status === 'kicked');
    expect(reader.state.notice).toBe('Die Verbindung wurde von Ralf getrennt.');
    await new Promise((r) => setTimeout(r, 200));
    expect(reader.state.status).toBe('kicked'); // kein automatisches Neuverbinden
    await waitFor(() => editor.state.users.length === 1);
    // bewusst neu verbinden
    reader.reconnect();
    await waitFor(() => reader.state.status === 'synced');
    await waitFor(() => editor.state.users.length === 2);
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
    // war schon abgeglichen → Oberfläche bleibt bedienbar
    expect(b.state.everSynced).toBe(true);
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
