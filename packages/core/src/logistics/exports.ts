// Weitere Listen (Stückliste, Geräteliste) und CSV-Export für alle Listen.
import { formatDmx } from '../dmx/dmx';
import type { Library, MasterKind } from '../library/library';
import type { CheckMark, Project, Template } from '../model/schema';
import { buildNetworkList } from '../network/network';
import { effectiveHeight } from '../stageplan/heights';
import { formatCableLength, formatMeters } from './format';
import { buildPatchLists, viaText } from '../audio/patch';
import { devicePerson, personName, buildPeopleList } from '../people/people';
import { buildCableList, buildCaseLists, effectiveTrailerId, packItems, type PackItem } from './lists';

type ProjectLike = Pick<Project, 'devices' | 'cables' | 'settings' | 'network'> & Partial<Pick<Project, 'people' | 'groups' | 'caseTrailers' | 'patch'>>;

const KIND_LABEL: Record<Template['kind'], string> = {
  device: 'Gerät',
  cableType: 'Kabel',
  stageElement: 'Bühnenelement',
  truss: 'Traverse',
  stand: 'Stativ',
};

export function masterLabel(library: Pick<Library, 'masterData'>, kind: MasterKind, id: string | undefined): string {
  if (!id) return '';
  return (library.masterData[kind] as { id: string; name: string }[]).find((e) => e.id === id)?.name ?? '';
}

// ---------- Stückliste ----------

export interface BomRow {
  name: string;
  kind: string;
  lengthMm: number | null;
  count: number;
  category: string;
}

/** Stückliste: Anzahl je Vorlage (und Länge), unabhängig von Besitzer/Anhänger. */
export function buildBom(items: PackItem[], library: Pick<Library, 'templates' | 'masterData'>): BomRow[] {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const rows = new Map<string, BomRow>();
  for (const item of items) {
    const key = `${item.kind}|${item.templateId}|${item.lengthMm ?? ''}`;
    const row = rows.get(key) ?? {
      name: item.name,
      kind: KIND_LABEL[templates.get(item.templateId)?.kind ?? (item.kind === 'cable' ? 'cableType' : 'device')],
      lengthMm: item.lengthMm,
      count: 0,
      category: masterLabel(library, 'categories', item.categoryId),
    };
    row.count++;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.kind.localeCompare(b.kind, 'de') || a.name.localeCompare(b.name, 'de') || (a.lengthMm ?? 0) - (b.lengthMm ?? 0));
}

// ---------- Geräteliste ----------

export interface DeviceRow {
  id: string;
  label: string;
  template: string;
  kind: string;
  category: string;
  owner: string;
  trailer: string;
  case: string;
  person: string;
  group: string;
  inventoryNo: string;
  carrier: string;
  height: string;
  dmx: string;
  ip: string;
}

export function buildDeviceList(project: ProjectLike, library: Pick<Library, 'templates' | 'masterData'>): DeviceRow[] {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const byId = new Map(project.devices.map((d) => [d.id, d]));
  return project.devices
    .filter((d) => templates.get(d.templateId)?.kind !== 'cableType')
    .map((d) => {
      const t = templates.get(d.templateId);
      const carrierId = d.mountedOnId ?? d.stagePlan?.standsOnId;
      const h = d.stagePlan ? effectiveHeight(d, byId, templates).heightMm : 0;
      const ips = (d.network ?? []).map((n) => (n.mode === 'dhcp' ? 'DHCP' : (n.ip ?? ''))).filter(Boolean);
      return {
        id: d.id,
        label: d.label,
        template: t?.name ?? '',
        kind: t ? KIND_LABEL[t.kind] : '',
        category: masterLabel(library, 'categories', d.categoryOverride ?? t?.categoryId),
        owner: masterLabel(library, 'owners', d.ownerId),
        trailer: masterLabel(library, 'trailers', effectiveTrailerId(d, project.caseTrailers, library.masterData.cases)),
        case: masterLabel(library, 'cases', d.caseId),
        person: personName(devicePerson(d, t, project.people ?? [])),
        group: project.groups?.find((g) => g.id === d.groupId)?.name ?? '',
        inventoryNo: d.inventoryNo ?? '',
        carrier: carrierId ? (byId.get(carrierId)?.label ?? '') : '',
        height: h > 0 ? formatMeters(h) : '',
        dmx: d.dmx ? `${formatDmx(d.dmx.universe, d.dmx.address)} (${d.dmx.modeName})` : '',
        ip: ips.join(', '),
      };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind, 'de') || a.label.localeCompare(b.label, 'de', { numeric: true }));
}

