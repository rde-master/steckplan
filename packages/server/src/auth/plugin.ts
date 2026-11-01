// Anmeldung: Bearbeiten- oder Lese-Passwort + eingetippter Name → Sitzung per HttpOnly-Cookie.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { can, type Permission } from '@steckplan/core';
import type { PasswordChecker } from './passwords';
import { LoginRateLimiter } from './rate-limit';
import { normalizeName, SESSION_TTL_MS, type Session, type SessionStore } from './sessions';

export const SESSION_COOKIE = 'steckplan_session';

declare module 'fastify' {
  interface FastifyRequest {
    session: Session | null;
    sessionToken: string | null;
  }
}

export interface AuthOptions {
  sessions: SessionStore;
  /** Ohne Passwörter ist keine Anmeldung per Browser möglich (z. B. Desktop ohne Weboberfläche). */
  passwords: PasswordChecker | null;
  rateLimiter?: LoginRateLimiter;
  /** Wird nach dem Abmelden aufgerufen (z. B. um offene Verbindungen zu trennen). */
  onLogout?: (session: Session) => void;
}

export async function registerAuth(app: FastifyInstance, options: AuthOptions): Promise<void> {
  const { sessions, passwords } = options;
  const limiter = options.rateLimiter ?? new LoginRateLimiter();

  await app.register(fastifyCookie);
  app.decorateRequest('session', null);
  app.decorateRequest('sessionToken', null);

  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    const session = sessions.get(token);
    request.session = session ?? null;
    request.sessionToken = session && token ? token : null;
  });

  app.get('/api/auth/session', async (request, reply) => {
    if (!request.session) return reply.code(401).send({ error: 'Nicht angemeldet', loginAvailable: passwords !== null });
    const { name, access, via } = request.session;
    return { name, access, via };
  });

  app.post<{ Body: { password?: unknown; name?: unknown } }>('/api/auth/login', async (request, reply) => {
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
