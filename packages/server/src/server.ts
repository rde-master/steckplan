import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { keepAlive } from './keepalive';
import { createHealthInfo, type ServerMode } from '@steckplan/core';
import { registerAuth } from './auth/plugin';
import type { PasswordChecker } from './auth/passwords';
import type { LoginRateLimiter } from './auth/rate-limit';
import type { DesktopKeyStore } from './auth/desktop-keys';
import { keySessionId } from './auth/plugin';
import type { Session, SessionStore } from './auth/sessions';
import { EventHub } from './events/event-hub';
import type { LibraryStore } from './library/library-store';
import type { UsageTracker } from './library/usage-tracker';
import { registerLibraryRoutes } from './routes/library';
import { registerProjectRoutes } from './routes/projects';
import { registerSettingsRoutes } from './routes/settings';
import type { ProjectStore } from './storage/types';
import type { MediaStore } from './storage/media-store';
import { registerMediaRoutes } from './routes/media';
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
  /** Bearbeiten-/Lese-Passwort; null = keine Anmeldung per Browser; Funktion = zur Laufzeit veränderlich */
  passwords: PasswordChecker | null | (() => PasswordChecker | null);
  /** Ordner mit der gebauten UI (index.html). Fehlt er, wird nur die API ausgeliefert. */
  uiDir?: string;
  /** Fastify-Logger an/aus. Niemals Passwörter oder Projektinhalte loggen. */
  logger?: boolean;
  /** Hinter einem Reverse-Proxy: X-Forwarded-* auswerten (IP für Rate-Limit, https für Cookies) */
  trustProxy?: boolean;
  rateLimiter?: LoginRateLimiter;
  /** Desktop-Zugangsschlüssel (nur Docker-Server) */
  desktopKeys?: DesktopKeyStore;
  /** Medienspeicher (Regie: Audiodateien); fehlt er, gibt es keine Medien-Routen */
  media?: MediaStore;
  /** Für Tests: Verzögerungen beim Speichern */
  saveDelayMs?: number;
  versionIntervalMs?: number;
  idleMs?: number;
  stampDelayMs?: number;
  changeLogWindowMs?: number;
  /** Abstand der Lebenszeichen (Ping) auf WebSocket-Verbindungen; 0 = aus. Standard 25 s */
  keepAliveMs?: number;
}

export interface ConnectedPerson {
  sessionId: string;
  name: string;
  access: Session['access'];
  via: Session['via'];
  /** Namen der geöffneten Projekte */
  projects: string[];
}

export interface SteckplanServer {
  app: FastifyInstance;
  rooms: RoomManager;
  events: EventHub;
  /** Wer ist gerade verbunden (Browser/Handy)? */
  connectedPeople(): ConnectedPerson[];
  /** Sitzungen beenden und Verbindungen trennen (z. B. „Trennen“ oder Weboberfläche beendet). */
  endSessions(predicate: (session: Session) => boolean, reason: string): number;
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
    stampDelayMs: options.stampDelayMs,
    changeLogWindowMs: options.changeLogWindowMs,
    // nach dem Schließen: nicht mehr verwendete Medien in den Papierkorb, alte Papierkorb-Einträge löschen
    ...(options.media
      ? {
          onClosed: async (id: string, referenced: ReadonlySet<string>) => {
            await options.media!.collect(id, referenced);
            await options.media!.purge(id);
          },
        }
      : {}),
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
    await options.desktopKeys?.flush();
  });

  app.get('/api/health', async () => createHealthInfo(options.mode));

  await registerAuth(app, {
    sessions: options.sessions,
    passwords: options.passwords,
    rateLimiter: options.rateLimiter,
    ...(options.desktopKeys ? { desktopKeys: options.desktopKeys } : {}),
    onLogout: (session) => {
      rooms.disconnectSession(session.id);
      events.disconnectSession(session.id);
    },
  });

  await app.register(fastifyWebsocket);
  // Lebenszeichen, damit Reverse-Proxys ruhende Verbindungen nicht trennen (sonst Neuverbinden und kurzes Flackern)
  app.get<{ Params: { id: string } }>('/api/projects/:id/sync', { websocket: true }, (socket, request) => {
    keepAlive(socket, options.keepAliveMs);
    rooms.handleConnection(socket, request, request.params.id);
  });

  app.get('/api/events', { websocket: true }, (socket, request) => {
    keepAlive(socket, options.keepAliveMs);
    events.handleConnection(socket, request);
  });

  registerProjectRoutes(app, rooms, options.usage, options.media);
  if (options.media) {
    registerMediaRoutes(app, {
      media: options.media,
      project: async (id) => {
        const room = rooms.peek(id);
        return room ? room.currentProject() : options.store.load(id);
      },
    });
  }
  registerLibraryRoutes(app, { library: options.library, usage: options.usage });
  if (options.desktopKeys) {
    registerSettingsRoutes(app, {
      desktopKeys: options.desktopKeys,
      // Widerruf trennt alle Verbindungen dieses Schlüssels sofort
      onRevoke: (keyId) => {
        rooms.disconnectSession(keySessionId(keyId), 'Der Desktop-Zugangsschlüssel wurde widerrufen.');
        events.disconnectSession(keySessionId(keyId));
      },
    });
  }

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

  function connectedPeople(): ConnectedPerson[] {
    const people = new Map<string, ConnectedPerson>();
    const sessionsById = new Map(options.sessions.list().map((s) => [s.id, s]));
    const add = (sessionId: string, project?: string) => {
      const session = sessionsById.get(sessionId);
      if (!session || session.via === 'desktop') return;
      const person = people.get(sessionId) ?? { sessionId, name: session.name, access: session.access, via: session.via, projects: [] };
      if (project && !person.projects.includes(project)) person.projects.push(project);
      people.set(sessionId, person);
    };
    for (const sessionId of events.sessionIds()) add(sessionId);
    for (const { sessionId, project } of rooms.connectedSessions()) add(sessionId, project);
    return [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  function endSessions(predicate: (session: Session) => boolean, reason: string): number {
    const removed = options.sessions.deleteWhere(predicate);
    for (const session of removed) {
      rooms.disconnectSession(session.id, reason);
      events.disconnectSession(session.id);
    }
    return removed.length;
  }

  return { app, rooms, events, connectedPeople, endSessions };
}
