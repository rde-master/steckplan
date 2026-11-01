// Prüfungen für den Bühnenplan.
import type { Library } from '../library/library';
import type { Project, Template } from '../model/schema';
import type { Issue } from '../signalflow/checks';
import { mountedCount } from './docking';

export function checkStagePlan(project: Pick<Project, 'devices'>, library: Pick<Library, 'templates'>): Issue[] {
  const issues: Issue[] = [];
  const templates = new Map<string, Template>(library.templates.map((t) => [t.id, t]));
  const devices = new Map(project.devices.map((d) => [d.id, d]));
  const unplaced: string[] = [];

  for (const device of project.devices) {
    const template = templates.get(device.templateId);
    if (template?.kind === 'device' && !device.stagePlan) unplaced.push(device.id);
    if (device.mountedOnId && !devices.has(device.mountedOnId)) {
      issues.push({ id: `mount-missing:${device.id}`, severity: 'error', message: `„${device.label}“ hängt an einem Stativ/einer Traverse, das es nicht mehr gibt.`, objectIds: [device.id] });
    }
    if ((template?.kind === 'stand' || template?.kind === 'truss') && template.maxMountedDevices !== undefined) {
      const count = mountedCount(device.id, project.devices);
      if (count > template.maxMountedDevices) {
        issues.push({
          id: `overmounted:${device.id}`,
          severity: 'warning',
          message: `„${device.label}“: ${count} Geräte angehängt, erlaubt sind ${template.maxMountedDevices}.`,
          objectIds: [device.id],
        });
      }
    }
  }
  if (unplaced.length) {
    issues.push({
      id: 'unplaced',
      severity: 'info',
      message: unplaced.length === 1 ? '1 Gerät ist im Bühnenplan noch nicht platziert.' : `${unplaced.length} Geräte sind im Bühnenplan noch nicht platziert.`,
      objectIds: unplaced,
    });
  }
  return issues;
}
