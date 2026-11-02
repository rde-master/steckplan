// Personen im Projekt (Name, Vorname, Art) und Geräte „benutzt von Mensch“ (seit Format 4).
import * as Y from 'yjs';
import type { Library } from '../library/library';
import { formatCableLength } from '../logistics/format';
import { computeCableLength, lengthContext } from '../logistics/length';
import { newId } from '../model/project';
import type { Cable, CaseTrailer, DeviceInstance, Person, Project, Template } from '../model/schema';
import { findPort } from '../signalflow/ports';

type Json = Record<string, unknown>;

/** „Vorname Name“, sonst was vorhanden ist. */
export function personName(person: Pick<Person, 'firstName' | 'lastName'> | undefined): string {
  if (!person) return '';
  return [person.firstName.trim(), person.lastName.trim()].filter(Boolean).join(' ');
}

/** Sortierung: Name, dann Vorname. */
export function comparePeople(a: Person, b: Person): number {
  return a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de');
}

/** Wird das Gerät von einer Person benutzt? Gerät überschreibt die Vorgabe der Vorlage. */
export function usesPerson(device: Pick<DeviceInstance, 'usedByPerson'>, template: Template | undefined): boolean {
  return device.usedByPerson ?? template?.usedByPerson ?? false;
}

/** Zugeordnete Person (nur wenn „benutzt von Mensch“ aktiv ist). */
export function devicePerson(device: DeviceInstance, template: Template | undefined, people: Person[]): Person | undefined {
  if (!usesPerson(device, template) || !device.personId) return undefined;
  return people.find((p) => p.id === device.personId);
}

/** Bereits verwendete Arten (Vorschläge im Freitextfeld), alphabetisch. */
export function personKinds(people: Person[], extra: string[] = ['Musiker', 'Moderator', 'Redner', 'Techniker']): string[] {
  const kinds = new Set<string>();
  for (const p of people) if (p.kind.trim()) kinds.add(p.kind.trim());
  for (const k of extra) kinds.add(k);
  return [...kinds].sort((a, b) => a.localeCompare(b, 'de'));
}

// ---------- Änderungen am Live-Dokument ----------

export function readCaseTrailers(doc: Y.Doc): CaseTrailer[] {
  return Object.values(doc.getMap('caseTrailers').toJSON() as Record<string, CaseTrailer>);
}

/** Case in diesem Projekt einem anderen Anhänger zuordnen (undefined = Standard-Anhänger des Cases). */
export function setCaseTrailer(doc: Y.Doc, caseId: string, trailerId: string | undefined, isDefault: boolean, origin: unknown): void {
  doc.transact(() => {
    const map = doc.getMap<Y.Map<unknown>>('caseTrailers');
    if (isDefault) {
      map.delete(caseId);
      return;
    }
    let entry = map.get(caseId);
    if (!entry) {
      entry = new Y.Map<unknown>();
      map.set(caseId, entry);
      entry.set('id', caseId);
    }
    if (trailerId) entry.set('trailerId', trailerId);
    else entry.delete('trailerId');
  }, origin);
}

export function readPeople(doc: Y.Doc): Person[] {
  return Object.values(doc.getMap('people').toJSON() as Record<string, Person>).sort(comparePeople);
}

export function addPerson(doc: Y.Doc, person: Omit<Person, 'id'>, origin: unknown): Person {
  const created: Person = { id: newId(), lastName: person.lastName.trim(), firstName: person.firstName.trim(), kind: person.kind.trim() };
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    doc.getMap<Y.Map<unknown>>('people').set(created.id, map);
    for (const [key, value] of Object.entries(created as unknown as Json)) map.set(key, value);
  }, origin);
  return created;
}

export function updatePerson(doc: Y.Doc, id: string, patch: Partial<Omit<Person, 'id'>>, origin: unknown): void {
  doc.transact(() => {
    const map = doc.getMap<Y.Map<unknown>>('people').get(id);
    if (!map) return;
    for (const [key, value] of Object.entries(patch)) if (value !== undefined) map.set(key, value);
  }, origin);
}

/** Person löschen; Geräte verlieren die Zuordnung (bleiben aber „benutzt von Mensch“). */
export function removePerson(doc: Y.Doc, id: string, origin: unknown): void {
  doc.transact(() => {
    doc.getMap('people').delete(id);
    for (const map of doc.getMap<Y.Map<unknown>>('devices').values()) {
      if (map.get('personId') === id) map.delete('personId');
    }
  }, origin);
}

// ---------- Personenliste und Etiketten ----------

