import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { createHealthInfo, type ServerMode } from '@steckplan/core';
import { registerAuth } from './auth/plugin';
import type { PasswordChecker } from './auth/passwords';
import type { LoginRateLimiter } from './auth/rate-limit';
import type { SessionStore } from './auth/sessions';
import { EventHub } from './events/event-hub';
import type { LibraryStore } from './library/library-store';
import type { UsageTracker } from './library/usage-tracker';
import { registerLibraryRoutes } from './routes/library';
import { registerProjectRoutes } from './routes/projects';
import type { ProjectStore } from './storage/types';
import type { VersionStore } from './storage/version-store';
import { RoomManager } from './sync/rooms';

export interface ServerOptions {
  /** Betriebsart: eingebettet in der Desktop-App oder eigenständig (Docker). */
  mode: ServerMode;
  store: ProjectStore;
  versions: VersionStore;
  sessions: SessionStore;
  /** Bibliothek (Vorlagen + Stammdaten) */
  library: LibraryStore;
  /** Welche Projekte welche Vorlagen/Stammdaten verwenden */
  usage: UsageTracker;
  /** Bearbeiten-/Lese-Passwort; null = keine Anmeldung per Browser */
  passwords: PasswordChecker | null;
  /** Ordner mit der gebauten UI (index.html). Fehlt er, wird nur die API ausgeliefert. */
  uiDir?: string;
  /** Fastify-Logger an/aus. Niemals Passwörter oder Projektinhalte loggen. */
  logger?: boolean;
  /** Hinter einem Reverse-Proxy: X-Forwarded-* auswerten (IP für Rate-Limit, https für Cookies) */
  trustProxy?: boolean;
  rateLimiter?: LoginRateLimiter;
  /** Für Tests: Verzögerungen beim Speichern */
  saveDelayMs?: number;
  versionIntervalMs?: number;
  idleMs?: number;
}

export interface SteckplanServer {
  app: FastifyInstance;
  rooms: RoomManager;
  events: EventHub;
}

export async function createServer(options: ServerOptions): Promise<SteckplanServer> {
  const app = Fastify({
    logger: options.logger
      ? { redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] }
      : false,
    trustProxy: options.trustProxy ?? false,
  });

  const rooms = new RoomManager({
    store: options.store,
    versions: options.versions,
    sessions: options.sessions,
    library: options.library,
    usage: options.usage,
    unloadWhenIdle: options.store.kind === 'dataDir',
    idleMs: options.idleMs,
    saveDelayMs: options.saveDelayMs,
    versionIntervalMs: options.versionIntervalMs,
    log: {
      info: (msg) => app.log.info(msg),
      warn: (msg) => app.log.warn(msg),
      error: (msg) => app.log.error(msg),
    },
  });

  const events = new EventHub();
  options.library.onChange((change) => events.broadcast({ type: 'library', ...change }));

  app.addHook('onClose', async () => {
    events.closeAll();
    await rooms.closeAll('Server wird beendet');
    await options.sessions.flush();
    await options.usage.flush();
  });

  app.get('/api/health', async () => createHealthInfo(options.mode));

  await registerAuth(app, {
    sessions: options.sessions,
    passwords: options.passwords,
    rateLimiter: options.rateLimiter,
    onLogout: (session) => {
      rooms.disconnectSession(session.id);
      events.disconnectSession(session.id);
    },
  });

  await app.register(fastifyWebsocket);
  app.get<{ Params: { id: string } }>('/api/projects/:id/sync', { websocket: true }, (socket, request) => {
    rooms.handleConnection(socket, request, request.params.id);
  });

  app.get('/api/events', { websocket: true }, (socket, request) => events.handleConnection(socket, request));

  registerProjectRoutes(app, rooms, options.usage);
  registerLibraryRoutes(app, { library: options.library, usage: options.usage });

  const uiDir = options.uiDir;
  const hasUi = uiDir !== undefined && existsSync(join(uiDir, 'index.html'));
  if (hasUi) {
    await app.register(fastifyStatic, { root: uiDir, wildcard: false });
  }

  // Unbekannte Pfade: API → 404 als JSON; sonst index.html (Single-Page-App).
  app.setNotFoundHandler((request, reply) => {
    if (hasUi && request.method === 'GET' && !request.url.startsWith('/api/')) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Nicht gefunden' });
  });

  return { app, rooms, events };
}
