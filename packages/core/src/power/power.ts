// Strom (M10): Leistung je Gerät, Verteiler mit Abgängen (Absicherung, Phase), Last je Abgang und Phase,
// Überlast- und Schieflast-Warnungen. Grundlage sind die Stromkabel im Signalfluss (Anschlüsse mit „Strom“).
// Gerechnet wird mit voller Nennleistung bei 230 V je Phase.
import type { Library } from '../library/library';
import type { Cable, DeviceInstance, Project, Template } from '../model/schema';
import type { Issue } from '../signalflow/checks';
import { templatePorts, type EffectivePort } from '../signalflow/ports';

export const VOLTAGE = 230;
export const WARN_RATIO = 0.8;
export const IMBALANCE_RATIO = 0.3;
export const IMBALANCE_MIN_A = 5;

export type Phase = 'L1' | 'L2' | 'L3';
export type Feed = Phase | '3P';
export type PhaseLoad = Record<Phase, number>;

const PHASES: Phase[] = ['L1', 'L2', 'L3'];
const MAX_DEPTH = 20;

export function emptyLoad(): PhaseLoad {
  return { L1: 0, L2: 0, L3: 0 };
}

function add(a: PhaseLoad, b: PhaseLoad): PhaseLoad {
  return { L1: a.L1 + b.L1, L2: a.L2 + b.L2, L3: a.L3 + b.L3 };
}

export function totalW(load: PhaseLoad): number {
  return load.L1 + load.L2 + load.L3;
}

export function amps(watts: number): number {
  return watts / VOLTAGE;
}

/** Leistung eines Geräts: im Projekt gesetzt, sonst aus der Vorlage. */
export function devicePowerW(device: DeviceInstance, template: Template | undefined): number {
  return device.powerW ?? template?.powerW ?? 0;
}

export function powerPorts(template: Template | undefined): { inputs: EffectivePort[]; outputs: EffectivePort[] } {
  const ports = templatePorts(template).filter((p) => p.isPower);
  return { inputs: ports.filter((p) => p.role === 'in'), outputs: ports.filter((p) => p.role !== 'in') };
}

/** Verteiler = Gerät mit mindestens einem Strom-Abgang. */
export function isDistributor(template: Template | undefined): boolean {
  return powerPorts(template).outputs.length > 0;
}

export interface OutletRow {
  portId: string;
  label: string;
  phase: Feed;
  fuseA?: number;
  /** angeschlossene Geräte (direkt) */
  devices: DeviceInstance[];
  load: PhaseLoad;
  /** höchster Phasenstrom (A) */
  currentA: number;
  /** Auslastung der Absicherung (0–1+), undefined ohne Absicherung */
  usage?: number;
}

export interface DistributorReport {
  device: DeviceInstance;
  template: Template | undefined;
  /** Einspeisung: Phase(n) und Absicherung der Zuleitung */
  feed: Feed;
  inputFuseA?: number;
  /** woran der Verteiler hängt (Name des übergeordneten Verteilers · Abgang) */
  fedFrom?: string;
  /** eigene Leistung + alles an den Abgängen */
  load: PhaseLoad;
  currentA: PhaseLoad;
  usage?: number;
  imbalance: boolean;
  outlets: OutletRow[];
  /** Tiefe im Baum (0 = Haupteinspeisung) */
  depth: number;
}

export interface PowerReport {
  distributors: DistributorReport[];
  /** Geräte mit Leistung, aber ohne Stromkabel */
  unconnected: { device: DeviceInstance; powerW: number }[];
  /** Gesamtleistung aller Hauptverteiler */
  total: PhaseLoad;
}

type ProjectLike = Pick<Project, 'devices' | 'cables'>;

/** Anschluss → (Kabel, anderes Ende) */
function powerIndex(cables: Cable[], devices: Map<string, DeviceInstance>, templates: Map<string, Template>): Map<string, { deviceId: string; portId: string }> {
  const isPowerPort = (end: Cable['from']) => templatePorts(templates.get(devices.get(end.deviceId)?.templateId ?? '')).some((p) => p.id === end.portId && p.isPower);
  const index = new Map<string, { deviceId: string; portId: string }>();
  for (const cable of cables) {
    if (!isPowerPort(cable.from) || !isPowerPort(cable.to)) continue;
    index.set(`${cable.from.deviceId}/${cable.from.portId}`, cable.to);
    index.set(`${cable.to.deviceId}/${cable.to.portId}`, cable.from);
  }
  return index;
}

