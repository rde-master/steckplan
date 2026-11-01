// REST-Schnittstelle für Projekte, Papierkorb und Versionen.
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  can,
  createEmptyProject,
  newId,
  parseProject,
  ProjectFormatError,
  serializeProject,
  withoutSecrets,
  type Project,
} from '@steckplan/core';
import { requireSession } from '../auth/plugin';
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

export function registerProjectRoutes(app: FastifyInstance, rooms: RoomManager): void {
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
    const id = await store.create({ ...project, id: newId() });
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
