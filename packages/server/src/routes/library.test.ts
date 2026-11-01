import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createEmptyProject, createLibraryExport, type Template } from '@steckplan/core';
import { isManagedStore } from '../storage/types';
import { login, startTestServer, waitFor, type TestServer } from '../test-utils';

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function setup() {
  server = await startTestServer();
  return { server, edit: await login(server, 'edit'), read: await login(server, 'read') };
}

const spotInput = {
  kind: 'device',
  name: 'Spot 575',
  manufacturer: 'Lichtbau',
  defaultColor: '#F59E0B',
  shape: { form: 'rect', widthMm: 450, depthMm: 300, heightMm: 600 },
  ports: [
    { id: 'dmx-in', label: 'DMX In', connector: 'XLR 5', direction: 'in', signal: 'DMX' },
    { id: 'dmx-out', label: 'DMX Out', connector: 'XLR 5', direction: 'out', signal: 'DMX' },
  ],
  dmxModes: [{ name: '16 Kanal', channels: 16 }],
  notes: '',
};

describe('Bibliothek: Vorlagen', () => {
  it('startet leer und hat eine eigene Kennung', async () => {
    const { server, read } = await setup();
    const lib = (await server.app.inject({ method: 'GET', url: '/api/library', headers: { cookie: read } })).json();
    expect(lib.templates).toEqual([]);
    expect(lib.libraryId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('legt an, ändert mit Versionsprüfung und löscht', async () => {
    const { server, edit } = await setup();
    const created = await server.app.inject({ method: 'POST', url: '/api/library/templates', headers: { cookie: edit }, payload: { template: spotInput } });
    expect(created.statusCode).toBe(201);
    const t = created.json() as Template;
    expect(t).toMatchObject({ kind: 'device', version: 1, updatedBy: 'Ralf', name: 'Spot 575' });
    expect(t.notes).toBeUndefined(); // leere Texte werden weggelassen

    const updated = await server.app.inject({
      method: 'PUT',
      url: `/api/library/templates/${t.id}`,
      headers: { cookie: edit },
      payload: { template: { ...t, name: 'Spot 700', kind: 'cableType' }, baseVersion: 1 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ name: 'Spot 700', version: 2, kind: 'device' }); // Art bleibt

    // veraltete Version → 409 mit aktuellem Stand
    const stale = await server.app.inject({
      method: 'PUT',
      url: `/api/library/templates/${t.id}`,
      headers: { cookie: edit },
      payload: { template: { ...t, name: 'Alt' }, baseVersion: 1 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toContain('inzwischen von Ralf geändert');
    expect(stale.json().current.version).toBe(2);
    // trotzdem überschreiben
    const forced = await server.app.inject({
      method: 'PUT',
      url: `/api/library/templates/${t.id}`,
      headers: { cookie: edit },
      payload: { template: { ...t, name: 'Erzwungen' }, baseVersion: 1, force: true },
    });
    expect(forced.json()).toMatchObject({ name: 'Erzwungen', version: 3 });

    expect((await server.app.inject({ method: 'DELETE', url: `/api/library/templates/${t.id}`, headers: { cookie: edit } })).statusCode).toBe(200);
    expect(server.library.get().templates).toEqual([]);
  });

  it('prüft Eingaben', async () => {
    const { server, edit } = await setup();
    const post = (template: object) => server.app.inject({ method: 'POST', url: '/api/library/templates', headers: { cookie: edit }, payload: { template } });
    expect((await post({ ...spotInput, name: '  ' })).statusCode).toBe(400);
    expect((await post({ ...spotInput, kind: 'rakete' })).statusCode).toBe(400);
    expect((await post({ ...spotInput, defaultColor: 'rot' })).statusCode).toBe(400);
    expect((await post({ ...spotInput, categoryId: 'gibtsnicht' })).statusCode).toBe(400);
    expect((await post({ ...spotInput, ports: [spotInput.ports[0], spotInput.ports[0]] })).json().error).toMatch(/eindeutige/);
    expect((await post({ ...spotInput, dmxModes: [{ name: 'x', channels: 0 }] })).statusCode).toBe(400);
  });

  it('speichert Multicore-Kabeltypen mit Adern', async () => {
    const { server, edit } = await setup();
    const channels = [
      { id: 's1', label: 'Send 1', connectorA: 'XLR 3 f', connectorB: 'XLR 3 m', direction: 'aToB', signal: 'Audio' },
      { id: 'r1', label: 'Return 1', connectorA: 'XLR 3 m', connectorB: 'XLR 3 f', direction: 'bToA', signal: 'Audio' },
    ];
    const post = (template: object) => server.app.inject({ method: 'POST', url: '/api/library/templates', headers: { cookie: edit }, payload: { template } });
    const ok = await post({ kind: 'cableType', name: 'Multicore 8/8', endALabel: 'Bühne', endBLabel: 'FOH', channels, availableLengthsMm: [30000, 50000] });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ endALabel: 'Bühne', channels: [{ direction: 'aToB' }, { direction: 'bToA' }] });
    expect((await post({ kind: 'cableType', name: 'X', channels: [channels[0], channels[0]] })).json().error).toMatch(/Adern/);
    expect((await post({ kind: 'device', name: 'X', channels })).json().error).toMatch(/nur bei Kabeltypen/);
  });

  it('Lese-Zugang darf nur ansehen', async () => {
    const { server, read } = await setup();
    expect((await server.app.inject({ method: 'POST', url: '/api/library/templates', headers: { cookie: read }, payload: { template: spotInput } })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'POST', url: '/api/library/master/owners', headers: { cookie: read }, payload: { name: 'X' } })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'POST', url: '/api/library/import', headers: { cookie: read }, payload: { data: {} } })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'GET', url: '/api/library/export', headers: { cookie: read } })).statusCode).toBe(200);
  });

  it('verwendete Vorlagen können nicht gelöscht werden', async () => {
    const { server, edit } = await setup();
    const t = (await server.app.inject({ method: 'POST', url: '/api/library/templates', headers: { cookie: edit }, payload: { template: spotInput } })).json() as Template;
    if (!isManagedStore(server.store)) throw new Error();
    const project = createEmptyProject({ name: 'Stadtfest' });
    const id = await server.store.create({ ...project, devices: [{ id: 'd1', templateId: t.id, layerId: project.layers[0]!.id, label: 'Spot 1' }] });
    await server.rooms.get(id); // Öffnen erfasst die Nutzung
    const res = await server.app.inject({ method: 'DELETE', url: `/api/library/templates/${t.id}`, headers: { cookie: edit } });
    expect(res.statusCode).toBe(409);
    expect(res.json().projects).toEqual(['Stadtfest']);
  });
});

