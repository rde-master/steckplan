// Akai APC40 (Original, 2009) – Protokoll (siehe docs/APC40_MIDI_Dokumentation.md): Bedienelemente mit fester
// Kennung, eingehende Nachrichten → Bedienelement, LED-Zustand → MIDI-Nachricht. Das Gerät wird in Modus 2
// geschaltet (alle Tasten momentan, alle LEDs vom Programm). Nur die 40 Clip-Tasten sind mehrfarbig (Grün/Rot/Gelb).

/** Modus 2 („Alternate Ableton Live“) – nach jedem Verbinden senden */
export const APC40_INIT = [0xf0, 0x47, 0x7f, 0x73, 0x60, 0x00, 0x04, 0x42, 0x01, 0x00, 0x00, 0xf7];

export const COLUMNS = 8;
export const CLIP_ROWS = 5;

/** LED-Zustand: Clip-Tasten farbig, Clip-Stopp/Szenen mit Blinken, übrige nur an/aus */
export type LedState = 'off' | 'green' | 'greenBlink' | 'red' | 'redBlink' | 'yellow' | 'yellowBlink' | 'on' | 'blink';
export type LedKind = 'color' | 'blink' | 'onoff' | 'none';

export interface Apc40Control {
  id: string;
  /** Beschriftung auf dem Gerät */
  label: string;
  note: number;
  /** MIDI-Kanal (Spalte) bei den Pro-Spur-Tasten, sonst 0 */
  channel: number;
  led: LedKind;
}

const control = (id: string, label: string, note: number, channel: number, led: LedKind): Apc40Control => ({ id, label, note, channel, led });

/** Kennung einer Clip-Taste: Spalte 0–7, Reihe 0–4 (0 = oben) */
export const clipId = (col: number, row: number) => `clip:${col}:${row}`;

function buildControls(): Apc40Control[] {
  const list: Apc40Control[] = [];
  for (let col = 0; col < COLUMNS; col++) {
    for (let row = 0; row < CLIP_ROWS; row++) list.push(control(clipId(col, row), `Clip ${col + 1}/${row + 1}`, 53 + row, col, 'color'));
    list.push(control(`clipStop:${col}`, `Clip Stop ${col + 1}`, 52, col, 'blink'));
    list.push(control(`trackSelect:${col}`, `Track ${col + 1}`, 51, col, 'onoff'));
    list.push(control(`activator:${col}`, `Activator ${col + 1}`, 50, col, 'onoff'));
    list.push(control(`solo:${col}`, `Solo/Cue ${col + 1}`, 49, col, 'onoff'));
    list.push(control(`recArm:${col}`, `Rec Arm ${col + 1}`, 48, col, 'onoff'));
  }
  for (let n = 0; n < CLIP_ROWS; n++) list.push(control(`scene:${n}`, `Scene ${n + 1}`, 82 + n, 0, 'blink'));
  const device = ['Clip/Track', 'Device On/Off', '◀ Device', 'Device ▶', 'Detail View', 'Rec Quant.', 'MIDI Overdub', 'Metronome'];
  device.forEach((label, n) => list.push(control(`device:${n}`, label, 58 + n, 0, 'onoff')));
  list.push(
    control('master', 'Master', 80, 0, 'onoff'),
    control('stopAll', 'Stop All Clips', 81, 0, 'none'),
    control('pan', 'Pan', 87, 0, 'onoff'),
    control('sendA', 'Send A', 88, 0, 'onoff'),
    control('sendB', 'Send B', 89, 0, 'onoff'),
    control('sendC', 'Send C', 90, 0, 'onoff'),
    control('play', 'Play', 91, 0, 'none'),
    control('stop', 'Stop', 92, 0, 'none'),
    control('record', 'Rec', 93, 0, 'none'),
    control('bankUp', 'Bank ▲', 94, 0, 'none'),
    control('bankDown', 'Bank ▼', 95, 0, 'none'),
    control('bankRight', 'Bank ▶', 96, 0, 'none'),
    control('bankLeft', 'Bank ◀', 97, 0, 'none'),
    control('shift', 'Shift', 98, 0, 'none'),
    control('tap', 'Tap Tempo', 99, 0, 'none'),
    control('nudgePlus', 'Nudge +', 100, 0, 'none'),
    control('nudgeMinus', 'Nudge −', 101, 0, 'none'),
  );
  return list;
}

export const APC40_CONTROLS: Apc40Control[] = buildControls();
const byId = new Map(APC40_CONTROLS.map((c) => [c.id, c]));
/** Pro-Spur-Noten (Kanal zählt) */
const perTrack = (note: number) => note >= 48 && note <= 57;
const byNote = new Map(APC40_CONTROLS.map((c) => [`${c.note}:${perTrack(c.note) ? c.channel : 0}`, c]));

export function apc40Control(id: string): Apc40Control | undefined {
  return byId.get(id);
}

/** Kennung des relativen Drehreglers „Cue Level“ */
export const CUE_LEVEL = 'cueLevel';

export type Apc40Input = { kind: 'button'; id: string; pressed: boolean } | { kind: 'encoder'; id: string; delta: number } | { kind: 'analog'; id: string; value: number };

