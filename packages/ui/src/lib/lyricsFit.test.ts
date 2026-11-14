import { describe, expect, it } from 'vitest';
import { fitLines, lyricsLineBox } from './lyricsFit';

describe('Passt die Zeile ins Textfenster?', () => {
  it('Schrift und Breite wie im Textfenster (16:9)', () => {
    // Standard: 1 davor, 3 danach → 5 Plätze à 15 vh, Schrift 0,42 × 15 vh = 68 px; Breite 1920 − 2·(3+2) vw
    const lines = lyricsLineBox({ mode: 'lines', before: 1, after: 3, translation: false, blockLines: 0 });
    expect(lines.fontPx).toBeCloseTo(68.04);
    expect(lines.maxPx).toBeCloseTo(1728);
    // mit Übersetzung kleiner
    expect(lyricsLineBox({ mode: 'lines', before: 1, after: 3, translation: true, blockLines: 0 }).fontPx).toBeCloseTo(51.84);
    // Block: nach der Zahl der Zeilen im Abschnitt (4 Zeilen: 11 vh je Zeile → 0,62 × 11 vh)
    const block = lyricsLineBox({ mode: 'block', before: 1, after: 3, translation: false, blockLines: 4 });
    expect(block.fontPx).toBeCloseTo(73.656);
    expect(block.maxPx).toBeCloseTo(1747.2);
  });

  it('zählt Zeichen und meldet zu lange Zeilen; schätzt, wie viele Zeichen passen', () => {
    // jedes Zeichen halb so breit wie die Schrift
    const measure = (text: string, fontPx: number) => text.length * fontPx * 0.5;
    const options = { mode: 'lines' as const, before: 1, after: 3, translation: false, blockLines: 0 };
    // 1728 / 34,02 → 50 Zeichen passen
    const result = fitLines(['Kurz', 'x'.repeat(50), 'x'.repeat(51), '', '  Ä  '], options, measure);
    expect(result.maxChars).toBe(50);
    expect(result.lines).toEqual([
      { chars: 4, tooLong: false },
      { chars: 50, tooLong: false },
      { chars: 51, tooLong: true },
      { chars: 0, tooLong: false },
      { chars: 1, tooLong: false },
    ]);
  });
});
