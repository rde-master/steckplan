// Kabellänge (PLAN.md 7.1): Planlänge + Höhe + Reserve, gerundet auf verfügbare Längen.
// Wird nie gespeichert, sondern immer frisch berechnet.
import type { Cable, DeviceInstance, ProjectSettings, Template } from '../model/schema';
import { effectiveHeight } from '../stageplan/heights';
import { polylineLength, type Pt } from '../stageplan/geometry';
import { isMulticore } from '../signalflow/ports';

export type LengthStatus = 'computed' | 'manual' | 'open' | 'direct';

export interface CableLength {
  status: LengthStatus;
  planMm?: number;
  heightMm?: number;
  reserveMm?: number;
  totalMm?: number;
  /** gewählte (verfügbare) Länge; null = keine verfügbare Länge reicht */
  chosenMm?: number | null;
  /** keine konfigurierte Länge reicht → Verlängerung nötig */
  needsExtension: boolean;
  /** über der maximalen Länge des Kabeltyps */
  exceedsMax: boolean;
}

export interface LengthContext {
  devices: Map<string, DeviceInstance>;
  templates: Map<string, Template>;
  settings: Partial<ProjectSettings>;
}

const DEFAULT_RESERVE_PERCENT = 10;
const DEFAULT_RESERVE_PER_END = 500;

/** Lage eines Anschlusses im Bühnenplan: Gerätemitte; bei Multicore-Adern das jeweilige Ende. */
export function endpointPosition(device: DeviceInstance | undefined, portId: string, templates: Map<string, Template>): Pt | undefined {
  const stage = device?.stagePlan;
  if (!device || !stage) return undefined;
  if (isMulticore(templates.get(device.templateId)) && portId.endsWith(':b')) return stage.endB ?? stage.position;
  return stage.position;
}

/** Kleinste verfügbare Länge ≥ total; ohne konfigurierte Längen auf ganze Meter aufrunden. */
export function chooseLength(totalMm: number, template: Template | undefined): { chosenMm: number | null; needsExtension: boolean; exceedsMax: boolean } {
  const available = [...(template?.availableLengthsMm ?? [])].sort((a, b) => a - b);
  let chosenMm: number | null;
  let needsExtension = false;
  if (available.length) {
    chosenMm = available.find((l) => l >= totalMm) ?? null;
    needsExtension = chosenMm === null;
  } else {
    chosenMm = Math.max(1000, Math.ceil(totalMm / 1000) * 1000);
  }
  const exceedsMax = template?.maxLengthMm !== undefined && (chosenMm ?? totalMm) > template.maxLengthMm;
  return { chosenMm, needsExtension, exceedsMax };
}

function reserve(planMm: number, percent: number | undefined, perEndMm: number | undefined, settings: Partial<ProjectSettings>): number {
  const p = percent ?? settings.defaultReservePercent ?? DEFAULT_RESERVE_PERCENT;
  const e = perEndMm ?? settings.defaultReservePerEndMm ?? DEFAULT_RESERVE_PER_END;
  return Math.round((planMm * p) / 100 + 2 * e);
}

export function computeCableLength(cable: Cable, ctx: LengthContext): CableLength {
  const none = { needsExtension: false, exceedsMax: false };
  if (cable.direct) return { status: 'direct', ...none };
  const template = cable.templateId ? ctx.templates.get(cable.templateId) : undefined;
  if (cable.manualLengthMm !== undefined) {
    const max = template?.maxLengthMm;
    return { status: 'manual', totalMm: cable.manualLengthMm, chosenMm: cable.manualLengthMm, needsExtension: false, exceedsMax: max !== undefined && cable.manualLengthMm > max };
  }
  const fromDevice = ctx.devices.get(cable.from.deviceId);
  const toDevice = ctx.devices.get(cable.to.deviceId);
  const a = endpointPosition(fromDevice, cable.from.portId, ctx.templates);
  const b = endpointPosition(toDevice, cable.to.portId, ctx.templates);
  if (!a || !b || !fromDevice || !toDevice) return { status: 'open', ...none };

  const planMm = Math.round(polylineLength([a, ...cable.waypoints, b]));
  const ha = isMulticore(ctx.templates.get(fromDevice.templateId)) ? 0 : effectiveHeight(fromDevice, ctx.devices, ctx.templates).heightMm;
  const hb = isMulticore(ctx.templates.get(toDevice.templateId)) ? 0 : effectiveHeight(toDevice, ctx.devices, ctx.templates).heightMm;
  const heightMm = (cable.heightRule ?? 'floor') === 'floor' ? ha + hb : Math.abs(ha - hb);
  const reserveMm = reserve(planMm, cable.reservePercent, cable.reservePerEndMm, ctx.settings);
  const totalMm = planMm + heightMm + reserveMm;
  return { status: 'computed', planMm, heightMm, reserveMm, totalMm, ...chooseLength(totalMm, template) };
}

/** Länge eines Multicores aus seinen zwei Enden im Bühnenplan. */
export function computeMulticoreLength(device: DeviceInstance, template: Template | undefined, settings: Partial<ProjectSettings>): CableLength {
  if (device.manualLengthMm !== undefined) {
    return { status: 'manual', totalMm: device.manualLengthMm, chosenMm: device.manualLengthMm, needsExtension: false, exceedsMax: template?.maxLengthMm !== undefined && device.manualLengthMm > template.maxLengthMm };
  }
  const stage = device.stagePlan;
  if (!stage?.endB) return { status: 'open', needsExtension: false, exceedsMax: false };
  const planMm = Math.round(polylineLength([stage.position, ...(stage.waypoints ?? []), stage.endB]));
  const reserveMm = reserve(planMm, undefined, undefined, settings);
  const totalMm = planMm + reserveMm;
  return { status: 'computed', planMm, heightMm: 0, reserveMm, totalMm, ...chooseLength(totalMm, template) };
}

export function lengthContext(devices: DeviceInstance[], templates: Template[], settings: Partial<ProjectSettings>): LengthContext {
  return { devices: new Map(devices.map((d) => [d.id, d])), templates: new Map(templates.map((t) => [t.id, t])), settings };
}
