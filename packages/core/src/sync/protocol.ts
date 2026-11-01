// WebSocket-Protokoll für den Live-Sync – kompatibel zum y-websocket-Format
// (0 = Yjs-Sync, 1 = Awareness) plus eigene Server-Nachrichten (100 = Info als JSON).
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import type { Access } from '../model/access';

export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;
export const MESSAGE_INFO = 100;

/** Gründe für das Schließen der Verbindung durch den Server (WebSocket-Close-Codes). */
export const CloseCode = {
  /** Nicht angemeldet / Sitzung abgelaufen */
  Unauthorized: 4401,
  /** Kein Zugriff (z. B. falsche Herkunft) */
  Forbidden: 4403,
  /** Projekt existiert nicht */
  NotFound: 4404,
  /** Projekt wurde geschlossen oder gelöscht */
  ProjectClosed: 4410,
} as const;

export interface PresenceUser {
  /** Verbindungs-ID (pro Fenster/Tab) */
  id: string;
  name: string;
  access: Access;
}

export type ServerInfo =
  | {
      type: 'welcome';
      connectionId: string;
      access: Access;
      readOnly: boolean;
      readOnlyReason?: string;
      /** Vorlagen-Abgleich wartet auf eine Entscheidung */
      reconcilePending?: boolean;
    }
  | { type: 'presence'; users: PresenceUser[] }
  | { type: 'notice'; message: string };

export function encodeInfo(info: ServerInfo): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_INFO);
  encoding.writeVarString(encoder, JSON.stringify(info));
  return encoding.toUint8Array(encoder);
}

export function decodeInfo(decoder: decoding.Decoder): ServerInfo {
  return JSON.parse(decoding.readVarString(decoder)) as ServerInfo;
}
