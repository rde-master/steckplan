import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject, DeviceInstanceSchema } from '@steckplan/core';
import { normalizeBaseUrl } from '../auth/label-qr';
import { scopeAllows } from '../auth/plugin';
import { isManagedStore } from '../storage/types';
import { login, startTestServer, type TestServer } from '../test-utils';

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function setup() {
  server = await startTestServer();
  if (!isManagedStore(server.store)) throw new Error();
  const a = await server.store.create(createEmptyProject({ name: 'Projekt A' }));
  const b = await server.store.create(createEmptyProject({ name: 'Projekt B' }));
  return { server, a, b, edit: await login(server, 'edit') };
}

const cookieOf = (res: { cookies: { name: string; value: string }[] }) => {
  const c = res.cookies.find((x) => x.name === 'steckplan_session');
  return c ? `steckplan_session=${c.value}` : '';
};

describe('QR-Code auf Etiketten', () => {
  it('Einstellungen: lesen alle, ändern nur Bearbeiten; Adresse und Hinweis werden geprüft', async () => {
    const { server, edit } = await setup();
    const read = await login(server, 'read');
    expect((await server.app.inject({ method: 'GET', url: '/api/settings/label-qr', headers: { cookie: read } })).json()).toEqual({ enabled: true, baseUrl: '', hint: 'Aktuelle Informationen finden Sie hier.' });
    expect((await server.app.inject({ method: 'PUT', url: '/api/settings/label-qr', headers: { cookie: read }, payload: { enabled: false } })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'PUT', url: '/api/settings/label-qr', headers: { cookie: edit }, payload: { baseUrl: 'ftp://x' } })).statusCode).toBe(400);
    const ok = await server.app.inject({ method: 'PUT', url: '/api/settings/label-qr', headers: { cookie: edit }, payload: { baseUrl: 'https://steckplan.example.de/', hint: 'Infos hier' } });
    expect(ok.json()).toEqual({ enabled: true, baseUrl: 'https://steckplan.example.de', hint: 'Infos hier' });
    expect(normalizeBaseUrl('http://192.168.1.5:8080')).toBe('http://192.168.1.5:8080');
    expect(normalizeBaseUrl('https://x.de/?a=1')).toBeNull();
  });

  it('Schlüssel: anlegen (nur Bearbeiten), lesen, QR öffnet nur dieses Projekt und nur lesend; erneuern/sperren beendet den Zugang', async () => {
    const { server, a, b, edit } = await setup();
    expect((await server.app.inject({ method: 'GET', url: `/api/projects/${a}/share`, headers: { cookie: edit } })).statusCode).toBe(404);
    const read = await login(server, 'read');
    expect((await server.app.inject({ method: 'POST', url: `/api/projects/${a}/share`, headers: { cookie: read }, payload: {} })).statusCode).toBe(403);
    const { token } = (await server.app.inject({ method: 'POST', url: `/api/projects/${a}/share`, headers: { cookie: edit }, payload: {} })).json() as { token: string };
    expect(token.length).toBeGreaterThan(20);
    // gleicher Schlüssel beim erneuten Anlegen
    expect((await server.app.inject({ method: 'POST', url: `/api/projects/${a}/share`, headers: { cookie: edit }, payload: {} })).json().token).toBe(token);
    expect((await server.app.inject({ method: 'GET', url: `/api/projects/${a}/share`, headers: { cookie: read } })).json().token).toBe(token);

    // Scannen ohne Anmeldung
    const scan = await server.app.inject({ method: 'GET', url: `/s/${token}?g=MH%201` });
    expect(scan.statusCode).toBe(302);
    expect(scan.headers.location).toBe(`/projekt/${a}?ansicht=signalfluss&geraet=MH%201`);
    const qr = cookieOf(scan);
    const session = (await server.app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: qr } })).json();
    expect(session).toMatchObject({ name: 'Gast (QR-Code)', access: 'read' });
    // nur dieses Projekt, nur lesen
    const list = (await server.app.inject({ method: 'GET', url: '/api/projects', headers: { cookie: qr } })).json() as { projects: { id: string }[] };
    expect(list.projects.map((p) => p.id)).toEqual([a]);
    expect((await server.app.inject({ method: 'GET', url: `/api/projects/${a}`, headers: { cookie: qr } })).statusCode).toBe(200);
    expect((await server.app.inject({ method: 'GET', url: `/api/projects/${b}`, headers: { cookie: qr } })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'GET', url: `/api/projects/${b}/download`, headers: { cookie: qr } })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'POST', url: `/api/projects/${a}/check`, headers: { cookie: qr }, payload: { kind: 'device', id: 'x', direction: 'out', status: 'ok' } })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'GET', url: '/api/library', headers: { cookie: qr } })).statusCode).toBe(200);
    // ungültig / gesperrt
    expect((await server.app.inject({ method: 'GET', url: '/s/falsch' })).statusCode).toBe(404);

    // wer schon angemeldet ist, bleibt angemeldet
    const already = await server.app.inject({ method: 'GET', url: `/s/${token}`, headers: { cookie: edit } });
    expect(cookieOf(already)).toBe('');

    // erneuern: alter Code ungültig, QR-Sitzung beendet
    const renewed = (await server.app.inject({ method: 'POST', url: `/api/projects/${a}/share`, headers: { cookie: edit }, payload: { renew: true } })).json().token as string;
    expect(renewed).not.toBe(token);
    expect((await server.app.inject({ method: 'GET', url: `/s/${token}` })).statusCode).toBe(404);
    expect((await server.app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: qr } })).statusCode).toBe(401);
    // Liste in den Einstellungen, sperren über die Kennung
    const links = (await server.app.inject({ method: 'GET', url: '/api/settings/label-qr/links', headers: { cookie: edit } })).json().links as { key: string; name: string }[];
    expect(links.map((l) => l.name)).toEqual(['Projekt A']);
    expect((await server.app.inject({ method: 'PUT', url: '/api/settings/label-qr/links', headers: { cookie: edit }, payload: { key: links[0]!.key, action: 'revoke' } })).json()).toEqual({ ok: true });
    expect((await server.app.inject({ method: 'GET', url: `/s/${renewed}` })).statusCode).toBe(404);
    // ausgeschaltet: auch gültige Schlüssel öffnen nichts
    const again = (await server.app.inject({ method: 'POST', url: `/api/projects/${a}/share`, headers: { cookie: edit }, payload: {} })).json().token as string;
    await server.app.inject({ method: 'PUT', url: '/api/settings/label-qr', headers: { cookie: edit }, payload: { enabled: false } });
    expect((await server.app.inject({ method: 'GET', url: `/s/${again}` })).statusCode).toBe(404);
  });

  it('Helfer: QR-Code eines Geräts mit Person öffnet ihre Helfer-Seite; anmelden geht auch mit der QR-Sitzung', async () => {
    server = await startTestServer();
    if (!isManagedStore(server.store)) throw new Error();
    const base = createEmptyProject({ name: 'Helfer' });
    const device = DeviceInstanceSchema.parse({ id: 'v', templateId: 't', layerId: base.layers[0]!.id, label: 'Vox', personId: 'anna' });
    const a = await server.store.create({ ...base, people: [{ id: 'anna', lastName: 'Muster', firstName: 'Anna', kind: '' }, { id: 'ben', lastName: 'Beispiel', firstName: 'Ben', kind: '' }], devices: [device], gigs: [{ id: 'g1', title: 'Konzert', location: '' }] });
    const b = await server.store.create(createEmptyProject({ name: 'Anderes' }));
    const edit = await login(server, 'edit');
    const { token } = (await server.app.inject({ method: 'POST', url: `/api/projects/${a}/share`, headers: { cookie: edit }, payload: {} })).json() as { token: string };
    const scan = await server.app.inject({ method: 'GET', url: `/s/${token}?g=v` });
    expect(scan.headers.location).toBe(`/projekt/${a}?ansicht=helfer&person=anna`);
    // Link zur persönlichen Seite: ?p=<Person> → als diese Person
    const byLink = await server.app.inject({ method: 'GET', url: `/s/${token}?p=ben` });
    expect(byLink.headers.location).toBe(`/projekt/${a}?ansicht=helfer&person=ben`);
    expect((await server.app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: cookieOf(byLink) } })).json()).toMatchObject({ name: 'Ben Beispiel (QR-Code)', personId: 'ben' });
    expect((await server.app.inject({ method: 'GET', url: `/s/${token}?p=niemand` })).headers.location).toBe(`/projekt/${a}?ansicht=signalfluss`);
    // Gerät ohne Person: wie bisher
    expect((await server.app.inject({ method: 'GET', url: `/s/${token}?g=x` })).headers.location).toBe(`/projekt/${a}?ansicht=signalfluss&geraet=x`);
    const qr = cookieOf(scan);
    expect((await server.app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: qr } })).json()).toMatchObject({ name: 'Anna Muster (QR-Code)', access: 'read', personId: 'anna' });
    const helper = (cookie: string, project: string, payload: object) => server!.app.inject({ method: 'POST', url: `/api/projects/${project}/helper`, headers: { cookie }, payload });
    expect((await helper(qr, a, { gigId: 'g1', personId: 'anna', helps: true, trailerNext: true, note: 'später' })).json()).toEqual({ ok: true });
    const project = (await server.app.inject({ method: 'GET', url: `/api/projects/${a}/download`, headers: { cookie: edit } })).json() as { helperSignups: { personId: string; helps: boolean; trailerNext: boolean; note: string; by: string }[] };
    expect(project.helperSignups).toEqual([expect.objectContaining({ personId: 'anna', helps: true, trailerNext: true, note: 'später', by: 'Anna Muster (QR-Code)' })]);
    expect((await helper(qr, a, { gigId: 'gibts-nicht', personId: 'anna', helps: true })).statusCode).toBe(404);
    expect((await helper(qr, a, { gigId: 'g1', personId: 'anna', helps: 'ja' })).statusCode).toBe(400);
    expect((await helper(qr, b, { gigId: 'g1', personId: 'anna', helps: true })).statusCode).toBe(403);
    // nur für sich selbst: andere Person → 403; Lesen/Regie ohne Person auch; Bearbeiten darf für alle
    expect((await helper(qr, a, { gigId: 'g1', personId: 'ben', helps: true })).statusCode).toBe(403);
    expect((await helper(await login(server, 'read'), a, { gigId: 'g1', personId: 'anna', helps: false })).statusCode).toBe(403);
    expect((await helper(edit, a, { gigId: 'g1', personId: 'ben', helps: true })).statusCode).toBe(200);
    // Etikett eines anderen Geräts derselben Person / ohne Person: Sitzung bleibt, Person bleibt
    expect((await server.app.inject({ method: 'GET', url: `/s/${token}?g=x`, headers: { cookie: qr } })).headers.location).toBe(`/projekt/${a}?ansicht=signalfluss&geraet=x`);
    expect((await server.app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: qr } })).json()).toMatchObject({ personId: 'anna' });
  });

  it('Nachrichten an die Technik: Helfer schreiben, ändern, löschen nur eigene; Bearbeiten alle', async () => {
    server = await startTestServer();
    if (!isManagedStore(server.store)) throw new Error();
    const base = createEmptyProject({ name: 'Nachrichten' });
    const device = DeviceInstanceSchema.parse({ id: 'v', templateId: 't', layerId: base.layers[0]!.id, label: 'Vox', personId: 'anna' });
    const a = await server.store.create({ ...base, people: [{ id: 'anna', lastName: 'Muster', firstName: 'Anna', kind: '' }, { id: 'ben', lastName: 'Beispiel', firstName: 'Ben', kind: '' }], devices: [device] });
    const edit = await login(server, 'edit');
    const { token } = (await server.app.inject({ method: 'POST', url: `/api/projects/${a}/share`, headers: { cookie: edit }, payload: {} })).json() as { token: string };
    const qr = cookieOf(await server.app.inject({ method: 'GET', url: `/s/${token}?g=v` }));
    const call = (cookie: string, method: 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) => server!.app.inject({ method, url: `/api/projects/${a}/messages${url}`, headers: { cookie }, ...(payload ? { payload } : {}) });
    const { id } = (await call(qr, 'POST', '', { personId: 'anna', text: 'Akku leer' })).json() as { id: string };
    expect(id).toBeTruthy();
    expect((await call(qr, 'POST', '', { personId: 'ben', text: 'als Ben' })).statusCode).toBe(403);
    expect((await call(qr, 'POST', '', { personId: 'anna', text: '  ' })).statusCode).toBe(400);
    const ben = (await call(edit, 'POST', '', { personId: 'ben', text: 'von Ben' })).json().id as string;
    expect((await call(qr, 'PUT', `/${ben}`, { text: 'fremd' })).statusCode).toBe(403);
    expect((await call(qr, 'DELETE', `/${ben}`)).statusCode).toBe(403);
    expect((await call(qr, 'PUT', `/${id}`, { text: 'Akku leer, bitte tauschen' })).json()).toEqual({ ok: true });
    expect((await call(edit, 'PUT', `/${id}`, { text: 'Akku getauscht?' })).statusCode).toBe(200);
    const project = (await server.app.inject({ method: 'GET', url: `/api/projects/${a}/download`, headers: { cookie: edit } })).json() as { helperMessages: { id: string; text: string }[] };
    expect(project.helperMessages.find((m) => m.id === id)?.text).toBe('Akku getauscht?');
    expect((await call(qr, 'DELETE', `/${id}`)).json()).toEqual({ ok: true });
    expect((await call(edit, 'DELETE', `/${ben}`)).json()).toEqual({ ok: true });
    expect((await call(edit, 'DELETE', `/${ben}`)).statusCode).toBe(404);
    // Lesen ohne Person: nichts schreiben
    expect((await call(await login(server, 'read'), 'POST', '', { personId: 'anna', text: 'x' })).statusCode).toBe(403);
  });

  it('Bereich einer QR-Sitzung', () => {
    expect(scopeAllows('POST', '/api/projects/p1/messages', 'p1')).toBe(true);
    expect(scopeAllows('PUT', '/api/projects/p1/messages/m1', 'p1')).toBe(true);
    expect(scopeAllows('DELETE', '/api/projects/p1/messages/m1', 'p1')).toBe(true);
    expect(scopeAllows('DELETE', '/api/projects/p1/messages/m1/x', 'p1')).toBe(false);
    expect(scopeAllows('DELETE', '/api/projects/p2/messages/m1', 'p1')).toBe(false);
    expect(scopeAllows('POST', '/api/projects/p1/helper', 'p1')).toBe(true);
    expect(scopeAllows('POST', '/api/projects/p2/helper', 'p1')).toBe(false);
    expect(scopeAllows('GET', '/projekt/p1', 'p1')).toBe(true);
    expect(scopeAllows('GET', '/api/projects/p1/sync', 'p1')).toBe(true);
    expect(scopeAllows('GET', '/api/projects/p10/sync', 'p1')).toBe(false);
    expect(scopeAllows('POST', '/api/projects/p1/check', 'p1')).toBe(false);
    expect(scopeAllows('POST', '/api/auth/logout', 'p1')).toBe(true);
    expect(scopeAllows('GET', '/api/trash', 'p1')).toBe(false);
    expect(scopeAllows('GET', '/api/settings/desktop-keys', 'p1')).toBe(false);
  });
});
