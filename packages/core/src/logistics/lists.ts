// Listen als Datenstruktur – dieselbe Quelle für Bildschirm, PDF und CSV.
import type { Library, MasterKind } from '../library/library';
import type { Cable, CaseTrailer, CheckMark, DeviceInstance, MasterData, Project, Template } from '../model/schema';
import { devicePerson, personName } from '../people/people';
import { findPort, isMulticore } from '../signalflow/ports';
import { computeCableLength, computeMulticoreLength, lengthContext, type CableLength } from './length';

type ProjectLike = Pick<Project, 'devices' | 'cables' | 'settings'>;

// ---------- Kabelliste ----------

export interface CableListRow {
  id: string;
  kind: 'cable' | 'multicore';
  label: string;
  typeName: string;
  from: string;
  to: string;
  length: CableLength;
  ownerId?: string;
  trailerId?: string;
  caseId?: string;
  categoryId?: string;
  inventoryNo?: string;
}

function endLabel(project: ProjectLike, templates: Map<string, Template>, end: Cable['from']): string {
  const device = project.devices.find((d) => d.id === end.deviceId);
  const port = findPort(templates.get(device?.templateId ?? ''), end.portId);
  return `${device?.label ?? '?'} · ${port?.label ?? end.portId}`;
}

export function buildCableList(
  project: ProjectLike & Partial<Pick<Project, 'caseTrailers'>>,
  library: Pick<Library, 'templates'> & { masterData?: Pick<MasterData, 'cases'> },
): CableListRow[] {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const trailerOf = (item: { caseId?: string; trailerId?: string }) => effectiveTrailerId(item, project.caseTrailers, library.masterData?.cases);
  const ctx = lengthContext(project.devices, library.templates, project.settings);
  const rows: CableListRow[] = [];
  for (const cable of project.cables) {
    if (cable.direct) continue;
    const t = cable.templateId ? templates.get(cable.templateId) : undefined;
    rows.push({
      id: cable.id,
      kind: 'cable',
      label: cable.label ?? '',
      typeName: t?.name ?? '(ohne Kabeltyp)',
      from: endLabel(project, templates, cable.from),
      to: endLabel(project, templates, cable.to),
      length: computeCableLength(cable, ctx),
      ownerId: cable.ownerId,
      trailerId: trailerOf(cable),
      ...(cable.caseId ? { caseId: cable.caseId } : {}),
      categoryId: cable.categoryOverride ?? t?.categoryId,
      inventoryNo: cable.inventoryNo,
    });
  }
  for (const device of project.devices) {
    const t = templates.get(device.templateId);
    if (!isMulticore(t)) continue;
    rows.push({
      id: device.id,
      kind: 'multicore',
      label: device.label,
      typeName: t!.name,
      from: t!.endALabel || 'Ende A',
      to: t!.endBLabel || 'Ende B',
      length: computeMulticoreLength(device, t, project.settings),
      ownerId: device.ownerId,
      trailerId: trailerOf(device),
      ...(device.caseId ? { caseId: device.caseId } : {}),
      categoryId: device.categoryOverride ?? t!.categoryId,
      inventoryNo: device.inventoryNo,
    });
  }
  return rows.sort((a, b) => a.typeName.localeCompare(b.typeName, 'de') || a.from.localeCompare(b.from, 'de', { numeric: true }));
}

// ---------- Cases ----------

/** Anhänger eines Cases: Zuordnung im Projekt, sonst Standard-Anhänger des Cases. */
export function caseTrailerId(caseId: string, caseTrailers: CaseTrailer[] | undefined, cases: MasterData['cases'] | undefined): string | undefined {
  const override = caseTrailers?.find((c) => c.id === caseId);
  if (override) return override.trailerId;
  return cases?.find((c) => c.id === caseId)?.defaultTrailerId;
}

/** Anhänger, in den ein Gerät/Kabel kommt: im Case → Anhänger des Cases, sonst der eigene. */
export function effectiveTrailerId(
  item: { caseId?: string; trailerId?: string },
  caseTrailers: CaseTrailer[] | undefined,
  cases: MasterData['cases'] | undefined,
): string | undefined {
  return item.caseId ? caseTrailerId(item.caseId, caseTrailers, cases) : item.trailerId;
}

