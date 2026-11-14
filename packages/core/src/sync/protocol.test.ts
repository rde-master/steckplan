import * as decoding from 'lib0/decoding';
import { describe, expect, it } from 'vitest';
import { cueLevels, decodeCue, encodeCue, LYRICS_FADE_SEC_DEFAULT, MESSAGE_CUE, type Cue } from './protocol';

/** wie der Server: Nachricht lesen, Typ prüfen, Stelle prüfen */
function roundTrip(cue: unknown): Cue | null {
  const decoder = decoding.createDecoder(encodeCue(cue as Cue));
  expect(decoding.readVarUint(decoder)).toBe(MESSAGE_CUE);
  return decodeCue(decoder);
}

describe('Stelle: Helligkeit von Text und Hintergrund, Blendzeit', () => {
  it('der Server übernimmt gültige Werte und verwirft ungültige', () => {
    expect(roundTrip({ itemId: 'a', textLevel: 0.4, backgroundLevel: 0, fadeSec: 3 })).toEqual({ itemId: 'a', textLevel: 0.4, backgroundLevel: 0, fadeSec: 3 });
    expect(roundTrip({ itemId: 'a', textLevel: 2, backgroundLevel: -1, fadeSec: 99 })).toEqual({ itemId: 'a' });
    expect(roundTrip({ itemId: 'a', textLevel: 'hell', fadeSec: null })).toEqual({ itemId: 'a' });
  });

  it('Helligkeiten lesen: fehlt = sichtbar, ältere Sender mit hideText/hideBackground', () => {
    expect(cueLevels(null)).toEqual({ text: 1, background: 1, fadeSec: LYRICS_FADE_SEC_DEFAULT });
    expect(cueLevels({ hideText: true })).toEqual({ text: 0, background: 1, fadeSec: LYRICS_FADE_SEC_DEFAULT });
    expect(cueLevels({ hideBackground: true, textLevel: 0.5, fadeSec: 2 })).toEqual({ text: 0.5, background: 0, fadeSec: 2 });
    // die Helligkeit geht vor
    expect(cueLevels({ hideText: true, textLevel: 0.25 }).text).toBe(0.25);
  });
});
