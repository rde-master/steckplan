// Aufbereitung für die Zeichenfläche: Kästen mit Größe/Anschlüssen, Kabel mit Punkten.
import { boundsOf, devicePerson, type MixerNetworkRow, type StageboxInputInfo, EMPTY_FILTER, formatDmx, GROUP_COLORS, personName, type Filter, type Group, type Person } from '@steckplan/core';
import type { ColorMode } from '../../lib/editor';
import { cableVisible, deviceVisible, displayColor } from '../../lib/display';
import {
  boxLayout,
  cableIssueMap,
  contrastText,
  curveCable,
  DEFAULT_DEVICE_COLOR,
  defectivePortIds,
  isMulticore,
  routeCable,
  templatePorts,
  type BoxLayout,
  type Cable,
  type DeviceInstance,
  type EffectivePort,
  type Issue,
  type Library,
  type Template,
} from '@steckplan/core';

export const MULTICORE_END_ROW = 16;
/** Zeile mit dem Namen der Person unter der Kennung */
export const PERSON_ROW = 16;
export const GROUP_PADDING = 14;
export const GROUP_LABEL = 20;

export interface DeviceBox {
  device: DeviceInstance;
  template: Template | undefined;
  x: number;
  y: number;
  layout: BoxLayout;
  /** zusätzliche Kopfzeile (Multicore: Namen der Enden) */
  extraHeader: number;
  fill: string;
  text: string;
  multicore: boolean;
  stageObject: boolean;
  /** Gerät ist im Bühnenplan noch nicht platziert */
  unplaced: boolean;
  /** passt nicht zum Filter → ausgegraut */
  dimmed: boolean;
  /** „1.001“ (wenn DMX-Adresse gesetzt) */
  dmxLabel?: string;
  /** Person, die das Gerät benutzt */
  person?: string;
  /** Besitzer (wenn eingeblendet) */
  owner?: string;
  /** Anschluss → angezeigter Text */
  labels: Map<string, string>;
  /** defekte Anschlüsse (rotes X) */
  defects: Set<string>;
}

export interface CableLine {
  cable: Cable;
  /** eckig: Punktliste; geschwungen: [Start, Kontrollpunkt 1, Kontrollpunkt 2, Ziel] */
  points: number[];
  curved: boolean;
  color: string;
  issue: 'error' | 'warning' | 'info' | undefined;
  dimmed: boolean;
}

export function deviceColor(device: DeviceInstance, template: Template | undefined): string {
  return device.colorOverride ?? template?.defaultColor ?? DEFAULT_DEVICE_COLOR;
}

function fallbackPosition(index: number): { x: number; y: number } {
  return { x: 40 + (index % 5) * 260, y: 40 + Math.floor(index / 5) * 180 };
}

export interface DisplayOptions {
  colorMode: ColorMode;
  filter: Filter;
  /** Personen des Projekts (für „benutzt von Mensch“) */
  people?: Person[];
  /** Namen der Personen in den Kästen zeigen (Standard: ja) */
  showPeople?: boolean;
  /** Besitzer in den Kästen zeigen (Standard: nein) */
  showOwner?: boolean;
  /** Stagebox-Eingänge: „Gerät/Anschluss“ → Quelle und Pult-Kanal (leer = nicht zeigen) */
  stageboxInfo?: Map<string, StageboxInputInfo>;
  /** Pulte: belegte Netzwerk-Kanäle (rechts als Anzeige-Zeilen) */
  mixerRows?: Map<string, MixerNetworkRow[]>;
}

const DEFAULT_DISPLAY: DisplayOptions = { colorMode: 'device', filter: EMPTY_FILTER };

