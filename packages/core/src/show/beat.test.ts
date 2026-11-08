import { describe, expect, it } from 'vitest';
import { addTap, beatStep, bpmCommand, itemTempo, beatAt, parseTimeSignature, tapProgress, tapTempo, TAP_RESET_SEC, type Tap } from './beat';

describe('Tempo und Takt', () => {
  it('Taktart lesen', () => {
    expect(parseTimeSignature('6/8')).toEqual({ beats: 6, unit: 8 });
    expect(parseTimeSignature(undefined)).toEqual({ beats: 4, unit: 4 });
    expect(parseTimeSignature('quatsch')).toEqual({ beats: 4, unit: 4 });
  });

  it('Schlag zur Zeit: 120 BPM, 4/4, „1“ bei 0,25 s', () => {
    expect(beatAt(0.25, 120, 4, 0.25)).toMatchObject({ count: 1, phase: 0, bar: 1 });
    expect(beatAt(0.25 + 0.5 * 3 + 0.25, 120, 4, 0.25)).toMatchObject({ count: 4, phase: 0.5, bar: 1 });
    expect(beatAt(0.25 + 2, 120, 4, 0.25)).toMatchObject({ count: 1, bar: 2 });
    expect(beatAt(0, 120, 4, 0.25).count).toBe(4); // vor der ersten „1“
    expect(beatAt(0.25 + 0.75, 120, 3, 0.25).barPhase).toBeCloseTo(0.5, 5);
  });

  it('Tap: nach zwei vollen Takten übernehmen, dann je weiterem Takt; Pause beginnt neu; Lage der „1“', () => {
    const beatLen = 0.5; // 120 BPM
    let taps: Tap[] = [];
    const results: (ReturnType<typeof tapTempo>)[] = [];
    for (let i = 0; i < 12; i++) {
      // leichte Ungenauigkeit beim Tippen; Wiedergabe läuft, „1“ des Lieds bei 0,3 s
      const jitter = i % 2 ? 0.01 : -0.01;
      taps = addTap(taps, { wall: 100 + i * beatLen + jitter, at: 10.3 + i * beatLen + jitter });
      results.push(tapTempo(taps, 4));
    }
    expect(results.slice(0, 7).every((r) => r === null)).toBe(true);
    expect(results[7]!.bpm).toBeCloseTo(120, 0);
    expect(results[7]!.offset).toBeCloseTo(0.3, 1);
    expect(results.slice(8, 11).every((r) => r === null)).toBe(true);
    expect(results[11]!.bpm).toBeCloseTo(120, 0);
    expect(tapProgress(taps, 4)).toEqual({ count: 4, remaining: 0 });
    // lange Pause → neue Folge
    taps = addTap(taps, { wall: 100 + 12 * beatLen + TAP_RESET_SEC + 1 });
    expect(taps).toHaveLength(1);
    expect(tapProgress(taps, 4)).toEqual({ count: 1, remaining: 7 });
    // ohne laufende Wiedergabe: nur das Tempo
    let still: Tap[] = [];
    for (let i = 0; i < 6; i++) still = addTap(still, { wall: i * 0.6 });
    expect(tapTempo(still, 3)).toEqual({ bpm: 100 });
  });
});

describe('gültiges Tempo und OSC-Befehl', () => {
  it('manuelles Tempo hat Vorrang, sonst das gespeicherte', () => {
    expect(itemTempo({ bpm: 120, beatOffsetSec: 0.5 })).toEqual({ bpm: 120, offset: 0.5, manual: false });
    expect(itemTempo({ bpm: 120, beatOffsetSec: 0.5, manualBpm: 98.4, manualBeatOffsetSec: 1.2 })).toEqual({ bpm: 98.4, offset: 1.2, manual: true });
    expect(itemTempo({ bpm: 120, beatOffsetSec: 0.5, manualBpm: 98.4 })).toEqual({ bpm: 98.4, offset: 0.5, manual: true });
    expect(itemTempo({})).toEqual({ bpm: undefined, offset: undefined, manual: false });
  });
  it('Befehl aus der Vorlage', () => {
    expect(bpmCommand('Master 3.1 At BPM {bpm}', 120)).toBe('Master 3.1 At BPM 120');
    expect(bpmCommand('Master 3.1 At BPM {bpm}', 121.46)).toBe('Master 3.1 At BPM 121.5');
    expect(bpmCommand('Master 3.2 At BPM', 90)).toBe('Master 3.2 At BPM 90');
    expect(bpmCommand('  ', 90)).toBe('Master 3.1 At BPM 90');
  });
});

describe('Schlag vor/zurück', () => {
  it('springt im Raster (120 BPM = 0,5 s, die „1“ bei 0,2 s)', () => {
    expect(beatStep(1.0, 120, 0.2, 1)).toBe(1.2);
    expect(beatStep(1.0, 120, 0.2, -1)).toBe(0.7);
    // auf einem Schlag: einen ganzen weiter bzw. zurück
    expect(beatStep(1.2, 120, 0.2, 1)).toBe(1.7);
    expect(beatStep(1.21, 120, 0.2, -1)).toBe(0.7);
    // nie vor 0
    expect(beatStep(0.1, 120, 0.2, -1)).toBe(0);
  });
});
