// Steckplan Player: eigenes Programm auf einem Rechner am Bildschirm/Beamer (Textfenster im Vollbild).
// Er sucht die Steuersoftware im Netz (UDP-Rundruf), koppelt sich einmal (Code im Führen-Bildschirm bestätigen),
// lädt beim Start Texte und Medien und zeigt dann das Textfenster des Projekts, in dem gerade geführt wird.
import type { Project } from '../model/schema';
import { lyricsImages } from '../show/show';
import type { ServerMode } from '../app';

/** UDP-Port der Suche (Player ruft, Steuersoftware antwortet) */
export const DISCOVERY_PORT = 41234;
export const DISCOVERY_REQUEST = 'STECKPLAN-DISCOVER/1';

/** Antwort der Steuersoftware auf den Rundruf */
export interface DiscoveryReply {
  app: 'steckplan';
  v: 1;
  /** dauerhafte Kennung der Installation (erkennt den Server auch mit neuer IP-Adresse) */
  id: string;
  /** Name des Rechners */
  name: string;
  /** HTTP-Port der Oberfläche */
  port: number;
  mode: ServerMode;
  version: string;
}

export function parseDiscoveryReply(text: string): DiscoveryReply | null {
  try {
    const v = JSON.parse(text) as Partial<DiscoveryReply>;
    if (v.app !== 'steckplan' || v.v !== 1) return null;
    if (typeof v.id !== 'string' || !v.id || v.id.length > 64) return null;
    if (typeof v.port !== 'number' || !Number.isInteger(v.port) || v.port < 1 || v.port > 65535) return null;
    return {
      app: 'steckplan',
      v: 1,
      id: v.id,
      name: typeof v.name === 'string' ? v.name.slice(0, 80) : '',
      port: v.port,
      mode: v.mode === 'desktop' ? 'desktop' : 'standalone',
      version: typeof v.version === 'string' ? v.version.slice(0, 32) : '',
    };
  } catch {
    return null;
  }
}

/** Cookie mit dem Zugangsschlüssel des Players (nur lesen) */
export const PLAYER_COOKIE = 'steckplan_player';
/** Ohne Lebenszeichen so lange gilt ein Player als nicht verbunden */
export const PLAYER_OFFLINE_MS = 10_000;
/** Abstand der Lebenszeichen */
export const PLAYER_HEARTBEAT_MS = 3_000;

export type PlayerPhase = 'syncing' | 'ready' | 'error';

/** Stand, den der Player mit jedem Lebenszeichen meldet */
export interface PlayerReport {
  phase: PlayerPhase;
  version: string;
  /** Projekte mit Regie (Texte geladen) */
  projects: number;
  mediaDone: number;
  mediaTotal: number;
  bytesDone: number;
  bytesTotal: number;
  /** zuletzt vollständig synchronisiert */
  syncedAt?: string;
  error?: string;
}

export function parsePlayerReport(raw: unknown): PlayerReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (v.phase !== 'syncing' && v.phase !== 'ready' && v.phase !== 'error') return null;
  const count = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  const text = (x: unknown, max: number) => (typeof x === 'string' && x ? x.slice(0, max) : undefined);
  const syncedAt = text(v.syncedAt, 40);
  const error = text(v.error, 300);
  return {
    phase: v.phase,
    version: text(v.version, 32) ?? '',
    projects: count(v.projects),
    mediaDone: count(v.mediaDone),
    mediaTotal: count(v.mediaTotal),
    bytesDone: count(v.bytesDone),
    bytesTotal: count(v.bytesTotal),
    ...(syncedAt ? { syncedAt } : {}),
    ...(error ? { error } : {}),
  };
}

/** Ein gekoppelter Player im Führen-Bildschirm */
export interface PlayerStatus {
  id: string;
  name: string;
  pairedAt: string;
  online: boolean;
  lastSeen?: string;
  address?: string;
  report?: PlayerReport;
  /** neue Synchronisierung angefordert, noch nicht abgeholt */
  resyncPending: boolean;
}

/** Player, der sich koppeln möchte (Code am Player-Bildschirm) */
export interface PlayerPairingRequest {
  requestId: string;
  name: string;
  code: string;
  createdAt: string;
  address?: string;
}

export interface PlayersOverview {
  players: PlayerStatus[];
  pairing: PlayerPairingRequest[];
  /** antwortet die Steuersoftware gerade auf die Suche? (Desktop: nur mit laufender Weboberfläche) */
  discoverable: boolean;
}

export interface PlayerHeartbeatReply {
  /** neu synchronisieren (im Führen-Bildschirm angestoßen) */
  resync: boolean;
  /** Projekt, in dem gerade geführt wird */
  leadProjectId: string | null;
}

export interface PlayerCatalogMedia {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
}

/** Was der Player beim Start lädt: Projekte mit Regie und ihre Bilder/Videos fürs Textfenster */
export interface PlayerCatalog {
  projects: { id: string; name: string; items: number; lines: number; media: PlayerCatalogMedia[] }[];
}

/** Bilder und Videos, die das Textfenster eines Projekts zeigen kann (Standard, je Eintrag, je Abschnitt) */
export function playerMediaIds(project: Pick<Project, 'show' | 'showSettings'>): string[] {
  const ids = new Set<string>(lyricsImages(project.showSettings?.lyricsBackground));
  for (const item of project.show.items) for (const id of lyricsImages(item.lyricsBackground)) ids.add(id);
  for (const section of project.show.sections) if (section.backgroundMediaId) ids.add(section.backgroundMediaId);
  return [...ids];
}

/** Eintrag des Katalogs für ein Projekt (nur mit Texten oder Hintergrund fürs Textfenster) */
export function playerCatalogEntry(project: Pick<Project, 'id' | 'meta' | 'show' | 'showSettings' | 'media'>): PlayerCatalog['projects'][number] | null {
  const wanted = new Set(playerMediaIds(project));
  const lines = project.show.sections.reduce((n, s) => n + s.lines.length, 0);
  if (lines === 0 && wanted.size === 0) return null;
  return {
    id: project.id,
    name: project.meta.name,
    items: project.show.items.length,
    lines,
    media: project.media.filter((m) => wanted.has(m.id)).map((m) => ({ id: m.id, name: m.name, mime: m.mime, sizeBytes: m.sizeBytes, sha256: m.sha256 })),
  };
}

/** Kopplungs-Code: vier Ziffern, nicht schon vergeben */
export function pairingCode(taken: ReadonlySet<string>, random: () => number = Math.random): string {
  for (let i = 0; i < 100; i++) {
    const code = String(Math.floor(random() * 9000) + 1000);
    if (!taken.has(code)) return code;
  }
  throw new Error('Zu viele offene Kopplungen');
}

/** Bytes lesbar (MB/GB) */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',')} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} GB`;
}
