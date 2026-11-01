// Aufbereitung für die Zeichenfläche: Kästen mit Größe/Anschlüssen, Kabel mit Punkten.
import {
  boxLayout,
  cableIssueMap,
  contrastText,
  DEFAULT_DEVICE_COLOR,
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
  /** Anschluss → angezeigter Text */
  labels: Map<string, string>;
}

export interface CableLine {
  cable: Cable;
  points: number[];
  color: string;
  issue: 'error' | 'warning' | 'info' | undefined;
}

export function deviceColor(device: DeviceInstance, template: Template | undefined): string {
  return device.colorOverride ?? template?.defaultColor ?? DEFAULT_DEVICE_COLOR;
}

function fallbackPosition(index: number): { x: number; y: number } {
  return { x: 40 + (index % 5) * 260, y: 40 + Math.floor(index / 5) * 180 };
}

export function buildBoxes(devices: DeviceInstance[], library: Library | null, showStageObjects: boolean): DeviceBox[] {
  const templates = new Map((library?.templates ?? []).map((t) => [t.id, t]));
  const boxes: DeviceBox[] = [];
  devices.forEach((device, index) => {
    const template = templates.get(device.templateId);
    const stageObject = template ? ['stageElement', 'truss', 'stand'].includes(template.kind) : false;
    if (stageObject && !showStageObjects) return;
    const multicore = isMulticore(template);
    const ports = templatePorts(template);
    const labels = new Map<string, string>();
    for (const port of ports) labels.set(port.id, multicore ? port.label.replace(/ \([^)]*\)$/, '') : port.label);
    const displayPorts: EffectivePort[] = ports.map((p) => ({ ...p, label: labels.get(p.id) ?? p.label }));
    const base = boxLayout(device.label, displayPorts);
    const extraHeader = multicore ? MULTICORE_END_ROW : 0;
    const layout: BoxLayout = {
      width: base.width,
      height: base.height + extraHeader,
      anchors: base.anchors.map((a) => ({ ...a, y: a.y + extraHeader })),
    };
    const fill = deviceColor(device, template);
    const pos = device.signalFlow?.position ?? fallbackPosition(index);
    boxes.push({ device, template, x: pos.x, y: pos.y, layout, extraHeader, fill, text: contrastText(fill), multicore, stageObject, labels });
  });
  return boxes;
}

export function anchorOf(box: DeviceBox, portId: string): { x: number; y: number; side: 'left' | 'right' } | undefined {
  const anchor = box.layout.anchors.find((a) => a.port.id === portId);
  return anchor ? { x: box.x + anchor.x, y: box.y + anchor.y, side: anchor.port.side } : undefined;
}

export function buildCableLines(cables: Cable[], boxes: DeviceBox[], library: Library | null, issues: Issue[]): CableLine[] {
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
      points: routeCable(a, a.side, b, b.side),
      color: cable.direct ? '#64748b' : (type?.defaultColor ?? '#475569'),
      issue: issueMap.get(cable.id),
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