describe('Stammdaten', () => {
  it('anlegen, umbenennen, Farbe, archivieren; löschen nur wenn unbenutzt', async () => {
    const { server, edit } = await setup();
    const cat = (await server.app.inject({ method: 'POST', url: '/api/library/master/categories', headers: { cookie: edit }, payload: { name: 'Licht', color: '#F59E0B' } })).json();
    expect(cat).toMatchObject({ name: 'Licht', color: '#f59e0b' });
    const renamed = await server.app.inject({ method: 'PUT', url: `/api/library/master/categories/${cat.id}`, headers: { cookie: edit }, payload: { name: 'Beleuchtung' } });
    expect(renamed.json()).toMatchObject({ name: 'Beleuchtung', color: '#f59e0b' });

    // Vorlage verwendet Kategorie → nicht löschbar
    const t = (await server.app.inject({ method: 'POST', url: '/api/library/templates', headers: { cookie: edit }, payload: { template: { ...spotInput, categoryId: cat.id } } })).json();
    const del = await server.app.inject({ method: 'DELETE', url: `/api/library/master/categories/${cat.id}`, headers: { cookie: edit } });
    expect(del.statusCode).toBe(409);
    expect(del.json().usedBy).toEqual(['Vorlage „Spot 575“']);
    expect(del.json().error).toContain('archivieren');

    // archivieren: bleibt erhalten, für neue Zuordnungen gesperrt
    await server.app.inject({ method: 'PUT', url: `/api/library/master/categories/${cat.id}`, headers: { cookie: edit }, payload: { archived: true } });
    const newTemplate = await server.app.inject({ method: 'POST', url: '/api/library/templates', headers: { cookie: edit }, payload: { template: { ...spotInput, categoryId: cat.id } } });
    expect(newTemplate.statusCode).toBe(400);
    expect(newTemplate.json().error).toContain('archiviert');
    // bestehende Vorlage mit archivierter Kategorie darf weiter gespeichert werden
    const keep = await server.app.inject({ method: 'PUT', url: `/api/library/templates/${t.id}`, headers: { cookie: edit }, payload: { template: { ...t, name: 'Spot X' }, baseVersion: 1 } });
    expect(keep.statusCode).toBe(200);
    // rückgängig
    const unarchived = await server.app.inject({ method: 'PUT', url: `/api/library/master/categories/${cat.id}`, headers: { cookie: edit }, payload: { archived: false } });
    expect(unarchived.json().archived).toBeUndefined();

    const owner = (await server.app.inject({ method: 'POST', url: '/api/library/master/owners', headers: { cookie: edit }, payload: { name: 'Verein', contact: '0170 123' } })).json();
    expect(owner.contact).toBe('0170 123');
    expect((await server.app.inject({ method: 'DELETE', url: `/api/library/master/owners/${owner.id}`, headers: { cookie: edit } })).statusCode).toBe(200);
    expect((await server.app.inject({ method: 'POST', url: '/api/library/master/gibtsnicht', headers: { cookie: edit }, payload: { name: 'x' } })).statusCode).toBe(404);
  });
});

