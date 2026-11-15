import { describe, expect, it } from 'vitest';
import type { TimedLine } from '@steckplan/core';
import { lineWindow, scrollProgress, SCROLL_LAST_SEC } from './lyricsScroll';

const line = (id: string, atSec?: number) => ({ sectionId: 's', sectionLabel: 'S', line: { id, text: id, ...(atSec !== undefined ? { atSec } : {}) } }) as TimedLine;

describe('Zu lange Zeile läuft durch', () => {
  it('steht am Anfang und Ende je bis 1 s, läuft dazwischen gleichmäßig', () => {
    // Fenster 10 s: 1 s stehen, 8 s laufen, 1 s stehen
    expect(scrollProgress(10, 10, 20)).toBe(0);
    expect(scrollProgress(11, 10, 20)).toBe(0);
    expect(scrollProgress(15, 10, 20)).toBeCloseTo(0.5);
    expect(scrollProgress(19, 10, 20)).toBe(1);
    expect(scrollProgress(25, 10, 20)).toBe(1);
    // kurze Zeile (2 s): je ein Fünftel stehen
    expect(scrollProgress(10.4, 10, 12)).toBeCloseTo(0);
    expect(scrollProgress(11, 10, 12)).toBeCloseTo(0.5);
    expect(scrollProgress(5, 10, 10)).toBe(0);
  });

  it('Fenster: bis zur nächsten Zeile mit späterer Zeit, sonst bis zum Ende des Stücks bzw. einige Sekunden', () => {
    const lines = [line('a', 2), line('b'), line('c', 2), line('d', 9)];
    expect(lineWindow(lines, 0)).toEqual({ start: 2, end: 9 });
    expect(lineWindow(lines, 1)).toBeUndefined();
    expect(lineWindow(lines, 3, 30)).toEqual({ start: 9, end: 30 });
    expect(lineWindow(lines, 3)).toEqual({ start: 9, end: 9 + SCROLL_LAST_SEC });
    expect(lineWindow(lines, 3, 5)).toEqual({ start: 9, end: 9 + SCROLL_LAST_SEC });
  });
});
