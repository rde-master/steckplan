// Zusätzlicher Zugang für denselben Server, z. B. die Weboberfläche des Desktops im lokalen Netz.
// Anfragen und WebSocket-Upgrades werden an die Fastify-Instanz weitergereicht (gleiche Räume, Sitzungen, Bibliothek).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';

export interface ExtraListener {
  host: string;
  port: number;
  close(): Promise<void>;
}

function listen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve((server.address() as AddressInfo).port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

/** Startet einen weiteren Zugang. Ist der Port belegt, werden die nächsten (bis +tries) versucht. */
export async function startExtraListener(app: FastifyInstance, host: string, port: number, tries = 20): Promise<ExtraListener> {
  await app.ready();
  const server = createServer((req, res) => app.routing(req, res));
  server.on('upgrade', (req, socket, head) => app.server.emit('upgrade', req, socket, head));
  let lastError: unknown;
  for (let p = port; p < port + Math.max(1, tries); p++) {
    try {
      const actual = await listen(server, host, p);
      const sockets = new Set<import('node:net').Socket>();
      server.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
      });
      return {
        host,
        port: actual,
        close: () =>
          new Promise<void>((resolve) => {
            for (const socket of sockets) socket.destroy();
            server.close(() => resolve());
          }),
      };
    } catch (error) {
      lastError = error;
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || port === 0) break;
    }
  }
  throw lastError;
}
