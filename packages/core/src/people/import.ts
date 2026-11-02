// Personen importieren: CSV-Datei (Trennzeichen ; , oder Tab) oder aus Excel kopierte Zellen.
// Spalten werden anhand der Überschriften erkannt (Name, Vorname, Art); ohne Überschrift: Name, Vorname, Art.
import * as Y from 'yjs';
import { newId } from '../model/project';
import type { Person } from '../model/schema';

export type ImportedPerson = Omit<Person, 'id'>;

/** Wörter, an denen die Spalten erkannt werden (Überschrift ist gleich oder enthält das Wort) */
const ALIASES: Record<keyof ImportedPerson, string[]> = {
  lastName: ['nachname', 'familienname', 'lastname', 'last name', 'surname', 'name'],
  firstName: ['vorname', 'firstname', 'first name', 'rufname', 'given name'],
  kind: ['art', 'rolle', 'funktion', 'typ', 'type', 'role', 'instrument', 'position', 'kategorie', 'gruppe', 'bereich', 'tätigkeit', 'aufgabe', 'besetzung', 'beschreibung', 'function'],
};

/** Zuordnung Feld → Spaltennummer (−1 = keine Spalte) */
export interface PeopleColumns {
  lastName: number;
  firstName: number;
  kind: number;
}

export interface PeopleTable {
  /** Überschriften (bzw. „Spalte 1“ …, wenn die erste Zeile keine Überschrift ist) */
  headers: string[];
  hasHeader: boolean;
  /** erkannte Zuordnung */
  columns: PeopleColumns;
  /** Datenzeilen (ohne Überschrift) */
  rows: string[][];
}

/** Eine Tabellenzeile in Zellen zerlegen (Anführungszeichen wie in CSV). */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) {
      cells.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

function detectDelimiter(firstLine: string): string {
  if (firstLine.includes('\t')) return '\t';
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semis >= commas && semis > 0 ? ';' : commas > 0 ? ',' : ';';
}

function normalizeHeader(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/[^a-zäöüß]+/g, ' ')
    .trim();
}

/** Spalte zu einem Feld: zuerst exakte Überschrift, dann „enthält das Wort“; bereits vergebene Spalten werden übersprungen. */
function findColumn(headers: string[], key: keyof ImportedPerson, taken: Set<number>): number {
  const aliases = ALIASES[key];
  const exact = headers.findIndex((h, i) => !taken.has(i) && aliases.includes(h));
  if (exact >= 0) return exact;
  return headers.findIndex((h, i) => !taken.has(i) && aliases.some((a) => h.split(' ').includes(a) || (a.length > 4 && h.includes(a))));
}

/** Text einer CSV-Datei bzw. eingefügter Excel-Zellen zerlegen und die Spalten erkennen. */
export function analyzePeopleTable(text: string): PeopleTable {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { headers: [], hasHeader: false, columns: { lastName: -1, firstName: -1, kind: -1 }, rows: [] };
  const delimiter = detectDelimiter(lines[0]!);
  const rows = lines.map((l) => splitLine(l, delimiter));
  const width = Math.max(...rows.map((r) => r.length));
  const normalized = rows[0]!.map(normalizeHeader);
  // Vorname zuerst, damit „Name“ nicht in „Vorname“ gefunden wird
  const taken = new Set<number>();
  const firstName = findColumn(normalized, 'firstName', taken);
  if (firstName >= 0) taken.add(firstName);
  const lastName = findColumn(normalized, 'lastName', taken);
  if (lastName >= 0) taken.add(lastName);
  const hasHeader = firstName >= 0 || lastName >= 0;
  if (!hasHeader) {
    return {
      headers: Array.from({ length: width }, (_, i) => `Spalte ${i + 1}`),
      hasHeader: false,
      columns: { lastName: 0, firstName: width > 1 ? 1 : -1, kind: width > 2 ? 2 : -1 },
      rows,
    };
  }
  let kind = findColumn(normalized, 'kind', taken);
  const data = rows.slice(1);
  if (kind < 0) {
    // genau eine weitere Spalte mit Inhalt → Art
    const rest = Array.from({ length: width }, (_, i) => i).filter((i) => !taken.has(i) && data.some((r) => (r[i] ?? '').trim()));
    if (rest.length === 1) kind = rest[0]!;
  }
  return {
    headers: Array.from({ length: width }, (_, i) => rows[0]![i] || `Spalte ${i + 1}`),
    hasHeader: true,
    columns: { lastName, firstName, kind },
    rows: data,
  };
}

