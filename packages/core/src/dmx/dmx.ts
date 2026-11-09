// DMX: Belegung, Prüfungen, Kette und Auto-Adressierung (PLAN.md 7.2).
import type { Cable, DeviceInstance, Project, Template } from '../model/schema';
import type { Issue } from '../signalflow/checks';
import { findPort, isMulticore, templatePorts } from '../signalflow/ports';

export const DMX_CHANNELS = 512;

export function isDmxDevice(template: Template | undefined): boolean {
  return (template?.dmxModes?.length ?? 0) > 0;
}

// ---------- DMX per Funk ----------

export function isWirelessSender(template: Template | undefined): boolean {
  return template?.wirelessDmx?.send === true;
}

export function isWirelessReceiver(template: Template | undefined): boolean {
  return template?.wirelessDmx?.receive === true;
}

export interface WirelessLink {
  senderId: string;
  receiverId: string;
  /** gesendetes Universum (fehlt = beim Sender nicht eingestellt) */
  universe: number | undefined;
}

/** Funkstrecken: je Empfänger mit gültigem Sender eine Verbindung Sender → Empfänger */
export function wirelessLinks(project: Pick<Project, 'devices'>, templates: Map<string, Template>): WirelessLink[] {
  const byId = new Map(project.devices.map((d) => [d.id, d]));
  const links: WirelessLink[] = [];
  for (const device of project.devices) {
    const fromId = device.wirelessDmx?.fromId;
    if (!fromId || !isWirelessReceiver(templates.get(device.templateId))) continue;
    const sender = byId.get(fromId);
    if (!sender || !isWirelessSender(templates.get(sender.templateId))) continue;
    links.push({ senderId: sender.id, receiverId: device.id, universe: sender.wirelessDmx?.universe });
  }
  return links;
}

/**
 * DMX-Eingänge, die gesperrt sind, weil das Gerät sein DMX per Funk bekommt (Empfänger mit gewähltem Sender):
 * dort darf kein Kabel stecken.
 */
export function wirelessBlockedPorts(device: Pick<DeviceInstance, 'wirelessDmx'>, template: Template | undefined): Set<string> {
  if (!device.wirelessDmx?.fromId || !isWirelessReceiver(template)) return new Set();
  return new Set(templatePorts(template).filter((p) => (p.role === 'in' || p.role === 'bi') && DMX_SIGNAL.test(p.signal)).map((p) => p.id));
}

/** Prüfungen der Funkstrecken */
export function checkWirelessDmx(project: Pick<Project, 'devices'> & Partial<Pick<Project, 'cables'>>, templates: Map<string, Template>): Issue[] {
  const issues: Issue[] = [];
  // Kabel an einem DMX-Eingang, der per Funk versorgt wird
  for (const cable of project.cables ?? []) {
    for (const end of [cable.from, cable.to]) {
      const device = project.devices.find((d) => d.id === end.deviceId);
      if (!device || !wirelessBlockedPorts(device, templates.get(device.templateId)).has(end.portId)) continue;
      issues.push({ id: `wdmx-cable:${device.id}:${end.portId}`, severity: 'warning', message: `„${device.label}“ bekommt DMX per Funk – am DMX-Eingang steckt trotzdem ein Kabel.`, objectIds: [device.id, cable.id] });
    }
  }
  const byId = new Map(project.devices.map((d) => [d.id, d]));
  for (const device of project.devices) {
    const template = templates.get(device.templateId);
    if (isWirelessSender(template) && device.wirelessDmx?.universe === undefined) {
      issues.push({ id: `wdmx-universe:${device.id}`, severity: 'warning', message: `„${device.label}“: Funk-Sender ohne Universum.`, objectIds: [device.id] });
    }
    if (!isWirelessReceiver(template)) continue;
    const fromId = device.wirelessDmx?.fromId;
    const sender = fromId ? byId.get(fromId) : undefined;
    if (!fromId) {
      // Empfangsboxen ohne Sender sind ein Hinweis; Scheinwerfer mit eingebautem Empfänger hängen evtl. am Kabel
      if (!isDmxDevice(template)) issues.push({ id: `wdmx-nosender:${device.id}`, severity: 'warning', message: `„${device.label}“: Funk-Empfänger ohne Sender.`, objectIds: [device.id] });
      continue;
    }
    if (!sender || !isWirelessSender(templates.get(sender.templateId))) {
      issues.push({ id: `wdmx-sender:${device.id}`, severity: 'error', message: `„${device.label}“: der gewählte Funk-Sender gibt es nicht (mehr).`, objectIds: [device.id] });
      continue;
    }
    // Scheinwerfer mit eingebautem Empfänger: Patch muss im gesendeten Universum liegen
    const universe = sender.wirelessDmx?.universe;
    if (device.dmx && universe !== undefined && device.dmx.universe !== universe) {
      issues.push({
        id: `wdmx-mismatch:${device.id}`,
        severity: 'warning',
        message: `„${device.label}“: gepatcht in Universum ${device.dmx.universe}, empfängt per Funk aber Universum ${universe} von „${sender.label}“.`,
        objectIds: [device.id, sender.id],
      });
    }
  }
  return issues;
}