// ---------- Fader und Drehregler (absolut, 0–127) ----------

export interface Apc40Analog {
  id: string;
  label: string;
  cc: number;
  /** MIDI-Kanal bei den Kanalfadern (Spalte), sonst 0 */
  channel: number;
  kind: 'fader' | 'knob';
  /** CC für den Stil des LED-Rings (nur Drehregler) */
  ringStyleCc?: number;
}

function buildAnalog(): Apc40Analog[] {
  const list: Apc40Analog[] = [];
  for (let col = 0; col < COLUMNS; col++) list.push({ id: `fader:${col}`, label: `Fader ${col + 1}`, cc: 7, channel: col, kind: 'fader' });
  list.push({ id: 'masterFader', label: 'Master-Fader', cc: 14, channel: 0, kind: 'fader' }, { id: 'crossfader', label: 'Crossfader', cc: 15, channel: 0, kind: 'fader' });
  for (let n = 0; n < 8; n++) list.push({ id: `trackKnob:${n}`, label: `Track Control ${n + 1}`, cc: 48 + n, channel: 0, kind: 'knob', ringStyleCc: 56 + n });
  for (let n = 0; n < 8; n++) list.push({ id: `deviceKnob:${n}`, label: `Device Control ${n + 1}`, cc: 16 + n, channel: 0, kind: 'knob', ringStyleCc: 24 + n });
  return list;
}

export const APC40_ANALOG: Apc40Analog[] = buildAnalog();
const analogById = new Map(APC40_ANALOG.map((c) => [c.id, c]));
/** Kanalfader: Kanal zählt; übrige Regler auf beliebigem Kanal (Device-Regler sind je nach Modus gebankt) */
const analogByCc = new Map(APC40_ANALOG.map((c) => [`${c.cc}:${c.cc === 7 ? c.channel : 0}`, c]));

export function apc40Analog(id: string): Apc40Analog | undefined {
  return analogById.get(id);
}

/** Ring eines Drehreglers: Stil „Volume“ (Balken) bzw. aus, und Wert 0–1 (setzt Ring und Position des Reglers) */
export function ringMessages(id: string, value: number | null): number[][] {
  const c = analogById.get(id);
  if (!c?.ringStyleCc) return [];
  if (value === null) return [[0xb0, c.ringStyleCc, 0]];
  return [
    [0xb0, c.ringStyleCc, 2],
    [0xb0, c.cc, Math.round(Math.min(1, Math.max(0, value)) * 127)],
  ];
}

/** Eingehende MIDI-Nachricht → Bedienelement (Taste gedrückt/losgelassen, Cue-Level-Drehung) */
export function parseApc40(data: ArrayLike<number>): Apc40Input | null {
  const [status = 0, d1 = 0, d2 = 0] = Array.from(data);
  const type = status & 0xf0;
  const channel = status & 0x0f;
  if (type === 0x90 || type === 0x80) {
    const c = byNote.get(`${d1}:${perTrack(d1) ? channel : 0}`);
    if (!c) return null;
    // Note-On mit Velocity 0 gilt als Loslassen
    return { kind: 'button', id: c.id, pressed: type === 0x90 && d2 > 0 };
  }
  if (type === 0xb0) {
    const analog = analogByCc.get(`${d1}:${d1 === 7 ? channel : 0}`);
    if (analog) return { kind: 'analog', id: analog.id, value: Math.min(127, d2) / 127 };
  }
  if (type === 0xb0 && d1 === 47) {
    const delta = d2 < 64 ? d2 : d2 - 128;
    return delta === 0 ? null : { kind: 'encoder', id: CUE_LEVEL, delta };
  }
  return null;
}

const COLOR_VELOCITY: Partial<Record<LedState, number>> = { green: 1, greenBlink: 2, red: 3, redBlink: 4, yellow: 5, yellowBlink: 6 };

/** Zustand auf das, was die Taste kann (z. B. Farbe → an bei einfarbigen Tasten) */
export function fitLed(kind: LedKind, state: LedState): LedState {
  if (kind === 'none' || state === 'off') return 'off';
  const blinking = state === 'blink' || state.endsWith('Blink');
  if (kind === 'color') return state === 'on' ? 'green' : state === 'blink' ? 'greenBlink' : state;
  if (kind === 'blink') return blinking ? 'blink' : 'on';
  return 'on';
}

/** MIDI-Nachricht, die die LED einer Taste setzt (null = Taste ohne LED) */
export function ledMessage(id: string, state: LedState): number[] | null {
  const c = byId.get(id);
  if (!c || c.led === 'none') return null;
  const fitted = fitLed(c.led, state);
  if (fitted === 'off') return [0x80 | c.channel, c.note, 0];
  const velocity = c.led === 'color' ? COLOR_VELOCITY[fitted]! : fitted === 'blink' ? 2 : 1;
  return [0x90 | c.channel, c.note, velocity];
}

/** Ist das ein APC40 (Original)? Der Port-Name enthält „APC40“, aber nicht „mkII“. */
export function isApc40Port(name: string | null | undefined): boolean {
  return !!name && /apc\s*40/i.test(name) && !/mk\s*ii|mk2/i.test(name);
}
