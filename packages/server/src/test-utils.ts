// Hilfen für Server-Tests: Server mit temporärem Datenordner, Anmeldung, Sync-Clients.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { SyncClient, type SocketLike } from '@steckplan/core';
import { PasswordChecker } from './auth/passwords';
import { LoginRateLimiter } from './auth/rate-limit';
import { SessionStore } from './auth/sessions';
import { createServer, type ServerOptions, type SteckplanServer } from './server';
import { DataDirProjectStore } from './storage/data-dir-store';
import { VersionStore } from './storage/version-store';
import type { ProjectStore } from './storage/types';

export const EDIT_PASSWORD = 'bearbeiten-geheim';
export const READ_PASSWORD = 'lesen-geheim';

export interface TestServer extends SteckplanServer {
  baseUrl: string;
  dataDir: string;
  sessions: SessionStore;
  store: ProjectStore;
  versions: VersionStore;
  close(): Promise<void>;
}

export async function startTestServer(overrides: Partial<ServerOptions> = {}): Promise<TestServer> {
  const dataDir = mkdtempSync(join(tmpdir(), 'steckplan-server-'));
  let store = overrides.store;
  if (!store) {
    const dataStore = new DataDirProjectStore(dataDir);
    await dataStore.init();
    store = dataStore;
  }
  const versions = overrides.versions ?? new VersionStore(join(dataDir, 'versions'));
  const sessions = overrides.sessions ?? new SessionStore();
  const server = await createServer({
    mode: 'standalone',
    store,
    versions,
    sessions,
    passwords: new PasswordChecker({ edit: EDIT_PASSWORD, read: READ_PASSWORD }),
    rateLimiter: new LoginRateLimiter({ maxFailures: 3 }),
    saveDelayMs: 20,
    idleMs: 50,
    ...overrides,
  });
  await server.app.listen({ host: '127.0.0.1', port: 0 });
  const address = server.app.server.address();
  if (!address || typeof address === 'string') throw new Error('keine Adresse');
  return {
    ...server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    dataDir,
    sessions,
    store,
    versions,
    close: () => server.app.close(),
  };
}

/** Meldet sich an und gibt den Cookie-Header zurück. */
export async function login(server: TestServer, access: 'edit' | 'read', name = access === 'edit' ? 'Ralf' : 'Anna'): Promise<string> {
  const res = await server.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password: access === 'edit' ? EDIT_PASSWORD : READ_PASSWORD, name },
  });
  if (res.statusCode !== 200) throw new Error(`Login fehlgeschlagen: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'steckplan_session');
  if (!cookie) throw new Error('kein Cookie');
  return `steckplan_session=${cookie.value}`;
}

export function connect(server: TestServer, projectId: string, cookie: string | null, doc = new Y.Doc()): SyncClient {
  const url = `${server.baseUrl.replace('http', 'ws')}/api/projects/${projectId}/sync`;
  return new SyncClient({
    url,
    doc,
    reconnectDelay: 20,
    createSocket: (u) => new WebSocket(u, { headers: cookie ? { cookie } : {} }) as unknown as SocketLike,
  });
}

export async function waitFor(check: () => boolean, timeoutMs = 3000, message = 'Bedingung nicht erfüllt'): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(message);
    await new Promise((r) => setTimeout(r, 10));
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
