// Belegung des APC40 für die Vorstellung (Führen): welche Taste welche Aktion auslöst, und wie ihre LED leuchtet.
// Je Gerät gespeichert (der Controller hängt an diesem Rechner). Vorbelegung: die Clip-Matrix sind die Ablaufpunkte
// 1–32 (aktuell grün, beim Abspielen blinkend; nächster rot; übrige gelb), darunter das Metronom (Schlag 1–8: blinkt
// im Takt, Druck springt im laufenden Takt auf diesen Schlag), Transport, Szenen, Tap und Schlag; Clip Stop 1–6:
// spulen (−5 s, −1 s, +1 s, +5 s) und Textzeile zurück/weiter.
import { useSyncExternalStore } from 'react';
import { APC40_ANALOG, APC40_CONTROLS, clipId, CLIP_ROWS, COLUMNS, type LedState } from './apc40';

export const MIDI_ACTIONS = [
  'none',
  'toggle',
  'play',
  'pause',
  'stop',
  'back',
  'forward',
  'prev',
  'next',
  'item',
  'scenePrev',
  'sceneNext',
  'linePrev',
  'lineNext',
  'tap',
  'beatBack',
  'beatForward',
  'click',
  'preroll',
  'lead',
  'lyricsText',
  'lyricsBackground',
  'beat',
] as const;
export type MidiActionName = (typeof MIDI_ACTIONS)[number];

export interface MidiAction {
  action: MidiActionName;
  /** Sekunden (back/forward) bzw. Nummer des Ablaufpunkts (item) */
  value?: number;
}

export type MidiMapping = Record<string, MidiAction>;

/** Aktionen mit Wert */
export const ACTION_VALUE: Partial<Record<MidiActionName, { min: number; max: number; step: number; default: number }>> = {
  back: { min: 0.1, max: 60, step: 0.1, default: 5 },
  forward: { min: 0.1, max: 60, step: 0.1, default: 5 },
  item: { min: 1, max: 999, step: 1, default: 1 },
  beat: { min: 1, max: 16, step: 1, default: 1 },
};

export function defaultMapping(): MidiMapping {
  const m: MidiMapping = {};
  // Matrix: Ablaufpunkte 1–32 zeilenweise (oben links = 1); untere Reihe: Metronom (Schlag 1–8)
  for (let row = 0; row < CLIP_ROWS - 1; row++) for (let col = 0; col < COLUMNS; col++) m[clipId(col, row)] = { action: 'item', value: row * COLUMNS + col + 1 };
  for (let col = 0; col < COLUMNS; col++) m[clipId(col, CLIP_ROWS - 1)] = { action: 'beat', value: col + 1 };
  Object.assign(m, {
    play: { action: 'toggle' },
    stop: { action: 'stop' },
    record: { action: 'click' },
    tap: { action: 'tap' },
    nudgeMinus: { action: 'beatBack' },
    nudgePlus: { action: 'beatForward' },
    bankUp: { action: 'prev' },
    bankDown: { action: 'next' },
    bankLeft: { action: 'scenePrev' },
    bankRight: { action: 'sceneNext' },
    'scene:0': { action: 'prev' },
    'scene:1': { action: 'next' },
    'scene:2': { action: 'scenePrev' },
    'scene:3': { action: 'sceneNext' },
    'scene:4': { action: 'lead' },
    'clipStop:0': { action: 'back', value: 5 },
    'clipStop:1': { action: 'back', value: 1 },
    'clipStop:2': { action: 'forward', value: 1 },
    'clipStop:3': { action: 'forward', value: 5 },
    'clipStop:4': { action: 'linePrev' },
    'clipStop:5': { action: 'lineNext' },
    'device:7': { action: 'click' },
    'device:6': { action: 'preroll' },
  } satisfies MidiMapping);
  return m;
}

const KEY = 'steckplan.apc40';
const known = new Set<string>(MIDI_ACTIONS);
const ids = new Set(APC40_CONTROLS.map((c) => c.id));

/** Gespeicherte Belegung prüfen (unbekannte Tasten/Aktionen fallen weg) */
export function sanitizeMapping(raw: unknown): MidiMapping | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: MidiMapping = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ids.has(id) || !value || typeof value !== 'object') continue;
    const { action, value: v } = value as { action?: unknown; value?: unknown };
    if (typeof action !== 'string' || !known.has(action)) continue;
    const spec = ACTION_VALUE[action as MidiActionName];
    out[id] = { action: action as MidiActionName, ...(spec ? { value: typeof v === 'number' && Number.isFinite(v) ? Math.min(spec.max, Math.max(spec.min, v)) : spec.default } : {}) };
  }
  return out;
}

function load(): MidiMapping {
  try {
    return sanitizeMapping(JSON.parse(localStorage.getItem(KEY) ?? 'null')) ?? defaultMapping();
  } catch {
    return defaultMapping();
  }
}

let mapping: MidiMapping | null = null;
const listeners = new Set<() => void>();
const current = () => (mapping ??= load());

function save(next: MidiMapping): void {
  mapping = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ohne Speicher gilt die Belegung bis zum Neuladen
  }
  for (const l of listeners) l();
}

export function setMidiAction(id: string, action: MidiAction): void {
  const next = { ...current() };
  if (action.action === 'none') delete next[id];
  else next[id] = action;
  save(next);
}

export function resetMidiMapping(): void {
  save(defaultMapping());
  saveAnalog(defaultAnalogMapping());
}

export function useMidiMapping(): MidiMapping {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    current,
  );
}

// ---------- Fader und Drehregler ----------

