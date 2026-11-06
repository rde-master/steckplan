// Auftritte (Projektdaten) und Helfer: je Person und Auftritt eine Anmeldung – hilft beim Aufbau, fährt einen
// Anhänger zur Location bzw. zur nächsten, Bemerkung. Helfer ändern ihre Anmeldung über den Server (auch mit
// Lesezugang, z. B. nach dem QR-Code auf dem Etikett), wie die Häkchen der Packliste.
import * as Y from 'yjs';
import { newId } from '../model/project';
import type { Gig, HelperSignup, Person } from '../model/schema';
import { comparePeople } from './people';

function gigMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('gigs');
}

function signupMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('helperSignups');
}

function setFields(map: Y.Map<unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === '') map.delete(key);
    else map.set(key, value);
  }
}

/** Sortierung: nach Datum und Uhrzeit (ohne Datum am Ende), dann Titel */
export function compareGigs(a: Gig, b: Gig): number {
  const key = (g: Gig) => `${g.date ?? '9999-99-99'} ${g.setupTime ?? g.startTime ?? '99:99'}`;
  return key(a).localeCompare(key(b)) || a.title.localeCompare(b.title, 'de') || a.id.localeCompare(b.id);
}

export function readGigs(doc: Y.Doc): Gig[] {
  return Object.values(gigMap(doc).toJSON() as Record<string, Gig>)
    .map((g) => ({ ...g, title: g.title ?? '', location: g.location ?? '' }))
    .sort(compareGigs);
}

export function addGig(doc: Y.Doc, init: Partial<Omit<Gig, 'id'>>, origin: unknown): string {
  const id = newId();
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    gigMap(doc).set(id, map);
    setFields(map, { title: '', location: '', ...init, id });
  }, origin);
  return id;
}

export function updateGig(doc: Y.Doc, id: string, patch: Partial<Omit<Gig, 'id'>>, origin: unknown): void {
  const map = gigMap(doc).get(id);
  if (map) doc.transact(() => setFields(map, patch), origin);
}

/** Auftritt löschen – mit allen Anmeldungen dazu */
export function removeGig(doc: Y.Doc, id: string, origin: unknown): void {
  doc.transact(() => {
    gigMap(doc).delete(id);
    for (const [key, map] of [...signupMap(doc).entries()]) if (map.get('gigId') === id) signupMap(doc).delete(key);
  }, origin);
}

export function signupId(gigId: string, personId: string): string {
  return `${gigId}:${personId}`;
}

/** Anmeldungen (nur zu vorhandenen Auftritten und Personen, wenn diese angegeben sind) */
export function readHelperSignups(doc: Y.Doc): HelperSignup[] {
  return Object.values(signupMap(doc).toJSON() as Record<string, HelperSignup>).map((s) => ({ ...s, helps: !!s.helps, trailerThere: !!s.trailerThere, trailerNext: !!s.trailerNext }));
}

export type SignupPatch = Partial<Pick<HelperSignup, 'helps' | 'trailerThere' | 'trailerNext' | 'note'>>;

/**
 * Anmeldung ändern (legt sie bei Bedarf an; ohne Angaben mehr wird sie entfernt).
 * Gibt false zurück, wenn es Auftritt oder Person nicht gibt.
 */
export function setHelperSignup(doc: Y.Doc, gigId: string, personId: string, patch: SignupPatch, by: string, origin: unknown): boolean {
  if (!gigMap(doc).has(gigId) || !doc.getMap<Y.Map<unknown>>('people').has(personId)) return false;
  const key = signupId(gigId, personId);
  doc.transact(() => {
    let map = signupMap(doc).get(key);
    if (!map) {
      map = new Y.Map<unknown>();
      signupMap(doc).set(key, map);
      setFields(map, { id: key, gigId, personId });
    }
    const note = patch.note === undefined ? undefined : patch.note.trim();
    setFields(map, { ...patch, ...(note !== undefined ? { note } : {}), at: new Date().toISOString(), by });
    // nichts mehr angegeben → Eintrag weg
    if (!map.get('helps') && !map.get('trailerThere') && !map.get('trailerNext') && !map.get('note')) signupMap(doc).delete(key);
  }, origin);
  return true;
}

export function personSignup(signups: HelperSignup[], gigId: string, personId: string): HelperSignup | undefined {
  return signups.find((s) => s.gigId === gigId && s.personId === personId);
}

export interface GigSummary {
  gig: Gig;
  /** Helfer beim Aufbau */
  helpers: Person[];
  /** fahren einen Anhänger zur Location bzw. zur nächsten */
  trailerThere: Person[];
  trailerNext: Person[];
  /** Bemerkungen mit Person */
  notes: { person: Person; note: string }[];
}

/** Übersicht je Auftritt: wer hilft, wer fährt welchen Anhänger, Bemerkungen */
export function gigSummaries(gigs: Gig[], signups: HelperSignup[], people: Person[]): GigSummary[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  return [...gigs].sort(compareGigs).map((gig) => {
    const entries = signups
      .filter((s) => s.gigId === gig.id && byId.has(s.personId))
      .map((s) => ({ s, person: byId.get(s.personId)! }))
      .sort((a, b) => comparePeople(a.person, b.person));
    return {
      gig,
      helpers: entries.filter((e) => e.s.helps).map((e) => e.person),
      trailerThere: entries.filter((e) => e.s.trailerThere).map((e) => e.person),
      trailerNext: entries.filter((e) => e.s.trailerNext).map((e) => e.person),
      notes: entries.filter((e) => e.s.note).map((e) => ({ person: e.person, note: e.s.note! })),
    };
  });
}

/** „Sa, 14.03.2026“ (ohne Datum: leer) */
export function formatGigDate(date: string | undefined): string {
  if (!date) return '';
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** „Aufbau 16:00 · Beginn 19:30“ */
export function formatGigTimes(gig: Pick<Gig, 'setupTime' | 'startTime'>): string {
  return [gig.setupTime ? `Aufbau ${gig.setupTime}` : '', gig.startTime ? `Beginn ${gig.startTime}` : ''].filter(Boolean).join(' · ');
}