describe('Import/Export', () => {
  it('exportiert und importiert mit Konfliktabfrage', async () => {
    const { server, edit } = await setup();
    const t = (await server.app.inject({ method: 'POST', url: '/api/library/templates', headers: { cookie: edit }, payload: { template: spotInput } })).json() as Template;
    const exported = (await server.app.inject({ method: 'GET', url: '/api/library/export', headers: { cookie: edit } })).json();
    expect(exported.format).toBe('steckplan-library');

    // fremde Datei: geänderte Vorlage + neue Vorlage
    const foreign = createLibraryExport({ ...server.library.get(), libraryId: 'verein' });
    foreign.templates = [{ ...t, name: 'Spot (Verein)' }, { ...t, id: 'neu-1', name: 'Wash' }];
    const first = await server.app.inject({ method: 'POST', url: '/api/library/import', headers: { cookie: edit }, payload: { data: foreign } });
    expect(first.json()).toMatchObject({ status: 'conflicts', additions: 1 });
    expect(first.json().conflicts[0]).toMatchObject({ key: `template:${t.id}`, fields: ['name'] });
    expect(server.library.get().templates).toHaveLength(1); // noch nichts geändert

    const second = await server.app.inject({
      method: 'POST',
      url: '/api/library/import',
      headers: { cookie: edit },
      payload: { data: foreign, resolutions: { [`template:${t.id}`]: 'copy' } },
    });
    expect(second.json()).toMatchObject({ status: 'imported', summary: { added: 1, copied: 1 } });
    expect(server.library.get().templates.map((x) => x.name).sort()).toEqual(['Spot (Verein) (Kopie)', 'Spot 575', 'Wash']);
  });

  it('lehnt fremde Dateien ab', async () => {
    const { server, edit } = await setup();
    const res = await server.app.inject({ method: 'POST', url: '/api/library/import', headers: { cookie: edit }, payload: { data: { foo: 1 } } });
    expect(res.statusCode).toBe(400);
  });
});

describe('Ereignisse', () => {
  it('benachrichtigt alle angemeldeten Clients über Bibliotheksänderungen', async () => {
    const { server, edit, read } = await setup();
    const url = `${server.baseUrl.replace('http', 'ws')}/api/events`;
    const received: unknown[] = [];
    const ws = new WebSocket(url, { headers: { cookie: read } });
    ws.on('message', (data) => received.push(JSON.parse(String(data))));
    await new Promise((r) => ws.on('open', r));
    await waitFor(() => server.events.size === 1);
    await server.app.inject({ method: 'POST', url: '/api/library/master/trailers', headers: { cookie: edit }, payload: { name: 'Anhänger 1' } });
    await waitFor(() => received.length === 1);
    expect(received[0]).toMatchObject({ type: 'library', revision: 1 });
    ws.close();

    const anonymous = new WebSocket(url);
    const code = await new Promise<number>((r) => anonymous.on('close', (c) => r(c)));
    expect(code).toBe(4401);
  });
});
