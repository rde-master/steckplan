// Ein geöffnetes Projekt auf dem Server: Yjs-Dokument + verbundene Clients + Speichern/Versionen.
import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import {
  can,
  createYDocFromProject,
  encodeInfo,
  MESSAGE_SYNC,
  readProjectFromYDoc,
  writeProjectToYDoc,
  type PresenceUser,
  type Project,
  type Secrets,
  type ServerInfo,
} from '@steckplan/core';
import type { Session } from '../auth/sessions';
import type { ProjectStore } from '../storage/types';
import { VERSION_INTERVAL_MS, type VersionInfo, type VersionStore } from '../storage/version-store';

export interface Connection {
  id: string;
  socket: WebSocket;
  session: Session;
}

export interface RoomLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface RoomDeps {
  store: ProjectStore;
  versions: VersionStore;
  log: RoomLogger;
  saveDelayMs?: number;
  maxSaveDelayMs?: number;
  versionIntervalMs?: number;
}

/** Herkunft für Änderungen, die der Server selbst schreibt (z. B. Wiederherstellen). */
class ServerOrigin {
  constructor(readonly by: string) {}
}

const OPEN = 1;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

export class Room {
  readonly doc: Y.Doc;
  readonly connections = new Set<Connection>();
  private secrets: Secrets;
  private changeLog: Project['changeLog'];
  private readonly projectId: string;
  private dirty = false;
  private firstDirtyAt = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private editorsSinceVersion = new Set<string>();
  private lastVersionAt = 0;
  private closed = false;
  private readonly saveDelayMs: number;
  private readonly maxSaveDelayMs: number;
  private readonly versionIntervalMs: number;

  private constructor(
    readonly id: string,
    project: Project,
    private readonly deps: RoomDeps,
  ) {
    this.doc = createYDocFromProject(project);
    this.secrets = project.secrets;
    this.changeLog = project.changeLog;
    this.projectId = project.id;
    this.saveDelayMs = deps.saveDelayMs ?? 1500;
    this.maxSaveDelayMs = deps.maxSaveDelayMs ?? 10_000;
    this.versionIntervalMs = deps.versionIntervalMs ?? VERSION_INTERVAL_MS;
    this.doc.on('update', this.handleUpdate);
  }

  static async load(id: string, deps: RoomDeps): Promise<Room> {
    const project = await deps.store.load(id);
    const room = new Room(id, project, deps);
    const latest = await deps.versions.latest(project.id).catch(() => undefined);
    room.lastVersionAt = latest ? Date.parse(latest.at) : 0;
    return room;
  }

  get readOnlyReason(): string | undefined {
    return this.deps.store.readOnlyReason(this.id);
  }

  get versionKey(): string {
    return this.projectId;
  }

  canWrite(session: Session): boolean {
    return !this.readOnlyReason && can(session.access, 'editProject');
  }

  /** Aktueller Stand inkl. geschütztem Bereich. */
  currentProject(): Project {
    const result = readProjectFromYDoc(this.doc, { secrets: this.secrets, changeLog: this.changeLog });
    if (!result.ok) throw new Error(`Projekt ungültig: ${result.error}`);
    return result.project;
  }

  // ---------- Verbindungen ----------

  addConnection(socket: WebSocket, session: Session): Connection {
    const connection: Connection = { id: randomBytes(6).toString('hex'), socket, session };
    this.connections.add(connection);

    const readOnly = !this.canWrite(session);
    this.send(connection, encodeInfo({
      type: 'welcome',
      connectionId: connection.id,
      access: session.access,
      readOnly,
      ...(this.readOnlyReason ? { readOnlyReason: this.readOnlyReason } : {}),
    }));

    // Server-Stand anbieten; der Client antwortet mit seinen fehlenden Änderungen (Sync-Step 2)
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    this.send(connection, encoding.toUint8Array(encoder));

    this.broadcastPresence();
    return connection;
  }

  removeConnection(connection: Connection): void {
    if (this.connections.delete(connection)) this.broadcastPresence();
  }

  updateSession(session: Session): void {
    let changed = false;
    for (const connection of this.connections) {
      if (connection.session.id === session.id) {
        connection.session = session;
        changed = true;
      }
    }
    if (changed) this.broadcastPresence();
  }

  presence(): PresenceUser[] {
    return [...this.connections].map((c) => ({ id: c.id, name: c.session.name, access: c.session.access }));
  }

