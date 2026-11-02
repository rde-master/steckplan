// Export: aus Projektdaten PDF-Definitionen bzw. CSV erzeugen (dieselben Listen wie auf dem Bildschirm).
import {
  boundsOf,
  buildBom,
  buildCableList,
  buildCaseLists,
  buildDeviceLabels,
  buildPeopleList,
  buildDeviceList,
  buildDmxPatch,
  buildNetworkList,
  buildPackingList,
  buildPatchLists,
  buildPowerReport,
  cableMatches,
  deviceMatches,
  dmxCsv,
  formatCableLength,
  formatAmps,
  formatDmx,
  formatMeters,
  formatWatts,
  isFilterActive,
  listCsv,
  masterLabel,
  packItems,
  peopleWithoutDevice,
  totalW,
  viaText,
  type Filter,
  type GroupBy,
  type Issue,
  type Library,
  type PackItem,
  type ProjectMeta,
} from '@steckplan/core';
import type { ColorMode } from '../lib/editor';
import type { ProjectData } from '../lib/useProjectData';
import { buildBoxes, buildCableLines, buildGroupFrames } from '../components/signalflow/model';
import { buildMulticoreRoutes, buildStageCables, buildStageGroupFrames, buildStageItems } from '../components/stageplan/model';
import {
  caseListsDoc,
  drawableArea,
  LABEL_FORMATS,
  labelsDoc,
  packingListDoc,
  patchDoc,
  planDoc,
  sectionsDoc,
  PT_PER_MM,
  tableDoc,
  tilePlan,
  wifiPosterDoc,
  worldPerPtForScale,
  type DocContext,
  type DocDefinition,
  type Orientation,
  type PageFormat,
  type PlanTile,
} from './documents';
import { signalFlowBounds, signalFlowSvg, stageBounds, stagePlanSvg, usedCategories, type StageDrawing } from './svg';

export type ExportKind = 'stageplan' | 'signalflow' | 'packing' | 'cases' | 'cables' | 'bom' | 'dmx' | 'devices' | 'network' | 'people' | 'patch' | 'power' | 'labels' | 'wifi';

export const CSV_KINDS: ExportKind[] = ['packing', 'cases', 'cables', 'bom', 'dmx', 'devices', 'network', 'people', 'patch', 'power'];

export const EXPORT_TITLES: Record<ExportKind, string> = {
  stageplan: 'Bühnenplan',
  signalflow: 'Signalfluss',
  packing: 'Packliste',
  cases: 'Case-Listen',
  cables: 'Kabelliste',
  bom: 'Stückliste',
  dmx: 'DMX-Patch',
  devices: 'Geräteliste',
  network: 'Netzwerkliste',
  people: 'Personenliste',
  patch: 'Input-/Output-Liste',
  power: 'Stromliste',
  labels: 'Geräte-Etiketten',
  wifi: 'WLAN-Aushang',
};

export interface ExportOptions {
  kind: ExportKind;
  format: PageFormat;
  orientation: Orientation;
  /** Bühnenplan: Maßstab 1:n oder „Seite füllen“ */
  scale: 'fill' | 50 | 100;
  includeBackground: boolean;
  showCables: boolean;
  groupBy: GroupBy;
  thenBy: GroupBy | '';
  mode: 'aggregated' | 'single';
  /** Packliste: Zeilen nach Bezeichnung oder zuerst nach Case */
  sortBy: 'name' | 'case';
  showChecks: boolean;
  wifiIds: string[];
  printPassword: boolean;
  /** Etiketten: Bogenformat und Schnittlinien (für Normalpapier) */
  labelFormat: string;
  cutLines: boolean;
  /** Bühnenplan: Gruppenrahmen einzeichnen */
  showGroups: boolean;
}

export const DEFAULT_OPTIONS: ExportOptions = {
  kind: 'packing',
  format: 'A4',
  orientation: 'landscape',
  scale: 100,
  includeBackground: true,
  showCables: true,
  groupBy: 'category',
  thenBy: '',
  mode: 'aggregated',
  sortBy: 'name',
  showChecks: false,
  wifiIds: [],
  printPassword: true,
  labelFormat: LABEL_FORMATS[0]!.id,
  cutLines: false,
  showGroups: true,
};

