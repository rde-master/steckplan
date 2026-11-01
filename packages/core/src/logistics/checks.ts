// Prüfungen zur Logistik: doppelte Inventarnummern, Kabellängen.
import type { Library } from '../library/library';
import type { Project } from '../model/schema';
import type { Issue } from '../signalflow/checks';
import { formatMeters } from './format';
import { computeCableLength, computeMulticoreLength, lengthContext } from './length';
import { isMulticore } from '../signalflow/ports';

export function checkLogistics(project: Pick<Project, 'devices' | 'cables' | 'settings'>, library: Pick<Library, 'templates'>): Issue[] {
  const issues: Issue[] = [];
  const templates = new Map(library.templates.map((t) => [t.id, t]));

  const byNumber = new Map<string, string[]>();
  for (const item of [...project.devices, ...project.cables]) {
    const no = item.inventoryNo?.trim();
    if (no) byNumber.set(no, [...(byNumber.get(no) ?? []), item.id]);
  }
  for (const [no, ids] of byNumber) {
    if (ids.length > 1) issues.push({ id: `inventory:${no}`, severity: 'warning', message: `Inventarnummer „${no}“ ist ${ids.length}-fach vergeben.`, objectIds: ids });
  }

  const ctx = lengthContext(project.devices, library.templates, project.settings);
  for (const cable of project.cables) {
    if (cable.direct) continue;
    const length = computeCableLength(cable, ctx);
    const name = templates.get(cable.templateId ?? '')?.name ?? 'Kabel';
    if (length.needsExtension) {
      issues.push({ id: `extension:${cable.id}`, severity: 'warning', message: `${cable.label || name}: ${formatMeters(length.totalMm ?? 0)} benötigt – keine verfügbare Länge reicht (Verlängerung nötig).`, objectIds: [cable.id] });
    } else if (length.exceedsMax) {
      issues.push({ id: `maxlength:${cable.id}`, severity: 'warning', message: `${cable.label || name}: länger als die maximale Länge des Kabeltyps.`, objectIds: [cable.id] });
    }
  }
  for (const device of project.devices) {
    const t = templates.get(device.templateId);
    if (!isMulticore(t)) continue;
    const length = computeMulticoreLength(device, t, project.settings);
    if (length.needsExtension) {
      issues.push({ id: `extension:${device.id}`, severity: 'warning', message: `${device.label}: ${formatMeters(length.totalMm ?? 0)} benötigt – keine verfügbare Länge reicht.`, objectIds: [device.id] });
    }
  }
  return issues;
}
