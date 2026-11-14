import { describe, expect, it } from 'vitest';
import { APC40_CONTROLS, APC40_INIT, clipId, isApc40Port, ledMessage, parseApc40, ringMessages } from './apc40';
import { defaultAnalogMapping, defaultMapping, ledFor, sanitizeAnalogMapping, sanitizeMapping, type PerformanceLedState } from './mapping';

describe('APC40: Protokoll', () => {
  it('Modus 2 per SysEx', () => {
    expect(APC40_INIT).toEqual([0xf0, 0x47, 0x7f, 0x73, 0x60, 0x00, 0x04, 0x42, 0x01, 0x00, 0x00, 0xf7]);
  });
  it('Tasten: Spalte steckt im Kanal, globale Tasten auf beliebigem Kanal', () => {
    expect(parseApc40([0x92, 0x35, 0x7f])).toEqual({ kind: 'button', id: clipId(2, 0), pressed: true });
    expect(parseApc40([0x87, 0x39, 0x7f])).toEqual({ kind: 'button', id: clipId(7, 4), pressed: false });
    expect(parseApc40([0x90, 0x63, 0x7f])).toEqual({ kind: 'button', id: 'tap', pressed: true });
    expect(parseApc40([0x93, 0x5b, 0x7f])).toEqual({ kind: 'button', id: 'play', pressed: true });
    // Note-On mit Velocity 0 = Loslassen
    expect(parseApc40([0x90, 0x52, 0x00])).toEqual({ kind: 'button', id: 'scene:0', pressed: false });
    expect(parseApc40([0x90, 0x10, 0x7f])).toBeNull();
  });
  it('Cue Level relativ (Zweierkomplement)', () => {
    expect(parseApc40([0xb0, 47, 3])).toEqual({ kind: 'encoder', id: 'cueLevel', delta: 3 });
    expect(parseApc40([0xb0, 47, 126])).toEqual({ kind: 'encoder', id: 'cueLevel', delta: -2 });
    expect(parseApc40([0xb0, 47, 0])).toBeNull();
    expect(parseApc40([0xb0, 46, 64])).toBeNull(); // unbekannter Regler
  });
  it('LEDs: Farben nur in der Matrix, Blinken bei Szenen/Clip-Stopp, sonst an/aus', () => {
    expect(ledMessage(clipId(3, 2), 'redBlink')).toEqual([0x93, 0x37, 4]);
    expect(ledMessage(clipId(7, 4), 'yellow')).toEqual([0x97, 0x39, 5]);
    expect(ledMessage(clipId(0, 0), 'off')).toEqual([0x80, 0x35, 0]);
    expect(ledMessage('scene:1', 'greenBlink')).toEqual([0x90, 0x53, 2]);
    expect(ledMessage('clipStop:2', 'red')).toEqual([0x92, 0x34, 1]);
    expect(ledMessage('device:7', 'yellowBlink')).toEqual([0x90, 0x41, 1]);
    expect(ledMessage('recArm:2', 'on')).toEqual([0x92, 0x30, 1]);
    expect(ledMessage('tap', 'green')).toBeNull();
  });
  it('jede Taste genau einmal', () => {
    const keys = APC40_CONTROLS.map((c) => `${c.note}:${c.note >= 48 && c.note <= 57 ? c.channel : 0}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(APC40_CONTROLS.filter((c) => c.led === 'color')).toHaveLength(40);
  });
  it('Port-Name: APC40, aber nicht mkII', () => {
    expect(isApc40Port('Akai APC40')).toBe(true);
    expect(isApc40Port('APC40 MIDI 1')).toBe(true);
    expect(isApc40Port('APC40 mkII')).toBe(false);
    expect(isApc40Port('Launchpad')).toBe(false);
  });
});

describe('APC40: Belegung und LEDs', () => {
  const state: PerformanceLedState = {
    playing: false,
    currentNumber: 2,
    nextNumber: 3,
    numbers: new Set([1, 2, 3, 4]),
    hasPrevItem: true,
    hasNextItem: true,
    hasPrevScene: false,
    hasNextScene: true,
    hasPrevLine: false,
    hasNextLine: true,
    click: false,
    preroll: true,
    leading: false,
    hasTempo: true,
    hideText: false,
    hideBackground: true,
    beat: 1,
    beatsPerBar: 3,
  };
  it('Metronom: untere Matrixreihe = Schlag 1–8; laufender Schlag leuchtet (die „1“ rot), außerhalb des Takts aus', () => {
    const m = defaultMapping();
    expect(m[clipId(0, 4)]).toEqual({ action: 'beat', value: 1 });
    expect(m[clipId(7, 4)]).toEqual({ action: 'beat', value: 8 });
    expect(m[clipId(7, 3)]).toEqual({ action: 'item', value: 32 });
    expect(ledFor({ action: 'beat', value: 1 }, state)).toBe('red');
    expect(ledFor({ action: 'beat', value: 2 }, state)).toBe('off');
    expect(ledFor({ action: 'beat', value: 2 }, { ...state, beat: 2 })).toBe('green');
    expect(ledFor({ action: 'beat', value: 4 }, { ...state, beat: 4 })).toBe('off');
    expect(ledFor({ action: 'beat', value: 1 }, { ...state, beat: undefined })).toBe('off');
  });
  it('Textfenster: Text/Hintergrund eingeblendet grün, ausgeblendet rot blinkend', () => {
    expect(ledFor({ action: 'lyricsText' }, state)).toBe('green');
    expect(ledFor({ action: 'lyricsBackground' }, state)).toBe('redBlink');
  });
  it('Matrix = Ablaufpunkte: aktuell grün (blinkend beim Abspielen), nächster rot, übrige gelb, leer aus', () => {
    const m = defaultMapping();
    expect(m[clipId(0, 0)]).toEqual({ action: 'item', value: 1 });
    expect(m[clipId(7, 3)]).toEqual({ action: 'item', value: 32 });
    expect(ledFor(m[clipId(1, 0)], state)).toBe('green');
    expect(ledFor(m[clipId(1, 0)], { ...state, playing: true })).toBe('greenBlink');
    expect(ledFor(m[clipId(2, 0)], state)).toBe('red');
    expect(ledFor(m[clipId(0, 0)], state)).toBe('yellow');
    expect(ledFor(m[clipId(5, 0)], state)).toBe('off');
  });
  it('Zustände: Szene zurück aus ohne vorige Szene, Vorlauf an, Klick aus', () => {
    expect(ledFor({ action: 'scenePrev' }, state)).toBe('off');
    expect(ledFor({ action: 'sceneNext' }, state)).toBe('green');
    expect(ledFor({ action: 'preroll' }, state)).toBe('red');
    expect(ledFor({ action: 'click' }, state)).toBe('off');
    expect(ledFor(undefined, state)).toBe('off');
  });
  it('Textzeile zurück/weiter: Vorbelegung Clip Stop 5 und 6, gelb, wenn es die Zeile gibt', () => {
    const m = defaultMapping();
    expect(m['clipStop:4']).toEqual({ action: 'linePrev' });
    expect(m['clipStop:5']).toEqual({ action: 'lineNext' });
    expect(ledFor(m['clipStop:4'], state)).toBe('off');
    expect(ledFor(m['clipStop:5'], state)).toBe('yellow');
    expect(sanitizeMapping({ 'clipStop:6': { action: 'lineNext', value: 3 } })).toEqual({ 'clipStop:6': { action: 'lineNext' } });
  });
  it('gespeicherte Belegung prüfen', () => {
    expect(sanitizeMapping({ tap: { action: 'tap' }, unbekannt: { action: 'tap' }, play: { action: 'boom' }, 'clipStop:0': { action: 'back', value: 999 }, [clipId(0, 0)]: { action: 'item' } })).toEqual({
      tap: { action: 'tap' },
      'clipStop:0': { action: 'back', value: 60 },
      [clipId(0, 0)]: { action: 'item', value: 1 },
    });
    expect(sanitizeMapping('x')).toBeNull();
  });
});

describe('APC40: Fader und Drehregler', () => {
  it('Kanalfader nach Kanal, Master/Crossfader und Regler auf beliebigem Kanal, Wert 0–1', () => {
    expect(parseApc40([0xb1, 7, 127])).toEqual({ kind: 'analog', id: 'fader:1', value: 1 });
    expect(parseApc40([0xb0, 7, 0])).toEqual({ kind: 'analog', id: 'fader:0', value: 0 });
    expect(parseApc40([0xb0, 14, 64])).toMatchObject({ id: 'masterFader' });
    expect(parseApc40([0xb0, 15, 64])).toMatchObject({ id: 'crossfader' });
    expect(parseApc40([0xb0, 48, 127])).toEqual({ kind: 'analog', id: 'trackKnob:0', value: 1 });
    expect(parseApc40([0xb3, 23, 0])).toEqual({ kind: 'analog', id: 'deviceKnob:7', value: 0 });
    // Cue Level bleibt relativ
    expect(parseApc40([0xb0, 47, 1])).toEqual({ kind: 'encoder', id: 'cueLevel', delta: 1 });
  });

  it('LED-Ring: Stil „Volume“ und Wert; ohne Aufgabe aus; Fader haben keinen Ring', () => {
    expect(ringMessages('trackKnob:0', 0.5)).toEqual([
      [0xb0, 56, 2],
      [0xb0, 48, 64],
    ]);
    expect(ringMessages('deviceKnob:2', 1)).toEqual([
      [0xb0, 26, 2],
      [0xb0, 18, 127],
    ]);
    expect(ringMessages('trackKnob:3', null)).toEqual([[0xb0, 59, 0]]);
    expect(ringMessages('fader:0', 0.5)).toEqual([]);
  });

  it('Vorbelegung: Fader 1 = Text, Fader 2 = Hintergrund, Track Control 1 = Blendzeit; gespeicherte Belegung prüfen', () => {
    expect(defaultAnalogMapping()).toEqual({ 'fader:0': 'textLevel', 'fader:1': 'backgroundLevel', 'trackKnob:0': 'fadeTime' });
    expect(sanitizeAnalogMapping({ 'fader:7': 'textLevel', 'trackKnob:1': 'boom', unbekannt: 'fadeTime', crossfader: 'none' })).toEqual({ 'fader:7': 'textLevel' });
    expect(sanitizeAnalogMapping(null)).toBeNull();
  });
});
