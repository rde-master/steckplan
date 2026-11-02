// Ton-Patch (M9): Input- und Output-Liste je Mischpult, automatisch aus dem Signalfluss.
// Die Kette wird über Kabel und Multicore-Adern verfolgt:
//   Input:  Pult-Eingang ← (direkt/Kabel) ← Multicore-Ader ← Kabel ← Quelle (Mikro, DI …)
//   Output: Pult-Ausgang → Multicore-Ader → Kabel → Ziel (Monitor, In-Ear, Endstufe …)
// Zusatzangaben (Kanalname, 48 V, Stativ, Bemerkung) stehen je Pult-Anschluss in project.patch.
import * as Y from 'yjs';
import type { Library } from '../library/library';
import type { Cable, DeviceInstance, PatchEntry, Person, Project, Template } from '../model/schema';
import { devicePerson, personName } from '../people/people';
import type { Issue } from '../signalflow/checks';
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
  /** Kanäle, die über das Netzwerk kommen (digitale Stagebox), 1 … n */
  network: PatchRow[];
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

  const assignments = validAssignments(project, library);
  const networkRow = (mixer: DeviceInstance, channel: number): PatchRow => {
    const id = patchId(mixer.id, `net:${channel}`);
    const found = assignments.find((a) => a.mixer.id === mixer.id && a.channel === channel);
    const device = found?.device;
    const template = device ? templates.get(device.templateId) : undefined;
    const carrierId = device?.mountedOnId ?? device?.stagePlan?.standsOnId;
    const carrier = carrierId ? devices.get(carrierId) : undefined;
    const carrierText = carrier ? (templates.get(carrier.templateId)?.name ?? carrier.label) : undefined;
    const person = device ? personName(devicePerson(device, template, people)) : '';
    const entry = entries.get(id);
    return {
      id,
      channel,
      port: `Netz ${channel}`,
      ...(device ? { device, deviceTemplate: template?.name ?? '' } : {}),
      ...(found ? { devicePort: found.route.sourcePort } : {}),
      ...(person ? { person } : {}),
      via: found ? networkRouteHops(found.route) : [],
      ...(carrierText ? { carrier: carrierText } : {}),
      name: entry?.name ?? (device ? (person ? `${device.label} (${person})` : device.label) : ''),
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
      const ports = templatePorts(mixerTemplate).filter((p) => !p.isNetwork && !p.isPower);
      const inputs = ports.filter((p) => p.role === 'in').map((p, i) => row(mixer, p, i + 1));
      const outputs = ports.filter((p) => p.role === 'out').map((p, i) => row(mixer, p, i + 1));
      const network = Array.from({ length: networkChannelCount(mixer, mixerTemplate) }, (_, i) => networkRow(mixer, i + 1));
      return { mixer, mixerTemplate, inputs, outputs, network };
    });
}

// ---------- Netzwerk-Kanäle (digitale Stagebox → Pult) ----------

/** Anzahl der Netzwerk-Kanäle eines Pults: im Projekt gesetzt, sonst aus der Vorlage. */
export function networkChannelCount(mixer: DeviceInstance, template: Template | undefined): number {
  return mixer.networkChannels ?? template?.networkChannels ?? 0;
}

export interface NetworkRoute {
  mixer: DeviceInstance;
  stagebox: DeviceInstance;
  /** Eingang der Stagebox, an dem das Signal ankommt */
  stageboxPortId: string;
  stageboxPort: string;
  /** Anschluss an der Quelle */
  sourcePort: string;
  /** analog vor der Stagebox: Multicore-Adern */
  analogVia: PatchHop[];
  /** digital zwischen Stagebox und Pult: weitere Geräte (z. B. zweite Stagebox, Switch) */
  networkVia: DeviceInstance[];
}

/**
 * Durchgehende Ketten einer Quelle zu Mischpulten mit Netzwerk-Kanälen:
 * Quelle → (Kabel, auch durch Multicore-Adern) → Eingang einer Stagebox → Netzwerk (auch über weitere Geräte
 * mit Netzwerk-Anschlüssen, z. B. eine zweite Stagebox oder einen Switch) → Netzwerk-Anschluss des Pults.
 */
