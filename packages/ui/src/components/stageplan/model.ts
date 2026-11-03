// Aufbereitung für den Bühnenplan.
import { EMPTY_FILTER, boundsOf, cableIssueMap, devicePerson, endpointPosition, GROUP_COLORS, isMulticore, personName, rotate, tBarLength, type Cable, type Filter, type Group, type Issue, type Person } from '@steckplan/core';
import type { ColorMode } from '../../lib/editor';
import { cableVisible, deviceVisible, displayColor } from '../../lib/display';
import {
  DEFAULT_DEVICE_COLOR,
  effectiveHeight,
  footprint,
  type DeviceInstance,
  type EffectiveHeight,
  type Footprint,
  type Layer,
  type Library,
  type Template,
} from '@steckplan/core';
import { deviceColor } from '../signalflow/model';

export interface StageItem {
  device: DeviceInstance;
  template: Template | undefined;
  x: number;
  y: number;
  rotation: number;
  footprint: Footprint;
  fill: string;
  height: EffectiveHeight;
  kind: Template['kind'] | 'unknown';
  locked: boolean;
  dimmed: boolean;
  /** Person, die das Gerät benutzt */
  person?: string;
  /** Stativ: Länge der T-Bar (mm) */
  tBarMm?: number;
  /** Gerät am Stativ: oben stehend oder unten hängend */
  mountSide?: 'top' | 'bottom';
  /** Reihenfolge der Ebene (höher = weiter oben gezeichnet); mindestens die des Trägers, auf/an dem es steht/hängt */
  layerOrder: number;
}

export interface StageDisplay {
  colorMode: ColorMode;
  filter: Filter;
  people?: Person[];
}

const DEFAULT_DISPLAY: StageDisplay = { colorMode: 'device', filter: EMPTY_FILTER };

/** Zeichenreihenfolge: Bühnenelemente, Traversen, Stative, Geräte */
const ORDER: Record<string, number> = { stageElement: 0, truss: 1, stand: 2, device: 3, cableType: 3, unknown: 3 };

export function buildStageItems(devices: DeviceInstance[], library: Library | null, layers: Layer[], display: StageDisplay = DEFAULT_DISPLAY): StageItem[] {
  const templates = new Map((library?.templates ?? []).map((t) => [t.id, t]));
  const byId = new Map(devices.map((d) => [d.id, d]));
  const layerById = new Map(layers.map((l) => [l.id, l]));
  const items: StageItem[] = [];
  for (const device of devices) {
    if (!device.stagePlan) continue;
    const layer = layerById.get(device.layerId);
    if (layer && !layer.visible) continue;
    const template = templates.get(device.templateId);
    if (template?.kind === 'cableType') continue; // Multicores werden als Verlauf gezeichnet (buildMulticoreRoutes)
    const kind = template?.kind ?? 'unknown';
    const baseFill = kind === 'stageElement' ? (device.colorOverride ?? template?.defaultColor ?? '#e2e8f0') : kind === 'device' ? deviceColor(device, template) : (device.colorOverride ?? template?.defaultColor ?? DEFAULT_DEVICE_COLOR);
    items.push({
      device,
      template,
      x: device.stagePlan.position.x,
      y: device.stagePlan.position.y,
      rotation: device.stagePlan.rotationDeg ?? 0,
      footprint: footprint(template),
      fill: kind === 'device' ? displayColor(display.colorMode, device, template, library, baseFill) : baseFill,
      height: effectiveHeight(device, byId, templates),
      kind,
      locked: layer?.locked ?? false,
      layerOrder: layer?.order ?? 0,
      dimmed: !deviceVisible(display.filter, device, template),
      ...(personName(devicePerson(device, template, display.people ?? [])) ? { person: personName(devicePerson(device, template, display.people ?? [])) } : {}),
      ...(kind === 'stand' ? { tBarMm: tBarLength(device, template) } : {}),
      ...(device.mountedOnId && templates.get(byId.get(device.mountedOnId)?.templateId ?? '')?.kind === 'stand' ? { mountSide: device.mountSide ?? 'bottom' } : {}),
    });
  }
  // Was auf etwas steht oder an etwas hängt (Podest, Stativ, Traverse), liegt mindestens auf der Ebene seines Trägers –
  // sonst verschwindet es unter dem Träger, wenn dieser auf einer höheren Ebene liegt.
  const byDevice = new Map(items.map((i) => [i.device.id, i]));
  const effective = (item: StageItem, seen = new Set<string>()): number => {
    const carrierId = item.device.mountedOnId ?? item.device.stagePlan?.standsOnId;
    const carrier = carrierId ? byDevice.get(carrierId) : undefined;
    if (!carrier || seen.has(item.device.id)) return item.layerOrder;
    seen.add(item.device.id);
    return Math.max(item.layerOrder, effective(carrier, seen));
  };
  const orders = new Map(items.map((i) => [i.device.id, effective(i)]));
  for (const item of items) item.layerOrder = orders.get(item.device.id)!;
  // erst nach Ebene (unten → oben), innerhalb der Ebene Bühnenelemente, Traversen, Stative, Geräte
  return items.sort((a, b) => a.layerOrder - b.layerOrder || (ORDER[a.kind] ?? 3) - (ORDER[b.kind] ?? 3));
}

