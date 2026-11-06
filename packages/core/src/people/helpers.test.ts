import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { addGig, addPerson, gigSummaries, formatGigDate, formatGigTimes, readGigs, readHelperSignups, readPeople, removeGig, removePerson, setHelperSignup, updateGig } from '../index';

describe('Auftritte und Helfer', () => {
  it('Auftritte anlegen, sortieren, ändern, löschen (mit Anmeldungen)', () => {
    const doc = new Y.Doc();
    const later = addGig(doc, { title: 'Stadtfest', date: '2026-07-04', setupTime: '14:00' }, null);
    const first = addGig(doc, { title: 'Kirche', date: '2026-05-01', startTime: '19:30' }, null);
    addGig(doc, { title: 'Ohne Datum' }, null);
    expect(readGigs(doc).map((g) => g.title)).toEqual(['Kirche', 'Stadtfest', 'Ohne Datum']);
    updateGig(doc, later, { location: 'Marktplatz', notes: '' }, null);
    expect(readGigs(doc)[1]).toMatchObject({ location: 'Marktplatz' });
    expect(readGigs(doc)[1]!.notes).toBeUndefined();

    const anna = addPerson(doc, { lastName: 'Muster', firstName: 'Anna', kind: 'Musiker' }, null);
    expect(setHelperSignup(doc, first, anna.id, { helps: true }, 'Anna', null)).toBe(true);
    expect(setHelperSignup(doc, 'gibts-nicht', anna.id, { helps: true }, 'Anna', null)).toBe(false);
    removeGig(doc, first, null);
    expect(readHelperSignups(doc)).toEqual([]);
  });

  it('Anmeldung: an/ab, Anhänger, Bemerkung; leer → entfernt; Übersicht', () => {
    const doc = new Y.Doc();
    const gig = addGig(doc, { title: 'Konzert', date: '2026-03-14', setupTime: '16:00', startTime: '19:30' }, null);
    const anna = addPerson(doc, { lastName: 'Muster', firstName: 'Anna', kind: '' }, null);
    const ben = addPerson(doc, { lastName: 'Beispiel', firstName: 'Ben', kind: '' }, null);
    setHelperSignup(doc, gig, anna.id, { helps: true, trailerThere: true }, 'Anna', null);
    setHelperSignup(doc, gig, ben.id, { trailerNext: true, note: '  komme später  ' }, 'Ben', null);
    expect(readHelperSignups(doc).find((s) => s.personId === ben.id)).toMatchObject({ helps: false, trailerNext: true, note: 'komme später', by: 'Ben' });

    const [summary] = gigSummaries(readGigs(doc), readHelperSignups(doc), readPeople(doc));
    expect(summary!.helpers.map((p) => p.firstName)).toEqual(['Anna']);
    expect(summary!.trailerThere.map((p) => p.firstName)).toEqual(['Anna']);
    expect(summary!.trailerNext.map((p) => p.firstName)).toEqual(['Ben']);
    expect(summary!.notes).toEqual([{ person: expect.objectContaining({ firstName: 'Ben' }), note: 'komme später' }]);

    // alles abgewählt → Eintrag weg
    setHelperSignup(doc, gig, anna.id, { helps: false, trailerThere: false }, 'Anna', null);
    expect(readHelperSignups(doc).map((s) => s.personId)).toEqual([ben.id]);
    // Person gelöscht → ihre Anmeldungen auch
    removePerson(doc, ben.id, null);
    expect(readHelperSignups(doc)).toEqual([]);

    expect(formatGigDate('2026-03-14')).toBe('Sa., 14.03.2026');
    expect(formatGigTimes({ setupTime: '16:00', startTime: '19:30' })).toBe('Aufbau 16:00 · Beginn 19:30');
  });
});
