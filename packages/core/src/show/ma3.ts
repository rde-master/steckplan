// grandMA3: welcher Cue läuft in der Sequenz einer Lichtszene? Steckplan schickt dem Pult per OSC (/cmd) eine Zeile
// Lua; das Pult antwortet per SendOSC an den OSC-Empfang von Steckplan mit /steckplan/ma3 (Sequenz, Cue, Name).
// Auf dem Pult muss nichts installiert werden – nur OSC (Empfangen mit Befehlen, Senden an Steckplan) eingerichtet sein.

/** höchste Sequenznummer im grandMA3 */
export const MA3_SEQUENCE_MAX = 99999;
/** Antwort des Pults */
export const MA3_REPLY_ADDRESS = '/steckplan/ma3';
/** so lange wartet Steckplan auf die Antwort */
export const MA3_REPLY_TIMEOUT_MS = 2000;

export const MA3_QUERY_DEFAULTS = { enabled: false, host: '', port: 8000, address: '/cmd', oscLine: 1 } as const;

export interface Ma3QueryConfig {
  enabled: boolean;
  host: string;
  port: number;
  address: string;
  /** Nummer der OSC-Zeile im Pult (Menü In & Out → OSC), über die es antwortet */
  oscLine: number;
}

export function ma3QueryConfig(raw: unknown): Ma3QueryConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Ma3QueryConfig>;
  return {
    enabled: r.enabled === true,
    host: typeof r.host === 'string' ? r.host.trim() : '',
    port: Number.isInteger(r.port) && r.port! >= 1 && r.port! <= 65535 ? r.port! : MA3_QUERY_DEFAULTS.port,
    address: typeof r.address === 'string' && /^\/\S+$/.test(r.address.trim()) ? r.address.trim() : MA3_QUERY_DEFAULTS.address,
    oscLine: Number.isInteger(r.oscLine) && r.oscLine! >= 1 && r.oscLine! <= 999 ? r.oscLine! : MA3_QUERY_DEFAULTS.oscLine,
  };
}

export function isMa3Sequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MA3_SEQUENCE_MAX;
}

/**
 * Befehlszeile für das Pult: Lua sucht die Sequenz, nimmt ihren aktuellen Cue (Nummer intern × 1000) und schickt
 * Sequenz, Cue-Nummer und Name per SendOSC zurück. Cue „?“ = Sequenz gibt es nicht, „-“ = kein Cue aktiv. Im Lua stehen
 * keine doppelten Anführungszeichen (die Befehlszeile umschließt es damit) – sie entstehen über string.char(34);
 * Kommas und Anführungszeichen im Namen werden zu Leerzeichen (SendOSC trennt mit Kommas).
 */
export function ma3QueryCommand(sequence: number, oscLine: number): string {
  const lua = [
    'local q=string.char(34)',
    `local ok,o=pcall(ObjectList,'Sequence ${sequence}')`,
    'local s=ok and o and o[1]',
    'local c=s and s:CurrentChild()',
    "local no,nm='-','-' if not s then no='?' end",
    "if c then no=string.format('%g',(c.no or 0)/1000) nm=string.gsub(c.name or '','[,'..q..']',' ') if nm=='' then nm='-' end end",
    `Cmd('SendOSC ${oscLine} '..q..'${MA3_REPLY_ADDRESS},iss,${sequence},'..no..','..nm..q)`,
  ].join(' ');
  return `Lua "${lua}"`;
}

/** Stand der Abfrage für die Anzeige im Führen */
export interface Ma3CueState {
  sequence: number;
  /** Lichtszene, für die gefragt wurde */
  sceneId?: string;
  /** Cue-Nummer wie am Pult („3“, „1.5“) bzw. Name; fehlt, solange keine Antwort da ist */
  cue?: string;
  name?: string;
  /** gefragt bzw. beantwortet (ISO) */
  askedAt: string;
  answeredAt?: string;
  /** Sequenz gibt es nicht / kein Cue aktiv / keine Antwort / nicht gesendet */
  status: 'waiting' | 'ok' | 'noCue' | 'noSequence' | 'timeout' | 'error';
  error?: string;
}

export interface Ma3Reply {
  sequence: number;
  cue?: string;
  name?: string;
  /** Pult kennt die Sequenz nicht */
  noSequence: boolean;
}

/** Antwort /steckplan/ma3 (Sequenz, Cue, Name) lesen; null = keine gültige Antwort */
export function parseMa3Reply(args: readonly unknown[]): Ma3Reply | null {
  const sequence = typeof args[0] === 'number' ? args[0] : typeof args[0] === 'string' ? Number(args[0]) : NaN;
  if (!isMa3Sequence(sequence)) return null;
  const text = (v: unknown) => {
    const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
    return s && s !== '-' ? s.slice(0, 120) : undefined;
  };
  const raw = text(args[1]);
  const noSequence = raw === '?';
  const cue = noSequence ? undefined : raw;
  const name = noSequence ? undefined : text(args[2]);
  return { sequence, ...(cue !== undefined ? { cue } : {}), ...(name !== undefined ? { name } : {}), noSequence };
}