/** Leistungsbilanz des ganzen Projekts. */
export function buildPowerReport(project: ProjectLike, library: Pick<Library, 'templates'>): PowerReport {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const devices = new Map(project.devices.map((d) => [d.id, d]));
  const index = powerIndex(project.cables, devices, templates);
  const reports: DistributorReport[] = [];

  /** Phase, auf die ein Anschluss bei gegebener Einspeisung wirkt */
  const effective = (portPhase: Feed | undefined, feed: Feed): Feed => (feed === '3P' ? (portPhase ?? '3P') : feed);

  /** Last eines Geräts (inkl. allem dahinter) bei Einspeisung `feed` */
  const loadOf = (device: DeviceInstance, feed: Feed, depth: number, visited: Set<string>, fedFrom: string | undefined, collect: boolean): PhaseLoad => {
    if (visited.has(device.id) || depth > MAX_DEPTH) return emptyLoad();
    visited.add(device.id);
    const template = templates.get(device.templateId);
    const own = devicePowerW(device, template);
    let load = feed === '3P' ? { L1: own / 3, L2: own / 3, L3: own / 3 } : { ...emptyLoad(), [feed]: own };
    const { inputs, outputs } = powerPorts(template);
    if (outputs.length === 0) return load;
    const outlets: OutletRow[] = [];
    // Bericht-Platzhalter, damit die Reihenfolge Eltern vor Kindern bleibt
    const report: DistributorReport | undefined = collect
      ? { device, template, feed, ...(inputs[0]?.fuseA ? { inputFuseA: inputs[0].fuseA } : {}), ...(fedFrom ? { fedFrom } : {}), load: emptyLoad(), currentA: emptyLoad(), imbalance: false, outlets, depth }
      : undefined;
    if (report) reports.push(report);
    for (const port of outputs) {
      const phase = effective(port.phase, feed);
      const other = index.get(`${device.id}/${port.id}`);
      const child = other ? devices.get(other.deviceId) : undefined;
      const childLoad = child ? loadOf(child, phase, depth + 1, visited, `${device.label} · ${port.label}`, collect) : emptyLoad();
      const current = Math.max(...PHASES.map((p) => amps(childLoad[p])));
      outlets.push({
        portId: port.id,
        label: port.label,
        phase,
        ...(port.fuseA ? { fuseA: port.fuseA, usage: current / port.fuseA } : {}),
        devices: child ? [child] : [],
        load: childLoad,
        currentA: current,
      });
      load = add(load, childLoad);
    }
    if (report) {
      report.load = load;
      report.currentA = { L1: amps(load.L1), L2: amps(load.L2), L3: amps(load.L3) };
      const max = Math.max(report.currentA.L1, report.currentA.L2, report.currentA.L3);
      const min = Math.min(report.currentA.L1, report.currentA.L2, report.currentA.L3);
      if (report.inputFuseA) report.usage = (feed === '3P' ? max : report.currentA[feed]) / report.inputFuseA;
      report.imbalance = feed === '3P' && max - min > IMBALANCE_RATIO * max && max - min >= IMBALANCE_MIN_A;
    }
    return load;
  };

  // Hauptverteiler: Verteiler, deren Zuleitung nicht an einem anderen Abgang hängt
  const roots = project.devices
    .filter((d) => isDistributor(templates.get(d.templateId)))
    .filter((d) => !powerPorts(templates.get(d.templateId)).inputs.some((p) => index.has(`${d.id}/${p.id}`)))
    .sort((a, b) => a.label.localeCompare(b.label, 'de', { numeric: true }));
  const visited = new Set<string>();
  let total = emptyLoad();
  for (const root of roots) {
    const feed = powerPorts(templates.get(root.templateId)).inputs[0]?.phase ?? '3P';
    total = add(total, loadOf(root, feed, 0, visited, undefined, true));
  }

  const unconnected = project.devices
    .filter((d) => !visited.has(d.id))
    .map((d) => ({ device: d, powerW: devicePowerW(d, templates.get(d.templateId)) }))
    .filter((x) => x.powerW > 0)
    .sort((a, b) => a.device.label.localeCompare(b.device.label, 'de', { numeric: true }));
  return { distributors: reports, unconnected, total };
}

export function formatAmps(a: number): string {
  return `${a.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} A`;
}

export function formatWatts(w: number): string {
  return w >= 1000 ? `${(w / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} kW` : `${Math.round(w)} W`;
}

/** Überlast (Warnung ab 80 %, Fehler ab 100 % der Absicherung), Schieflast, Geräte ohne Stromanschluss. */
export function checkPower(project: ProjectLike, library: Pick<Library, 'templates'>): Issue[] {
  const report = buildPowerReport(project, library);
  const issues: Issue[] = [];
  const usageIssue = (id: string, what: string, usage: number | undefined, currentA: number, fuseA: number | undefined, objectIds: string[]) => {
    if (usage === undefined || fuseA === undefined) return;
    if (usage >= 1) issues.push({ id: `power-over:${id}`, severity: 'error', message: `${what}: Überlast – ${formatAmps(currentA)} bei ${fuseA} A Absicherung.`, objectIds });
    else if (usage >= WARN_RATIO) issues.push({ id: `power-high:${id}`, severity: 'warning', message: `${what}: ${Math.round(usage * 100)} % ausgelastet (${formatAmps(currentA)} von ${fuseA} A).`, objectIds });
  };
  for (const d of report.distributors) {
    const max = Math.max(d.currentA.L1, d.currentA.L2, d.currentA.L3);
    usageIssue(d.device.id, `${d.device.label} (Zuleitung)`, d.usage, d.feed === '3P' ? max : d.currentA[d.feed], d.inputFuseA, [d.device.id]);
    for (const o of d.outlets) usageIssue(`${d.device.id}:${o.portId}`, `${d.device.label} · ${o.label}`, o.usage, o.currentA, o.fuseA, [d.device.id, ...o.devices.map((x) => x.id)]);
    if (d.imbalance) {
      issues.push({
        id: `power-imbalance:${d.device.id}`,
        severity: 'warning',
        message: `${d.device.label}: Schieflast – L1 ${formatAmps(d.currentA.L1)}, L2 ${formatAmps(d.currentA.L2)}, L3 ${formatAmps(d.currentA.L3)}.`,
        objectIds: [d.device.id],
      });
    }
  }
  if (report.unconnected.length) {
    issues.push({
      id: 'power-unconnected',
      severity: 'info',
      message: `${report.unconnected.length === 1 ? '1 Gerät hat' : `${report.unconnected.length} Geräte haben`} Leistung, aber keinen Stromanschluss (${report.unconnected.slice(0, 5).map((u) => u.device.label).join(', ')}${report.unconnected.length > 5 ? ' …' : ''}).`,
      objectIds: report.unconnected.map((u) => u.device.id),
    });
  }
  return issues;
}
