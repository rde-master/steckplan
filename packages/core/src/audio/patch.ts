// Ton-Patch (M9): Input- und Output-Liste je Mischpult, automatisch aus dem Signalfluss.
// Die Kette wird über Kabel und Multicore-Adern verfolgt:
//   Input:  Pult-Eingang ← (direkt/Kabel) ← Multicore-Ader ← Kabel ← Quelle (Mikro, DI …)
//   Output: Pult-Ausgang → Multicore-Ader → Kabel → Ziel (Monitor, In-Ear, Endstufe …)
// Zusatzangaben (Kanalname, 48 V, Stativ, Bemerkung) stehen je Pult-Anschluss in project.patch.
import * as Y from 'yjs';
import type { Library } from '../library/library';
import type { Cable, DeviceInstance, PatchEntry, Person, Project, Template } from '../model/schema';
import { devicePerson, personName } from '../people/people';
import { endNames, isMulticore, templatePorts, type EffectivePort } from '../signalflow/ports';

export function isMixer(template: Template | undefined): boolean {
  return template?.kind === 'device' && template.mixer === true;
}

export function patchId(mixerId: string, portId: string): string {
  return `${mixerId}:${portId}`;
}

export interface PatchHop {
  /** Multicore-Gerät */
  deviceId: string;
  /** „Multicore 1 · Send 5“ */
  text: string;
}

export interface PatchRow {
  id: string;
  /** laufende Nummer (1, 2, …) innerhalb der Eingänge bzw. Ausgänge des Pults */
  channel: number;
  /** Anschluss am Pult, z. B. „In 5“ */
  port: string;
  /** Gerät am anderen Ende der Kette (Quelle bzw. Ziel); undefined = nichts gesteckt */
  device?: DeviceInstance;
  deviceTemplate?: string;
  /** Anschluss am Quell-/Zielgerät */
  devicePort?: string;
  /** Person, die das Quell-/Zielgerät benutzt */
  person?: string;
  /** über welche Multicores/Stageboxen */
  via: PatchHop[];
  /** Stativ/Traverse, an dem die Quelle hängt (Vorschlag für „Stativ“) */
  carrier?: string;
  /** Angaben aus der Liste (bzw. Vorschläge) */
  name: string;
  phantom: boolean;
  stand: string;
  notes: string;
  /** Angaben wurden von Hand gesetzt (sonst Vorschlag) */
  edited: { name: boolean; phantom: boolean; stand: boolean };
}

export interface PatchList {
  mixer: DeviceInstance;
  mixerTemplate: Template;
  inputs: PatchRow[];
  outputs: PatchRow[];
}

type ProjectLike = Pick<Project, 'devices' | 'cables'> & Partial<Pick<Project, 'patch' | 'people'>>;

interface End {
  deviceId: string;
  portId: string;
}

const MAX_HOPS = 20;

/** Kabel je Anschluss (beide Enden). */
function cableIndex(cables: Cable[]): Map<string, { cable: Cable; other: End }[]> {
  const index = new Map<string, { cable: Cable; other: End }[]>();
  const add = (end: End, other: End, cable: Cable) => {
    const key = `${end.deviceId}/${end.portId}`;
    index.set(key, [...(index.get(key) ?? []), { cable, other }]);
  };
  for (const cable of cables) {
    add(cable.from, cable.to, cable);
    add(cable.to, cable.from, cable);
  }
  return index;
}

/**
 * Verfolgt die Kette von einem Pult-Anschluss bis zum ersten Gerät, das kein Multicore ist.
 * Unterwegs werden Multicore-Adern durchlaufen (Ende A ↔ Ende B derselben Ader).
 */
function trace(start: End, devices: Map<string, DeviceInstance>, templates: Map<string, Template>, index: ReturnType<typeof cableIndex>): { end?: End; via: PatchHop[] } {
  const via: PatchHop[] = [];
  const visited = new Set<string>();
  let current = start;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const key = `${current.deviceId}/${current.portId}`;
    if (visited.has(key)) return { via };
    visited.add(key);
    const next = index.get(key)?.find((c) => !visited.has(`${c.other.deviceId}/${c.other.portId}`));
    if (!next) return { via };
    const device = devices.get(next.other.deviceId);
    const template = templates.get(device?.templateId ?? '');
    if (!device || !isMulticore(template)) return { end: next.other, via };
    // Multicore: zur anderen Seite derselben Ader
    const [channelId, side] = next.other.portId.split(':');
    const channel = template!.channels!.find((c) => c.id === channelId);
    const ends = endNames(template!);
    const exit = side === 'a' ? 'b' : 'a';
    // genannt wird das Ende, an dem die Kette weitergeht (z. B. die Stagebox auf der Bühne)
    via.push({ deviceId: device.id, text: `${device.label} · ${channel?.label ?? channelId} (${exit === 'a' ? ends.a : ends.b})` });
    visited.add(`${device.id}/${next.other.portId}`);
    current = { deviceId: device.id, portId: `${channelId}:${exit}` };
  }
  return { via };
}