export function channelsOf(device: DeviceInstance, template: Template | undefined): number | undefined {
  if (!device.dmx || !template?.dmxModes) return undefined;
  return template.dmxModes.find((m) => m.name === device.dmx!.modeName)?.channels;
}

/** Belegter Bereich [Startadresse, Ende]. */
export function footprintOf(device: DeviceInstance, template: Template | undefined): { universe: number; start: number; end: number } | undefined {
  const channels = channelsOf(device, template);
  if (!device.dmx || channels === undefined) return undefined;
  return { universe: device.dmx.universe, start: device.dmx.address, end: device.dmx.address + channels - 1 };
}

/** „1.001“ (Universum.Adresse) */
export function formatDmx(universe: number, address: number): string {
  return `${universe}.${String(address).padStart(3, '0')}`;
}

export function checkDmx(project: Pick<Project, 'devices'>, templates: Map<string, Template>): Issue[] {
  const issues: Issue[] = [];
  const used: { device: DeviceInstance; universe: number; start: number; end: number }[] = [];
  for (const device of project.devices) {
    const template = templates.get(device.templateId);
    if (!isDmxDevice(template)) continue;
    if (!device.dmx) {
      issues.push({ id: `dmx-missing:${device.id}`, severity: 'warning', message: `„${device.label}“: keine DMX-Adresse.`, objectIds: [device.id] });
      continue;
    }
    const channels = channelsOf(device, template);
    if (channels === undefined) {
      issues.push({ id: `dmx-mode:${device.id}`, severity: 'error', message: `„${device.label}“: DMX-Modus „${device.dmx.modeName}“ gibt es in der Vorlage nicht.`, objectIds: [device.id] });
      continue;
    }
    const end = device.dmx.address + channels - 1;
    if (end > DMX_CHANNELS) {
      issues.push({
        id: `dmx-end:${device.id}`,
        severity: 'error',
        message: `„${device.label}“: Kanäle ${device.dmx.address}–${end} gehen über 512 hinaus (Universum ${device.dmx.universe}).`,
        objectIds: [device.id],
      });
    }
    used.push({ device, universe: device.dmx.universe, start: device.dmx.address, end });
  }
  used.sort((a, b) => a.universe - b.universe || a.start - b.start);
  for (let i = 0; i < used.length; i++) {
    for (let j = i + 1; j < used.length; j++) {
      const a = used[i]!;
      const b = used[j]!;
      if (b.universe !== a.universe || b.start > a.end) break;
      issues.push({
        id: `dmx-overlap:${a.device.id}:${b.device.id}`,
        severity: 'error',
        message: `DMX-Überlappung in Universum ${a.universe}: „${a.device.label}“ (${a.start}–${a.end}) und „${b.device.label}“ (${b.start}–${b.end}).`,
        objectIds: [a.device.id, b.device.id],
      });
    }
  }
  return issues;
}

