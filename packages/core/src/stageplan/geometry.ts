// Maßstäbliche Geometrie im Bühnenplan (alles in Millimetern, Winkel in Grad).
import type { DeviceInstance, Template } from '../model/schema';

export const DEFAULT_FOOTPRINT_MM = 300;

export interface Footprint {
  widthMm: number;
  depthMm: number;
  form: 'rect' | 'circle' | 'rounded';
}

/** Grundfläche einer Vorlage (Traverse: Länge × Querschnitt). */
export function footprint(template: Template | undefined): Footprint {
  if (template?.kind === 'truss') {
    return { widthMm: template.lengthMm ?? template.shape?.widthMm ?? 3000, depthMm: template.shape?.depthMm ?? 290, form: 'rect' };
  }
  const shape = template?.shape;
  return {
    widthMm: shape?.widthMm && shape.widthMm > 0 ? shape.widthMm : DEFAULT_FOOTPRINT_MM,
    depthMm: shape?.depthMm && shape.depthMm > 0 ? shape.depthMm : DEFAULT_FOOTPRINT_MM,
    form: shape?.form ?? 'rect',
  };
}

export interface Pt {
  x: number;
  y: number;
}

export function rotate(point: Pt, center: Pt, deg: number): Pt {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/** Liegt ein Punkt in der (gedrehten) Grundfläche eines Objekts? Position = Mittelpunkt. */
export function containsPoint(device: DeviceInstance, template: Template | undefined, point: Pt, marginMm = 0): boolean {
  const pos = device.stagePlan?.position;
  if (!pos) return false;
  const fp = footprint(template);
  const local = rotate(point, pos, -(device.stagePlan?.rotationDeg ?? 0));
  const dx = local.x - pos.x;
  const dy = local.y - pos.y;
  if (fp.form === 'circle') {
    const rx = fp.widthMm / 2 + marginMm;
    const ry = fp.depthMm / 2 + marginMm;
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
  }
  return Math.abs(dx) <= fp.widthMm / 2 + marginMm && Math.abs(dy) <= fp.depthMm / 2 + marginMm;
}

/** Punkt auf die Längsachse einer Traverse projizieren (innerhalb der Länge). */
export function projectOnTruss(truss: DeviceInstance, template: Template | undefined, point: Pt): Pt {
  const pos = truss.stagePlan?.position ?? { x: 0, y: 0 };
  const half = footprint(template).widthMm / 2;
  const local = rotate(point, pos, -(truss.stagePlan?.rotationDeg ?? 0));
  const x = Math.max(pos.x - half, Math.min(pos.x + half, local.x));
  return rotate({ x, y: pos.y }, pos, truss.stagePlan?.rotationDeg ?? 0);
}

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function snapTo(value: number, grid: number): number {
  return grid > 0 ? Math.round(value / grid) * grid : value;
}

export function polylineLength(points: Pt[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += distance(points[i - 1]!, points[i]!);
  return length;
}
