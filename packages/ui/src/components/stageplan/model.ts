// Aufbereitung für den Bühnenplan.
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
}

/** Zeichenreihenfolge: Bühnenelemente, Traversen, Stative, Geräte */
const ORDER: Record<string, number> = { stageElement: 0, truss: 1, stand: 2, device: 3, cableType: 3, unknown: 3 };

export function buildStageItems(devices: DeviceInstance[], library: Library | null, layers: Layer[]): StageItem[] {
  const templates = new Map((library?.templates ?? []).map((t) => [t.id, t]));
  const byId = new Map(devices.map((d) => [d.id, d]));
  const layerById = new Map(layers.map((l) => [l.id, l]));
  const items: StageItem[] = [];
  for (const device of devices) {
    if (!device.stagePlan) continue;
    const layer = layerById.get(device.layerId);
    if (layer && !layer.visible) continue;
    const template = templates.get(device.templateId);
    if (template?.kind === 'cableType') continue; // Multicore-Verlauf folgt mit den Kabelwegen (M5)
    const kind = template?.kind ?? 'unknown';
    items.push({
      device,
      template,
      x: device.stagePlan.position.x,
      y: device.stagePlan.position.y,
      rotation: device.stagePlan.rotationDeg ?? 0,
      footprint: footprint(template),
      fill: kind === 'stageElement' ? (device.colorOverride ?? template?.defaultColor ?? '#e2e8f0') : kind === 'device' ? deviceColor(device, template) : (device.colorOverride ?? template?.defaultColor ?? DEFAULT_DEVICE_COLOR),
      height: effectiveHeight(device, byId, templates),
      kind,
      locked: layer?.locked ?? false,
    });
  }
  return items.sort((a, b) => (ORDER[a.kind] ?? 3) - (ORDER[b.kind] ?? 3));
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