/** Schöne Länge für den Maßstabsbalken (1, 2, 5, 10 … m) bei ~100 px. */
export function scaleBar(zoom: number): { mm: number; px: number } {
  const target = 100 / zoom;
  const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  const mm = steps.find((s) => s >= target) ?? 100000;
  return { mm, px: mm * zoom };
}

export function formatLength(mm: number): string {
  return `${(mm / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

// ---------- Kabel und Multicores im Bühnenplan ----------

export interface StageCable {
  cable: Cable;
  points: number[];
  color: string;
  dimmed: boolean;
  issue: boolean;
  /** direkt gesteckt (ohne Kabel) → gestrichelt */
  direct: boolean;
  /** Kabeltyp bzw. Bezeichnung (leer bei direkt gesteckt) */
  name: string;
}

export function buildStageCables(cables: Cable[], devices: DeviceInstance[], library: Library | null, layers: Layer[], filter: Filter, issues: Issue[]): StageCable[] {
  const templates = new Map((library?.templates ?? []).map((t) => [t.id, t]));
  const byId = new Map(devices.map((d) => [d.id, d]));
  const hidden = new Set(layers.filter((l) => !l.visible).map((l) => l.id));
  const issueMap = cableIssueMap(issues);
  const result: StageCable[] = [];
  for (const cable of cables) {
    const from = byId.get(cable.from.deviceId);
    const to = byId.get(cable.to.deviceId);
    if (!from || !to || hidden.has(from.layerId) || hidden.has(to.layerId)) continue;
    const a = endpointPosition(from, cable.from.portId, templates);
    const b = endpointPosition(to, cable.to.portId, templates);
    if (!a || !b) continue;
    const type = cable.templateId ? templates.get(cable.templateId) : undefined;
    const severity = issueMap.get(cable.id);
    result.push({
      cable,
      points: [a, ...cable.waypoints, b].flatMap((p) => [p.x, p.y]),
      color: cable.direct ? '#64748b' : (type?.defaultColor ?? '#475569'),
      dimmed: !cableVisible(filter, cable, type),
      issue: severity === 'error' || severity === 'warning',
      direct: !!cable.direct,
      name: cable.direct ? '' : cable.label || type?.name || '',
    });
  }
  return result;
}

export interface MulticoreRoute {
  device: DeviceInstance;
  template: Template;
  a: { x: number; y: number };
  b: { x: number; y: number } | undefined;
  waypoints: { x: number; y: number }[];
  color: string;
  dimmed: boolean;
  locked: boolean;
}

export function buildMulticoreRoutes(devices: DeviceInstance[], library: Library | null, layers: Layer[], filter: Filter): MulticoreRoute[] {
  const templates = new Map((library?.templates ?? []).map((t) => [t.id, t]));
  const layerById = new Map(layers.map((l) => [l.id, l]));
  const routes: MulticoreRoute[] = [];
  for (const device of devices) {
    const template = templates.get(device.templateId);
    if (!isMulticore(template) || !device.stagePlan) continue;
    const layer = layerById.get(device.layerId);
    if (layer && !layer.visible) continue;
    routes.push({
      device,
      template: template!,
      a: device.stagePlan.position,
      b: device.stagePlan.endB,
      waypoints: device.stagePlan.waypoints ?? [],
      color: device.colorOverride ?? template!.defaultColor ?? '#64748b',
      dimmed: !deviceVisible(filter, device, template),
      locked: layer?.locked ?? false,
    });
  }
  return routes;
}

export interface StageGroupFrame {
  id: string;
  name: string;
  color: string;
  /** gezeichnet direkt unter den Objekten der untersten Ebene seiner Mitglieder (alle Mitglieder liegen darüber) */
  layerOrder: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Gruppenrahmen im Bühnenplan: umschließt die (gedrehten) Grundflächen der Mitglieder. */
export function buildStageGroupFrames(groups: Group[], items: StageItem[], paddingMm = 300): StageGroupFrame[] {
  return groups.flatMap((group, index) => {
    const members = items.filter((i) => i.device.groupId === group.id);
    const rects = members
      .map((i) => {
        const corners = [
          { x: i.x - i.footprint.widthMm / 2, y: i.y - i.footprint.depthMm / 2 },
          { x: i.x + i.footprint.widthMm / 2, y: i.y - i.footprint.depthMm / 2 },
          { x: i.x + i.footprint.widthMm / 2, y: i.y + i.footprint.depthMm / 2 },
          { x: i.x - i.footprint.widthMm / 2, y: i.y + i.footprint.depthMm / 2 },
        ].map((c) => rotate(c, { x: i.x, y: i.y }, i.rotation));
        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);
        return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      });
    const rect = boundsOf(rects, paddingMm);
    const layerOrder = Math.min(...members.map((m) => m.layerOrder));
    return rect ? [{ id: group.id, name: group.name, color: group.color ?? GROUP_COLORS[index % GROUP_COLORS.length]!, layerOrder, ...rect }] : [];
  });
}