const DMX_SIGNAL = /dmx/i;

/**
 * DMX-Kette ab einem Gerät: folgt den Kabeln von DMX-Ausgängen (Signal „DMX“) zu Eingängen.
 * Multicore-Adern werden durchlaufen (Ende A → Ende B). Reihenfolge = Reihenfolge der Ausgänge.
 */
export function dmxChain(startId: string, project: Pick<Project, 'devices' | 'cables'>, templates: Map<string, Template>): string[] {
  const devices = new Map(project.devices.map((d) => [d.id, d]));
  const order: string[] = [];
  const seen = new Set<string>();
  const outgoing = (deviceId: string, portId: string): Cable[] => project.cables.filter((c) => c.from.deviceId === deviceId && c.from.portId === portId);

  const visit = (deviceId: string, viaPort?: string): void => {
    const device = devices.get(deviceId);
    if (!device) return;
    const template = templates.get(device.templateId);
    if (isMulticore(template)) {
      // durch die Ader: Eingang an einem Ende → gleicher Kanal am anderen Ende
      if (!viaPort) return;
      const [channel, end] = viaPort.split(':');
      const other = `${channel}:${end === 'a' ? 'b' : 'a'}`;
      for (const cable of outgoing(deviceId, other)) visit(cable.to.deviceId, cable.to.portId);
      return;
    }
    if (seen.has(deviceId)) return;
    seen.add(deviceId);
    order.push(deviceId);
    // per Funk: Sender → alle gekoppelten Empfänger
    if (isWirelessSender(template)) {
      for (const d of project.devices) {
        if (d.wirelessDmx?.fromId === deviceId && isWirelessReceiver(templates.get(d.templateId))) visit(d.id);
      }
    }
    for (const port of templatePorts(template)) {
      if ((port.role === 'out' || port.role === 'bi') && DMX_SIGNAL.test(port.signal)) {
        for (const cable of outgoing(deviceId, port.id)) {
          const target = findPort(templates.get(devices.get(cable.to.deviceId)?.templateId ?? ''), cable.to.portId);
          if (!target || target.role === 'out') continue;
          visit(cable.to.deviceId, cable.to.portId);
        }
      }
    }
  };
  visit(startId);
  return order;
}

export interface AutoAddressResult {
  patches: { id: string; dmx: NonNullable<DeviceInstance['dmx']> }[];
  /** Geräte, die ins nächste Universum gerutscht sind */
  wrapped: string[];
}

/** Vergibt Adressen der Reihe nach; passt ein Gerät nicht mehr, geht es im nächsten Universum ab 1 weiter. */
export function autoAddress(
  deviceIds: string[],
  start: { universe: number; address: number },
  project: Pick<Project, 'devices'>,
  templates: Map<string, Template>,
): AutoAddressResult {
  const devices = new Map(project.devices.map((d) => [d.id, d]));
  let universe = Math.max(1, Math.floor(start.universe));
  let address = Math.min(DMX_CHANNELS, Math.max(1, Math.floor(start.address)));
  const patches: AutoAddressResult['patches'] = [];
  const wrapped: string[] = [];
  for (const id of deviceIds) {
    const device = devices.get(id);
    const template = templates.get(device?.templateId ?? '');
    if (!device || !isDmxDevice(template)) continue;
    const mode = template!.dmxModes!.find((m) => m.name === device.dmx?.modeName) ?? template!.dmxModes![0]!;
    if (address + mode.channels - 1 > DMX_CHANNELS) {
      universe++;
      address = 1;
      wrapped.push(id);
    }
    patches.push({ id, dmx: { modeName: mode.name, universe, address } });
    address += mode.channels;
    if (address > DMX_CHANNELS) {
      universe++;
      address = 1;
    }
  }
  return { patches, wrapped };
}

