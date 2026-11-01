import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { createHealthInfo, type ServerMode } from '@steckplan/core';

export interface ServerOptions {
  /** Betriebsart: eingebettet in der Desktop-App oder eigenständig (Docker). */
  mode: ServerMode;
  /** Ordner mit der gebauten UI (index.html). Fehlt er, wird nur die API ausgeliefert. */
  uiDir?: string;
  /** Fastify-Logger an/aus. Niemals Passwörter oder Projektinhalte loggen. */
  logger?: boolean;
}

export async function createServer(options: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  app.get('/api/health', async () => createHealthInfo(options.mode));

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

  return app;
}