export interface ExportInput {
  data: ProjectData;
  library: Library;
  meta: Partial<ProjectMeta>;
  filter: Filter;
  colorMode: ColorMode;
  issues: Issue[];
  appTitle: string;
  by: string;
  /** QR-Code (SVG) eines WLAN-Netzes vom Server */
  fetchQr: (wifiId: string) => Promise<string>;
  /** WLAN-Passwörter (nur mit Bearbeiten-Zugang vorhanden) */
  passwords?: Record<string, string>;
  now?: Date;
}

function settings(data: ProjectData) {
  return { gridMm: 500, snap: true, defaultReservePercent: 10, defaultReservePerEndMm: 500, ...data.settings };
}

function projectLike(data: ProjectData) {
  return {
    devices: data.devices,
    cables: data.cables,
    settings: settings(data),
    network: data.network,
    people: data.people,
    groups: data.groups,
    caseTrailers: data.caseTrailers,
    patch: data.patch,
  };
}

/** Exemplare der Packliste, gefiltert wie auf dem Bildschirm. */
export function filteredPackItems(data: ProjectData, library: Library, filter: Filter): PackItem[] {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const devices = new Map(data.devices.map((d) => [d.id, d]));
  const cables = new Map(data.cables.map((c) => [c.id, c]));
  const ctx = { caseTrailers: data.caseTrailers, cases: library.masterData.cases };
  return packItems(projectLike(data), library).filter((item) => {
    const d = devices.get(item.id);
    if (d) return deviceMatches(filter, d, templates.get(d.templateId), ctx);
    const c = cables.get(item.id);
    return c ? cableMatches(filter, c, templates.get(c.templateId ?? ''), ctx) : true;
  });
}

function visibleDevices(data: ProjectData, library: Library, filter: Filter) {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  return data.devices.filter((d) => deviceMatches(filter, d, templates.get(d.templateId), { caseTrailers: data.caseTrailers, cases: library.masterData.cases }));
}

const GROUP_TITLE: Record<GroupBy, string> = { category: 'Kategorie', trailer: 'Anhänger', owner: 'Besitzer', case: 'Case' };

