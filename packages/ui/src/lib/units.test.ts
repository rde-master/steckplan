import { describe, expect, it } from 'vitest';
import { formatMeterList, formatMeters, parseMeterList, parseMeters } from './units';

describe('Meter-Eingabe', () => {
  it('formatiert Millimeter als Meter mit Komma', () => {
    expect(formatMeters(450)).toBe('0,45');
    expect(formatMeters(3200)).toBe('3,2');
    expect(formatMeters(12000)).toBe('12');
    expect(formatMeters(undefined)).toBe('');
  });

  it('liest Meter mit Komma oder Punkt', () => {
    expect(parseMeters('0,45')).toBe(450);
    expect(parseMeters('0.45')).toBe(450);
    expect(parseMeters(' 3,2 m')).toBe(3200);
    expect(parseMeters('')).toBeUndefined();
    expect(parseMeters('abc')).toBeNull();
    expect(parseMeters('-1')).toBeNull();
  });

  it('liest Längenlisten', () => {
    expect(parseMeterList('1; 2,5; 10 5')).toEqual([1000, 2500, 5000, 10000]);
    expect(parseMeterList('10; 10; 5')).toEqual([5000, 10000]);
    expect(parseMeterList('')).toEqual([]);
    expect(parseMeterList('5; x')).toBeNull();
    expect(formatMeterList([1000, 2500])).toBe('1; 2,5');
  });
});
