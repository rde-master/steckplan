import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import { createYDocFromProject } from '../model/ydoc';
import { applyPeopleImport, parsePeopleTable, planPeopleImport } from './import';
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
