// Verwaltung aller geöffneten Projekte (Räume) und Annahme von WebSocket-Verbindungen.
import type { FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { CloseCode } from '@steckplan/core';
import type { Session, SessionStore } from '../auth/sessions';
import { ProjectNotFoundError, type ProjectStore } from '../storage/types';
import type { VersionStore } from '../storage/version-store';
import { Room, type RoomDeps, type RoomLogger } from './room';

export interface RoomManagerOptions extends Omit<RoomDeps, 'log'> {
  log: RoomLogger;
  sessions: SessionStore;
  /** Docker: Projekte ohne Verbindung nach idleMs schließen. Desktop lokal: offen lassen. */
  unloadWhenIdle: boolean;
  idleMs?: number;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly loading = new Map<string, Promise<Room>>();
  private readonly idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly options: RoomManagerOptions) {
    options.sessions.onChange((session) => {
      for (const room of this.rooms.values()) room.updateSession(session);
    });
    options.library.onChange((change) => {
      for (const room of this.rooms.values()) room.libraryChanged(change);
    });
  }

  get store(): ProjectStore {
    return this.options.store;
  }

  get versions(): VersionStore {
    return this.options.versions;
  }

  peek(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  async get(id: string): Promise<Room> {
    const existing = this.rooms.get(id);
    if (existing) return existing;
    let pending = this.loading.get(id);
    if (!pending) {
      pending = Room.load(id, this.options).then((room) => {
        this.rooms.set(id, room);
        return room;
      });
      pending.finally(() => this.loading.delete(id)).catch(() => undefined);
      this.loading.set(id, pending);
    }
    return pending;
  }

  /** Schließt ein Projekt für alle (z. B. gelöscht oder am Desktop geschlossen). */
  async close(id: string, reason: string): Promise<void> {
    this.clearIdle(id);
    const room = this.rooms.get(id) ?? (await this.loading.get(id)?.catch(() => undefined));
    if (!room) return;
    this.rooms.delete(id);
    await room.close(CloseCode.ProjectClosed, reason);
  }

  async flushAll(): Promise<void> {
    await Promise.all([...this.rooms.values()].map((room) => room.flush()));
  }

  async closeAll(reason: string): Promise<void> {
    await Promise.all([...this.rooms.keys()].map((id) => this.close(id, reason)));
  }

  /** Trennt alle Verbindungen einer Sitzung (z. B. nach dem Abmelden). */
  disconnectSession(sessionId: string): void {
    for (const room of this.rooms.values()) {
      for (const connection of room.connections) {
        if (connection.session.id === sessionId) connection.socket.close(CloseCode.Unauthorized, 'Abgemeldet');
      }
    }
  }

  handleConnection(socket: WebSocket, request: FastifyRequest, id: string): void {
    const session: Session | null = request.session;
    if (!session) {
      socket.close(CloseCode.Unauthorized, 'Nicht angemeldet');
      return;
    }
    if (!isSameOrigin(request)) {
      socket.close(CloseCode.Forbidden, 'Herkunft nicht erlaubt');
      return;
    }

    // Nachrichten puffern, bis das Projekt geladen ist (der Client sendet sofort nach dem Verbinden).
    const queue: Uint8Array[] = [];
    let onMessage: (data: Uint8Array) => void = (data) => queue.push(data);
    socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => onMessage(toBytes(data)));

    let closed = false;
    socket.once('close', () => {
      closed = true;
    });

    this.clearIdle(id);
    this.get(id).then(
      (room) => {
        if (closed) {
          this.scheduleIdle(id, room);
          return;
        }
        const connection = room.addConnection(socket, session);
        onMessage = (data) => room.handleMessage(connection, data);
        for (const data of queue.splice(0)) room.handleMessage(connection, data);
        socket.once('close', () => {
          room.removeConnection(connection);
          this.scheduleIdle(id, room);
        });
      },
      (error: unknown) => {
        if (error instanceof ProjectNotFoundError) socket.close(CloseCode.NotFound, 'Projekt nicht gefunden');
        else {
          this.options.log.error(`Projekt ${id} konnte nicht geöffnet werden: ${(error as Error).message}`);
          socket.close(1011, 'Projekt konnte nicht geöffnet werden');
        }
      },
    );
  }

  private scheduleIdle(id: string, room: Room): void {
    if (room.connections.size > 0) return;
    if (!this.options.unloadWhenIdle) {
      void room.flush();
      return;
    }
    this.clearIdle(id);
    const timer = setTimeout(() => {
      this.idleTimers.delete(id);
      if (room.connections.size === 0 && this.rooms.get(id) === room) {
        this.rooms.delete(id);
        void room.close(CloseCode.ProjectClosed, 'Leerlauf');
      }
    }, this.options.idleMs ?? 30_000);
    timer.unref?.();
    this.idleTimers.set(id, timer);
  }

  private clearIdle(id: string): void {
    const timer = this.idleTimers.get(id);
    if (timer) clearTimeout(timer);
    this.idleTimers.delete(id);
  }
}

function toBytes(data: Buffer | ArrayBuffer | Buffer[]): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/** Schutz vor Cross-Site-WebSocket-Hijacking: Origin muss zum Host passen (falls gesendet). */
function isSameOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}