export function networkRoutes(device: DeviceInstance, project: Pick<Project, 'devices' | 'cables'>, library: Pick<Library, 'templates'>): NetworkRoute[] {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const devices = new Map(project.devices.map((d) => [d.id, d]));
  const index = cableIndex(project.cables);
  const portOf = (deviceId: string, portId: string) => templatePorts(templates.get(devices.get(deviceId)?.templateId ?? '')).find((p) => p.id === portId);
  const networkPorts = (deviceId: string) => templatePorts(templates.get(devices.get(deviceId)?.templateId ?? '')).filter((p) => p.isNetwork);
  const routes: NetworkRoute[] = [];
  const sourcePorts = templatePorts(templates.get(device.templateId)).filter((p) => !p.isNetwork && !p.isPower);
  for (const sourcePort of sourcePorts) {
    // analog: bis zum ersten Gerät, das kein Multicore ist (die Stagebox)
    const { end, via } = trace({ deviceId: device.id, portId: sourcePort.id }, devices, templates, index);
    if (!end) continue;
    const stagebox = devices.get(end.deviceId);
    const stageboxTemplate = templates.get(stagebox?.templateId ?? '');
    const inPort = portOf(end.deviceId, end.portId);
    if (!stagebox || !inPort || inPort.isNetwork || inPort.isPower || isMixer(stageboxTemplate) || networkPorts(stagebox.id).length === 0) continue;
    // digital: Breitensuche über Netzwerkkabel bis zu Pulten mit Netzwerk-Kanälen
    const visited = new Set([stagebox.id]);
    const queue: { deviceId: string; path: DeviceInstance[] }[] = [{ deviceId: stagebox.id, path: [] }];
    while (queue.length) {
      const { deviceId, path } = queue.shift()!;
      for (const port of networkPorts(deviceId)) {
        for (const { other } of index.get(`${deviceId}/${port.id}`) ?? []) {
          if (visited.has(other.deviceId) || !portOf(other.deviceId, other.portId)?.isNetwork) continue;
          visited.add(other.deviceId);
          const next = devices.get(other.deviceId);
          if (!next) continue;
          const nextTemplate = templates.get(next.templateId);
          if (isMixer(nextTemplate) && networkChannelCount(next, nextTemplate) > 0) {
            if (!routes.some((r) => r.mixer.id === next.id && r.stagebox.id === stagebox.id && r.stageboxPortId === inPort.id)) {
              routes.push({ mixer: next, stagebox, stageboxPortId: inPort.id, stageboxPort: inPort.label, sourcePort: sourcePort.label, analogVia: via, networkVia: path });
            }
          } else if (path.length < MAX_HOPS) {
            queue.push({ deviceId: next.id, path: [...path, next] });
          }
        }
      }
    }
  }
  return routes;
}

/** „Multicore 1 · Send 5 (FOH) → Stagebox 1 · In 5 (Netzwerk) → Stagebox 2“ */
export function networkRouteHops(route: NetworkRoute): PatchHop[] {
  return [
    ...route.analogVia,
    { deviceId: route.stagebox.id, text: `${route.stagebox.label} · ${route.stageboxPort} (Netzwerk)` },
    ...route.networkVia.map((d) => ({ deviceId: d.id, text: d.label })),
  ];
}

export interface ChannelAssignment {
  device: DeviceInstance;
  mixer: DeviceInstance;
  channel: number;
  route: NetworkRoute;
}

/** Zuordnungen mit gültiger Kette und vorhandenem Kanal. */
export function validAssignments(project: Pick<Project, 'devices' | 'cables'>, library: Pick<Library, 'templates'>): ChannelAssignment[] {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const result: ChannelAssignment[] = [];
  for (const device of project.devices) {
    const mc = device.mixerChannel;
    if (!mc) continue;
    const route = networkRoutes(device, project, library).find((r) => r.mixer.id === mc.mixerId);
    if (!route || mc.channel > networkChannelCount(route.mixer, templates.get(route.mixer.templateId))) continue;
    result.push({ device, mixer: route.mixer, channel: mc.channel, route });
  }
  return result;
}

/** Anzeige an der Stagebox: „Gerät/Anschluss“ → „→ FOH 12“ */
export function stageboxChannelLabels(project: Pick<Project, 'devices' | 'cables'>, library: Pick<Library, 'templates'>): Map<string, string> {
  const labels = new Map<string, string>();
  for (const a of validAssignments(project, library)) {
    const key = `${a.route.stagebox.id}/${a.route.stageboxPortId}`;
    const text = `${a.mixer.label} ${a.channel}`;
    labels.set(key, labels.has(key) ? `${labels.get(key)}, ${text}` : text);
  }
  return labels;
}

/** Prüfungen: Zuordnung ohne durchgehende Kette, Kanal gibt es nicht, Kanal doppelt belegt. */
export function checkNetworkChannels(project: Pick<Project, 'devices' | 'cables'>, library: Pick<Library, 'templates'>): Issue[] {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const devices = new Map(project.devices.map((d) => [d.id, d]));
  const issues: Issue[] = [];
  for (const device of project.devices) {
    const mc = device.mixerChannel;
    if (!mc) continue;
    const mixer = devices.get(mc.mixerId);
    const route = networkRoutes(device, project, library).find((r) => r.mixer.id === mc.mixerId);
    if (!mixer || !route) {
      issues.push({ id: `netchannel-chain:${device.id}`, severity: 'warning', message: `${device.label}: Kanal ${mc.channel} auf ${mixer?.label ?? 'Pult'} – keine durchgehende Kette (Quelle → Stagebox → Netzwerk → Pult).`, objectIds: [device.id] });
    } else if (mc.channel > networkChannelCount(mixer, templates.get(mixer.templateId))) {
      issues.push({ id: `netchannel-range:${device.id}`, severity: 'warning', message: `${device.label}: ${mixer.label} hat keinen Kanal ${mc.channel}.`, objectIds: [device.id] });
    }
  }
  const byChannel = new Map<string, ChannelAssignment[]>();
  for (const a of validAssignments(project, library)) {
    const key = `${a.mixer.id}:${a.channel}`;
    byChannel.set(key, [...(byChannel.get(key) ?? []), a]);
  }
  for (const [key, list] of byChannel) {
    if (list.length < 2) continue;
    issues.push({ id: `netchannel-double:${key}`, severity: 'warning', message: `${list[0]!.mixer.label} Kanal ${list[0]!.channel} ist doppelt belegt (${list.map((a) => a.device.label).join(', ')}).`, objectIds: list.map((a) => a.device.id) });
  }
  return issues;
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