/** Aktionen für Fader und Drehregler: Helligkeit von Text bzw. Hintergrund im Textfenster, Ein-/Ausblendzeit */
export const ANALOG_ACTIONS = ['none', 'textLevel', 'backgroundLevel', 'fadeTime'] as const;
export type AnalogActionName = (typeof ANALOG_ACTIONS)[number];
export type AnalogMapping = Record<string, AnalogActionName>;

/** Vorbelegung: Fader 1 = Text, Fader 2 = Hintergrund, oberer Drehregler 1 = Blendzeit */
export function defaultAnalogMapping(): AnalogMapping {
  return { 'fader:0': 'textLevel', 'fader:1': 'backgroundLevel', 'trackKnob:0': 'fadeTime' };
}

const ANALOG_KEY = 'steckplan.apc40.analog';
const knownAnalog = new Set<string>(ANALOG_ACTIONS);
const analogIds = new Set(APC40_ANALOG.map((c) => c.id));

export function sanitizeAnalogMapping(raw: unknown): AnalogMapping | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: AnalogMapping = {};
  for (const [id, action] of Object.entries(raw as Record<string, unknown>)) {
    if (analogIds.has(id) && typeof action === 'string' && knownAnalog.has(action) && action !== 'none') out[id] = action as AnalogActionName;
  }
  return out;
}

let analog: AnalogMapping | null = null;
const currentAnalog = () =>
  (analog ??= (() => {
    try {
      return sanitizeAnalogMapping(JSON.parse(localStorage.getItem(ANALOG_KEY) ?? 'null')) ?? defaultAnalogMapping();
    } catch {
      return defaultAnalogMapping();
    }
  })());

function saveAnalog(next: AnalogMapping): void {
  analog = next;
  try {
    localStorage.setItem(ANALOG_KEY, JSON.stringify(next));
  } catch {
    // ohne Speicher gilt die Belegung bis zum Neuladen
  }
  for (const l of listeners) l();
}

export function setAnalogAction(id: string, action: AnalogActionName): void {
  const next = { ...currentAnalog() };
  if (action === 'none') delete next[id];
  else next[id] = action;
  saveAnalog(next);
}

export function useAnalogMapping(): AnalogMapping {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    currentAnalog,
    currentAnalog,
  );
}

// ---------- LEDs aus dem Zustand der Vorstellung ----------

export interface PerformanceLedState {
  playing: boolean;
  /** Nummer des aktuellen und des nächsten Ablaufpunkts */
  currentNumber: number | undefined;
  nextNumber: number | undefined;
  /** vorhandene Nummern */
  numbers: Set<number>;
  hasPrevItem: boolean;
  hasNextItem: boolean;
  hasPrevScene: boolean;
  hasNextScene: boolean;
  /** Textzeile zurück/weiter möglich (vorige bzw. nächste Zeile mit Zeit) */
  hasPrevLine: boolean;
  hasNextLine: boolean;
  click: boolean;
  preroll: boolean;
  leading: boolean;
  hasTempo: boolean;
  /** Textfenster: Text bzw. Hintergrund ganz ausgeblendet (Helligkeit 0) */
  hideText: boolean;
  hideBackground: boolean;
  /** Metronom: aktueller Schlag im Takt (1 …) und Schläge je Takt; ohne Tempo undefined */
  beat?: number;
  beatsPerBar?: number;
}

/** LED einer belegten Taste: zeigt Zustand bzw. Verfügbarkeit der Aktion */
export function ledFor(action: MidiAction | undefined, s: PerformanceLedState): LedState {
  if (!action) return 'off';
  switch (action.action) {
    case 'none':
      return 'off';
    case 'item': {
      const n = action.value;
      if (n === undefined || !s.numbers.has(n)) return 'off';
      if (n === s.currentNumber) return s.playing ? 'greenBlink' : 'green';
      if (n === s.nextNumber) return 'red';
      return 'yellow';
    }
    case 'toggle':
    case 'play':
      return s.playing ? 'greenBlink' : 'green';
    case 'pause':
      return s.playing ? 'yellow' : 'off';
    case 'stop':
      return 'red';
    case 'prev':
      return s.hasPrevItem ? 'yellow' : 'off';
    case 'next':
      return s.hasNextItem ? 'yellow' : 'off';
    case 'scenePrev':
      return s.hasPrevScene ? 'green' : 'off';
    case 'sceneNext':
      return s.hasNextScene ? 'green' : 'off';
    case 'linePrev':
      return s.hasPrevLine ? 'yellow' : 'off';
    case 'lineNext':
      return s.hasNextLine ? 'yellow' : 'off';
    case 'tap':
    case 'beatBack':
    case 'beatForward':
      return s.hasTempo ? 'yellow' : 'off';
    case 'click':
      return s.click ? (s.playing ? 'redBlink' : 'red') : 'off';
    case 'preroll':
      return s.preroll ? 'red' : 'off';
    case 'lead':
      return s.leading ? 'green' : 'yellowBlink';
    case 'beat': {
      // Metronom: der laufende Schlag leuchtet (die „1“ rot, sonst grün); Schläge außerhalb des Takts aus
      const n = action.value;
      if (n === undefined || s.beat === undefined || n > (s.beatsPerBar ?? 4)) return 'off';
      return n === s.beat ? (n === 1 ? 'red' : 'green') : 'off';
    }
    case 'lyricsText':
      return s.hideText ? 'redBlink' : 'green';
    case 'lyricsBackground':
      return s.hideBackground ? 'redBlink' : 'green';
    case 'back':
    case 'forward':
      return 'yellow';
  }
}
