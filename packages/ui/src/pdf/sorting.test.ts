import { describe, expect, it } from 'vitest';
import { toCsv } from '@steckplan/core';
import { parseCsv, sortCsv, sortRows } from './sorting';

const headers = ['Kennung', 'Länge', 'Besitzer'];
const rows = [
  ['Spot 10', '2,50 m', 'Ralf'],
  ['Spot 2', '10,00 m', ''],
  ['Spot 1', '2,50 m', 'Anna'],
];

describe('Sortieren der Export-Tabellen', () => {
  it('natürlich, mehrstufig, auf- und absteigend; leere Zellen am Ende', () => {
    expect(sortRows(headers, rows, [{ column: 'Kennung' }]).map((r) => r[0])).toEqual(['Spot 1', 'Spot 2', 'Spot 10']);
    expect(sortRows(headers, rows, [{ column: 'Länge' }, { column: 'Kennung', desc: true }]).map((r) => r[0])).toEqual(['Spot 10', 'Spot 1', 'Spot 2']);
    expect(sortRows(headers, rows, [{ column: 'Besitzer', desc: true }]).map((r) => r[2])).toEqual(['Ralf', 'Anna', '']);
    // ohne Sortierung oder unbekannte Spalte: Reihenfolge bleibt
    expect(sortRows(headers, rows, [])).toBe(rows);
    expect(sortRows(headers, rows, [{ column: 'Gibts nicht' }])).toBe(rows);
  });

  it('CSV: gleiche Sortierung, abweichende Überschriften werden zugeordnet', () => {
    const csv = toCsv(['Kennung', 'Planlänge (m)', 'Inventarnummer'], [['B', '10,00', 'X-2'], ['A', '2,00', 'X-10']]);
    expect(parseCsv(sortCsv(csv, [{ column: 'Plan' }])).slice(1).map((r) => r[0])).toEqual(['A', 'B']);
    expect(parseCsv(sortCsv(csv, [{ column: 'Inv.-Nr.', desc: true }])).slice(1).map((r) => r[0])).toEqual(['A', 'B']);
    expect(sortCsv(csv, [])).toBe(csv);
  });
});