// ---------- Packliste ----------

export interface PackItem {
  id: string;
  kind: 'device' | 'cable';
  templateId: string;
  name: string;
  label: string;
  lengthMm: number | null;
  categoryId?: string;
  ownerId?: string;
  /** Anhänger (bei Inhalt eines Cases: Anhänger des Cases) */
  trailerId?: string;
  caseId?: string;
  /** Person, die das Gerät benutzt */
  person?: string;
  inventoryNo?: string;
  /** Stativ/Traverse bzw. Bühnenelement */
  carrier?: string;
  /** Kabel: „von → nach“ */
  route?: string;
  notes?: string;
  check?: { out?: CheckMark; in?: CheckMark };
}

/** Alle Objekte, die mitgenommen werden (keine direkt gesteckten Verbindungen). */
export function packItems(
  project: ProjectLike & Partial<Pick<Project, 'caseTrailers' | 'people'>>,
  library: Pick<Library, 'templates'> & { masterData?: Pick<MasterData, 'cases'> },
): PackItem[] {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const cases = library.masterData?.cases;
  const trailerOf = (item: { caseId?: string; trailerId?: string }) => effectiveTrailerId(item, project.caseTrailers, cases);
  const devices = new Map(project.devices.map((d) => [d.id, d]));
  const ctx = lengthContext(project.devices, library.templates, project.settings);
  const items: PackItem[] = [];
  for (const d of project.devices) {
    const t = templates.get(d.templateId);
    const multicore = isMulticore(t);
    const carrier = d.mountedOnId ? devices.get(d.mountedOnId) : d.stagePlan?.standsOnId ? devices.get(d.stagePlan.standsOnId) : undefined;
    items.push({
      id: d.id,
      kind: multicore ? 'cable' : 'device',
      templateId: d.templateId,
      name: t?.name ?? '(Vorlage fehlt)',
      label: d.label,
      lengthMm: multicore ? (computeMulticoreLength(d, t, project.settings).chosenMm ?? null) : null,
      categoryId: d.categoryOverride ?? t?.categoryId,
      ownerId: d.ownerId,
      trailerId: trailerOf(d),
      ...(d.caseId ? { caseId: d.caseId } : {}),
      ...(devicePerson(d, t, project.people ?? []) ? { person: personName(devicePerson(d, t, project.people ?? [])) } : {}),
      inventoryNo: d.inventoryNo,
      carrier: carrier?.label,
      notes: d.notes,
      check: d.check,
    });
  }
  for (const c of project.cables) {
    if (c.direct) continue;
    const t = c.templateId ? templates.get(c.templateId) : undefined;
    items.push({
      id: c.id,
      kind: 'cable',
      templateId: c.templateId ?? '',
      name: t?.name ?? '(ohne Kabeltyp)',
      label: c.label ?? '',
      lengthMm: computeCableLength(c, ctx).chosenMm ?? null,
      categoryId: c.categoryOverride ?? t?.categoryId,
      ownerId: c.ownerId,
      trailerId: trailerOf(c),
      ...(c.caseId ? { caseId: c.caseId } : {}),
      inventoryNo: c.inventoryNo,
      route: `${devices.get(c.from.deviceId)?.label ?? '?'} → ${devices.get(c.to.deviceId)?.label ?? '?'}`,
      notes: c.notes,
      check: c.check,
    });
  }
  return items;
}

export type GroupBy = 'category' | 'trailer' | 'owner' | 'case';
const GROUP_FIELD: Record<GroupBy, 'categoryId' | 'trailerId' | 'ownerId' | 'caseId'> = { category: 'categoryId', trailer: 'trailerId', owner: 'ownerId', case: 'caseId' };
const GROUP_MASTER: Record<GroupBy, MasterKind> = { category: 'categories', trailer: 'trailers', owner: 'owners', case: 'cases' };
export const UNASSIGNED_LABEL: Record<GroupBy, string> = { category: 'ohne Kategorie', trailer: 'ohne Anhänger', owner: 'ohne Besitzer', case: 'nicht im Case' };

export interface PackRow {
  key: string;
  name: string;
  lengthMm: number | null;
  items: PackItem[];
  checkedOut: number;
  checkedIn: number;
}