export async function buildExportDoc(opts: ExportOptions, input: ExportInput): Promise<DocDefinition> {
  const { data, library, filter } = input;
  const ctx: DocContext = {
    meta: input.meta,
    format: opts.format,
    orientation: opts.orientation,
    appTitle: input.appTitle,
    by: input.by,
    ...(input.now ? { now: input.now } : {}),
    ...(isFilterActive(filter) ? { filterNote: 'Filter aktiv' } : {}),
  };
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const name = (kind: 'categories' | 'owners' | 'trailers' | 'cases') => (id?: string) => masterLabel(library, kind, id);

  switch (opts.kind) {
    case 'packing': {
      const list = buildPackingList(filteredPackItems(data, library, filter), library, { groupBy: opts.thenBy ? [opts.groupBy, opts.thenBy] : [opts.groupBy], mode: opts.mode, sortBy: opts.sortBy });
      return packingListDoc(
        list,
        {
          mode: opts.mode,
          showChecks: opts.showChecks,
          names: { category: name('categories'), owner: name('owners'), trailer: name('trailers'), case: name('cases') },
          groupTitle: `gruppiert nach ${GROUP_TITLE[opts.groupBy]}${opts.thenBy ? `, dann ${GROUP_TITLE[opts.thenBy]}` : ''}${opts.sortBy === 'case' ? ', sortiert nach Case' : ''}`,
        },
        ctx,
      );
    }
    case 'cases': {
      const lists = buildCaseLists(filteredPackItems(data, library, filter), library, { mode: opts.mode, caseTrailers: data.caseTrailers });
      return caseListsDoc(
        lists.map((c) => ({
          name: c.name,
          trailer: masterLabel(library, 'trailers', c.trailerId),
          total: c.total,
          rows: c.rows,
          ...(c.notes ? { notes: c.notes } : {}),
          ...(c.color ? { color: c.color } : {}),
        })),
        {
          mode: opts.mode,
          showChecks: opts.showChecks,
          names: { category: name('categories'), owner: name('owners'), trailer: name('trailers'), case: name('cases') },
          groupTitle: '',
        },
        ctx,
      );
    }
    case 'cables': {
      const visible = new Set(data.cables.filter((c) => cableMatches(filter, c, templates.get(c.templateId ?? ''))).map((c) => c.id));
      const deviceIds = new Set(visibleDevices(data, library, filter).map((d) => d.id));
      const rows = buildCableList(projectLike(data), library).filter((r) => (r.kind === 'cable' ? visible.has(r.id) : deviceIds.has(r.id)));
      const summary = new Map<string, number>();
      for (const r of rows) {
        const key = `${r.typeName} ${r.length.chosenMm === null ? '(Verlängerung nötig)' : r.length.chosenMm !== undefined ? formatCableLength(r.length.chosenMm) : '(offen)'}`;
        summary.set(key, (summary.get(key) ?? 0) + 1);
      }
      return tableDoc(
        'Kabelliste',
        ['Kabeltyp', 'Kennung', 'Von', 'Nach', 'Plan', 'Höhe', 'Benötigt', 'Gewählt', 'Besitzer', 'Anhänger', 'Case', 'Inv.-Nr.'],
        rows.map((r) => [
          r.typeName,
          r.label,
          r.from,
          r.to,
          r.length.planMm !== undefined ? formatMeters(r.length.planMm) : '–',
          r.length.heightMm !== undefined ? formatMeters(r.length.heightMm) : '–',
          r.length.totalMm !== undefined ? formatMeters(r.length.totalMm) : '–',
          r.length.status === 'open' ? 'offen' : r.length.chosenMm === null ? 'Verlängerung!' : formatCableLength(r.length.chosenMm),
          masterLabel(library, 'owners', r.ownerId),
          masterLabel(library, 'trailers', r.trailerId),
          masterLabel(library, 'cases', r.caseId),
          r.inventoryNo ?? '',
        ]),
        ctx,
        { widths: [58, 38, '*', '*', 34, 32, 40, 44, 46, 46, 46, 40], summary: [...summary].map(([k, v]) => `${v} × ${k}`) },
      );
    }
    case 'bom': {
      const rows = buildBom(filteredPackItems(data, library, filter), library);
      return tableDoc('Stückliste', ['Anzahl', 'Bezeichnung', 'Art', 'Länge', 'Kategorie'], rows.map((r) => [r.count, r.name, r.kind, r.lengthMm ? formatCableLength(r.lengthMm) : '', r.category]), ctx, {
        widths: [40, '*', 80, 50, 100],
      });
    }
    case 'dmx': {
      const rows = buildDmxPatch({ devices: visibleDevices(data, library, filter) }, templates);
      return tableDoc(
        'DMX-Patch',
        ['Univ.', 'Adresse', 'Ende', 'Gerät', 'Vorlage', 'Modus', 'Kanäle', 'Stativ/Traverse'],
        rows.map((r) => [r.universe ?? '–', r.universe !== undefined && r.address !== undefined ? formatDmx(r.universe, r.address) : '–', r.end ?? '–', r.label, r.templateName, r.modeName, r.channels ?? '', r.carrier ?? '']),
        ctx,
        { widths: [32, 46, 32, '*', '*', 70, 38, 80] },
      );
    }
    case 'devices': {
      const ids = new Set(visibleDevices(data, library, filter).map((d) => d.id));
      const rows = buildDeviceList(projectLike(data), library).filter((r) => ids.has(r.id));
      return tableDoc(
        'Geräteliste',
        ['Kennung', 'Vorlage', 'Art', 'Kategorie', 'Besitzer', 'Anhänger', 'Case', 'Person', 'Inv.-Nr.', 'Stativ/Podest', 'Höhe', 'DMX', 'IP'],
        rows.map((r) => [r.label, r.template, r.kind, r.category, r.owner, r.trailer, r.case, r.person, r.inventoryNo, r.carrier, r.height, r.dmx, r.ip]),
        ctx,
        { widths: ['*', '*', 42, 46, 46, 46, 46, 56, 38, 54, 32, 52, 54] },
      );
    }
    case 'people': {
      const ids = new Set(visibleDevices(data, library, filter).map((d) => d.id));
      const rows: string[][] = [];
      for (const entry of buildPeopleList(projectLike(data), library)) {
        if (entry.person && entry.devices.length === 0) {
          rows.push([`${entry.person.lastName}, ${entry.person.firstName}`.replace(/^, |, $/g, ''), entry.person.kind, '(kein Gerät)', '', '']);
          continue;
        }
        const devices = entry.devices.filter((d) => ids.has(d.device.id));
        devices.forEach((d, i) => {
          const person = i === 0 ? (entry.person ? `${entry.person.lastName}, ${entry.person.firstName}`.replace(/^, |, $/g, '') : '(nicht zugeordnet)') : '';
          const kind = i === 0 ? (entry.person?.kind ?? '') : '';
          const connections = d.connections.map((c) => `${c.port} → ${c.target} (${c.cable}${c.cableLabel ? `, ${c.cableLabel}` : ''})`).join('\n');
          rows.push([person, kind, d.device.label, d.templateName, connections || '–']);
        });
      }
      return tableDoc('Personenliste', ['Person', 'Art', 'Gerät', 'Vorlage', 'Einstecken'], rows, ctx, {
        widths: [90, 60, 70, 80, '*'],
        subtitle: `${data.people.length} Personen · Geräte „benutzt von Mensch“ mit Verbindungen${(() => {
          const n = peopleWithoutDevice({ devices: data.devices, people: data.people }, library).length;
          return n ? ` · ${n} ohne Gerät` : '';
        })()}`,
      });
    }
    case 'patch': {
      const sections = buildPatchLists(projectLike(data), library).flatMap((list) => {
        const target = (r: (typeof list.inputs)[number]) => (r.device ? `${r.device.label}${r.devicePort ? ` · ${r.devicePort}` : ''}${r.deviceTemplate ? `\n${r.deviceTemplate}` : ''}` : 'offen');
        return [
          {
            title: `Input-Liste – ${list.mixer.label}`,
            subtitle: `${list.mixerTemplate.name} · ${list.inputs.length} Eingänge, ${list.inputs.filter((r) => r.device).length} belegt`,
            headers: ['Kanal', 'Anschluss', 'Name', 'Quelle', 'Über', '48 V', 'Stativ', 'Bemerkung'],
            widths: [30, 50, '*', '*', '*', 28, 70, '*'],
            rows: list.inputs.map((r) => [r.channel, r.port, r.name, target(r), viaText(r), r.phantom ? '48 V' : '', r.stand, r.notes]),
          },
          ...(list.network.length
            ? [
                {
                  title: `Netzwerk-Kanäle – ${list.mixer.label}`,
                  subtitle: `${list.network.length} Kanäle über das Netzwerk, ${list.network.filter((r) => r.device).length} belegt`,
                  headers: ['Kanal', 'Anschluss', 'Name', 'Quelle', 'Über', '48 V', 'Stativ', 'Bemerkung'],
                  widths: [30, 50, '*', '*', '*', 28, 70, '*'],
                  rows: list.network.map((r) => [r.channel, r.port, r.name, target(r), viaText(r), r.phantom ? '48 V' : '', r.stand, r.notes]),
                },
              ]
            : []),
          ...(list.outputs.length
            ? [
                {
                  title: `Output-Liste – ${list.mixer.label}`,
                  subtitle: `${list.mixerTemplate.name} · ${list.outputs.length} Ausgänge, ${list.outputs.filter((r) => r.device).length} belegt`,
                  headers: ['Weg', 'Anschluss', 'Name', 'Ziel', 'Person', 'Über', 'Bemerkung'],
                  widths: [30, 50, '*', '*', 80, '*', '*'],
                  rows: list.outputs.map((r) => [r.channel, r.port, r.name, target(r), r.person ?? '', viaText(r), r.notes]),
                },
              ]
            : []),
        ];
      });
      return patchDoc(sections, ctx);
    }
    case 'power': {
      const report = buildPowerReport(projectLike(data), library);
      const pct = (u: number | undefined, a: number) => (u !== undefined && a > 0 ? `${Math.round(u * 100)} %${u >= 1 ? ' !' : ''}` : '');
      const sections = report.distributors.map((d) => {
        const max = Math.max(d.currentA.L1, d.currentA.L2, d.currentA.L3);
        const phases = d.feed === '3P' ? `L1 ${formatAmps(d.currentA.L1)} · L2 ${formatAmps(d.currentA.L2)} · L3 ${formatAmps(d.currentA.L3)}` : `${d.feed} ${formatAmps(d.currentA[d.feed])}`;
        return {
          title: `${'– '.repeat(d.depth)}${d.device.label}`,
          subtitle: `${d.template?.name ?? ''} · ${d.fedFrom ? `an ${d.fedFrom}` : 'Einspeisung'} · ${d.feed === '3P' ? 'Drehstrom' : d.feed}${d.inputFuseA ? ` ${d.inputFuseA} A` : ''} · ${formatWatts(totalW(d.load))} · ${phases}${d.usage !== undefined ? ` · Zuleitung ${pct(d.usage, max)}` : ''}${d.imbalance ? ' · Schieflast!' : ''}`,
          headers: ['Nr.', 'Abgang', 'Phase', 'Absicherung', 'Angeschlossen', 'Leistung', 'Strom', 'Auslastung'],
          widths: [24, 70, 50, 56, '*', 60, 50, 56],
          rows: d.outlets.map((o, i) => [
            i + 1,
            o.label,
            o.phase === '3P' ? 'Drehstrom' : o.phase,
            o.fuseA ? `${o.fuseA} A` : '',
            o.devices.map((x) => x.label).join(', ') || 'frei',
            totalW(o.load) > 0 ? formatWatts(totalW(o.load)) : '',
            o.currentA > 0 ? formatAmps(o.currentA) : '',
            pct(o.usage, o.currentA),
          ]),
        };
      });
      if (report.unconnected.length) {
        sections.push({
          title: 'Ohne Stromanschluss',
          subtitle: 'Geräte mit Leistung, aber ohne Stromkabel im Signalfluss',
          headers: ['Nr.', 'Gerät', 'Leistung'],
          widths: [24, '*', 80],
          rows: report.unconnected.map((u, i) => [i + 1, u.device.label, formatWatts(u.powerW)]),
        } as (typeof sections)[number]);
      }
      const total = report.total;
      return sectionsDoc(
        'Stromliste',
        sections,
        ctx,
        'Keine Stromverteiler im Projekt.',
        false,
        `Gesamt ${formatWatts(totalW(total))} · L1 ${formatAmps(total.L1 / 230)} · L2 ${formatAmps(total.L2 / 230)} · L3 ${formatAmps(total.L3 / 230)} · volle Nennleistung bei 230 V`,
      );
    }
    case 'labels': {
      const ids = visibleDevices(data, library, filter).map((d) => d.id);
      const format = LABEL_FORMATS.find((f) => f.id === opts.labelFormat) ?? LABEL_FORMATS[0]!;
      return labelsDoc(buildDeviceLabels(projectLike(data), library, ids), format, ctx, { cutLines: opts.cutLines });
    }
    case 'network': {
      const rows = buildNetworkList({ devices: visibleDevices(data, library, filter), network: data.network }, templates);
      return tableDoc('Netzwerkliste', ['Gerät', 'Anschluss', 'IP-Adresse', 'Subnetz', 'Hostname'], rows.map((r) => [r.device, r.port, r.ip, r.subnet, r.hostname]), ctx, {
        subtitle: data.network.subnets.map((s) => `${s.name}: ${s.cidr}${s.gateway ? ` (Gateway ${s.gateway})` : ''}${s.vlanNote ? ` · ${s.vlanNote}` : ''}`).join('   '),
      });
    }
    case 'wifi': {
      const networks = data.network.wifi.filter((w) => opts.wifiIds.length === 0 || opts.wifiIds.includes(w.id));
      const posters = await Promise.all(
        networks.map(async (w) => ({
          ssid: w.ssid,
          security: w.security,
          hidden: w.hidden,
          qrSvg: await input.fetchQr(w.id),
          ...(opts.printPassword && w.security !== 'open' && input.passwords?.[w.id] ? { password: input.passwords[w.id] } : {}),
        })),
      );
      return wifiPosterDoc(posters, ctx);
    }
    case 'stageplan': {
      const visibleLayers = new Set(data.layers.filter((l) => l.visible).map((l) => l.id));
      const stageItems = buildStageItems(data.devices, library, data.layers, { colorMode: input.colorMode, filter, people: data.people });
      const drawing: StageDrawing = {
        items: stageItems,
        ...(opts.showGroups ? { groupFrames: buildStageGroupFrames(data.groups, stageItems) } : {}),
        shapes: data.shapes.filter((s) => visibleLayers.has(s.layerId) || !data.layers.some((l) => l.id === s.layerId)),
        cables: buildStageCables(data.cables, data.devices, library, data.layers, filter, input.issues),
        multicores: buildMulticoreRoutes(data.devices, library, data.layers, filter),
        ...(data.background ? { background: data.background } : {}),
        showCables: opts.showCables,
      };
      const bounds = stageBounds(drawing, opts.includeBackground) ?? { x: 0, y: 0, width: 10000, height: 7000 };
      const area = drawableArea(ctx);
      const worldPerPt = opts.scale === 'fill' ? Math.max(bounds.width / area.width, bounds.height / area.height) : worldPerPtForScale(opts.scale);
      const tiles = tilePlan(bounds, area, worldPerPt, opts.scale === 'fill' ? 0 : 28);
      const fontMm = 2.6 * PT_PER_MM * worldPerPt; // ca. 2,6 mm Schrift auf dem Papier
      const planTiles: PlanTile[] = tiles.map((t) => ({
        svg: stagePlanSvg(drawing, t.view, area.width, area.height, fontMm, opts.includeBackground),
        label: t.rows * t.cols > 1 ? `${t.row * t.cols + t.col + 1} von ${t.rows * t.cols} (Zeile ${t.row + 1}, Spalte ${t.col + 1})` : '1 von 1',
      }));
      const scaleText = opts.scale === 'fill' ? `ca. 1:${Math.round(worldPerPt * PT_PER_MM)} (Seite füllen)` : `1:${opts.scale}`;
      return planDoc(
        planTiles,
        {
          title: 'Bühnenplan',
          scaleText,
          legend: usedCategories(drawing.items.map((i) => i.device.id), data, library),
          lineLegend: [
            { name: 'Kabel', color: '#475569' },
            { name: 'Multicore', color: '#64748b', dashed: true, width: 3 },
            { name: 'Problem', color: '#dc2626' },
          ],
        },
        ctx,
      );
    }
    case 'signalflow': {
      const boxes = buildBoxes(data.devices, library, false, { colorMode: input.colorMode, filter, people: data.people });
      const frames = buildGroupFrames(data.groups, boxes);
      const lines = buildCableLines(data.cables, boxes, library, input.issues, filter);
      const boxBounds = signalFlowBounds(boxes);
      const bounds = boxBounds && frames.length ? boundsOf([boxBounds, ...frames], 0)! : (boxBounds ?? { x: 0, y: 0, width: 800, height: 500 });
      const area = drawableArea(ctx);
      const worldPerPt = Math.max(bounds.width / area.width, bounds.height / area.height, 0.5);
      const view = { x: bounds.x - (area.width * worldPerPt - bounds.width) / 2, y: bounds.y - (area.height * worldPerPt - bounds.height) / 2, width: area.width * worldPerPt, height: area.height * worldPerPt };
      return planDoc(
        [{ svg: signalFlowSvg(boxes, lines, view, area.width, area.height, frames), label: '1 von 1' }],
        {
          title: 'Signalfluss',
          scaleText: 'ohne Maßstab',
          legend: usedCategories(boxes.map((b) => b.device.id), data, library),
          lineLegend: [
            { name: 'Kabel', color: '#475569' },
            { name: 'direkt gesteckt', color: '#64748b', dashed: true },
            { name: 'Problem', color: '#dc2626' },
          ],
        },
        ctx,
      );
    }
  }
}

