// Anmeldung: Bearbeiten- oder Lese-Passwort + eingetippter Name → Sitzung per HttpOnly-Cookie.
// Desktop-App mit Server-Verbindung: Desktop-Zugangsschlüssel im Authorization-Header (Bearer),
// Name aus den Einstellungen der Desktop-App im Header X-Steckplan-Name (URL-kodiert).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { can, PLAYER_COOKIE, type Permission } from '@steckplan/core';
import type { DesktopKeyStore } from './desktop-keys';
import type { PlayerStore } from './players';
import type { PasswordChecker } from './passwords';
import { LoginRateLimiter } from './rate-limit';
import { normalizeName, SESSION_TTL_MS, type Session, type SessionStore } from './sessions';

export const SESSION_COOKIE = 'steckplan_session';
export const NAME_HEADER = 'x-steckplan-name';

/** Sitzungs-id für alle Verbindungen eines Desktop-Zugangsschlüssels (Widerruf trennt sie). */
export function keySessionId(keyId: string): string {
  return `key:${keyId}`;
}

declare module 'fastify' {
  interface FastifyRequest {
    session: Session | null;
    sessionToken: string | null;
    /** Authorization-Header vorhanden, aber Schlüssel ungültig/widerrufen bzw. zu viele Fehlversuche */
    keyRejected: 'invalid' | 'rateLimited' | null;
  }
}

export interface AuthOptions {
  sessions: SessionStore;
  /**
   * Ohne Passwörter ist keine Anmeldung per Browser möglich (z. B. Desktop ohne Weboberfläche).
   * Als Funktion: wird bei jeder Anmeldung neu gefragt (Desktop: Weboberfläche an/aus, Passwörter geändert).
   */
  passwords: PasswordChecker | null | (() => PasswordChecker | null);
  rateLimiter?: LoginRateLimiter;
  /** Wird nach dem Abmelden aufgerufen (z. B. um offene Verbindungen zu trennen). */
  onLogout?: (session: Session) => void;
  /** Desktop-Zugangsschlüssel (nur Docker-Server) */
  desktopKeys?: DesktopKeyStore;
  /** Gekoppelte Player (Zugang per Cookie mit ihrem Schlüssel, nur lesen) */
  players?: PlayerStore;
}

/** Sitzungs-id aller Verbindungen eines Players (Entfernen trennt sie). */
export function playerSessionId(playerId: string): string {
  return `player:${playerId}`;
}

function nameFromHeader(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;
  try {
    return normalizeName(decodeURIComponent(value));
  } catch {
    return null;
  }
}

