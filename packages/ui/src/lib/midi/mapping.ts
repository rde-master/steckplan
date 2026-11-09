// Belegung des APC40 für die Vorstellung (Führen): welche Taste welche Aktion auslöst, und wie ihre LED leuchtet.
// Je Gerät gespeichert (der Controller hängt an diesem Rechner). Vorbelegung: die Clip-Matrix sind die Ablaufpunkte
// 1–40 (aktuell grün, beim Abspielen blinkend; nächster rot; übrige gelb), Transport, Szenen, Tap und Schlag.
import { useSyncExternalStore } from 'react';
import { APC40_CONTROLS, clipId, CLIP_ROWS, COLUMNS, type LedState } from './apc40';

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
  'tap',
  'beatBack',
  'beatForward',
  'click',
  'preroll',
  'lead',
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
};

export function defaultMapping(): MidiMapping {
  const m: MidiMapping = {};
  // Matrix: Ablaufpunkte 1–40 zeilenweise (oben links = 1)
  for (let row = 0; row < CLIP_ROWS; row++) for (let col = 0; col < COLUMNS; col++) m[clipId(col, row)] = { action: 'item', value: row * COLUMNS + col + 1 };
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
  click: boolean;
  preroll: boolean;
  leading: boolean;
  hasTempo: boolean;
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
    case 'back':
    case 'forward':
      return 'yellow';
  }
}
