// Ereignis-Kanal (WebSocket /api/events): benachrichtigt ALLE angemeldeten Clients,
// z. B. wenn sich die Bibliothek geändert hat – auch Clients in anderen Projekten.
import type { FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { CloseCode } from '@steckplan/core';

export type ServerEvent = { type: 'library'; revision: number; templateIds: string[]; masterKeys: string[] };

export class EventHub {
  private readonly sockets = new Map<WebSocket, string>();

  handleConnection(socket: WebSocket, request: FastifyRequest): void {
    if (!request.session) {
      socket.close(CloseCode.Unauthorized, 'Nicht angemeldet');
      return;
    }
    const origin = request.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== request.headers.host) {
          socket.close(CloseCode.Forbidden, 'Herkunft nicht erlaubt');
          return;
        }
      } catch {
        socket.close(CloseCode.Forbidden, 'Herkunft nicht erlaubt');
        return;
      }
    }
    this.sockets.set(socket, request.session.id);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('message', () => undefined); // Clients senden nichts
  }

  broadcast(event: ServerEvent): void {
    const data = JSON.stringify(event);
    for (const socket of this.sockets.keys()) if (socket.readyState === 1) socket.send(data);
  }

  disconnectSession(sessionId: string): void {
    for (const [socket, id] of this.sockets) if (id === sessionId) socket.close(CloseCode.Unauthorized, 'Abgemeldet');
  }

  closeAll(): void {
    for (const socket of this.sockets.keys()) socket.close(1001, 'Server wird beendet');
    this.sockets.clear();
  }

  get size(): number {
    return this.sockets.size;
  }
}