/** Input- und Output-Liste für alle Mischpulte im Projekt (nach Kennung sortiert). */
export function buildPatchLists(project: ProjectLike, library: Pick<Library, 'templates'>): PatchList[] {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const devices = new Map(project.devices.map((d) => [d.id, d]));
  const index = cableIndex(project.cables);
  const entries = new Map((project.patch ?? []).map((e) => [e.id, e]));
  const people: Person[] = project.people ?? [];

  const row = (mixer: DeviceInstance, port: EffectivePort, channel: number): PatchRow => {
    const { end, via } = trace({ deviceId: mixer.id, portId: port.id }, devices, templates, index);
    const device = end ? devices.get(end.deviceId) : undefined;
    const template = device ? templates.get(device.templateId) : undefined;
    const devicePortLabel = end ? templatePorts(template).find((p) => p.id === end.portId)?.label : undefined;
    const carrierId = device?.mountedOnId ?? device?.stagePlan?.standsOnId;
    const carrier = carrierId ? devices.get(carrierId) : undefined;
    const carrierText = carrier ? (templates.get(carrier.templateId)?.name ?? carrier.label) : undefined;
    const person = device ? personName(devicePerson(device, template, people)) : '';
    const entry: PatchEntry | undefined = entries.get(patchId(mixer.id, port.id));
    const suggestedName = device ? (person ? `${device.label} (${person})` : device.label) : '';
    return {
      id: patchId(mixer.id, port.id),
      channel,
      port: port.label,
      ...(device ? { device, deviceTemplate: template?.name ?? '' } : {}),
      ...(devicePortLabel ? { devicePort: devicePortLabel } : {}),
      ...(person ? { person } : {}),
      via,
      ...(carrierText ? { carrier: carrierText } : {}),
      name: entry?.name ?? suggestedName,
      phantom: entry?.phantom ?? template?.phantomPower ?? false,
      stand: entry?.stand ?? carrierText ?? '',
      notes: entry?.notes ?? '',
      edited: { name: entry?.name !== undefined, phantom: entry?.phantom !== undefined, stand: entry?.stand !== undefined },
    };
  };

  return project.devices
    .filter((d) => isMixer(templates.get(d.templateId)))
    .sort((a, b) => a.label.localeCompare(b.label, 'de', { numeric: true }))
    .map((mixer) => {
      const mixerTemplate = templates.get(mixer.templateId)!;
      const ports = templatePorts(mixerTemplate).filter((p) => !p.isNetwork);
      const inputs = ports.filter((p) => p.role === 'in').map((p, i) => row(mixer, p, i + 1));
      const outputs = ports.filter((p) => p.role === 'out').map((p, i) => row(mixer, p, i + 1));
      return { mixer, mixerTemplate, inputs, outputs };
    });
}

/** Text für „über“: „Multicore 1 · Send 5 (Bühne) → …“ */
export function viaText(row: Pick<PatchRow, 'via'>): string {
  return row.via.map((h) => h.text).join(' → ');
}

// ---------- Änderungen am Live-Dokument ----------

export function readPatch(doc: Y.Doc): PatchEntry[] {
  return Object.values(doc.getMap('patch').toJSON() as Record<string, PatchEntry>);
}

/**
 * Angaben eines Pult-Anschlusses setzen; undefined löscht die Angabe (→ wieder Vorschlag).
 * Leere Einträge werden entfernt.
 */
export function updatePatchEntry(doc: Y.Doc, id: string, patch: Partial<Omit<PatchEntry, 'id'>>, origin: unknown): void {
  doc.transact(() => {
    const collection = doc.getMap<Y.Map<unknown>>('patch');
    let entry = collection.get(id);
    if (!entry) {
      entry = new Y.Map<unknown>();
      collection.set(id, entry);
      entry.set('id', id);
    }
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) entry.delete(key);
      else entry.set(key, value);
    }
    if ([...entry.keys()].every((k) => k === 'id')) collection.delete(id);
  }, origin);
}
