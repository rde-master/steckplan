// Höhe eines Geräts (PLAN.md 7.1): eigene Höhe, sonst Stativ/Traverse (deren Instanz-Höhe, sonst Standardhöhe
// der Vorlage), sonst Bühnenelement, auf dem es steht; sonst 0.
import type { DeviceInstance, Template } from '../model/schema';

export type HeightSource = 'own' | 'mount' | 'standsOn' | 'template' | 'none';

export interface EffectiveHeight {
  heightMm: number;
  source: HeightSource;
  /** id des Trägers, von dem die Höhe stammt */
  fromId?: string;
}

/** Eigene Höhe eines Trägers (Stativ, Traverse, Bühnenelement): Instanz-Höhe, sonst Standardhöhe der Vorlage. */
export function carrierHeight(carrier: DeviceInstance, template: Template | undefined): number {
  return carrier.stagePlan?.heightMm ?? template?.shape?.heightMm ?? 0;
}

export function isCarrierKind(template: Template | undefined): template is Template & { kind: 'stand' | 'truss' | 'stageElement' } {
  return template?.kind === 'stand' || template?.kind === 'truss' || template?.kind === 'stageElement';
}

export function effectiveHeight(
  device: DeviceInstance,
  devices: Map<string, DeviceInstance>,
  templates: Map<string, Template>,
): EffectiveHeight {
  const template = templates.get(device.templateId);
  if (device.stagePlan?.heightMm !== undefined) return { heightMm: device.stagePlan.heightMm, source: 'own' };
  if (isCarrierKind(template)) {
    // Träger selbst: Standardhöhe der Vorlage (ein Podest „ist“ so hoch, ein Stativ ist so weit ausgefahren)
    const h = template.shape?.heightMm;
    return h !== undefined ? { heightMm: h, source: 'template' } : { heightMm: 0, source: 'none' };
  }
  const mount = device.mountedOnId ? devices.get(device.mountedOnId) : undefined;
  if (mount) return { heightMm: carrierHeight(mount, templates.get(mount.templateId)), source: 'mount', fromId: mount.id };
  const stand = device.stagePlan?.standsOnId ? devices.get(device.stagePlan.standsOnId) : undefined;
  if (stand) return { heightMm: carrierHeight(stand, templates.get(stand.templateId)), source: 'standsOn', fromId: stand.id };
  return { heightMm: 0, source: 'none' };
}
