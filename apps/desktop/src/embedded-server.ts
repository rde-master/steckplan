// Eingebetteter Server im Main-Prozess: nur auf 127.0.0.1, zufälliger Port.
import { join } from 'node:path';
import {
  createServer,
  LibraryStore,
  LocalFileStore,
  SessionStore,
  UsageTracker,
  VersionStore,
  type SteckplanServer,
} from '@steckplan/server';

export interface EmbeddedServer extends SteckplanServer {
  baseUrl: string;
  store: LocalFileStore;
  sessions: SessionStore;
  /** Token der lokalen Sitzung (Zugang `local`) für die Fenster der Desktop-App */
  localToken: string;
}

export async function startEmbeddedServer(options: { userDataDir: string; uiDir: string; userName: string }): Promise<EmbeddedServer> {
  const store = new LocalFileStore(options.userName);
  const sessions = new SessionStore();
  const library = new LibraryStore(join(options.userDataDir, 'library.json'));
  await library.load();
  const usage = new UsageTracker(join(options.userDataDir, 'usage.json'));
  await usage.load();
  const server = await createServer({
    mode: 'desktop',
    uiDir: options.uiDir,
    store,
    versions: new VersionStore(join(options.userDataDir, 'versions')),
    sessions,
    library,
    usage,
    passwords: null, // Weboberfläche per QR folgt in M8
  });
  const { token } = sessions.create(options.userName || 'Desktop', 'local', 'desktop', { persistent: false, expires: false });
  await server.app.listen({ host: '127.0.0.1', port: 0 });
  const address = server.app.server.address();
  if (address === null || typeof address === 'string') throw new Error('Serveradresse unbekannt');
  return { ...server, baseUrl: `http://127.0.0.1:${address.port}`, store, sessions, localToken: token };
}
