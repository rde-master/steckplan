// Einstiegspunkt für den eigenständigen Server (Docker).
import { join } from 'node:path';
import { formatAppTitle } from '@steckplan/core';
import { PasswordChecker, passwordFingerprint } from './auth/passwords';
import { SessionStore } from './auth/sessions';
import { ConfigError, readStandaloneConfig } from './config';
import { createServer } from './server';
import { DataDirProjectStore } from './storage/data-dir-store';
import { VersionStore } from './storage/version-store';

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

  const passwords = { edit: config.editPassword, read: config.readPassword };
  const store = new DataDirProjectStore(config.dataDir);
  await store.init();
  const versions = new VersionStore(join(config.dataDir, 'versions'));
  const sessions = new SessionStore({ file: join(config.dataDir, 'sessions.json') });
  await sessions.load((salt) => passwordFingerprint(passwords, salt));

  const { app } = await createServer({
    mode: 'standalone',
    store,
    versions,
    sessions,
    passwords: new PasswordChecker(passwords),
    uiDir: config.uiDir,
    logger: true,
    trustProxy: config.trustProxy,
  });

  const purgeTrash = async (): Promise<void> => {
    try {
      for (const projectId of await store.purgeTrash()) await versions.removeAll(projectId);
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

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
