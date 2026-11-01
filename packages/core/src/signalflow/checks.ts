// Prüfungen für das Prüfungen-Panel (werden immer frisch berechnet, nie gespeichert).
import type { Library } from '../library/library';
import type { Cable, DeviceInstance, Project, Template } from '../model/schema';
import { connectorMatch } from './cables';
import { canFlow, findPort } from './ports';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface Issue {
  id: string;
  severity: IssueSeverity;
  message: string;
  objectIds: string[];
}

export function deviceTitle(device: DeviceInstance, template: Template | undefined): string {
  return device.label || template?.name || 'Gerät';
}

export function checkSignalFlow(project: Pick<Project, 'devices' | 'cables'>, library: Pick<Library, 'templates'>): Issue[] {
  const issues: Issue[] = [];
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const devices = new Map(project.devices.map((d) => [d.id, d]));

  for (const device of project.devices) {
    if (!templates.has(device.templateId)) {
      issues.push({ id: `missing-template:${device.id}`, severity: 'error', message: `„${device.label}“: Vorlage fehlt in der Bibliothek.`, objectIds: [device.id] });
    }
  }

  const occupancy = new Map<string, Cable[]>();
  for (const cable of project.cables) {
    const fromDevice = devices.get(cable.from.deviceId);
    const toDevice = devices.get(cable.to.deviceId);
    const name = cable.label || 'Kabel';
    if (!fromDevice || !toDevice) {
      issues.push({ id: `orphan-device:${cable.id}`, severity: 'error', message: `${name}: angeschlossenes Gerät existiert nicht mehr.`, objectIds: [cable.id] });
      continue;
    }
    const fromTemplate = templates.get(fromDevice.templateId);
    const toTemplate = templates.get(toDevice.templateId);
    const fromPort = findPort(fromTemplate, cable.from.portId);
    const toPort = findPort(toTemplate, cable.to.portId);
    const where = `${deviceTitle(fromDevice, fromTemplate)} → ${deviceTitle(toDevice, toTemplate)}`;
    if ((fromTemplate && !fromPort) || (toTemplate && !toPort)) {
      issues.push({ id: `orphan-port:${cable.id}`, severity: 'error', message: `${where}: Anschluss existiert nicht mehr.`, objectIds: [cable.id] });
      continue;
    }
    if (!fromPort || !toPort) continue;
    for (const key of [`${fromDevice.id}/${fromPort.id}`, `${toDevice.id}/${toPort.id}`]) {
      occupancy.set(key, [...(occupancy.get(key) ?? []), cable]);
    }
    if (!canFlow(fromPort.role, toPort.role)) {
      issues.push({ id: `direction:${cable.id}`, severity: 'error', message: `${where}: Richtung passt nicht (${fromPort.label} → ${toPort.label}).`, objectIds: [cable.id] });
    }
    if (cable.direct) continue;
    const cableType = cable.templateId ? templates.get(cable.templateId) : undefined;
    if (!cable.templateId) {
      issues.push({ id: `no-type:${cable.id}`, severity: 'warning', message: `${where}: kein Kabeltyp gewählt.`, objectIds: [cable.id] });
    } else if (!cableType) {
      issues.push({ id: `missing-cable-type:${cable.id}`, severity: 'error', message: `${where}: Kabeltyp fehlt in der Bibliothek.`, objectIds: [cable.id] });
    } else if (connectorMatch(cableType, fromPort, toPort) === 'mismatch') {
      issues.push({
        id: `connector:${cable.id}`,
        severity: 'warning',
        message: `${where}: Stecker passen nicht (${fromPort.connector} → ${toPort.connector}, Kabel ${cableType.connectorA} / ${cableType.connectorB}).`,
        objectIds: [cable.id],
      });
    }
  }

  for (const [key, cables] of occupancy) {
    if (cables.length < 2) continue;
    const [deviceId, portId] = key.split('/') as [string, string];
    const device = devices.get(deviceId)!;
    const port = findPort(templates.get(device.templateId), portId);
    issues.push({
      id: `occupied:${key}`,
      severity: 'warning',
      message: `${device.label}: Anschluss „${port?.label ?? portId}“ ist ${cables.length}-fach belegt.`,
      objectIds: cables.map((c) => c.id),
    });
  }
  return issues;
}

/** Kabel mit Fehlern/Warnungen (für die rote Markierung im Plan). */
export function cableIssueMap(issues: Issue[]): Map<string, IssueSeverity> {
  const map = new Map<string, IssueSeverity>();
  for (const issue of issues) {
    for (const id of issue.objectIds) {
      const current = map.get(id);
      if (current !== 'error') map.set(id, issue.severity === 'error' ? 'error' : (current ?? issue.severity));
    }
  }
  return map;
}
