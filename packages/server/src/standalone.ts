// Einstiegspunkt für den eigenständigen Server (Docker).
import { formatAppTitle } from '@steckplan/core';
import { ConfigError, readStandaloneConfig } from './config';
import { createServer } from './server';

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

  const app = await createServer({ mode: 'standalone', uiDir: config.uiDir, logger: true });

  const shutdown = async (): Promise<void> => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ host: config.host, port: config.port });
  console.log(`${formatAppTitle()} läuft auf Port ${config.port}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
