// Hilfen für Server-Tests: Server mit temporärem Datenordner, Anmeldung, Sync-Clients.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { SyncClient, type RemoteCommand, type SocketLike } from '@steckplan/core';
import { PasswordChecker } from './auth/passwords';
import { LoginRateLimiter } from './auth/rate-limit';
import { DesktopKeyStore } from './auth/desktop-keys';
import { SessionStore } from './auth/sessions';
import { createServer, type ServerOptions, type SteckplanServer } from './server';
import { LibraryStore } from './library/library-store';
import { UsageTracker } from './library/usage-tracker';
import { DataDirProjectStore } from './storage/data-dir-store';
import { VersionStore } from './storage/version-store';
import { MediaStore } from './storage/media-store';
import { LabelQrStore } from './auth/label-qr';
import type { ProjectStore } from './storage/types';

export const EDIT_PASSWORD = 'bearbeiten-geheim';
export const READ_PASSWORD = 'lesen-geheim';
export const DIRECTION_PASSWORD = 'regie-geheim';

export interface TestServer extends SteckplanServer {
  baseUrl: string;
  dataDir: string;
  sessions: SessionStore;
  store: ProjectStore;
  versions: VersionStore;
  library: LibraryStore;
  usage: UsageTracker;
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
  const library = overrides.library ?? new LibraryStore(join(dataDir, 'library.json'));
  if (!overrides.library) await library.load();
  const usage = overrides.usage ?? new UsageTracker();
  const server = await createServer({
    mode: 'standalone',
    store,
    versions,
    sessions,
    library,
    usage,
    passwords: new PasswordChecker({ edit: EDIT_PASSWORD, read: READ_PASSWORD, direction: DIRECTION_PASSWORD }),
    rateLimiter: new LoginRateLimiter({ maxFailures: 3 }),
    desktopKeys: new DesktopKeyStore({ file: join(dataDir, 'desktop-keys.json') }),
    media: new MediaStore((id) => join(dataDir, 'media', id)),
    labelQr: new LabelQrStore(join(dataDir, 'label-qr.json')),
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
    library,
    usage,
    close: () => server.app.close(),
  };
}

/** Meldet sich an und gibt den Cookie-Header zurück. */
export async function login(server: TestServer, access: 'edit' | 'read' | 'direction', name = access === 'edit' ? 'Ralf' : access === 'direction' ? 'Regina' : 'Anna'): Promise<string> {
  const password = access === 'edit' ? EDIT_PASSWORD : access === 'direction' ? DIRECTION_PASSWORD : READ_PASSWORD;
  const res = await server.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password, name },
  });
  if (res.statusCode !== 200) throw new Error(`Login fehlgeschlagen: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'steckplan_session');
  if (!cookie) throw new Error('kein Cookie');
  return `steckplan_session=${cookie.value}`;
}

export function connect(server: TestServer, projectId: string, cookie: string | null, doc = new Y.Doc(), onRemote?: (command: RemoteCommand) => void): SyncClient {
  const url = `${server.baseUrl.replace('http', 'ws')}/api/projects/${projectId}/sync`;
  return new SyncClient({
    url,
    doc,
    onRemote,
    reconnectDelay: 20,
    createSocket: (u) => new WebSocket(u, { headers: cookie ? { cookie } : {} }) as unknown as SocketLike,
  });
}

export async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 3000, message = 'Bedingung nicht erfüllt'): Promise<void> {
  const started = Date.now();
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) throw new Error(message);
    await new Promise((r) => setTimeout(r, 10));
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
