// Tempo und Takt eines Lieds: aktueller Schlag zur Abspielzeit und Tap-Tempo (nach zwei vollen Takten übernehmen).

export const TIME_SIGNATURES = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'] as const;
export const DEFAULT_TIME_SIGNATURE = '4/4';
export const BPM_MIN = 20;
export const BPM_MAX = 400;

/** „6/8“ → { beats: 6, unit: 8 }; ungültig → 4/4 */
export function parseTimeSignature(sig: string | undefined): { beats: number; unit: number } {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(sig ?? '');
  const beats = m ? Number(m[1]) : 4;
  const unit = m ? Number(m[2]) : 4;
  return beats >= 1 && beats <= 32 && unit >= 1 ? { beats, unit } : { beats: 4, unit: 4 };
}

export interface BeatPosition {
  /** Zählzeit im Takt, 1 … beats */
  count: number;
  /** Fortschritt innerhalb des Schlags 0 … 1 */
  phase: number;
  /** Fortschritt innerhalb des Takts 0 … 1 (für den umlaufenden Zeiger) */
  barPhase: number;
  /** laufende Nummer des Takts (ab 1; vor der ersten „1“ 0 oder negativ) */
  bar: number;
}

/** Schlag zur Zeit t (Sekunden des Punkts); offset = Zeit einer „1“ */
export function beatAt(t: number, bpm: number, beats: number, offset = 0): BeatPosition {
  const pos = ((t - offset) * bpm) / 60;
  const index = Math.floor(pos);
  const inBar = ((index % beats) + beats) % beats;
  const phase = pos - index;
  return { count: inBar + 1, phase, barPhase: (inBar + phase) / beats, bar: Math.floor(index / beats) + 1 };
}

/**
 * Zum nächsten (dir 1) bzw. vorigen (dir -1) Schlag im Raster aus Tempo und Lage der „1“ springen. Liegt t (fast)
 * auf einem Schlag, geht es einen ganzen Schlag weiter. Nie vor 0.
 */
export function beatStep(t: number, bpm: number, offset: number, dir: 1 | -1): number {
  const len = 60 / bpm;
  const pos = (t - offset) / len;
  const eps = 0.05;
  const index = dir > 0 ? Math.floor(pos + eps) + 1 : Math.ceil(pos - eps) - 1;
  return Math.max(0, Math.round((offset + index * len) * 1000) / 1000);
}

export interface Tap {
  /** Zeitpunkt des Tippens (Sekunden, monoton – z. B. performance.now() / 1000) */
  wall: number;
  /** Zeit des Punkts beim Tippen; undefined = Wiedergabe stand */
  at?: number;
}

/** Abstand, ab dem eine neue Tap-Folge beginnt (Sekunden) */
export const TAP_RESET_SEC = 2.5;

/** Neuen Tap anhängen; nach einer langen Pause beginnt die Folge neu */
export function addTap(taps: Tap[], tap: Tap): Tap[] {
  const last = taps[taps.length - 1];
  return last && tap.wall - last.wall <= TAP_RESET_SEC && tap.wall > last.wall ? [...taps, tap] : [tap];
}

/** Gerade gezählte Zählzeit der Tap-Folge (1 … beats) und wie viele Taps bis zum Übernehmen fehlen */
export function tapProgress(taps: Tap[], beats: number): { count: number; remaining: number } {
  const n = taps.length;
  return { count: n === 0 ? 0 : ((n - 1) % beats) + 1, remaining: Math.max(0, 2 * beats - n) };
}

/** Gerade durch Punkte (Index → Zeit): Steigung und Achsenabschnitt (kleinste Quadrate) */
function fit(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, i) => {
    num += (i - mx) * (y - my);
    den += (i - mx) ** 2;
  });
  const slope = den ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

/**
 * Tempo aus der Tap-Folge – erst nach zwei vollen Takten, danach mit jedem weiteren vollen Takt (aus den letzten zwei).
 * Der erste Tap jeder Folge ist eine „1“. Lief die Wiedergabe, liefert es auch die Lage der „1“ (offset).
 */
export function tapTempo(taps: Tap[], beats: number): { bpm: number; offset?: number } | null {
  const n = taps.length;
  if (n < 2 * beats || n % beats !== 0) return null;
  const recent = taps.slice(n - 2 * beats);
  const { slope } = fit(recent.map((t) => t.wall));
  if (slope <= 0) return null;
  const bpm = Math.round(Math.min(BPM_MAX, Math.max(BPM_MIN, 60 / slope)) * 10) / 10;
  if (recent.some((t) => t.at === undefined)) return { bpm };
  // Lage der Schläge in der Zeit des Punkts; recent[0] ist eine „1“ (die Folge zählt ab ihrem ersten Tap)
  const { intercept } = fit(recent.map((t) => t.at!));
  const bar = (60 / bpm) * beats;
  const offset = ((intercept % bar) + bar) % bar;
  return { bpm, offset: Math.round(offset * 1000) / 1000 };
}

// ---------- gültiges Tempo (manuell vor Standard) ----------

export interface ItemTempo {
  bpm: number | undefined;
  /** Zeit einer „1“ */
  offset: number | undefined;
  /** stammt vom Tappen (manuell)? */
  manual: boolean;
}

/** Tempo eines Punkts: das manuelle (getappte) hat Vorrang, sonst das gespeicherte */
export function itemTempo(item: { bpm?: number | undefined; beatOffsetSec?: number | undefined; manualBpm?: number | undefined; manualBeatOffsetSec?: number | undefined }): ItemTempo {
  if (item.manualBpm !== undefined) return { bpm: item.manualBpm, offset: item.manualBeatOffsetSec ?? item.beatOffsetSec, manual: true };
  return { bpm: item.bpm, offset: item.beatOffsetSec, manual: false };
}

export const OSC_BPM_DEFAULTS = { enabled: false, host: '', port: 8000, address: '/cmd', command: 'Master 3.1 At BPM {bpm}' } as const;

/** Tempo als Text für den Befehl: höchstens eine Nachkommastelle mit Punkt („120“, „121.5“) */
export function formatBpmValue(bpm: number): string {
  return String(Math.round(bpm * 10) / 10);
}

/** Befehl aus der Vorlage: {bpm} wird ersetzt; ohne Platzhalter wird das Tempo angehängt */
export function bpmCommand(template: string, bpm: number): string {
  const value = formatBpmValue(bpm);
  const text = template.trim() || OSC_BPM_DEFAULTS.command;
  return text.includes('{bpm}') ? text.split('{bpm}').join(value) : `${text} ${value}`;
}