  handleMessage(connection: Connection, data: Uint8Array): void {
    try {
      const decoder = decoding.createDecoder(data);
      const type = decoding.readVarUint(decoder);
      if (type !== MESSAGE_SYNC) return; // Awareness o. Ä. wird (noch) nicht verarbeitet

      const syncType = decoding.readVarUint(decoder);
      switch (syncType) {
        case syncProtocol.messageYjsSyncStep1: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncStep1(decoder, encoder, this.doc);
          this.send(connection, encoding.toUint8Array(encoder));
          break;
        }
        case syncProtocol.messageYjsSyncStep2:
        case syncProtocol.messageYjsUpdate:
          // Rechte serverseitig durchsetzen: Änderungen von Lese-Clients werden verworfen.
          if (!this.canWrite(connection.session)) return;
          if (syncType === syncProtocol.messageYjsSyncStep2) syncProtocol.readSyncStep2(decoder, this.doc, connection);
          else syncProtocol.readUpdate(decoder, this.doc, connection);
          break;
      }
    } catch (error) {
      this.deps.log.warn(`Ungültige Sync-Nachricht von Verbindung ${connection.id}: ${(error as Error).message}`);
      connection.socket.close(1003, 'Ungültige Nachricht');
    }
  }

  notify(message: string): void {
    this.broadcast(encodeInfo({ type: 'notice', message }));
  }

  private send(connection: Connection, data: Uint8Array): void {
    if (connection.socket.readyState === OPEN) connection.socket.send(data);
  }

  private broadcast(data: Uint8Array, except?: unknown): void {
    for (const connection of this.connections) if (connection !== except) this.send(connection, data);
  }

  private broadcastPresence(): void {
    const info: ServerInfo = { type: 'presence', users: this.presence() };
    this.broadcast(encodeInfo(info));
  }

  private handleUpdate = (update: Uint8Array, origin: unknown): void => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    this.broadcast(encoding.toUint8Array(encoder), origin);

    if (origin && typeof origin === 'object' && 'session' in origin) {
      this.editorsSinceVersion.add((origin as Connection).session.name);
    } else if (origin instanceof ServerOrigin) {
      this.editorsSinceVersion.add(origin.by);
    }
    this.markDirty();
  };

  // ---------- Speichern & Versionen ----------

  private markDirty(): void {
    if (this.closed) return;
    const now = Date.now();
    if (!this.dirty) this.firstDirtyAt = now;
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const delay = Math.max(0, Math.min(this.saveDelayMs, this.firstDirtyAt + this.maxSaveDelayMs - now));
    this.saveTimer = setTimeout(() => void this.flush(), delay);
    this.saveTimer.unref?.();
  }

  /** Speichert sofort, falls es ungespeicherte Änderungen gibt. */
  flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.saving = this.saving.then(() => this.doSave());
    return this.saving;
  }

  private async doSave(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    const result = readProjectFromYDoc(this.doc, { secrets: this.secrets, changeLog: this.changeLog });
    if (!result.ok) {
      // Ungültiger Stand (z. B. fehlerhafter Client): letzten gültigen Stand auf der Platte behalten.
      this.deps.log.error(`Projekt ${this.id} nicht gespeichert – ungültiger Inhalt (${result.error})`);
      return;
    }
    try {
      await this.deps.store.save(this.id, result.project);
    } catch (error) {
      this.deps.log.error(`Projekt ${this.id} konnte nicht gespeichert werden: ${(error as Error).message}`);
      this.markDirty();
      return;
    }
    if (Date.now() - this.lastVersionAt >= this.versionIntervalMs) {
      await this.addVersion(result.project);
    }
  }

  private async addVersion(project: Project, note?: string, extraNames: string[] = []): Promise<VersionInfo | undefined> {
    try {
      const by = [...new Set([...this.editorsSinceVersion, ...extraNames])];
      const info = await this.deps.versions.add(this.projectId, project, by, note);
      this.editorsSinceVersion.clear();
      this.lastVersionAt = Date.parse(info.at);
      return info;
    } catch (error) {
      this.deps.log.error(`Version für ${this.id} konnte nicht angelegt werden: ${(error as Error).message}`);
      return undefined;
    }
  }

  /** Stellt einen früheren Stand wieder her (vorher wird der aktuelle Stand als Version gesichert). */
  async restoreVersion(versionId: string, by: string): Promise<void> {
    if (this.readOnlyReason) throw new Error(this.readOnlyReason);
    await this.flush();
    const old = await this.deps.versions.load(this.projectId, versionId);
    const current = this.currentProject();
    await this.addVersion(current, 'Stand vor dem Wiederherstellen', [by]);

    this.secrets = old.secrets;
    writeProjectToYDoc({ ...old, id: current.id, libraryId: current.libraryId }, this.doc, new ServerOrigin(by));
    await this.flush();
    const info = (await this.deps.versions.list(this.projectId)).find((v) => v.id === versionId);
    const at = info ? formatDateTime(info.at) : 'früher';
    this.notify(`${by} hat den Stand vom ${at} wiederhergestellt.`);
  }

  async close(code: number, reason: string): Promise<void> {
    await this.flush();
    this.closed = true;
    for (const connection of this.connections) connection.socket.close(code, reason);
    this.connections.clear();
    this.doc.off('update', this.handleUpdate);
    this.doc.destroy();
  }
}
