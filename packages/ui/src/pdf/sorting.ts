// Sortieren der Export-Tabellen (PDF, CSV, Vorschau): bis zu drei Spalten, je auf- oder absteigend.
// Vergleich „natürlich“ (Spot 2 vor Spot 10, 2,50 m vor 10,00 m); leere Zellen immer ans Ende.
import { toCsv } from '@steckplan/core';

export interface SortKey {
  column: string;
  desc?: boolean;
}

/** abweichende Überschriften in der CSV */
const CSV_ALIASES: Record<string, string[]> = {
  'Inv.-Nr.': ['Inventarnummer'],
  'Stativ/Podest': ['Stativ/Traverse/Podest'],
  'Univ.': ['Universum'],
  Plan: ['Planlänge (m)'],
  Einstecken: ['Anschluss'],
};

function columnIndex(headers: string[], column: string): number {
  const exact = headers.indexOf(column);
  if (exact >= 0) return exact;
  const aliases = CSV_ALIASES[column] ?? [];
  const alias = headers.findIndex((h) => aliases.includes(h));
  if (alias >= 0) return alias;
  return headers.findIndex((h) => h.startsWith(`${column} (`));
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

export function compareCells(a: unknown, b: unknown): number {
  const x = text(a);
  const y = text(b);
  if (!x && !y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return x.localeCompare(y, 'de', { numeric: true, sensitivity: 'base' });
}

/** Zeilen nach den gewählten Spalten sortieren (unbekannte Spalten werden übergangen; stabil). */
export function sortRows<T extends unknown[]>(headers: string[], rows: T[], keys: SortKey[] | undefined): T[] {
  const active = (keys ?? []).map((k) => ({ index: columnIndex(headers, k.column), desc: !!k.desc })).filter((k) => k.index >= 0);
  if (active.length === 0) return rows;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((p, q) => {
      for (const k of active) {
        const x = text(p.row[k.index]);
        const y = text(q.row[k.index]);
        // leere Zellen bleiben auch absteigend am Ende
        if (!x || !y) {
          const c = compareCells(p.row[k.index], q.row[k.index]);
          if (c) return c;
          continue;
        }
        const c = compareCells(p.row[k.index], q.row[k.index]);
        if (c) return k.desc ? -c : c;
      }
      return p.i - q.i;
    })
    .map((x) => x.row);
}

/** CSV-Text in Zeilen/Zellen (Semikolon, Anführungszeichen, BOM). */
export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ';') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

/** CSV nach denselben Spalten sortieren wie das PDF. */
export function sortCsv(csv: string, keys: SortKey[] | undefined): string {
  if (!keys?.length) return csv;
  const [headers, ...rows] = parseCsv(csv);
  if (!headers) return csv;
  return toCsv(headers, sortRows(headers, rows, keys));
}