export interface DmxPatchRow {
  id: string;
  label: string;
  templateName: string;
  modeName: string;
  channels?: number;
  universe?: number;
  address?: number;
  end?: number;
  carrier?: string;
}

export function buildDmxPatch(project: Pick<Project, 'devices'>, templates: Map<string, Template>): DmxPatchRow[] {
  const byId = new Map(project.devices.map((d) => [d.id, d]));
  return project.devices
    .filter((d) => isDmxDevice(templates.get(d.templateId)))
    .map((d) => {
      const t = templates.get(d.templateId)!;
      const channels = channelsOf(d, t);
      const carrier = d.mountedOnId ? byId.get(d.mountedOnId)?.label : undefined;
      return {
        id: d.id,
        label: d.label,
        templateName: t.name,
        modeName: d.dmx?.modeName ?? '',
        ...(channels !== undefined ? { channels } : {}),
        ...(d.dmx ? { universe: d.dmx.universe, address: d.dmx.address } : {}),
        ...(d.dmx && channels !== undefined ? { end: d.dmx.address + channels - 1 } : {}),
        ...(carrier ? { carrier } : {}),
      };
    })
    .sort((a, b) => (a.universe ?? Infinity) - (b.universe ?? Infinity) || (a.address ?? 0) - (b.address ?? 0) || a.label.localeCompare(b.label, 'de', { numeric: true }));
}

// ---------- Universum als Übersicht (grafische Ansicht) ----------

export interface DmxSegment {
  row: DmxPatchRow;
  start: number;
  /** Ende, höchstens 512 */
  end: number;
  /** Kanäle über 512 hinaus */
  overflow: number;
}

export interface DmxUniverseMap {
  universe: number;
  segments: DmxSegment[];
  /** belegte Kanäle (ohne Doppelte) */
  used: number;
  /** doppelt belegte Bereiche */
  overlaps: { start: number; end: number }[];
  /** freie Bereiche */
  free: { start: number; end: number }[];
}

/** Zusammenhängende Bereiche der Kanäle 1 … 512, für die test() gilt. */
function runs(test: (channel: number) => boolean): { start: number; end: number }[] {
  const result: { start: number; end: number }[] = [];
  for (let ch = 1; ch <= DMX_CHANNELS; ch++) {
    if (!test(ch)) continue;
    const last = result[result.length - 1];
    if (last && last.end === ch - 1) last.end = ch;
    else result.push({ start: ch, end: ch });
  }
  return result;
}

/** Je Universum: Geräte als Bereiche, Belegung, Überlappungen und freie Bereiche (Geräte ohne Adresse/Modus fehlen). */
export function dmxUniverses(rows: DmxPatchRow[]): DmxUniverseMap[] {
  const byUniverse = new Map<number, DmxSegment[]>();
  for (const row of rows) {
    if (row.universe === undefined || row.address === undefined || row.end === undefined) continue;
    const segments = byUniverse.get(row.universe) ?? [];
    segments.push({ row, start: row.address, end: Math.min(row.end, DMX_CHANNELS), overflow: Math.max(0, row.end - DMX_CHANNELS) });
    byUniverse.set(row.universe, segments);
  }
  return [...byUniverse.entries()]
    .sort(([a], [b]) => a - b)
    .map(([universe, segments]) => {
      const count = new Array<number>(DMX_CHANNELS + 1).fill(0);
      for (const s of segments) for (let ch = s.start; ch <= s.end; ch++) count[ch]!++;
      return {
        universe,
        segments: segments.sort((a, b) => a.start - b.start || a.end - b.end),
        used: count.filter((c) => c > 0).length,
        overlaps: runs((ch) => count[ch]! > 1),
        free: runs((ch) => count[ch] === 0),
      };
    });
}
