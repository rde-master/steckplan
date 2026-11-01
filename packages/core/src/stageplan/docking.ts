// Andocken an Stative/Traversen (mountedOnId) und Stehen auf Bühnenelementen (standsOnId), Mitbewegen.
import type { DeviceInstance, Template } from '../model/schema';
import { containsPoint, projectOnTruss, rotate, type Pt } from './geometry';

export type DockKind = 'mount' | 'standsOn';

export interface DockTarget {
  kind: DockKind;
  carrier: DeviceInstance;
}

/**
 * Ziel unter einem Punkt finden: Stative und Traversen haben Vorrang vor Bühnenelementen.
 * exclude: das gezogene Gerät selbst und alles, was daran hängt.
 */
export function findDockTarget(
  point: Pt,
  devices: DeviceInstance[],
  templates: Map<string, Template>,
  exclude: Set<string>,
): DockTarget | null {
  let standsOn: DeviceInstance | null = null;
  for (let i = devices.length - 1; i >= 0; i--) {
    const d = devices[i]!;
    if (exclude.has(d.id) || !d.stagePlan) continue;
    const t = templates.get(d.templateId);
    if (!t) continue;
    if ((t.kind === 'stand' || t.kind === 'truss') && containsPoint(d, t, point, t.kind === 'truss' ? 150 : 50)) return { kind: 'mount', carrier: d };
    if (t.kind === 'stageElement' && !standsOn && containsPoint(d, t, point)) standsOn = d;
  }
  return standsOn ? { kind: 'standsOn', carrier: standsOn } : null;
}

/** Kann dieses Gerät angedockt werden? Träger selbst docken nicht (Bühnenelemente/Stative/Traversen). */
export function canDock(template: Template | undefined): boolean {
  return template?.kind === 'device';
}

/** Alle Geräte, die (direkt oder über weitere Träger) an einem der Träger hängen bzw. darauf stehen. */
export function dependents(carrierIds: string[], devices: DeviceInstance[]): DeviceInstance[] {
  const result: DeviceInstance[] = [];
  const queue = [...carrierIds];
  const seen = new Set(carrierIds);
  while (queue.length) {
    const id = queue.shift()!;
    for (const d of devices) {
      if (seen.has(d.id)) continue;
      if (d.mountedOnId === id || d.stagePlan?.standsOnId === id) {
        seen.add(d.id);
        result.push(d);
        queue.push(d.id);
      }
    }
  }
  return result;
}

export interface StagePlacement {
  id: string;
  position: Pt;
  rotationDeg?: number;
}

/** Neue Positionen beim Verschieben: Auswahl um delta, abhängige Geräte mit. */
export function moveWithDependents(ids: string[], delta: Pt, devices: DeviceInstance[]): StagePlacement[] {
  const moving = new Set(ids);
  const all = [...devices.filter((d) => moving.has(d.id)), ...dependents(ids, devices).filter((d) => !moving.has(d.id))];
  return all
    .filter((d) => d.stagePlan)
    .map((d) => ({ id: d.id, position: { x: d.stagePlan!.position.x + delta.x, y: d.stagePlan!.position.y + delta.y } }));
}

/** Drehen eines Trägers um seinen Mittelpunkt: abhängige Geräte drehen mit. */
export function rotateWithDependents(carrier: DeviceInstance, newRotationDeg: number, devices: DeviceInstance[]): StagePlacement[] {
  const center = carrier.stagePlan?.position;
  if (!center) return [];
  const delta = newRotationDeg - (carrier.stagePlan?.rotationDeg ?? 0);
  return [
    { id: carrier.id, position: center, rotationDeg: newRotationDeg },
    ...dependents([carrier.id], devices)
      .filter((d) => d.stagePlan)
      .map((d) => ({
        id: d.id,
        position: rotate(d.stagePlan!.position, center, delta),
        rotationDeg: normalizeAngle((d.stagePlan!.rotationDeg ?? 0) + delta),
      })),
  ];
}

export function normalizeAngle(deg: number): number {
  const r = ((deg % 360) + 360) % 360;
  return Math.round(r * 100) / 100;
}

/** Position nach dem Andocken (Traverse: auf die Achse ziehen). */
export function dockedPosition(target: DockTarget, templates: Map<string, Template>, point: Pt): Pt {
  const t = templates.get(target.carrier.templateId);
  if (target.kind === 'mount' && t?.kind === 'truss') return projectOnTruss(target.carrier, t, point);
  if (target.kind === 'mount' && t?.kind === 'stand') return { ...target.carrier.stagePlan!.position };
  return point;
}

/** Anzahl der an einem Träger hängenden Geräte. */
export function mountedCount(carrierId: string, devices: DeviceInstance[]): number {
  return devices.filter((d) => d.mountedOnId === carrierId).length;
}
