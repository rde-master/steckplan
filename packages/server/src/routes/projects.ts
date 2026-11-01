// REST-Schnittstelle für Projekte, Papierkorb und Versionen.
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  can,
  copyAsNewProject,
  createEmptyProject,
  newId,
  parseProject,
  projectUsage,
  wifiQrPayload,
  type WifiNetwork,
  ProjectFormatError,
  serializeProject,
  withoutSecrets,
  type Project,
  type Resolution,
} from '@steckplan/core';
import QRCode from 'qrcode';
import { requireSession } from '../auth/plugin';
import type { UsageTracker } from '../library/usage-tracker';
import { isManagedStore, ProjectNotFoundError } from '../storage/types';
import type { RoomManager } from '../sync/rooms';

export const UPLOAD_LIMIT_BYTES = 50 * 1024 * 1024;

function notFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ error: 'Projekt nicht gefunden' });
}

/** Dateiname für Downloads (Umlaute erlaubt, unsichere Zeichen ersetzt). */
export function downloadFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || 'Projekt';
  return `${safe}.steckplan`;
}

function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function registerProjectRoutes(app: FastifyInstance, rooms: RoomManager, usage: UsageTracker): void {
  const store = rooms.store;

  async function currentProject(id: string): Promise<Project> {
    const room = rooms.peek(id);
    return room ? room.currentProject() : store.load(id);
  }

  app.get('/api/projects', async (request, reply) => {
    if (!requireSession(request, reply)) return reply;
    return { projects: await store.list(), canManage: isManagedStore(store) };
  });

  app.post<{ Body: { name?: unknown } }>('/api/projects', async (request, reply) => {
    if (!requireSession(request, reply, 'manageProjects')) return reply;
    if (!isManagedStore(store)) return reply.code(405).send({ error: 'Hier können keine Projekte angelegt werden.' });
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
    if (!name || name.length > 120) return reply.code(400).send({ error: 'Bitte einen Projektnamen (1–120 Zeichen) eingeben.' });
    const id = await store.create(createEmptyProject({ name }));
    return reply.code(201).send({ id });
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    if (!requireSession(request, reply)) return reply;
    const summary = (await store.list()).find((p) => p.id === request.params.id);
    if (!summary) return notFound(reply);
    return summary;
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id/download', async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return reply;
    let project: Project;
    try {
      project = await currentProject(request.params.id);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) return notFound(reply);
      throw error;
    }
    if (!can(session.access, 'viewSecrets')) project = withoutSecrets(project);
    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', contentDisposition(downloadFileName(project.meta.name)))
      .send(serializeProject(project));
  });

  app.post('/api/projects/upload', { bodyLimit: UPLOAD_LIMIT_BYTES }, async (request, reply) => {
    if (!requireSession(request, reply, 'manageProjects')) return reply;
    if (!isManagedStore(store)) return reply.code(405).send({ error: 'Hier können keine Projekte hochgeladen werden.' });
    let project: Project;
    try {
      project = parseProject(request.body);
    } catch (error) {
      if (error instanceof ProjectFormatError) return reply.code(400).send({ error: error.message });
      throw error;
    }
    // Hochgeladene Projekte bekommen immer eine neue id (kein Überschreiben vorhandener Projekte).
    // Der Vorlagen-Abgleich (ggf. mit Nachfrage) passiert beim ersten Öffnen.
    const id = await store.create({ ...project, id: newId() });
    usage.record(store.persistentKey(id), project.meta.name, projectUsage(project));
    return reply.code(201).send({ id });
  });

  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const session = requireSession(request, reply, 'manageProjects');
    if (!session) return reply;
    if (!isManagedStore(store)) return reply.code(405).send({ error: 'Hier können keine Projekte gelöscht werden.' });
    await rooms.close(request.params.id, `Das Projekt wurde von ${session.name} gelöscht.`);
    try {
      await store.trash(request.params.id);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) return notFound(reply);
      throw error;
    }
    usage.remove(store.persistentKey(request.params.id));
    return { ok: true };
  });

  app.get('/api/trash', async (request, reply) => {
    if (!requireSession(request, reply, 'manageProjects')) return reply;
    if (!isManagedStore(store)) return { entries: [] };
    return { entries: await store.listTrash() };
  });

  app.post<{ Params: { trashId: string } }>('/api/trash/:trashId/restore', async (request, reply) => {
    if (!requireSession(request, reply, 'manageProjects')) return reply;
    if (!isManagedStore(store)) return reply.code(405).send({ error: 'Nicht verfügbar' });
    try {
      return { id: await store.restoreFromTrash(request.params.trashId) };
    } catch (error) {
      if (error instanceof ProjectNotFoundError) return reply.code(404).send({ error: 'Eintrag nicht gefunden' });
      throw error;
    }
  });

  // ---------- Packliste: Häkchen ----------

  app.post<{ Params: { id: string }; Body: { kind?: unknown; id?: unknown; direction?: unknown; status?: unknown; note?: unknown } }>(
    '/api/projects/:id/check',
    async (request, reply) => {
      const session = requireSession(request, reply, 'checkItems');
      if (!session) return reply;
      const { kind, id, direction, status, note } = request.body ?? {};
      if ((kind !== 'device' && kind !== 'cable') || typeof id !== 'string' || (direction !== 'out' && direction !== 'in')) {
        return reply.code(400).send({ error: 'Ungültige Angaben.' });
      }
      if (status !== null && status !== 'ok' && status !== 'missing' && status !== 'damaged') return reply.code(400).send({ error: 'Ungültiger Status.' });
      if (note !== undefined && (typeof note !== 'string' || note.length > 500)) return reply.code(400).send({ error: 'Notiz zu lang.' });
      let room;
      try {
        room = await rooms.get(request.params.id);
      } catch (error) {
        if (error instanceof ProjectNotFoundError) return notFound(reply);
        throw error;
      }
      try {
        if (!room.applyCheck(kind, id, direction, status, session.name, note as string | undefined)) return reply.code(404).send({ error: 'Objekt nicht gefunden.' });
      } catch (error) {
        return reply.code(409).send({ error: (error as Error).message });
      }
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string }; Body: { direction?: unknown } }>('/api/projects/:id/checks/reset', async (request, reply) => {
    const session = requireSession(request, reply, 'resetChecks');
    if (!session) return reply;
    const direction = request.body?.direction;
    if (direction !== 'out' && direction !== 'in' && direction !== 'both') return reply.code(400).send({ error: 'Ungültige Richtung.' });
    let room;
    try {
      room = await rooms.get(request.params.id);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) return notFound(reply);
      throw error;
    }
    try {
      return { removed: room.resetChecks(direction, session.name) };
    } catch (error) {
      return reply.code(409).send({ error: (error as Error).message });
    }
  });

  // ---------- Geschützter Bereich: WLAN-Passwörter ----------

  async function roomOr404(id: string, reply: FastifyReply) {
    try {
      return await rooms.get(id);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        notFound(reply);
        return null;
      }
      throw error;
    }
  }

  app.get<{ Params: { id: string } }>('/api/projects/:id/secrets', async (request, reply) => {
    if (!requireSession(request, reply, 'viewSecrets')) return reply;
    const room = await roomOr404(request.params.id, reply);
    if (!room) return reply;
    return reply.header('Cache-Control', 'no-store').send(room.getSecrets());
  });

  app.put<{ Params: { id: string; wifiId: string }; Body: { password?: unknown } }>('/api/projects/:id/secrets/wifi/:wifiId', async (request, reply) => {
    if (!requireSession(request, reply, 'viewSecrets')) return reply;
    const password = request.body?.password;
    if (password !== null && (typeof password !== 'string' || password.length > 63)) {
      return reply.code(400).send({ error: 'WLAN-Passwörter haben höchstens 63 Zeichen.' });
    }
    const room = await roomOr404(request.params.id, reply);
    if (!room) return reply;
    if (!room.doc.getMap('wifi').has(request.params.wifiId)) return reply.code(404).send({ error: 'WLAN-Netz nicht gefunden.' });
    try {
      room.setWifiPassword(request.params.wifiId, password === '' ? null : (password as string | null));
    } catch (error) {
      return reply.code(409).send({ error: (error as Error).message });
    }
    return { ok: true };
  });

  /** QR-Code zum Verbinden – erzeugt der Server, damit Lese-Clients das Passwort nie im Klartext erhalten. */
  app.get<{ Params: { id: string; wifiId: string } }>('/api/projects/:id/wifi/:wifiId/qr.svg', async (request, reply) => {
    if (!requireSession(request, reply)) return reply;
    const room = await roomOr404(request.params.id, reply);
    if (!room) return reply;
    const item = room.doc.getMap('wifi').get(request.params.wifiId) as { toJSON(): WifiNetwork } | undefined;
    if (!item) return reply.code(404).send({ error: 'WLAN-Netz nicht gefunden.' });
    const network = item.toJSON();
    const svg = await QRCode.toString(wifiQrPayload(network, room.wifiPassword(network.id)), { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
    return reply.header('Content-Type', 'image/svg+xml').header('Cache-Control', 'no-store').send(svg);
  });

  // ---------- Neues Projekt aus diesem ----------

  app.post<{ Params: { id: string }; Body: { name?: unknown } }>('/api/projects/:id/copy', async (request, reply) => {
    if (!requireSession(request, reply, 'manageProjects')) return reply;
    if (!isManagedStore(store)) return reply.code(405).send({ error: 'Hier können keine Projekte angelegt werden.' });
    let project: Project;
    try {
      project = await currentProject(request.params.id);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) return notFound(reply);
      throw error;
    }
    const name = typeof request.body?.name === 'string' && request.body.name.trim() ? request.body.name.trim().slice(0, 120) : undefined;
    const copy = copyAsNewProject(project, name);
    const id = await store.create(copy);
    usage.record(store.persistentKey(id), copy.meta.name, projectUsage(copy));
    return reply.code(201).send({ id });
  });

  // ---------- Vorlagen-Abgleich ----------

  app.get<{ Params: { id: string } }>('/api/projects/:id/conflicts', async (request, reply) => {
    if (!requireSession(request, reply)) return reply;
    try {
      const room = await rooms.get(request.params.id);
      return { pending: room.reconcilePending, conflicts: room.conflicts() };
    } catch (error) {
      if (error instanceof ProjectNotFoundError) return notFound(reply);
      throw error;
    }
  });

  app.post<{ Params: { id: string }; Body: { resolutions?: Record<string, Resolution> } }>(
    '/api/projects/:id/conflicts',
    async (request, reply) => {
      const session = requireSession(request, reply, 'editProject');
      if (!session) return reply;
      let room;
      try {
        room = await rooms.get(request.params.id);
      } catch (error) {
        if (error instanceof ProjectNotFoundError) return notFound(reply);
        throw error;
      }
      if (!room.reconcilePending) return { ok: true };
      const resolutions = request.body?.resolutions ?? {};
      const valid = Object.values(resolutions).every((r) => r === 'keep' || r === 'theirs' || r === 'copy');
      if (!valid) return reply.code(400).send({ error: 'Ungültige Entscheidung.' });
      try {
        await room.resolveConflicts(resolutions, session.name);
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
      return { ok: true };
    },
  );

  // ---------- Versionen ----------

  async function versionKey(id: string): Promise<string | null> {
    try {
      return (await rooms.get(id)).versionKey;
    } catch (error) {
      if (error instanceof ProjectNotFoundError) return null;
      throw error;
    }
  }

  app.get<{ Params: { id: string } }>('/api/projects/:id/versions', async (request, reply) => {
    if (!requireSession(request, reply)) return reply;
    const key = await versionKey(request.params.id);
    if (!key) return notFound(reply);
    return { versions: await rooms.versions.list(key) };
  });

  app.get<{ Params: { id: string; versionId: string } }>('/api/projects/:id/versions/:versionId', async (request, reply) => {
    if (!requireSession(request, reply)) return reply;
    const key = await versionKey(request.params.id);
    if (!key) return notFound(reply);
    try {
      return withoutSecrets(await rooms.versions.load(key, request.params.versionId));
    } catch {
      return reply.code(404).send({ error: 'Version nicht gefunden' });
    }
  });

  app.post<{ Params: { id: string; versionId: string } }>('/api/projects/:id/versions/:versionId/restore', async (request, reply) => {
    const session = requireSession(request, reply, 'restoreVersion');
    if (!session) return reply;
    let room;
    try {
      room = await rooms.get(request.params.id);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) return notFound(reply);
      throw error;
    }
    if (room.readOnlyReason) return reply.code(409).send({ error: room.readOnlyReason });
    const exists = (await rooms.versions.list(room.versionKey)).some((v) => v.id === request.params.versionId);
    if (!exists) return reply.code(404).send({ error: 'Version nicht gefunden' });
    await room.restoreVersion(request.params.versionId, session.name);
    return { ok: true };
  });
}