/** Personen aus der zerlegten Tabelle mit einer (ggf. von Hand geänderten) Zuordnung. */
export function peopleFromTable(table: Pick<PeopleTable, 'rows'>, columns: PeopleColumns): ImportedPerson[] {
  const cell = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');
  const result: ImportedPerson[] = [];
  for (const cells of table.rows) {
    let lastName = cell(cells, columns.lastName);
    let firstName = cell(cells, columns.firstName);
    const kind = cell(cells, columns.kind);
    // ganzer Name in einer Spalte: „Muster, Anna“ oder „Anna Muster“
    if (lastName && columns.firstName < 0) {
      const comma = lastName.split(',').map((x) => x.trim());
      if (comma.length === 2) [lastName, firstName] = [comma[0]!, comma[1]!];
      else if (lastName.includes(' ')) {
        const parts = lastName.split(/\s+/);
        lastName = parts.pop() ?? '';
        firstName = parts.join(' ');
      }
    }
    if (!lastName && !firstName) continue;
    result.push({ lastName: lastName.slice(0, 80), firstName: firstName.slice(0, 80), kind: kind.slice(0, 80) });
  }
  return result;
}

/** Text einer CSV-Datei bzw. eingefügter Excel-Zellen → Personen (mit erkannter Zuordnung). */
export function parsePeopleTable(text: string): ImportedPerson[] {
  const table = analyzePeopleTable(text);
  return peopleFromTable(table, table.columns);
}

export type ImportStatus = 'new' | 'existing' | 'completeKind' | 'duplicate';

export interface PeopleImportPlan {
  rows: { person: ImportedPerson; status: ImportStatus; existingId?: string }[];
  toAdd: ImportedPerson[];
  /** vorhandene Personen ohne Art, die aus dem Import ergänzt wird */
  toComplete: { id: string; kind: string }[];
}

const key = (p: Pick<Person, 'lastName' | 'firstName'>) => `${p.lastName.trim().toLowerCase()}|${p.firstName.trim().toLowerCase()}`;

/** Abgleich mit den Personen im Projekt: gleiche Personen (Name + Vorname) überspringen, fehlende Art ergänzen. */
export function planPeopleImport(imported: ImportedPerson[], existing: Person[]): PeopleImportPlan {
  const byKey = new Map(existing.map((p) => [key(p), p]));
  const seen = new Set<string>();
  const plan: PeopleImportPlan = { rows: [], toAdd: [], toComplete: [] };
  for (const person of imported) {
    const k = key(person);
    const found = byKey.get(k);
    if (seen.has(k)) {
      plan.rows.push({ person, status: 'duplicate' });
      continue;
    }
    seen.add(k);
    if (!found) {
      plan.rows.push({ person, status: 'new' });
      plan.toAdd.push(person);
    } else if (!found.kind.trim() && person.kind.trim()) {
      plan.rows.push({ person, status: 'completeKind', existingId: found.id });
      plan.toComplete.push({ id: found.id, kind: person.kind.trim() });
    } else {
      plan.rows.push({ person, status: 'existing', existingId: found.id });
    }
  }
  return plan;
}

/** Plan in einer Transaktion übernehmen (ein Rückgängig-Schritt). */
export function applyPeopleImport(doc: Y.Doc, plan: PeopleImportPlan, origin: unknown): number {
  doc.transact(() => {
    const people = doc.getMap<Y.Map<unknown>>('people');
    for (const person of plan.toAdd) {
      const map = new Y.Map<unknown>();
      const id = newId();
      people.set(id, map);
      map.set('id', id);
      map.set('lastName', person.lastName.trim());
      map.set('firstName', person.firstName.trim());
      map.set('kind', person.kind.trim());
    }
    for (const { id, kind } of plan.toComplete) people.get(id)?.set('kind', kind);
  }, origin);
  return plan.toAdd.length + plan.toComplete.length;
}