export async function registerAuth(app: FastifyInstance, options: AuthOptions): Promise<void> {
  const { sessions } = options;
  const currentPasswords = (): PasswordChecker | null => (typeof options.passwords === 'function' ? options.passwords() : options.passwords);
  const limiter = options.rateLimiter ?? new LoginRateLimiter();

  await app.register(fastifyCookie);
  app.decorateRequest('session', null);
  app.decorateRequest('sessionToken', null);
  app.decorateRequest('keyRejected', null);

  app.addHook('onRequest', async (request) => {
    const authorization = request.headers.authorization;
    if (options.desktopKeys && typeof authorization === 'string' && /^Bearer /i.test(authorization)) {
      // Desktop-Zugangsschlüssel: Cookies werden dann nicht beachtet
      request.session = null;
      request.sessionToken = null;
      if (limiter.retryAfter(request.ip) > 0) {
        request.keyRejected = 'rateLimited';
        return;
      }
      const entry = options.desktopKeys.verify(authorization.slice(7).trim());
      if (!entry) {
        limiter.fail(request.ip);
        request.keyRejected = 'invalid';
        return;
      }
      const now = new Date().toISOString();
      request.session = {
        id: keySessionId(entry.id),
        name: nameFromHeader(request.headers[NAME_HEADER]) ?? entry.label,
        access: entry.access,
        via: 'desktopKey',
        createdAt: entry.createdAt,
        lastSeenAt: now,
      };
      return;
    }
    const token = request.cookies[SESSION_COOKIE];
    const session = sessions.get(token);
    request.session = session ?? null;
    request.sessionToken = session && token ? token : null;
    // Player: eigener Schlüssel im Cookie – nur lesen
    if (!session && options.players) {
      const player = options.players.verify(request.cookies[PLAYER_COOKIE]);
      if (player) {
        request.session = { id: playerSessionId(player.id), name: player.name, access: 'read', via: 'player', createdAt: player.pairedAt, lastSeenAt: new Date().toISOString() };
      }
    }
  });

  // Player: nur lesen (Oberfläche, Projekte, Medien) und Lebenszeichen
  app.addHook('onRequest', async (request, reply) => {
    if (request.session?.via !== 'player') return;
    if (request.method === 'GET' || request.method === 'HEAD') return;
    if (request.method === 'POST' && request.url.split('?')[0] === '/api/player/heartbeat') return;
    return reply.code(403).send({ error: 'Ein Player darf nur lesen.' });
  });

  // Sitzung per QR-Code (nur ein Projekt): nur lesen, nur dieses Projekt
  app.addHook('onRequest', async (request, reply) => {
    const scope = request.session?.scope;
    if (scope && !scopeAllows(request.method, request.url, scope.projectId)) {
      return reply.code(403).send({ error: 'Dieser Zugang gilt nur für ein Projekt (nur lesen).' });
    }
  });

  app.get('/api/auth/session', async (request, reply) => {
    if (!request.session) {
      return reply.code(401).send({
        error: request.keyRejected === 'rateLimited' ? 'Zu viele Fehlversuche.' : request.keyRejected ? 'Desktop-Zugangsschlüssel ungültig oder widerrufen.' : 'Nicht angemeldet',
        loginAvailable: currentPasswords() !== null,
        ...(request.keyRejected ? { keyRejected: request.keyRejected } : {}),
      });
    }
    const { name, access, via, scope } = request.session;
    return { name, access, via, ...(scope?.personId ? { personId: scope.personId } : {}) };
  });

  app.post<{ Body: { password?: unknown; name?: unknown } }>('/api/auth/login', async (request, reply) => {
    const passwords = currentPasswords();
    if (!passwords) return reply.code(404).send({ error: 'Anmeldung ist hier nicht verfügbar.' });

    const retry = limiter.retryAfter(request.ip);
    if (retry > 0) {
      return reply
        .code(429)
        .header('Retry-After', String(retry))
        .send({ error: `Zu viele Fehlversuche. Bitte in ${Math.ceil(retry / 60)} Minuten erneut versuchen.` });
    }

    const name = normalizeName(request.body?.name);
    if (!name) return reply.code(400).send({ error: 'Bitte einen Namen (1–40 Zeichen) eingeben.' });
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const access = password ? passwords.check(password) : null;
    if (!access) {
      limiter.fail(request.ip);
      return reply.code(401).send({ error: 'Passwort ist falsch.' });
    }
    limiter.succeed(request.ip);

    const old = request.cookies[SESSION_COOKIE];
    if (old) sessions.delete(old);
    const { token, session } = sessions.create(name, access, 'browser');
    setSessionCookie(reply, token, request.protocol === 'https');
    return { name: session.name, access: session.access, via: session.via };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    sessions.delete(request.cookies[SESSION_COOKIE]);
    if (request.session) options.onLogout?.(request.session);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}

/** Was eine auf ein Projekt beschränkte Sitzung (QR-Code) aufrufen darf */
export function scopeAllows(method: string, url: string, projectId: string): boolean {
  const path = url.split('?')[0]!;
  if (!path.startsWith('/api/')) return true; // Oberfläche
  if (path === '/api/auth/session' || path === '/api/auth/logout' || path === '/api/health') return true;
  const own = `/api/projects/${encodeURIComponent(projectId)}`;
  // Helfer melden sich über den QR-Code ihres Geräts an und ab
  if (method === 'POST' && path === `${own}/helper`) return true;
  // … und schreiben der Technik (eigene Nachrichten; geprüft in der Route)
  if (method === 'POST' && path === `${own}/messages`) return true;
  // … und Empfang / Rückgabe der Technik bestätigen
  if (method === 'POST' && path === `${own}/handover`) return true;
  if ((method === 'PUT' || method === 'DELETE') && /^\/[^/]+$/.test(path.slice(`${own}/messages`.length)) && path.startsWith(`${own}/messages/`)) return true;
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (path === '/api/events' || path === '/api/projects' || path === '/api/settings/label-qr') return true;
  if (path === '/api/library' || path.startsWith('/api/library/')) return true;
  return path === own || path.startsWith(`${own}/`);
}

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/** Prüft Anmeldung und Recht; sendet 401/403 und gibt null zurück, wenn es fehlt. */
export function requireSession(request: FastifyRequest, reply: FastifyReply, permission?: Permission): Session | null {
  const session = request.session;
  if (!session) {
    void reply.code(401).send({ error: 'Nicht angemeldet' });
    return null;
  }
  if (permission && !can(session.access, permission)) {
    void reply.code(403).send({ error: 'Dafür ist der Bearbeiten-Zugang nötig.' });
    return null;
  }
  return session;
}
