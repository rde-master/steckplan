// Medien (Regie, M11b): Hochladen in Teilen (fortsetzbar), Abspielen mit Spulen (HTTP Range).
//   POST   /api/projects/:id/media/uploads                 { size, mediaId? } → Upload beginnen
//   GET    /api/projects/:id/media/uploads/:uploadId       → Stand (für Fortsetzen)
//   PUT    /api/projects/:id/media/uploads/:uploadId?offset=N   Rohdaten (application/octet-stream)
//   POST   /api/projects/:id/media/uploads/:uploadId/complete   → { id, sizeBytes, sha256 }
//   DELETE /api/projects/:id/media/uploads/:uploadId       → abbrechen
//   GET    /api/projects/:id/media/:mediaId                → Datei (mit Range)
import { createReadStream } from 'node:fs';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Project } from '@steckplan/core';
import { requireSession } from '../auth/plugin';
import { MediaError, type MediaStore } from '../storage/media-store';
import { ProjectNotFoundError } from '../storage/types';

/** Größe eines Teils beim Hochladen (Client schickt 4 MB, etwas Luft) */
export const MEDIA_CHUNK_LIMIT_BYTES = 8 * 1024 * 1024;

function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof MediaError) return reply.code(error.status).send({ error: error.message, ...(error.received !== undefined ? { received: error.received } : {}) });
  if (error instanceof ProjectNotFoundError) return reply.code(404).send({ error: 'Projekt nicht gefunden' });
  throw error;
}

/** „bytes=100-“ / „bytes=100-199“ / „bytes=-500“ → Bereich oder null (ganze Datei) / 'invalid' */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let start: number;
  let end: number;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}

export function registerMediaRoutes(app: FastifyInstance, deps: { media: MediaStore; project: (id: string) => Promise<Project> }): void {
  const { media } = deps;

  // Rohdaten für die Teile des Uploads
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MEDIA_CHUNK_LIMIT_BYTES }, (_request, body, done) => done(null, body));

  app.post<{ Params: { id: string }; Body: { size?: unknown; mediaId?: unknown } }>('/api/projects/:id/media/uploads', async (request, reply) => {
    if (!requireSession(request, reply, 'editShow')) return reply;
    try {
      await deps.project(request.params.id);
      const size = Number(request.body?.size);
      const mediaId = typeof request.body?.mediaId === 'string' ? request.body.mediaId : undefined;
      return reply.code(201).send(await media.startUpload(request.params.id, { size, mediaId }));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get<{ Params: { id: string; uploadId: string } }>('/api/projects/:id/media/uploads/:uploadId', async (request, reply) => {
    if (!requireSession(request, reply, 'editShow')) return reply;
    try {
      return await media.uploadStatus(request.params.id, request.params.uploadId);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.put<{ Params: { id: string; uploadId: string }; Querystring: { offset?: string } }>('/api/projects/:id/media/uploads/:uploadId', async (request, reply) => {
    if (!requireSession(request, reply, 'editShow')) return reply;
    if (!Buffer.isBuffer(request.body)) return reply.code(415).send({ error: 'Bitte als application/octet-stream senden.' });
    try {
      const received = await media.appendChunk(request.params.id, request.params.uploadId, Number(request.query.offset ?? NaN), request.body);
      return { received };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post<{ Params: { id: string; uploadId: string } }>('/api/projects/:id/media/uploads/:uploadId/complete', async (request, reply) => {
    if (!requireSession(request, reply, 'editShow')) return reply;
    try {
      return await media.completeUpload(request.params.id, request.params.uploadId);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete<{ Params: { id: string; uploadId: string } }>('/api/projects/:id/media/uploads/:uploadId', async (request, reply) => {
    if (!requireSession(request, reply, 'editShow')) return reply;
    try {
      await media.cancelUpload(request.params.id, request.params.uploadId);
      return { ok: true };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get<{ Params: { id: string; mediaId: string } }>('/api/projects/:id/media/:mediaId', async (request, reply) => {
    if (!requireSession(request, reply)) return reply;
    try {
      const project = await deps.project(request.params.id);
      const ref = project.media.find((m) => m.id === request.params.mediaId);
      if (!ref) return reply.code(404).send({ error: 'Datei nicht gefunden' });
      const file = await media.open(request.params.id, ref.id);
      if (!file) return reply.code(404).send({ error: 'Datei fehlt im Medienspeicher' });
      reply.header('Accept-Ranges', 'bytes').header('Content-Type', ref.mime || 'application/octet-stream').header('Cache-Control', 'private, max-age=3600');
      const range = parseRange(request.headers.range, file.size);
      if (range === 'invalid') return reply.code(416).header('Content-Range', `bytes */${file.size}`).send();
      if (!range) return reply.header('Content-Length', file.size).send(createReadStream(file.path));
      return reply
        .code(206)
        .header('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`)
        .header('Content-Length', range.end - range.start + 1)
        .send(createReadStream(file.path, { start: range.start, end: range.end }));
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
