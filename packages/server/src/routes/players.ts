// Steckplan Player: Kopplung, Lebenszeichen, Katalog (was der Player lädt) und Übersicht im Führen-Bildschirm.
//   POST   /api/player/pair                    { name, deviceId } → { requestId, code }   (ohne Anmeldung)
//   GET    /api/player/pair/:requestId          → { state, token? }                        (ohne Anmeldung)
//   GET    /api/player/info                     → { id, name, mode }                       (ohne Anmeldung)
//   POST   /api/player/heartbeat                Stand → { resync, leadProjectId }          (Player)
//   GET    /api/player/state                    → { leadProjectId, version }               (angemeldet)
//   GET    /api/player/catalog                  → Projekte mit Regie und ihre Bilder/Videos (angemeldet)
//   GET    /api/players                         → Übersicht                                (Regie)
//   POST   /api/players/pairing/:requestId/approve | reject                                 (Regie)
//   POST   /api/players/:id/resync, /api/players/resync (alle)                              (Regie)
//   DELETE /api/players/:id                                                                (Regie)
import { hostname } from 'node:os';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { parsePlayerReport, playerCatalogEntry, VERSION, type PlayerCatalog, type Project, type ServerMode } from '@steckplan/core';
import { requireSession } from '../auth/plugin';
import { PlayerError, type PlayerStore } from '../auth/players';
import type { ProjectStore } from '../storage/types';

export interface PlayerRouteDeps {
  players: PlayerStore;
  store: ProjectStore;
  mode: ServerMode;
  /** aktueller Stand eines Projekts (geöffnet: live, sonst gespeichert) */
  project: (id: string) => Promise<Project>;
  leadingProjectId: () => string | null;
  /** antwortet die Steuersoftware gerade auf die Suche? */
  discoverable: () => boolean;
  /** Verbindungen eines entfernten Players trennen */
  disconnect: (playerId: string) => void;
}

function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof PlayerError) return reply.code(error.status).send({ error: error.message });
  throw error;
}

export function registerPlayerRoutes(app: FastifyInstance, deps: PlayerRouteDeps): void {
  const { players } = deps;

  app.get('/api/player/info', async () => ({ id: players.serverId, name: hostname(), mode: deps.mode }));

  app.post<{ Body: { name?: unknown; deviceId?: unknown } }>('/api/player/pair', async (request, reply) => {
    try {
      return reply.code(201).send(players.request(request.body?.name, request.body?.deviceId, request.ip));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get<{ Params: { requestId: string } }>('/api/player/pair/:requestId', async (request, reply) => {
    const state = players.poll(request.params.requestId);
    if (!state) return reply.code(404).send({ error: 'Kopplung abgelaufen – bitte neu anfragen.' });
    return state;
  });

  app.post<{ Body: unknown }>('/api/player/heartbeat', async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return reply;
    if (session.via !== 'player') return reply.code(403).send({ error: 'Nur für Player.' });
    const resync = players.heartbeat(session.id.slice('player:'.length), parsePlayerReport(request.body), request.ip);
    return { resync, leadProjectId: deps.leadingProjectId() };
  });

  app.get('/api/player/state', async (request, reply) => {
    if (!requireSession(request, reply)) return reply;
    // version: damit ein Player nach einem Update der Steuersoftware die Oberfläche neu lädt
    return { leadProjectId: deps.leadingProjectId(), version: VERSION };
  });

  app.get('/api/player/catalog', async (request, reply) => {
    if (!requireSession(request, reply)) return reply;
    const catalog: PlayerCatalog = { projects: [] };
    for (const summary of await deps.store.list()) {
      try {
        const entry = playerCatalogEntry(await deps.project(summary.id));
        if (entry) catalog.projects.push(entry);
      } catch {
        // nicht lesbares Projekt überspringen
      }
    }
    return catalog;
  });

  app.get('/api/players', async (request, reply) => {
    if (!requireSession(request, reply, 'editShow')) return reply;
    return { players: players.status(), pairing: players.pending(), discoverable: deps.discoverable() };
  });

  app.post<{ Params: { requestId: string } }>('/api/players/pairing/:requestId/approve', async (request, reply) => {
    if (!requireSession(request, reply, 'editShow')) return reply;
    const player = await players.approve(request.params.requestId);
    if (!player) return reply.code(404).send({ error: 'Anfrage nicht (mehr) vorhanden.' });
    return { id: player.id, name: player.name };
  });

  app.post<{ Params: { requestId: string } }>('/api/players/pairing/:requestId/reject', async (request, reply) => {
    if (!requireSession(request, reply, 'editShow')) return reply;
    if (!players.reject(request.params.requestId)) return reply.code(404).send({ error: 'Anfrage nicht (mehr) vorhanden.' });
    return { ok: true };
  });

  app.post('/api/players/resync', async (request, reply) => {
    if (!requireSession(request, reply, 'editShow')) return reply;
    players.requestResync();
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/players/:id/resync', async (request, reply) => {
    if (!requireSession(request, reply, 'editShow')) return reply;
    if (!players.requestResync(request.params.id)) return reply.code(404).send({ error: 'Player nicht gefunden.' });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/players/:id', async (request, reply) => {
    if (!requireSession(request, reply, 'editShow')) return reply;
    if (!(await players.remove(request.params.id))) return reply.code(404).send({ error: 'Player nicht gefunden.' });
    deps.disconnect(request.params.id);
    return { ok: true };
  });
}
