// WebSocket-Protokoll für den Live-Sync – kompatibel zum y-websocket-Format
// (0 = Yjs-Sync, 1 = Awareness) plus eigene Server-Nachrichten (100 = Info als JSON).
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import type { Access } from '../model/access';

export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;
export const MESSAGE_INFO = 100;
/** Vorstellung (Regie): Client → Server „ich führe, wir sind bei …“ – nicht im Projekt gespeichert */
export const MESSAGE_CUE = 101;

/** Stelle in der Vorstellung */
export interface Cue {
  itemId: string;
  sceneId?: string;
  /** Abspielposition in Sekunden beim Senden (für das Textfenster auf anderen Geräten) */
  at?: number;
  /** läuft die Wiedergabe? Dann zählen Folgende ab dem Empfang selbst weiter */
  playing?: boolean;
  /** Timecode, wenn er nicht an der Musik hängt (sonst wie at/playing) – Quelle für Art-Net */
  tc?: { at: number; playing: boolean };
  /** Abspielgeschwindigkeit (1 = Original): so schnell zählen Folgende und Art-Net weiter */
  rate?: number;
  /** Führen: OSC-Befehle der Regie automatisch senden (Start des Eintrags, Szenen, Events) */
  osc?: boolean;
  /** Führen: Text im Textfenster ausgeblendet */
  hideText?: boolean;
  /** Führen: Hintergrund im Textfenster ausgeblendet (schwarz) */
  hideBackground?: boolean;
}

/** Fernsteuerung der Vorstellung (OSC bzw. HTTP) */
export const REMOTE_ACTIONS = ['play', 'pause', 'stop', 'toggle', 'forward', 'back', 'seek', 'item', 'next', 'prev', 'sceneNext', 'scenePrev', 'tcForward', 'tcBack', 'tap'] as const;
export type RemoteAction = (typeof REMOTE_ACTIONS)[number];
export interface RemoteCommand {
  action: RemoteAction;
  /** Sekunden (forward/back/seek) bzw. Nummer des Ablaufpunkts (item) */
  value?: number;
}

/** Befehl prüfen (aus OSC oder HTTP); null = ungültig */
export function parseRemoteCommand(action: unknown, value?: unknown): RemoteCommand | null {
  if (typeof action !== 'string' || !(REMOTE_ACTIONS as readonly string[]).includes(action)) return null;
  const a = action as RemoteAction;
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : undefined;
  if (n !== undefined && !Number.isFinite(n)) return null;
  if ((a === 'seek' || a === 'item') && n === undefined) return null;
  if (a === 'item' && (!Number.isInteger(n) || n! < 1)) return null;
  if (a === 'seek' && n! < 0) return null;
  const relative = a === 'forward' || a === 'back' || a === 'tcForward' || a === 'tcBack';
  return { action: a, ...(n !== undefined ? { value: relative ? Math.abs(n) : n } : {}) };
}

/** Zuletzt gelaufener Cue des Lichtpults (per OSC als Text) mit Empfangszeit */
export interface DeskCue {
  text: string;
  at: string;
}
/** so viele Cues merkt sich der Server (neueste zuerst) */
export const DESK_CUE_HISTORY = 10;
export const DESK_CUE_MAX_LENGTH = 200;

/** Wer führt und wo die Vorstellung gerade steht */
export interface LeadInfo extends Cue {
  connectionId: string;
  name: string;
}

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
  /** Von einem Bearbeiter getrennt – nicht von selbst neu verbinden */
  Disconnected: 4409,
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
  | { type: 'notice'; message: string }
  | { type: 'lead'; lead: LeadInfo | null }
  /** Fernsteuerung: ausführen soll die führende Vorstellung, führt niemand, jede nicht folgende */
  | { type: 'remote'; command: RemoteCommand }
  /** Lichtpult: zuletzt gelaufene Cues (neueste zuerst) */
  | { type: 'deskCues'; cues: DeskCue[] }
  /** zuletzt gesendete OSC-Befehle der Regie (neueste zuerst) */
  | { type: 'oscLog'; entries: OscLogEntry[] };

/** gesendeter (oder fehlgeschlagener) OSC-Befehl */
export interface OscLogEntry {
  at: string;
  /** Auslöser, z. B. „Start: Lied 3“, „Szene: Intro“, „Event: Pyro“, „Von Hand“ */
  source: string;
  text: string;
  target: string;
  error?: string;
}
export const OSC_LOG_LENGTH = 15;

export function encodeInfo(info: ServerInfo): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_INFO);
  encoding.writeVarString(encoder, JSON.stringify(info));
  return encoding.toUint8Array(encoder);
}

/** Client → Server: Stelle senden (führen) oder Führen beenden (null) */
export function encodeCue(cue: Cue | null): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_CUE);
  encoding.writeVarString(encoder, JSON.stringify(cue));
  return encoding.toUint8Array(encoder);
}

/** Server: Stelle lesen und prüfen (nur Kennungen, kurz) */
export function decodeCue(decoder: decoding.Decoder): Cue | null {
  const raw = JSON.parse(decoding.readVarString(decoder)) as unknown;
  if (raw === null) return null;
  const v = raw as Partial<Cue>;
  const ok = (s: unknown) => typeof s === 'string' && s.length > 0 && s.length <= 128;
  if (!ok(v.itemId) || (v.sceneId !== undefined && !ok(v.sceneId))) throw new Error('Ungültige Stelle');
  const time = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 86_400 ? x : undefined);
  const at = time(v.at);
  const tcAt = v.tc && typeof v.tc === 'object' ? time((v.tc as { at?: unknown }).at) : undefined;
  return {
    itemId: v.itemId!,
    ...(v.sceneId ? { sceneId: v.sceneId } : {}),
    ...(at !== undefined ? { at, playing: v.playing === true } : {}),
    ...(tcAt !== undefined ? { tc: { at: tcAt, playing: (v.tc as { playing?: unknown }).playing === true } } : {}),
    ...(typeof v.rate === 'number' && Number.isFinite(v.rate) && v.rate >= 0.25 && v.rate <= 4 && v.rate !== 1 ? { rate: v.rate } : {}),
    ...(v.osc === true ? { osc: true } : {}),
    ...(v.hideText === true ? { hideText: true } : {}),
    ...(v.hideBackground === true ? { hideBackground: true } : {}),
  };
}

export function decodeInfo(decoder: decoding.Decoder): ServerInfo {
  return JSON.parse(decoding.readVarString(decoder)) as ServerInfo;
}