export interface Connection {
  /** Anschluss am Gerät, z. B. „Out“ */
  port: string;
  /** Gegenstelle, z. B. „Stagebox 1 · Kanal 5“ */
  target: string;
  /** Kabel, z. B. „XLR 10 m“ (leer bei direkt gesteckt) */
  cable: string;
  cableLabel?: string;
}

export interface PersonDevice {
  device: DeviceInstance;
  templateName: string;
  connections: Connection[];
}

export interface PersonEntry {
  /** undefined = „benutzt von Mensch“, aber noch keine Person zugeordnet */
  person?: Person;
  devices: PersonDevice[];
}

type ProjectLike = Pick<Project, 'devices' | 'cables' | 'settings' | 'people'>;

function lengthText(mm: number | null | undefined): string {
  return mm === null || mm === undefined ? '' : formatCableLength(mm);
}

/** Verbindungen eines Geräts: welcher Anschluss mit welchem Kabel wohin. */
export function deviceConnections(device: DeviceInstance, project: Pick<Project, 'devices' | 'cables' | 'settings'>, library: Pick<Library, 'templates'>): Connection[] {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const devices = new Map(project.devices.map((d) => [d.id, d]));
  const ctx = lengthContext(project.devices, library.templates, project.settings);
  const own = templates.get(device.templateId);
  const result: Connection[] = [];
  const describe = (cable: Cable, mine: Cable['from'], other: Cable['from']) => {
    const otherDevice = devices.get(other.deviceId);
    const otherPort = findPort(templates.get(otherDevice?.templateId ?? ''), other.portId);
    const type = cable.templateId ? templates.get(cable.templateId) : undefined;
    const length = cable.direct ? null : computeCableLength(cable, ctx).chosenMm;
    result.push({
      port: findPort(own, mine.portId)?.label ?? mine.portId,
      target: `${otherDevice?.label ?? '?'} · ${otherPort?.label ?? other.portId}`,
      cable: cable.direct ? 'direkt gesteckt' : [type?.name ?? 'Kabel', lengthText(length)].filter(Boolean).join(' '),
      ...(cable.label ? { cableLabel: cable.label } : {}),
    });
  };
  for (const cable of project.cables) {
    if (cable.from.deviceId === device.id) describe(cable, cable.from, cable.to);
    else if (cable.to.deviceId === device.id) describe(cable, cable.to, cable.from);
  }
  return result.sort((a, b) => a.port.localeCompare(b.port, 'de', { numeric: true }));
}

/** Geräte „benutzt von Mensch“, nach Personen gruppiert (ohne Zuordnung am Ende). */
export function buildPeopleList(project: ProjectLike, library: Pick<Library, 'templates'>): PersonEntry[] {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const byPerson = new Map<string, PersonEntry>();
  for (const person of [...project.people].sort(comparePeople)) byPerson.set(person.id, { person, devices: [] });
  const unassigned: PersonEntry = { devices: [] };
  for (const device of project.devices) {
    const template = templates.get(device.templateId);
    if (!usesPerson(device, template)) continue;
    const entry = (device.personId && byPerson.get(device.personId)) || unassigned;
    entry.devices.push({ device, templateName: template?.name ?? '(Vorlage fehlt)', connections: deviceConnections(device, project, library) });
  }
  const sortDevices = (e: PersonEntry) => e.devices.sort((a, b) => a.device.label.localeCompare(b.device.label, 'de', { numeric: true }));
  const result = [...byPerson.values()];
  result.forEach(sortDevices);
  if (unassigned.devices.length) {
    sortDevices(unassigned);
    result.push(unassigned);
  }
  return result;
}

export interface DeviceLabel {
  deviceId: string;
  title: string;
  templateName: string;
  person: string;
  personKind: string;
  lines: string[];
}

/** Etiketten: Gerät, Person und wo das Gerät mit welchem Kabel einzustecken ist. */
export function buildDeviceLabels(project: ProjectLike, library: Pick<Library, 'templates'>, deviceIds?: string[]): DeviceLabel[] {
  const wanted = deviceIds ? new Set(deviceIds) : null;
  const labels: DeviceLabel[] = [];
  for (const entry of buildPeopleList(project, library)) {
    for (const item of entry.devices) {
      if (wanted && !wanted.has(item.device.id)) continue;
      labels.push({
        deviceId: item.device.id,
        title: item.device.label,
        templateName: item.templateName,
        person: personName(entry.person),
        personKind: entry.person?.kind ?? '',
        lines: item.connections.map((c) => `${c.port} → ${c.target}${c.cable ? ` (${c.cable}${c.cableLabel ? `, ${c.cableLabel}` : ''})` : ''}`),
      });
    }
  }
  return labels;
}
