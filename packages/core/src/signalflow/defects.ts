// Defekte Anschlüsse: je Gerät im Projekt markiert (nicht in der Bibliothek). Bei Multicores gilt die Markierung für die Ader.
import type { DeviceInstance, Template } from '../model/schema';
import { isMulticore, templatePorts } from './ports';

/** Schlüssel der Markierung: Anschluss, bei Multicores die Ader („s1:a“ → „s1“). */
export function defectKey(template: Template | undefined, portId: string): string {
  return isMulticore(template) ? (portId.split(':')[0] ?? portId) : portId;
}

export function portDefect(device: DeviceInstance, template: Template | undefined, portId: string): { portId: string; note?: string } | undefined {
  const key = defectKey(template, portId);
  return device.defectivePorts?.find((d) => d.portId === key);
}

export function isPortDefective(device: DeviceInstance, template: Template | undefined, portId: string): boolean {
  return portDefect(device, template, portId) !== undefined;
}

/** Was sich markieren lässt: Anschlüsse bzw. bei Multicores die Adern. */
export function defectTargets(template: Template | undefined): { key: string; label: string }[] {
  if (isMulticore(template)) return (template!.channels ?? []).map((c) => ({ key: c.id, label: c.label }));
  return templatePorts(template).map((p) => ({ key: p.id, label: p.label }));
}

/** Markierung setzen/entfernen bzw. Notiz ändern; gibt die neue Liste zurück (undefined = keine). */
export function setDefect(device: DeviceInstance, key: string, defect: { note?: string } | false): DeviceInstance['defectivePorts'] {
  const rest = (device.defectivePorts ?? []).filter((d) => d.portId !== key);
  const next = defect === false ? rest : [...rest, { portId: key, ...(defect.note ? { note: defect.note } : {}) }];
  // Reihenfolge stabil halten (wie bisher in der Liste)
  const order = new Map((device.defectivePorts ?? []).map((d, i) => [d.portId, i]));
  next.sort((a, b) => (order.get(a.portId) ?? Infinity) - (order.get(b.portId) ?? Infinity));
  return next.length ? next : undefined;
}

/** Alle defekten Anschluss-IDs eines Geräts (bei Multicores beide Enden der Ader). */
export function defectivePortIds(device: DeviceInstance, template: Template | undefined): Set<string> {
  const ids = new Set<string>();
  if (!device.defectivePorts?.length) return ids;
  for (const port of templatePorts(template)) if (isPortDefective(device, template, port.id)) ids.add(port.id);
  return ids;
}
