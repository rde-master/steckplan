// Prüfungen zur Logistik: doppelte Inventarnummern, Kabellängen.
import type { Library } from '../library/library';
import type { Project } from '../model/schema';
import type { Issue } from '../signalflow/checks';
import { formatCableLength, formatMeters } from './format';
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
  issues.push(...checkStock(project, library));
  return issues;
}

export interface StockUsage {
  templateId: string;
  /** Länge bei Kabeltypen mit Bestand je Länge, sonst null */
  lengthMm: number | null;
  used: number;
  stock: number;
  objectIds: string[];
}

/**
 * Verwendung gegen den Lagerbestand der Vorlagen (je Projekt). Vorlagen ohne Bestandsangabe werden nicht gezählt.
 * Kabeltypen mit Bestand je Länge: gezählt wird je gewählter Länge (fehlt die Länge im Bestand, gilt 0).
 */
export function stockUsage(project: Pick<Project, 'devices' | 'cables' | 'settings'>, library: Pick<Library, 'templates'>): StockUsage[] {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const ctx = lengthContext(project.devices, library.templates, project.settings);
  const usage = new Map<string, StockUsage>();
  const count = (templateId: string | undefined, lengthMm: number | null | undefined, objectId: string) => {
    const t = templateId ? templates.get(templateId) : undefined;
    if (!t) return;
    const byLength = t.stockByLength && t.stockByLength.length > 0;
    if (!byLength && t.stock === undefined) return;
    const len = byLength ? (lengthMm ?? null) : null;
    if (byLength && len === null) return; // Länge noch unbekannt
    const key = `${t.id}|${len ?? ''}`;
    const stock = byLength ? (t.stockByLength!.find((s) => s.lengthMm === len)?.count ?? 0) : t.stock!;
    const entry = usage.get(key) ?? { templateId: t.id, lengthMm: len, used: 0, stock, objectIds: [] };
    entry.used++;
    entry.objectIds.push(objectId);
    usage.set(key, entry);
  };
  for (const device of project.devices) {
    const t = templates.get(device.templateId);
    count(device.templateId, isMulticore(t) ? computeMulticoreLength(device, t, project.settings).chosenMm : null, device.id);
  }
  for (const cable of project.cables) {
    if (cable.direct) continue;
    count(cable.templateId, computeCableLength(cable, ctx).chosenMm, cable.id);
  }
  return [...usage.values()];
}

export function checkStock(project: Pick<Project, 'devices' | 'cables' | 'settings'>, library: Pick<Library, 'templates'>): Issue[] {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  return stockUsage(project, library)
    .filter((u) => u.used > u.stock)
    .map((u) => {
      const name = `${templates.get(u.templateId)?.name ?? 'Vorlage'}${u.lengthMm !== null ? ` ${formatCableLength(u.lengthMm)}` : ''}`;
      return {
        id: `stock:${u.templateId}:${u.lengthMm ?? ''}`,
        severity: 'warning' as const,
        message: `${name}: ${u.used} verwendet, aber nur ${u.stock} im Lager.`,
        objectIds: u.objectIds,
      };
    });
}
