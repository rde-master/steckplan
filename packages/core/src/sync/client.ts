// Live-Sync-Client: verbindet ein Yjs-Dokument per WebSocket mit dem Steckplan-Server.
// Läuft im Browser, in Electron und (für Tests) in Node.
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import { CloseCode, decodeInfo, MESSAGE_INFO, MESSAGE_SYNC, type PresenceUser, type ServerInfo } from './protocol';
import type { Access } from '../model/access';

export interface SocketLike {
  binaryType: string;
  readyState: number;
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export type SyncStatus =
  | 'connecting'
  | 'connected' // verbunden, Erstabgleich läuft
  | 'synced' // verbunden und abgeglichen
  | 'disconnected' // getrennt, Neuverbindung geplant
  | 'unauthorized' // Sitzung ungültig → neu anmelden
  | 'notFound' // Projekt gibt es nicht
  | 'closed'; // Projekt wurde geschlossen/gelöscht oder Client beendet

export interface SyncClientState {
  status: SyncStatus;
  access: Access | null;
  readOnly: boolean;
  readOnlyReason?: string;
  connectionId: string | null;
  users: PresenceUser[];
  notice?: string;
}

export interface SyncClientOptions {
  url: string;
  doc: Y.Doc;
  createSocket?: (url: string) => SocketLike;
  onChange?: (state: SyncClientState) => void;
  /** Wartezeit vor Neuverbindung in ms (wächst bis maxReconnectDelay) */
  reconnectDelay?: number;
  maxReconnectDelay?: number;
}

const OPEN = 1;

export class SyncClient {
  readonly doc: Y.Doc;
  private readonly url: string;
  private readonly createSocket: (url: string) => SocketLike;
  private readonly onChange?: (state: SyncClientState) => void;
  private socket: SocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private destroyed = false;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private _state: SyncClientState = { status: 'connecting', access: null, readOnly: false, connectionId: null, users: [] };

  constructor(options: SyncClientOptions) {
    this.doc = options.doc;
    this.url = options.url;
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike);
    this.onChange = options.onChange;
    this.baseDelay = options.reconnectDelay ?? 500;
    this.maxDelay = options.maxReconnectDelay ?? 10_000;
    this.doc.on('update', this.handleDocUpdate);
    this.connect();
  }

  get state(): SyncClientState {
    return this._state;
  }

  /** Wartet, bis der Erstabgleich abgeschlossen ist (für Tests). */
  whenSynced(timeoutMs = 5000): Promise<void> {
    if (this._state.status === 'synced') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const check = (): void => {
        if (this._state.status === 'synced') resolve();
        else if (Date.now() - started > timeoutMs) reject(new Error(`Nicht synchronisiert (Status ${this._state.status})`));
        else setTimeout(check, 10);
      };
      check();
    });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.doc.off('update', this.handleDocUpdate);
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    this.setState({ status: 'closed' });
  }

  private setState(patch: Partial<SyncClientState>): void {
    this._state = { ...this._state, ...patch };
    this.onChange?.(this._state);
  }

  private connect(): void {
    if (this.destroyed) return;
    this.setState({ status: 'connecting' });
    const socket = this.createSocket(this.url);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.setState({ status: 'connected' });
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(encoder, this.doc);
      socket.send(encoding.toUint8Array(encoder));
    };

    socket.onmessage = (event) => {
      const data = event.data;
      const bytes =
        data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
      if (bytes) this.handleMessage(bytes);
    };

    socket.onerror = () => {
      // onclose folgt und kümmert sich um die Neuverbindung
    };

    socket.onclose = (event) => {
      this.socket = null;
      if (this.destroyed) return;
      switch (event.code) {
        case CloseCode.Unauthorized:
          this.setState({ status: 'unauthorized', users: [] });
          return;
        case CloseCode.NotFound:
          this.setState({ status: 'notFound', users: [] });
          return;
        case CloseCode.ProjectClosed:
          this.setState({ status: 'closed', users: [], notice: event.reason || undefined });
          return;
      }
      this.setState({ status: 'disconnected', users: [] });
      const delay = Math.min(this.maxDelay, this.baseDelay * 2 ** this.attempts);
      this.attempts += 1;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

  private handleMessage(bytes: Uint8Array): void {
    const decoder = decoding.createDecoder(bytes);
    const type = decoding.readVarUint(decoder);
    if (type === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      const syncType = syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
      if (encoding.length(encoder) > 1) this.socket?.send(encoding.toUint8Array(encoder));
      if (syncType === syncProtocol.messageYjsSyncStep2 && this._state.status !== 'synced') {
        this.setState({ status: 'synced' });
      }
    } else if (type === MESSAGE_INFO) {
      this.handleInfo(decodeInfo(decoder));
    }
  }

  private handleInfo(info: ServerInfo): void {
    switch (info.type) {
      case 'welcome':
        this.setState({
          access: info.access,
          readOnly: info.readOnly,
          readOnlyReason: info.readOnlyReason,
          connectionId: info.connectionId,
        });
        break;
      case 'presence':
        this.setState({ users: info.users });
        break;
      case 'notice':
        this.setState({ notice: info.message });
        break;
    }
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this || this._state.readOnly) return;
    const socket = this.socket;
    if (!socket || socket.readyState !== OPEN) return; // wird beim nächsten Verbinden per Sync-Step abgeglichen
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    socket.send(encoding.toUint8Array(encoder));
  };
}
