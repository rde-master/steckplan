import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import { createYDocFromProject } from '../model/ydoc';
import { analyzePeopleTable, applyPeopleImport, parsePeopleTable, peopleFromTable, planPeopleImport } from './import';
import { readPeople } from './people';

describe('Personen importieren', () => {
  it('CSV aus Excel (Semikolon, BOM, Überschriften in anderer Reihenfolge, Anführungszeichen)', () => {
    const csv = '\uFEFFVorname;Nachname;Rolle\r\nAnna;Muster;Sängerin\r\n"Jörg ""JJ""";"Müller; Sohn";Bass\r\n;;\r\n';
    expect(parsePeopleTable(csv)).toEqual([
      { firstName: 'Anna', lastName: 'Muster', kind: 'Sängerin' },
      { firstName: 'Jörg "JJ"', lastName: 'Müller; Sohn', kind: 'Bass' },
    ]);
  });

  it('aus Excel eingefügt (Tabulator) ohne Überschrift: Name, Vorname, Art', () => {
    expect(parsePeopleTable('Muster\tAnna\tGesang\nBeispiel\tBert\n')).toEqual([
      { lastName: 'Muster', firstName: 'Anna', kind: 'Gesang' },
      { lastName: 'Beispiel', firstName: 'Bert', kind: '' },
    ]);
  });

  it('Komma als Trennzeichen; eine Spalte mit ganzem Namen', () => {
    expect(parsePeopleTable('Name,Vorname,Art\nMuster,Anna,Gesang')).toEqual([{ lastName: 'Muster', firstName: 'Anna', kind: 'Gesang' }]);
    expect(parsePeopleTable('Anna Maria Muster\nBeispiel; Bert')).toHaveLength(2);
    expect(parsePeopleTable('Anna Maria Muster')).toEqual([{ lastName: 'Muster', firstName: 'Anna Maria', kind: '' }]);
    expect(parsePeopleTable('')).toEqual([]);
  });

  it('Art wird auch bei anderen Überschriften erkannt', () => {
    const kinds = (header: string) => parsePeopleTable(`Vorname;Nachname;${header}\nAnna;Muster;Sängerin`)[0]!.kind;
    expect(kinds('Art der Person')).toBe('Sängerin');
    expect(kinds('Funktion/Rolle')).toBe('Sängerin');
    expect(kinds('Instrumente')).toBe('Sängerin');
    expect(kinds('Bereich')).toBe('Sängerin');
    // unbekannte Überschrift, aber einzige weitere Spalte mit Inhalt
    expect(kinds('Besonderes')).toBe('Sängerin');
    // „Name“ wird nicht in „Vorname“ gefunden; Spalten in beliebiger Reihenfolge
    expect(parsePeopleTable('Art\tVorname\tName\nGesang\tAnna\tMuster')).toEqual([{ lastName: 'Muster', firstName: 'Anna', kind: 'Gesang' }]);
  });

  it('Zuordnung der Spalten lässt sich von Hand ändern', () => {
    const table = analyzePeopleTable('Anna;Muster;Gesang\nBert;Beispiel;Bass');
    expect(table.hasHeader).toBe(false);
    expect(table.headers).toEqual(['Spalte 1', 'Spalte 2', 'Spalte 3']);
    expect(table.columns).toEqual({ lastName: 0, firstName: 1, kind: 2 });
    // Datei hat Vorname zuerst → von Hand tauschen
    expect(peopleFromTable(table, { lastName: 1, firstName: 0, kind: 2 })[0]).toEqual({ lastName: 'Muster', firstName: 'Anna', kind: 'Gesang' });
    // Art weglassen
    expect(peopleFromTable(table, { lastName: 1, firstName: 0, kind: -1 })[1]).toEqual({ lastName: 'Beispiel', firstName: 'Bert', kind: '' });
  });

  it('Abgleich: vorhandene überspringen, fehlende Art ergänzen, Doppelte im Import; Übernahme in einem Schritt', () => {
    const doc = createYDocFromProject({
      ...createEmptyProject({ name: 'P' }),
      people: [
        { id: 'a', lastName: 'Muster', firstName: 'Anna', kind: '' },
        { id: 'b', lastName: 'Beispiel', firstName: 'Bert', kind: 'Redner' },
      ],
    });
    const plan = planPeopleImport(
      parsePeopleTable('Name;Vorname;Art\nmuster;anna;Sängerin\nBeispiel;Bert;Moderator\nNeu;Nina;Gitarre\nNeu;Nina;Gitarre'),
      readPeople(doc),
    );
    expect(plan.rows.map((r) => r.status)).toEqual(['completeKind', 'existing', 'new', 'duplicate']);
    expect(applyPeopleImport(doc, plan, null)).toBe(2);
    expect(readPeople(doc).map((p) => `${p.firstName} ${p.lastName}: ${p.kind}`)).toEqual(['Bert Beispiel: Redner', 'Anna Muster: Sängerin', 'Nina Neu: Gitarre']);
  });
});
