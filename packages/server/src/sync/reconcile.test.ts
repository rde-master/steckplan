import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject, type Project, type SyncClient, type Template } from '@steckplan/core';
import { isManagedStore } from '../storage/types';
import { connect, login, sleep, startTestServer, waitFor, type TestServer } from '../test-utils';

let server: TestServer | undefined;
const clients: SyncClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.destroy();
  await server?.close();
  server = undefined;
});

const T0 = '2026-01-01T00:00:00.000Z';
const spot = (overrides: Partial<Template> = {}): Template => ({ id: 'spot', kind: 'device', version: 1, updatedAt: T0, name: 'Spot 575', ...overrides });

function projectUsing(template: Template, libraryId: string): Project {
  const base = createEmptyProject({ name: 'Fremdprojekt' });
  return {
    ...base,
    libraryId,
    devices: [{ id: 'd1', templateId: template.id, layerId: base.layers[0]!.id, label: 'Spot 1' }],
    templateSnapshot: [template],
  };
}

async function setupWith(project: Project) {
  server = await startTestServer({ saveDelayMs: 20 });
  if (!isManagedStore(server.store)) throw new Error();
  const id = await server.store.create(project);
  return { server, id, edit: await login(server, 'edit'), read: await login(server, 'read') };
}

describe('Vorlagen-Abgleich beim Öffnen', () => {
  it('übernimmt fehlende Vorlagen automatisch und speichert den Snapshot', async () => {
    const { server, id, edit } = await setupWith(projectUsing(spot(), 'fremd'));
    const client = connect(server, id, edit);
    clients.push(client);
    await client.whenSynced();
    expect(client.state.reconcilePending).toBe(false);
    expect(server.library.get().templates.map((t) => t.id)).toEqual(['spot']);

    client.doc.getMap('meta').set('venue', 'x');
    await sleep(150);
    const saved = await server.store.load(id);
    expect(saved.libraryId).toBe(server.library.libraryId);
    expect(saved.templateSnapshot.map((t) => t.id)).toEqual(['spot']);
  });

  it('fremde Bibliothek mit Abweichung: nur lesen, bis entschieden ist', async () => {
    const { server, id, edit, read } = await setupWith(projectUsing(spot({ name: 'Spot (fremd)' }), 'fremd'));
    await server.library.mutate((lib) => ({ library: { ...lib, templates: [spot()] }, result: undefined }));

    const editor = connect(server, id, edit);
    const reader = connect(server, id, read);
    clients.push(editor, reader);
    await Promise.all([editor.whenSynced(), reader.whenSynced()]);
    expect(editor.state).toMatchObject({ reconcilePending: true, readOnly: true });
    expect(editor.state.readOnlyReason).toContain('Vorlagen-Abgleich ausstehend');

    const conflicts = (await server.app.inject({ method: 'GET', url: `/api/projects/${id}/conflicts`, headers: { cookie: read } })).json();
    expect(conflicts.pending).toBe(true);
    expect(conflicts.conflicts[0]).toMatchObject({ key: 'template:spot', fields: ['name'] });

    // Lese-Zugang darf nicht entscheiden
    const denied = await server.app.inject({ method: 'POST', url: `/api/projects/${id}/conflicts`, headers: { cookie: read }, payload: { resolutions: { 'template:spot': 'theirs' } } });
    expect(denied.statusCode).toBe(403);
    // fehlende Entscheidung
    const incomplete = await server.app.inject({ method: 'POST', url: `/api/projects/${id}/conflicts`, headers: { cookie: edit }, payload: { resolutions: {} } });
    expect(incomplete.statusCode).toBe(400);

    const ok = await server.app.inject({ method: 'POST', url: `/api/projects/${id}/conflicts`, headers: { cookie: edit }, payload: { resolutions: { 'template:spot': 'copy' } } });
    expect(ok.statusCode).toBe(200);
    await waitFor(() => editor.state.reconcilePending === false && editor.state.readOnly === false);
    await waitFor(() => (reader.state.notice ?? '').includes('Vorlagen-Abgleich'));

    const copy = server.library.get().templates.find((t) => t.name === 'Spot (fremd) (Kopie)')!;
    expect(copy).toBeDefined();
    // Instanz im Live-Dokument verwendet jetzt die Kopie
    await waitFor(() => (editor.doc.getMap('devices').get('d1') as { get(k: string): unknown })?.get('templateId') === copy.id);
    await sleep(150);
    const saved = await server.store.load(id);
    expect(saved.devices[0]!.templateId).toBe(copy.id);
    expect(saved.libraryId).toBe(server.library.libraryId);
  });

  it('eigene Bibliothek: Bibliothek gilt automatisch, Vorlagen-Änderung erneuert den Snapshot in der Datei', async () => {
    server = await startTestServer({ saveDelayMs: 20 });
    if (!isManagedStore(server.store)) throw new Error();
    const libraryId = server.library.libraryId;
    await server.library.mutate((lib) => ({ library: { ...lib, templates: [spot({ name: 'Neu', version: 2 })] }, result: undefined }));
    const id = await server.store.create(projectUsing(spot({ name: 'Alt' }), libraryId));
    const edit = await login(server, 'edit');
    const client = connect(server, id, edit);
    clients.push(client);
    await client.whenSynced();
    expect(client.state.reconcilePending).toBe(false);

    // Vorlage ändern, während das Projekt offen ist → Datei bekommt neuen Snapshot
    const t = server.library.get().templates[0]!;
    await server.app.inject({ method: 'PUT', url: `/api/library/templates/${t.id}`, headers: { cookie: edit }, payload: { template: { ...t, name: 'Ganz neu' }, baseVersion: t.version } });
    await sleep(150);
    expect((await server.store.load(id)).templateSnapshot[0]!.name).toBe('Ganz neu');
  });
});