// ---------- CSV ----------

function csvField(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV für deutsches Excel: UTF-8 mit BOM, Semikolon, CRLF. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return '﻿' + [headers, ...rows].map((row) => row.map(csvField).join(';')).join('\r\n') + '\r\n';
}

export type CsvKind = 'cables' | 'packing' | 'bom' | 'devices' | 'network' | 'people' | 'cases' | 'patch';

/** CSV einer Liste (Pack- und Stückliste aus den übergebenen Exemplaren, damit Filter gelten). */
export function listCsv(kind: CsvKind, project: ProjectLike, library: Library, items?: PackItem[]): string {
  const pack = items ?? packItems(project, library);
  const m = (k: MasterKind, id: string | undefined) => masterLabel(library, k, id);
  switch (kind) {
    case 'cables':
      return toCsv(
        ['Kabeltyp', 'Kennung', 'Von', 'Nach', 'Planlänge (m)', 'Höhe (m)', 'Reserve (m)', 'Benötigt (m)', 'Gewählt', 'Besitzer', 'Anhänger', 'Case', 'Inventarnummer'],
        buildCableList(project, library).map((r) => [
          r.typeName,
          r.label,
          r.from,
          r.to,
          r.length.planMm !== undefined ? (r.length.planMm / 1000).toFixed(2).replace('.', ',') : '',
          r.length.heightMm !== undefined ? (r.length.heightMm / 1000).toFixed(2).replace('.', ',') : '',
          r.length.reserveMm !== undefined ? (r.length.reserveMm / 1000).toFixed(2).replace('.', ',') : '',
          r.length.totalMm !== undefined ? (r.length.totalMm / 1000).toFixed(2).replace('.', ',') : '',
          r.length.status === 'open' ? 'offen' : r.length.chosenMm === null ? 'Verlängerung nötig' : formatCableLength(r.length.chosenMm),
          m('owners', r.ownerId),
          m('trailers', r.trailerId),
          m('cases', r.caseId),
          r.inventoryNo ?? '',
        ]),
      );
    case 'packing':
      return toCsv(
        ['Bezeichnung', 'Typ', 'Länge', 'Kategorie', 'Besitzer', 'Anhänger', 'Case', 'Person', 'Inventarnummer', 'Stativ/Position', 'Hin', 'Zurück', 'Notiz'],
        pack.map((i) => [
          i.label,
          i.name,
          i.lengthMm ? formatCableLength(i.lengthMm) : '',
          m('categories', i.categoryId),
          m('owners', i.ownerId),
          m('trailers', i.trailerId),
          m('cases', i.caseId),
          i.person ?? '',
          i.inventoryNo ?? '',
          i.carrier ?? i.route ?? '',
          checkText(i.check?.out),
          checkText(i.check?.in),
          [i.check?.out?.note, i.check?.in?.note, i.notes].filter(Boolean).join(' / '),
        ]),
      );
    case 'bom':
      return toCsv(['Anzahl', 'Bezeichnung', 'Art', 'Länge', 'Kategorie'], buildBom(pack, library).map((r) => [r.count, r.name, r.kind, r.lengthMm ? formatCableLength(r.lengthMm) : '', r.category]));
    case 'devices':
      return toCsv(
        ['Kennung', 'Vorlage', 'Art', 'Kategorie', 'Besitzer', 'Anhänger', 'Case', 'Person', 'Gruppe', 'Inventarnummer', 'Stativ/Traverse/Podest', 'Höhe', 'DMX', 'IP'],
        buildDeviceList(project, library).map((r) => [r.label, r.template, r.kind, r.category, r.owner, r.trailer, r.case, r.person, r.group, r.inventoryNo, r.carrier, r.height, r.dmx, r.ip]),
      );
    case 'patch':
      return toCsv(
        ['Pult', 'Richtung', 'Kanal', 'Anschluss', 'Name', 'Quelle/Ziel', 'Vorlage', 'Person', 'Über', '48 V', 'Stativ', 'Bemerkung'],
        buildPatchLists(project, library).flatMap((list) =>
          (['inputs', 'outputs'] as const).flatMap((dir) =>
            list[dir].map((r) => [
              list.mixer.label,
              dir === 'inputs' ? 'Eingang' : 'Ausgang',
              r.channel,
              r.port,
              r.name,
              r.device ? `${r.device.label}${r.devicePort ? ` · ${r.devicePort}` : ''}` : 'offen',
              r.deviceTemplate ?? '',
              r.person ?? '',
              viaText(r),
              dir === 'inputs' && r.phantom ? 'ja' : '',
              dir === 'inputs' ? r.stand : '',
              r.notes,
            ]),
          ),
        ),
      );
    case 'cases':
      return toCsv(
        ['Case', 'Anhänger', 'Anzahl', 'Bezeichnung', 'Länge', 'Kennungen', 'Person', 'Hin', 'Zurück'],
        buildCaseLists(pack, library, { mode: 'aggregated', caseTrailers: project.caseTrailers }).flatMap((c) =>
          c.rows.map((r) => [
            c.name,
            m('trailers', c.trailerId),
            r.items.length,
            r.name,
            r.lengthMm ? formatCableLength(r.lengthMm) : '',
            r.items.map((i) => i.label).filter(Boolean).join(', '),
            [...new Set(r.items.map((i) => i.person).filter(Boolean))].join(', '),
            `${r.checkedOut}/${r.items.length}`,
            `${r.checkedIn}/${r.items.length}`,
          ]),
        ),
      );
    case 'people':
      return toCsv(
        ['Name', 'Vorname', 'Art', 'Gerät', 'Vorlage', 'Anschluss', 'Ziel', 'Kabel'],
        buildPeopleList({ ...project, people: project.people ?? [] }, library).flatMap((entry) =>
          entry.devices.flatMap((d) => {
            const base = [entry.person?.lastName ?? '(nicht zugeordnet)', entry.person?.firstName ?? '', entry.person?.kind ?? '', d.device.label, d.templateName];
            return d.connections.length ? d.connections.map((c) => [...base, c.port, c.target, c.cable]) : [[...base, '', '', '']];
          }),
        ),
      );
    case 'network': {
      const templates = new Map(library.templates.map((t) => [t.id, t]));
      return toCsv(['Gerät', 'Anschluss', 'IP-Adresse', 'Subnetz', 'Hostname'], buildNetworkList(project, templates).map((r) => [r.device, r.port, r.ip, r.subnet, r.hostname]));
    }
  }
}

function checkText(mark: CheckMark | undefined): string {
  if (!mark) return '';
  return mark.status === 'ok' ? 'ja' : mark.status === 'missing' ? 'fehlt' : 'defekt';
}

/** DMX-Patch als CSV. */
export function dmxCsv(rows: { universe?: number; address?: number; end?: number; label: string; templateName: string; modeName: string; channels?: number; carrier?: string }[]): string {
  return toCsv(
    ['Universum', 'Adresse', 'Ende', 'Gerät', 'Vorlage', 'Modus', 'Kanäle', 'Stativ/Traverse'],
    rows.map((r) => [r.universe ?? '', r.address ?? '', r.end ?? '', r.label, r.templateName, r.modeName, r.channels ?? '', r.carrier ?? '']),
  );
}
