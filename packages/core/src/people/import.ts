// Personen importieren: CSV-Datei (Trennzeichen ; , oder Tab) oder aus Excel kopierte Zellen.
// Spalten werden anhand der Überschriften erkannt (Name, Vorname, Art); ohne Überschrift: Name, Vorname, Art.
import * as Y from 'yjs';
import { newId } from '../model/project';
import type { Person } from '../model/schema';

export type ImportedPerson = Omit<Person, 'id'>;

const ALIASES: Record<keyof ImportedPerson, string[]> = {
  lastName: ['name', 'nachname', 'familienname', 'lastname', 'last name', 'surname'],
  firstName: ['vorname', 'firstname', 'first name', 'rufname'],
  kind: ['art', 'rolle', 'funktion', 'typ', 'role', 'instrument', 'position'],
};

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
  return cell.toLowerCase().replace(/[^a-zäöüß ]/g, '').trim();
}

/** Text einer CSV-Datei bzw. eingefügter Excel-Zellen → Personen (leere Zeilen werden übersprungen). */
export function parsePeopleTable(text: string): ImportedPerson[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const delimiter = detectDelimiter(lines[0]!);
  const rows = lines.map((l) => splitLine(l, delimiter));
  const header = rows[0]!.map(normalizeHeader);
  const column = (key: keyof ImportedPerson) => header.findIndex((h) => ALIASES[key].includes(h));
  const columns = { lastName: column('lastName'), firstName: column('firstName'), kind: column('kind') };
  const hasHeader = columns.lastName >= 0 || columns.firstName >= 0;
  const data = hasHeader ? rows.slice(1) : rows;
  const index = hasHeader ? columns : { lastName: 0, firstName: 1, kind: 2 };
  const result: ImportedPerson[] = [];
  for (const cells of data) {
    let lastName = index.lastName >= 0 ? (cells[index.lastName] ?? '') : '';
    let firstName = index.firstName >= 0 ? (cells[index.firstName] ?? '') : '';
    const kind = index.kind >= 0 ? (cells[index.kind] ?? '') : '';
    // eine Spalte mit dem ganzen Namen: „Muster, Anna“ oder „Anna Muster“
    if (!hasHeader && cells.length === 1 && lastName) {
      const comma = lastName.split(',').map((x) => x.trim());
      if (comma.length === 2) [lastName, firstName] = [comma[0]!, comma[1]!];
      else {
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