/** CSV einer Liste (gefiltert wie auf dem Bildschirm). */
export function buildCsv(kind: ExportKind, data: ProjectData, library: Library, filter: Filter): string {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const devices = visibleDevices(data, library, filter);
  const all = projectLike(data);
  switch (kind) {
    case 'dmx':
      return dmxCsv(buildDmxPatch({ devices }, templates));
    case 'packing':
    case 'bom':
    case 'cases':
      return listCsv(kind, all, library, filteredPackItems(data, library, filter));
    case 'cables':
      // alle Geräte (für „von/nach“), aber nur passende Kabel
      return listCsv('cables', { ...all, cables: data.cables.filter((c) => cableMatches(filter, c, templates.get(c.templateId ?? ''))) }, library);
    case 'devices':
    case 'network':
      return listCsv(kind, { ...all, devices }, library);
    case 'people':
      return listCsv('people', all, library);
    case 'patch':
      return listCsv('patch', all, library);
    case 'power':
      return listCsv('power', all, library);
    default:
      return '';
  }
}

/** Dateiname nur aus ASCII-Zeichen – manche Browser verwerfen sonst den Namen beim Download. */
export function asciiFileName(text: string): string {
  const map: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss', '–': '-', '—': '-', '·': '-' };
  return text
    .replace(/[äöüÄÖÜß–—·]/g, (c) => map[c] ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

export function exportFileName(meta: Partial<ProjectMeta>, kind: ExportKind, extension: 'pdf' | 'csv'): string {
  return `${asciiFileName(meta.name || 'Projekt') || 'Projekt'} - ${asciiFileName(EXPORT_TITLES[kind])}.${extension}`;
}