export function buildBoxes(devices: DeviceInstance[], library: Library | null, showStageObjects: boolean, display: DisplayOptions = DEFAULT_DISPLAY): DeviceBox[] {
  const templates = new Map((library?.templates ?? []).map((t) => [t.id, t]));
  const boxes: DeviceBox[] = [];
  devices.forEach((device, index) => {
    const template = templates.get(device.templateId);
    const stageObject = template ? ['stageElement', 'truss', 'stand'].includes(template.kind) : false;
    if (stageObject && !showStageObjects) return;
    const multicore = isMulticore(template);
    const ports = templatePorts(template);
    const labels = new Map<string, string>();
    for (const port of ports) {
      const base = multicore ? port.label.replace(/ \([^)]*\)$/, '') : port.label;
      const info = display.stageboxInfo?.get(`${device.id}/${port.id}`);
      labels.set(port.id, info ? `${base} · ${info.source} → ${info.channel}` : base);
    }
    // Pult: belegte Netzwerk-Kanäle rechts unter den Anschlüssen (nur Anzeige)
    const virtualPorts: EffectivePort[] = (display.mixerRows?.get(device.id) ?? []).map((r) => ({
      id: `net:${r.channel}`,
      label: `${r.channel} · ${r.name} ← ${r.stagebox} · ${r.stageboxPort}`,
      connector: '',
      signal: '',
      role: 'in',
      side: 'right',
      virtual: true,
    }));
    for (const v of virtualPorts) labels.set(v.id, v.label);
    const displayPorts: EffectivePort[] = [...ports.map((p) => ({ ...p, label: labels.get(p.id) ?? p.label })), ...virtualPorts];
    const person = display.showPeople === false ? '' : personName(devicePerson(device, template, display.people ?? []));
    const owner = display.showOwner && device.ownerId ? (library?.masterData.owners.find((o) => o.id === device.ownerId)?.name ?? '') : '';
    const infoLines = [person, owner].filter(Boolean).length;
    const longest = [device.label, person ? `👤 ${person}` : '', owner ? `Besitzer: ${owner}` : ''].reduce((a, b) => (b.length > a.length ? b : a), '');
    const extraHeader = multicore ? MULTICORE_END_ROW : infoLines * PERSON_ROW;
    const sized = device.signalFlow;
    const base = boxLayout(longest, displayPorts, { width: sized?.width, height: sized?.height !== undefined ? sized.height - extraHeader : undefined });
    const layout: BoxLayout = {
      width: base.width,
      height: base.height + extraHeader,
      minWidth: base.minWidth,
      minHeight: base.minHeight + extraHeader,
      anchors: base.anchors.map((a) => ({ ...a, y: a.y + extraHeader })),
    };
    const fill = displayColor(display.colorMode, device, template, library, deviceColor(device, template));
    const pos = device.signalFlow?.position ?? fallbackPosition(index);
    const unplaced = template?.kind === 'device' && !device.stagePlan;
    const dimmed = !deviceVisible(display.filter, device, template);
    const dmxLabel = device.dmx ? formatDmx(device.dmx.universe, device.dmx.address) : undefined;
    boxes.push({ device, template, x: pos.x, y: pos.y, layout, extraHeader, fill, text: contrastText(fill), multicore, stageObject, unplaced, dimmed, labels, defects: defectivePortIds(device, template), ...(dmxLabel ? { dmxLabel } : {}), ...(person ? { person } : {}), ...(owner ? { owner } : {}) });
  });
  return boxes;
}

export function anchorOf(box: DeviceBox, portId: string): { x: number; y: number; side: 'left' | 'right' } | undefined {
  const anchor = box.layout.anchors.find((a) => a.port.id === portId);
  return anchor ? { x: box.x + anchor.x, y: box.y + anchor.y, side: anchor.port.side } : undefined;
}

export type CableStyle = 'square' | 'curved';

export function buildCableLines(cables: Cable[], boxes: DeviceBox[], library: Library | null, issues: Issue[], filter: Filter = EMPTY_FILTER, style: CableStyle = 'square'): CableLine[] {
  const byId = new Map(boxes.map((b) => [b.device.id, b]));
  const templates = new Map((library?.templates ?? []).map((t) => [t.id, t]));
  const issueMap = cableIssueMap(issues);
  const lines: CableLine[] = [];
  for (const cable of cables) {
    const fromBox = byId.get(cable.from.deviceId);
    const toBox = byId.get(cable.to.deviceId);
    if (!fromBox || !toBox) continue;
    const a = anchorOf(fromBox, cable.from.portId);
    const b = anchorOf(toBox, cable.to.portId);
    if (!a || !b) continue;
    const type = cable.templateId ? templates.get(cable.templateId) : undefined;
    lines.push({
      cable,
      points: style === 'curved' ? curveCable(a, a.side, b, b.side) : routeCable(a, a.side, b, b.side),
      curved: style === 'curved',
      color: cable.direct ? '#64748b' : (type?.defaultColor ?? '#475569'),
      issue: issueMap.get(cable.id),
      dimmed: !cableVisible(filter, cable, type),
    });
  }
  return lines;
}

export function bounds(boxes: DeviceBox[]): { x: number; y: number; width: number; height: number } | null {
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.layout.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.layout.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export const ROLE_COLORS = { in: '#0284c7', out: '#ea580c', bi: '#7c3aed' } as const;

/** Gruppenrahmen aus den Kästen der Mitglieder (Platz für den Namen oben). */
export function buildGroupFrames(groups: Group[], boxes: DeviceBox[]): { id: string; name: string; color: string; x: number; y: number; width: number; height: number; deviceIds: string[] }[] {
  return groups.flatMap((group, index) => {
    const members = boxes.filter((b) => b.device.groupId === group.id);
    const rect = boundsOf(members.map((b) => ({ x: b.x, y: b.y, width: b.layout.width, height: b.layout.height })), GROUP_PADDING);
    if (!rect) return [];
    return [{
      id: group.id,
      name: group.name,
      color: group.color ?? GROUP_COLORS[index % GROUP_COLORS.length]!,
      x: rect.x,
      y: rect.y - GROUP_LABEL,
      width: rect.width,
      height: rect.height + GROUP_LABEL,
      deviceIds: members.map((b) => b.device.id),
    }];
  });
}
