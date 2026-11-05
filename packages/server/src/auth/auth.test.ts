import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EDIT_PASSWORD, login, READ_PASSWORD, startTestServer, type TestServer } from '../test-utils';
import { PasswordChecker, passwordFingerprint } from './passwords';
import { LoginRateLimiter } from './rate-limit';
import { normalizeName, SessionStore, SESSION_TTL_MS } from './sessions';

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('Passwörter', () => {
  it('erkennt Bearbeiten- und Lese-Passwort', () => {
    const checker = new PasswordChecker({ edit: 'a', read: 'b' });
    expect(checker.check('a')).toBe('edit');
    expect(checker.check('b')).toBe('read');
    expect(checker.check('c')).toBeNull();
    expect(checker.check('')).toBeNull();
    expect(checker.hasDirection).toBe(false);
    const withDirection = new PasswordChecker({ edit: 'a', read: 'b', direction: 'r' });
    expect(withDirection.check('r')).toBe('direction');
    expect(withDirection.hasDirection).toBe(true);
  });

  it('Fingerabdruck ändert sich mit den Passwörtern', () => {
    const fp = passwordFingerprint({ edit: 'a', read: 'b' }, 'salt');
    expect(passwordFingerprint({ edit: 'a', read: 'b' }, 'salt')).toBe(fp);
    expect(passwordFingerprint({ edit: 'a', read: 'c' }, 'salt')).not.toBe(fp);
    expect(passwordFingerprint({ edit: 'geheim', read: 'b' }, 'salt')).not.toContain('geheim');
    // ohne Regie-Passwort unverändert (bestehende Sitzungen bleiben), mit Regie-Passwort anders
    expect(passwordFingerprint({ edit: 'a', read: 'b', direction: undefined }, 'salt')).toBe(fp);
    expect(passwordFingerprint({ edit: 'a', read: 'b', direction: 'r' }, 'salt')).not.toBe(fp);
  });
});

describe('Namen', () => {
  it('bereinigt und prüft eingetippte Namen', () => {
    expect(normalizeName('  Ralf   Müller ')).toBe('Ralf Müller');
    expect(normalizeName('')).toBeNull();
    expect(normalizeName('   ')).toBeNull();
    expect(normalizeName('x'.repeat(41))).toBeNull();
    expect(normalizeName('a\u0007b')).toBeNull();
    expect(normalizeName(42)).toBeNull();
  });
});

describe('Sitzungen', () => {
  it('laufen nach 30 Tagen ab und verlängern sich bei Benutzung', () => {
    let now = Date.parse('2026-11-01T10:00:00Z');
    const sessions = new SessionStore({ now: () => now });
    const { token } = sessions.create('Ralf', 'edit', 'browser');
    now += SESSION_TTL_MS - 1000;
    expect(sessions.get(token)?.name).toBe('Ralf'); // verlängert
    now += SESSION_TTL_MS - 1000;
    expect(sessions.get(token)?.name).toBe('Ralf');
    now += SESSION_TTL_MS + 1000;
    expect(sessions.get(token)).toBeUndefined();
  });

  it('lokale Desktop-Sitzungen laufen nicht ab und werden nicht gespeichert', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sess-')), 'sessions.json');
    let now = Date.now();
    const sessions = new SessionStore({ file, now: () => now });
    await sessions.load(() => 'fp');
    const { token } = sessions.create('Ralf', 'local', 'desktop', { persistent: false, expires: false });
    now += 10 * SESSION_TTL_MS;
    expect(sessions.get(token)?.access).toBe('local');
    await sessions.flush();
    expect(JSON.parse(readFileSync(file, 'utf8')).sessions).toEqual([]);
  });

  it('bleiben über einen Neustart erhalten, werden bei Passwortänderung aber verworfen', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sess-')), 'sessions.json');
    const first = new SessionStore({ file });
    await first.load((salt) => passwordFingerprint({ edit: 'a', read: 'b' }, salt));
    const { token } = first.create('Ralf', 'edit', 'browser');
    await first.flush();
    expect(readFileSync(file, 'utf8')).not.toContain(token);

    const restarted = new SessionStore({ file });
    await restarted.load((salt) => passwordFingerprint({ edit: 'a', read: 'b' }, salt));
    expect(restarted.get(token)?.name).toBe('Ralf');

    const changed = new SessionStore({ file });
    await changed.load((salt) => passwordFingerprint({ edit: 'neu', read: 'b' }, salt));
    expect(changed.get(token)).toBeUndefined();
  });
});

describe('Rate-Limit', () => {
  it('sperrt nach zu vielen Fehlversuchen und gibt nach Ablauf wieder frei', () => {
    let now = 0;
    const limiter = new LoginRateLimiter({ maxFailures: 2, windowMs: 1000, now: () => now });
    limiter.fail('1.2.3.4');
    expect(limiter.retryAfter('1.2.3.4')).toBe(0);
    limiter.fail('1.2.3.4');
    expect(limiter.retryAfter('1.2.3.4')).toBe(1);
    expect(limiter.retryAfter('5.6.7.8')).toBe(0);
    now = 1001;
    expect(limiter.retryAfter('1.2.3.4')).toBe(0);
  });
});

describe('Anmelde-Routen', () => {
  it('meldet mit Bearbeiten-Passwort an und setzt ein sicheres Cookie', async () => {
    server = await startTestServer();
    const res = await server.app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: EDIT_PASSWORD, name: ' Ralf ' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: 'Ralf', access: 'edit', via: 'browser' });
    const header = String(res.headers['set-cookie']);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).toMatch(/Max-Age=2592000/);
  });

  it('meldet mit Lese-Passwort als Lese-Zugang an', async () => {
    server = await startTestServer();
    const cookie = await login(server, 'read');
    const res = await server.app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    expect(res.json()).toMatchObject({ name: 'Anna', access: 'read' });
  });

  it('meldet mit Regie-Passwort als Regie-Zugang an', async () => {
    server = await startTestServer();
    const cookie = await login(server, 'direction');
    const res = await server.app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    expect(res.json()).toMatchObject({ name: 'Regina', access: 'direction' });
    // darf keine Projekte anlegen und keine Schlüssel verwalten
    expect((await server.app.inject({ method: 'POST', url: '/api/projects', headers: { cookie }, payload: { name: 'X' } })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'GET', url: '/api/settings/desktop-keys', headers: { cookie } })).statusCode).toBe(403);
  });

  it('lehnt falsche Passwörter und fehlende Namen ab', async () => {
    server = await startTestServer();
    expect((await server.app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'falsch', name: 'X' } })).statusCode).toBe(401);
    expect((await server.app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: READ_PASSWORD, name: '' } })).statusCode).toBe(400);
  });

  it('begrenzt Fehlversuche pro IP', async () => {
    server = await startTestServer();
    for (let i = 0; i < 3; i++) {
      await server.app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'falsch', name: 'X' } });
    }
    const res = await server.app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: EDIT_PASSWORD, name: 'X' } });
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('meldet ab', async () => {
    server = await startTestServer();
    const cookie = await login(server, 'edit');
    await server.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    const res = await server.app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ loginAvailable: true });
  });

  it('ohne Passwörter ist keine Anmeldung möglich', async () => {
    server = await startTestServer({ passwords: null });
    expect((await server.app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'x', name: 'X' } })).statusCode).toBe(404);
    expect((await server.app.inject({ method: 'GET', url: '/api/auth/session' })).json()).toMatchObject({ loginAvailable: false });
  });
});