export interface PackGroup {
  key: string;
  label: string;
  color?: string;
  unassigned: boolean;
  rows: PackRow[];
  groups: PackGroup[];
}

export interface PackingList {
  groups: PackGroup[];
  /** Abschnitt „Fehlt / defekt“ */
  problems: { item: PackItem; direction: 'out' | 'in'; mark: CheckMark }[];
  total: number;
}

export interface PackingOptions {
  groupBy: GroupBy[];
  mode: 'aggregated' | 'single';
}

function isChecked(mark: CheckMark | undefined): boolean {
  return mark !== undefined;
}

/** Zusammengefasst wird nur, was in Vorlage, Länge, Besitzer, Kategorie, Anhänger und Case übereinstimmt. */
export function aggregationKey(item: PackItem): string {
  return [item.kind, item.templateId, item.lengthMm ?? '', item.ownerId ?? '', item.categoryId ?? '', item.trailerId ?? '', item.caseId ?? ''].join('|');
}

function buildRows(items: PackItem[], mode: PackingOptions['mode']): PackRow[] {
  const rows = new Map<string, PackRow>();
  for (const item of items) {
    const key = mode === 'aggregated' ? aggregationKey(item) : item.id;
    let row = rows.get(key);
    if (!row) {
      row = { key, name: item.name, lengthMm: item.lengthMm, items: [], checkedOut: 0, checkedIn: 0 };
      rows.set(key, row);
    }
    row.items.push(item);
    if (isChecked(item.check?.out)) row.checkedOut++;
    if (isChecked(item.check?.in)) row.checkedIn++;
  }
  for (const row of rows.values()) row.items.sort((a, b) => a.label.localeCompare(b.label, 'de', { numeric: true }));
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'de') || (a.lengthMm ?? 0) - (b.lengthMm ?? 0) || (a.items[0]?.label ?? '').localeCompare(b.items[0]?.label ?? '', 'de', { numeric: true }));
}

function group(items: PackItem[], levels: GroupBy[], library: Pick<Library, 'masterData'>, mode: PackingOptions['mode']): PackGroup[] {
  const [level, ...rest] = levels;
  if (!level) return [];
  const field = GROUP_FIELD[level];
  const entries = library.masterData[GROUP_MASTER[level]] as { id: string; name: string; color?: string }[];
  const buckets = new Map<string, PackItem[]>();
  for (const item of items) {
    const key = item[field] ?? '';
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }
  const groups: PackGroup[] = [...buckets.entries()].map(([key, list]) => {
    const entry = entries.find((e) => e.id === key);
    return {
      key: `${level}:${key}`,
      label: key ? (entry?.name ?? '(unbekannt)') : UNASSIGNED_LABEL[level],
      ...(entry?.color ? { color: entry.color } : {}),
      unassigned: !key,
      rows: rest.length ? [] : buildRows(list, mode),
      groups: rest.length ? group(list, rest, library, mode) : [],
    };
  });
  // „nicht zugeordnet“ ans Ende
  return groups.sort((a, b) => Number(a.unassigned) - Number(b.unassigned) || a.label.localeCompare(b.label, 'de'));
}

export function buildPackingList(items: PackItem[], library: Pick<Library, 'masterData'>, options: PackingOptions): PackingList {
  const levels = [...new Set(options.groupBy)].slice(0, 2);
  const groups = levels.length
    ? group(items, levels, library, options.mode)
    : [{ key: 'all', label: 'Alle', unassigned: false, rows: buildRows(items, options.mode), groups: [] }];
  const problems: PackingList['problems'] = [];
  for (const item of items) {
    for (const direction of ['out', 'in'] as const) {
      const mark = item.check?.[direction];
      if (mark && mark.status !== 'ok') problems.push({ item, direction, mark });
    }
  }
  return { groups, problems, total: items.length };
}

/** Nächstes noch nicht abgehaktes Exemplar einer Zeile (für „Antippen hakt das nächste ab“). */
export function nextUnchecked(row: PackRow, direction: 'out' | 'in'): PackItem | undefined {
  return row.items.find((i) => !i.check?.[direction]);
}

export type { DeviceInstance };
