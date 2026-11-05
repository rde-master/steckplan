// Einstiegspunkt für den eigenständigen Server (Docker).
import { join } from 'node:path';
import { formatAppTitle, projectUsage } from '@steckplan/core';
import { PasswordChecker, passwordFingerprint } from './auth/passwords';
import { DesktopKeyStore } from './auth/desktop-keys';
import { SessionStore } from './auth/sessions';
import { ConfigError, readStandaloneConfig } from './config';
import { createServer } from './server';
import { LibraryStore } from './library/library-store';
import { UsageTracker } from './library/usage-tracker';
import { DataDirProjectStore } from './storage/data-dir-store';
import { VersionStore } from './storage/version-store';
import { MediaStore } from './storage/media-store';

const TRASH_PURGE_INTERVAL_MS = 12 * 60 * 60 * 1000;

async function main(): Promise<void> {
  let config;
  try {
    config = readStandaloneConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`${formatAppTitle()} kann nicht starten.\n${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  const passwords = { edit: config.editPassword, read: config.readPassword, direction: config.directionPassword };
  const store = new DataDirProjectStore(config.dataDir);
  const media = new MediaStore((id) => (/^[A-Za-z0-9-]{1,64}$/.test(id) ? join(config.dataDir, 'media', id) : undefined));
  await store.init();
  const versions = new VersionStore(join(config.dataDir, 'versions'));
  const sessions = new SessionStore({ file: join(config.dataDir, 'sessions.json') });
  await sessions.load((salt) => passwordFingerprint(passwords, salt));
  const desktopKeys = new DesktopKeyStore({ file: join(config.dataDir, 'desktop-keys.json') });
  await desktopKeys.load();
  const library = new LibraryStore(join(config.dataDir, 'library.json'));
  await library.load();
  const usage = new UsageTracker(join(config.dataDir, 'usage.json'));
  await usage.load();
  // Nutzungsübersicht aus allen Projekten neu aufbauen (Dateien könnten von Hand geändert worden sein)
  await rebuildUsage(store, usage);

  const { app } = await createServer({
    mode: 'standalone',
    store,
    versions,
    sessions,
    library,
    usage,
    passwords: new PasswordChecker(passwords),
    desktopKeys,
    media,
    uiDir: config.uiDir,
    logger: true,
    trustProxy: config.trustProxy,
  });

  const purgeTrash = async (): Promise<void> => {
    try {
      for (const projectId of await store.purgeTrash()) {
        await versions.removeAll(projectId);
        // Medien nur entfernen, wenn es kein Projekt (mehr) mit dieser Kennung gibt
        if (!(await store.load(projectId).then(() => true).catch(() => false))) await media.removeAll(projectId);
      }
    } catch (error) {
      app.log.error(`Papierkorb konnte nicht geleert werden: ${(error as Error).message}`);
    }
  };
  await purgeTrash();
  setInterval(() => void purgeTrash(), TRASH_PURGE_INTERVAL_MS).unref();

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await app.close(); // speichert offene Projekte und Sitzungen
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await app.listen({ host: config.host, port: config.port });
  console.log(`${formatAppTitle()} läuft auf Port ${config.port}`);
}

async function rebuildUsage(store: DataDirProjectStore, usage: UsageTracker): Promise<void> {
  for (const summary of await store.list()) {
    try {
      const project = await store.load(summary.id);
      usage.record(summary.id, project.meta.name, projectUsage(project));
    } catch {
      // beschädigte Datei überspringen
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
