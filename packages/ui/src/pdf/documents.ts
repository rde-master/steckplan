// PDF-Dokumente als pdfmake-Definitionen (reine Daten – getestet ohne Browser).
import type { CheckMark, PackGroup, PackingList, PackRow, ProjectMeta } from '@steckplan/core';
import { LOGO_PNG } from './logo';
import { formatCableLength } from '@steckplan/core';
import type { Rect } from './svg';

export type PageFormat = 'A4' | 'A3';
export type Orientation = 'portrait' | 'landscape';
export type DocDefinition = Record<string, unknown>;
type Content = unknown;

export interface DocContext {
  meta: Partial<ProjectMeta>;
  format: PageFormat;
  orientation: Orientation;
  /** „Steckplan 0.8.0“ */
  appTitle: string;
  /** Name der Person, die exportiert */
  by: string;
  now?: Date;
  /** Hinweis auf aktive Filter */
  filterNote?: string;
}

const SIZES: Record<PageFormat, [number, number]> = { A4: [595.28, 841.89], A3: [841.89, 1190.55] };
export const MARGIN = { left: 34, top: 46, right: 34, bottom: 38 };
export const PT_PER_MM = 72 / 25.4;

export function pageSize(format: PageFormat, orientation: Orientation): { width: number; height: number } {
  const [w, h] = SIZES[format];
  return orientation === 'portrait' ? { width: w, height: h } : { width: h, height: w };
}

/** Zeichen, die der eingebetteten Schrift fehlen, ersetzen. */
export function pdfText(text: string | undefined | null): string {
  return (text ?? '').replace(/→/g, '–>').replace(/[✓✔]/g, 'x').replace(/[☐☑]/g, '');
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(date: Date): string {
  return `${formatDate(date)}, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}

/** Fußzeile: Programm und Version · was exportiert wurde · Datum und Uhrzeit · von wem · Filter */
export function footerText(ctx: Pick<DocContext, 'appTitle' | 'by' | 'filterNote' | 'now'>, title: string): string {
  const now = ctx.now ?? new Date();
  return [ctx.appTitle, pdfText(title), `erstellt am ${formatDateTime(now)}${ctx.by ? ` von ${pdfText(ctx.by)}` : ''}`, ctx.filterNote ? pdfText(ctx.filterNote) : '']
    .filter(Boolean)
    .join(' · ');
}

/** Logo oben links im Kopf (Höhe in pt) */
function logo(size: number): { image: string; width: number; height: number } {
  return { image: LOGO_PNG, width: size, height: size };
}

function projectLine(meta: Partial<ProjectMeta>): string {
  const date = meta.date && /^\d{4}-\d{2}-\d{2}$/.test(meta.date) ? meta.date.split('-').reverse().join('.') : meta.date;
  return [meta.name, meta.venue, date].filter(Boolean).map(pdfText).join(' · ');
}

function base(ctx: DocContext, title: string, content: Content[]): DocDefinition {
  return {
    info: { title: `${pdfText(ctx.meta.name)} – ${title}`, creator: ctx.appTitle, producer: ctx.appTitle },
    pageSize: ctx.format,
    pageOrientation: ctx.orientation,
    pageMargins: [MARGIN.left, MARGIN.top, MARGIN.right, MARGIN.bottom],
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.1 },
    styles: {
      title: { fontSize: 15, bold: true, margin: [0, 0, 0, 6] },
      group: { fontSize: 11, bold: true, margin: [0, 10, 0, 4] },
      subgroup: { fontSize: 9.5, bold: true, margin: [0, 6, 0, 3], color: '#334155' },
      th: { bold: true, fontSize: 8, color: '#334155', fillColor: '#f1f5f9' },
      small: { fontSize: 7.5, color: '#64748b' },
    },
    header: () => ({
      columns: [
        { ...logo(18), width: 18 },
        { text: title, bold: true, fontSize: 8, margin: [5, 5, 0, 0] },
        { text: projectLine(ctx.meta), alignment: 'right', fontSize: 8, margin: [0, 5, 0, 0] },
      ],
      margin: [MARGIN.left, 14, MARGIN.right, 0],
    }),
    footer: (page: number, pages: number) => ({
      columns: [
        { text: footerText(ctx, title), fontSize: 7, color: '#64748b' },
        { text: `Seite ${page} von ${pages}`, alignment: 'right', fontSize: 7, color: '#64748b', width: 70 },
      ],
      margin: [MARGIN.left, 12, MARGIN.right, 0],
    }),
    content,
  };
}

function checkbox(mark?: CheckMark, show = false): Content {
  const shapes: unknown[] = [{ type: 'rect', x: 0, y: 1, w: 9, h: 9, lineWidth: 0.8, lineColor: '#0f172a' }];
  if (show && mark) {
    if (mark.status === 'ok') shapes.push({ type: 'polyline', points: [{ x: 1.8, y: 5.6 }, { x: 3.8, y: 8 }, { x: 7.6, y: 2.6 }], lineWidth: 1.2 });
    else shapes.push({ type: 'line', x1: 1.5, y1: 2.5, x2: 7.5, y2: 8.5, lineWidth: 1 }, { type: 'line', x1: 7.5, y1: 2.5, x2: 1.5, y2: 8.5, lineWidth: 1 });
  }
  return { canvas: shapes, alignment: 'center' };
}

function colorSquare(color?: string): Content {
  return color ? { canvas: [{ type: 'rect', x: 0, y: 2, w: 8, h: 8, color, lineColor: '#94a3b8', lineWidth: 0.5 }], width: 12 } : { text: '', width: 0 };
}

// ---------- Packliste ----------

export interface PackingDocOptions {
  mode: 'aggregated' | 'single';
  /** aktuellen Stand der Häkchen eindrucken */
  showChecks: boolean;
  names: { category: (id?: string) => string; owner: (id?: string) => string; trailer: (id?: string) => string; case: (id?: string) => string };
  groupTitle: string;
}

function packRowCells(row: PackRow, opts: PackingDocOptions): Content[] {
  const first = row.items[0]!;
  const unique = (values: (string | undefined)[]) => [...new Set(values.filter(Boolean))].join(', ');
  const aggregated = opts.mode === 'aggregated';
  const allOut = row.items.every((i) => i.check?.out);
  const allIn = row.items.every((i) => i.check?.in);
  const name = aggregated
    ? [{ text: pdfText(row.name), bold: true }, row.items.length > 1 && row.items.some((i) => i.label) ? { text: `\n${pdfText(unique(row.items.map((i) => i.label)))}`, style: 'small' } : '']
    : [{ text: pdfText(first.label || first.name), bold: true }, first.inventoryNo ? { text: `  ${pdfText(first.inventoryNo)}`, style: 'small' } : ''];
  const people = unique(row.items.map((i) => i.person));
  return [
    checkbox(allOut ? first.check?.out : undefined, opts.showChecks && allOut),
    checkbox(allIn ? first.check?.in : undefined, opts.showChecks && allIn),
    { text: String(row.items.length), alignment: 'right', bold: true },
    { text: [...name, people ? { text: `\n${pdfText(people)}`, style: 'small', color: '#0369a1' } : ''] },
    pdfText([aggregated ? '' : row.name, row.lengthMm ? formatCableLength(row.lengthMm) : ''].filter(Boolean).join(' ')),
    pdfText(opts.names.category(first.categoryId)),
    pdfText(opts.names.owner(first.ownerId)),
    pdfText(opts.names.trailer(first.trailerId)),
    pdfText(opts.names.case(first.caseId)),
    pdfText(unique(row.items.map((i) => i.carrier ?? i.route))),
    pdfText(unique(row.items.map((i) => i.notes))),
  ];
}

const PACK_HEADERS = ['Hin', 'Zur.', 'Anz.', 'Bezeichnung', 'Typ/Länge', 'Kategorie', 'Besitzer', 'Anhänger', 'Case', 'Stativ/Position', 'Notiz'];
const PACK_WIDTHS = [16, 16, 20, '*', 58, 48, 48, 48, 48, 64, '*'];

function signature(): Content {
  return {
    columns: [
      { text: 'Gepackt (Hin): ______________________   Datum: __________', fontSize: 8 },
      { text: 'Zurück: ______________________   Datum: __________', fontSize: 8, alignment: 'right' },
    ],
    margin: [0, 6, 0, 2],
  };
}

function groupContent(group: PackGroup, opts: PackingDocOptions, depth: number): Content[] {
  const out: Content[] = [];
  const count = (g: PackGroup): number => g.rows.reduce((s, r) => s + r.items.length, 0) + g.groups.reduce((s, x) => s + count(x), 0);
  out.push({
    columns: [colorSquare(group.color), { text: `${pdfText(group.label)}  (${count(group)})`, italics: group.unassigned }],
    columnGap: 4,
    style: depth === 0 ? 'group' : 'subgroup',
  });
  if (group.rows.length) {
    out.push({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: PACK_WIDTHS,
        body: [PACK_HEADERS.map((h) => ({ text: h, style: 'th' })), ...group.rows.map((r) => packRowCells(r, opts))],
      },
      layout: { hLineWidth: () => 0.4, vLineWidth: () => 0, hLineColor: () => '#cbd5e1', paddingTop: () => 3, paddingBottom: () => 3 },
    });
  }
  for (const sub of group.groups) out.push(...groupContent(sub, opts, depth + 1));
  if (depth === 0) out.push(signature());
  return out;
}

export function packingListDoc(list: PackingList, opts: PackingDocOptions, ctx: DocContext): DocDefinition {
  const content: Content[] = [
    { text: 'Packliste', style: 'title' },
    { text: `${opts.groupTitle} · ${opts.mode === 'aggregated' ? 'zusammengefasst' : 'einzeln'} · ${list.total} Objekte`, style: 'small', margin: [0, 0, 0, 6] },
  ];
  for (const group of list.groups) content.push(...groupContent(group, opts, 0));
  content.push({ text: 'Fehlt / defekt', style: 'group', pageBreak: list.problems.length > 12 ? 'before' : undefined });
  if (list.problems.length === 0) {
    content.push({ text: 'Bei der Rückgabe fehlende oder defekte Teile hier eintragen:', style: 'small' });
    content.push({ table: { widths: ['*', 60, '*'], body: [[{ text: 'Bezeichnung', style: 'th' }, { text: 'Zustand', style: 'th' }, { text: 'Notiz', style: 'th' }], ...Array.from({ length: 6 }, () => [' ', ' ', ' '])] }, layout: 'lightHorizontalLines' });
  } else {
    content.push({
      table: {
        headerRows: 1,
        widths: [42, 36, '*', 70, '*', 90],
        body: [
          ['Zustand', 'Richtung', 'Bezeichnung', 'Typ', 'Notiz', 'Erfasst'].map((h) => ({ text: h, style: 'th' })),
          ...list.problems.map(({ item, direction, mark }) => [
            { text: mark.status === 'missing' ? 'fehlt' : 'defekt', bold: true, color: mark.status === 'missing' ? '#b91c1c' : '#b45309' },
            direction === 'out' ? 'Hin' : 'Zurück',
            pdfText(item.label || item.name),
            pdfText(`${item.name}${item.lengthMm ? ` ${formatCableLength(item.lengthMm)}` : ''}`),
            pdfText(mark.note),
            pdfText(`${mark.by}, ${new Date(mark.at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`),
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    });
  }
  return base(ctx, 'Packliste', content);
}

// ---------- Case-Listen: je Case eine Seite ----------

export interface CaseListDoc {
  name: string;
  trailer: string;
  notes?: string;
  color?: string;
  total: number;
  rows: PackRow[];
}

/** Ohne Spalten Anhänger und Case (stehen im Kopf der Seite) */
const CASE_DROP = new Set([7, 8]);

export function caseListsDoc(lists: CaseListDoc[], opts: PackingDocOptions, ctx: DocContext): DocDefinition {
  const content: Content[] = [];
  if (lists.length === 0) content.push({ text: 'Case-Listen', style: 'title' }, { text: 'Noch nichts in Cases.', italics: true, color: '#64748b' });
  lists.forEach((c, index) => {
    content.push({
      columns: [colorSquare(c.color), { text: pdfText(c.name), style: 'title' }],
      columnGap: 6,
      ...(index > 0 ? { pageBreak: 'before' } : {}),
    });
    content.push({
      text: `${pdfText(c.trailer ? `Anhänger: ${c.trailer}` : 'ohne Anhänger')} · ${c.total} ${c.total === 1 ? 'Teil' : 'Teile'} · ${opts.mode === 'aggregated' ? 'zusammengefasst' : 'einzeln'}${c.notes ? ` · ${pdfText(c.notes)}` : ''}`,
      style: 'small',
      margin: [0, 0, 0, 6],
    });
    content.push({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: PACK_WIDTHS.filter((_, i) => !CASE_DROP.has(i)),
        body: [PACK_HEADERS.filter((_, i) => !CASE_DROP.has(i)).map((h) => ({ text: h, style: 'th' })), ...c.rows.map((r) => packRowCells(r, opts).filter((_, i) => !CASE_DROP.has(i)))],
      },
      layout: { hLineWidth: () => 0.4, vLineWidth: () => 0, hLineColor: () => '#cbd5e1', paddingTop: () => 3, paddingBottom: () => 3 },
    });
    content.push(signature());
  });
  return base(ctx, 'Case-Listen', content);
}

// ---------- Ton-Patch: Input-/Output-Liste je Mischpult ----------

export interface PatchSection {
  title: string;
  subtitle?: string;
  headers: string[];
  widths: (number | string)[];
  rows: (string | number)[][];
}

export function patchDoc(sections: PatchSection[], ctx: DocContext): DocDefinition {
  return sectionsDoc('Input-/Output-Liste', sections, ctx, 'Kein Mischpult im Projekt.', true);
}

/** Mehrere Tabellen mit Überschrift (z. B. je Pult oder je Verteiler); optional jede auf neuer Seite. */
export function sectionsDoc(title: string, sections: PatchSection[], ctx: DocContext, emptyText: string, pageBreaks: boolean, intro?: string): DocDefinition {
  const content: Content[] = [];
  if (intro) content.push({ text: title, style: 'title' }, { text: pdfText(intro), margin: [0, 0, 0, 8] });
  if (sections.length === 0) content.push({ text: title, style: 'title' }, { text: emptyText, italics: true, color: '#64748b' });
  sections.forEach((section, index) => {
    content.push({ text: pdfText(section.title), style: pageBreaks ? 'title' : 'group', ...(index > 0 && pageBreaks ? { pageBreak: 'before' } : {}) });
    if (section.subtitle) content.push({ text: pdfText(section.subtitle), style: 'small', margin: [0, 0, 0, 6] });
    content.push({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: section.widths,
        body: [
          section.headers.map((h) => ({ text: h, style: 'th' })),
          ...section.rows.map((r) => r.map((cell, i) => (i === 0 ? { text: String(cell), bold: true, alignment: 'right' } : pdfText(String(cell))))),
        ],
      },
      layout: { hLineWidth: () => 0.4, vLineWidth: () => 0, hLineColor: () => '#cbd5e1', fillColor: (i: number) => (i > 0 && i % 2 === 0 ? '#f8fafc' : null), paddingTop: () => 4, paddingBottom: () => 4 },
    });
  });
  return base(ctx, title, content);
}

// ---------- Tabellen-Listen (Kabel, Stück, DMX, Geräte, Netzwerk) ----------

export function tableDoc(title: string, headers: string[], rows: (string | number)[][], ctx: DocContext, options: { widths?: (number | string)[]; subtitle?: string; summary?: string[] } = {}): DocDefinition {
  const content: Content[] = [{ text: title, style: 'title' }];
  if (options.subtitle) content.push({ text: pdfText(options.subtitle), style: 'small', margin: [0, 0, 0, 6] });
  if (options.summary?.length) content.push({ text: options.summary.map(pdfText).join('   ·   '), margin: [0, 0, 0, 8] });
  if (rows.length === 0) content.push({ text: 'Keine Einträge.', italics: true, color: '#64748b' });
  else
    content.push({
      table: {
        headerRows: 1,
        widths: options.widths ?? headers.map(() => '*'),
        body: [headers.map((h) => ({ text: h, style: 'th' })), ...rows.map((r) => r.map((c) => (typeof c === 'number' ? { text: String(c), alignment: 'right' } : pdfText(c))))],
      },
      layout: { hLineWidth: () => 0.4, vLineWidth: () => 0, hLineColor: () => '#cbd5e1', fillColor: (i: number) => (i > 0 && i % 2 === 0 ? '#f8fafc' : null) },
    });
  return base(ctx, title, content);
}

// ---------- Geräte-Etiketten (A4-Bögen) ----------

export interface LabelFormat {
  id: string;
  name: string;
  cols: number;
  rows: number;
  widthMm: number;
  heightMm: number;
  marginLeftMm: number;
  marginTopMm: number;
  gapXMm: number;
  gapYMm: number;
}

/** Gängige Klebe-Etiketten-Bögen (A4) */
export const LABEL_FORMATS: LabelFormat[] = [
  { id: '70x37', name: '70 × 37 mm (3 × 8, z. B. Avery 3474)', cols: 3, rows: 8, widthMm: 70, heightMm: 37.125, marginLeftMm: 0, marginTopMm: 0, gapXMm: 0, gapYMm: 0 },
  { id: '63x38', name: '63,5 × 38,1 mm (3 × 7, z. B. Avery L7160)', cols: 3, rows: 7, widthMm: 63.5, heightMm: 38.1, marginLeftMm: 7.2, marginTopMm: 15.15, gapXMm: 2.5, gapYMm: 0 },
  { id: '105x48', name: '105 × 48 mm (2 × 6, z. B. Avery 3424)', cols: 2, rows: 6, widthMm: 105, heightMm: 48, marginLeftMm: 0, marginTopMm: 4.5, gapXMm: 0, gapYMm: 0 },
  { id: '105x74', name: '105 × 74 mm (2 × 4, A7)', cols: 2, rows: 4, widthMm: 105, heightMm: 74.25, marginLeftMm: 0, marginTopMm: 0, gapXMm: 0, gapYMm: 0 },
];

export interface LabelContent {
  title: string;
  person: string;
  personKind: string;
  templateName: string;
  lines: string[];
}

/** Etiketten auf A4: je Etikett Gerät, Person und wo es mit welchem Kabel eingesteckt wird. Optional Schnittlinien. */
export function labelsDoc(labels: LabelContent[], format: LabelFormat, ctx: Pick<DocContext, 'meta' | 'appTitle'>, options: { cutLines: boolean }): DocDefinition {
  const perPage = format.cols * format.rows;
  const w = format.widthMm * PT_PER_MM;
  const h = format.heightMm * PT_PER_MM;
  const pad = 2.5 * PT_PER_MM;
  const scale = Math.min(1.4, Math.max(0.8, h / (37 * PT_PER_MM)));
  const titleSize = 11 * scale;
  const lineSize = 7 * scale;
  // so viele Verbindungszeilen, wie sicher auf das Etikett passen
  const maxLines = Math.max(1, Math.floor((h - 2 * pad - titleSize * 1.3 - lineSize * 2.6) / (lineSize * 1.2)));
  const content: Content[] = [];
  labels.forEach((label, index) => {
    const slot = index % perPage;
    if (slot === 0 && index > 0) content.push({ text: '', pageBreak: 'before' });
    const col = slot % format.cols;
    const row = Math.floor(slot / format.cols);
    const x = (format.marginLeftMm + col * (format.widthMm + format.gapXMm)) * PT_PER_MM;
    const y = (format.marginTopMm + row * (format.heightMm + format.gapYMm)) * PT_PER_MM;
    if (options.cutLines) {
      content.push({ canvas: [{ type: 'rect', x: 0, y: 0, w, h, lineWidth: 0.3, lineColor: '#94a3b8', dash: { length: 2 } }], absolutePosition: { x, y } });
    }
    const lines = label.lines.length > maxLines ? [...label.lines.slice(0, maxLines - 1), `… und ${label.lines.length - maxLines + 1} weitere`] : label.lines;
    content.push({
      absolutePosition: { x: x + pad, y: y + pad },
      stack: [
        { text: pdfText(label.title), bold: true, fontSize: titleSize, noWrap: true },
        {
          text: [
            { text: pdfText(label.person || 'Person nicht zugeordnet'), bold: true, color: label.person ? '#0369a1' : '#b91c1c' },
            label.personKind ? { text: `  ${pdfText(label.personKind)}`, color: '#64748b' } : '',
          ],
          fontSize: lineSize * 1.15,
          noWrap: true,
        },
        { text: pdfText(label.templateName), fontSize: lineSize, color: '#64748b', noWrap: true, margin: [0, 0, 0, 1.5] },
        ...lines.map((line) => ({ text: pdfText(line), fontSize: lineSize, noWrap: true })),
      ],
      width: w - 2 * pad,
    });
  });
  if (labels.length === 0) content.push({ text: 'Keine Geräte „benutzt von Mensch“ vorhanden.', margin: [40, 40, 40, 0] });
  return {
    info: { title: `${pdfText(ctx.meta.name)} – Geräte-Etiketten`, creator: ctx.appTitle, producer: ctx.appTitle },
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [0, 0, 0, 0],
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.05 },
    content,
  };
}

// ---------- WLAN-Aushang ----------

export interface WifiPoster {
  ssid: string;
  security: string;
  hidden: boolean;
  qrSvg: string;
  password?: string;
}

export function wifiPosterDoc(posters: WifiPoster[], ctx: DocContext): DocDefinition {
  const page = pageSize(ctx.format, ctx.orientation);
  const qrSize = Math.min(page.width, page.height) * 0.55;
  const scale = ctx.format === 'A3' ? 1.4 : 1;
  const content: Content[] = posters.flatMap((p, index) => [
    { ...logo(48 * scale), alignment: 'center', margin: [0, 10, 0, 0], ...(index > 0 ? { pageBreak: 'before' } : {}) },
    { text: 'WLAN', fontSize: 28 * scale, bold: true, alignment: 'center', color: '#0284c7', margin: [0, 8, 0, 6] },
    { text: pdfText(p.ssid), fontSize: 36 * scale, bold: true, alignment: 'center', margin: [0, 0, 0, 20] },
    { svg: p.qrSvg, width: qrSize, alignment: 'center' },
    { text: 'Kamera-App öffnen und den QR-Code scannen, um sich zu verbinden.', fontSize: 13 * scale, alignment: 'center', margin: [0, 16, 0, 16] },
    ...(p.password
      ? [
          { text: 'Passwort', fontSize: 12 * scale, alignment: 'center', color: '#64748b' },
          { text: pdfText(p.password), fontSize: 24 * scale, bold: true, alignment: 'center', margin: [0, 2, 0, 0] },
        ]
      : []),
    { text: `${p.security === 'open' ? 'Offenes Netz' : p.security}${p.hidden ? ' · verstecktes Netz' : ''}`, fontSize: 9 * scale, alignment: 'center', color: '#64748b', margin: [0, 18, 0, 0] },
  ]);
  return { ...base(ctx, 'WLAN-Aushang', content), header: undefined };
}

// ---------- Planzeichnung ----------

export const TITLE_BLOCK_PT = 64;

export interface PlanTile {
  svg: string;
  label: string;
}

export interface PlanDocOptions {
  title: string;
  scaleText: string;
  legend: { name: string; color?: string }[];
  lineLegend: { name: string; color: string; dashed?: boolean; width?: number }[];
}

/** Zeichenfläche einer Seite (ohne Ränder und Planköpfchen) in pt. */
export function drawableArea(ctx: Pick<DocContext, 'format' | 'orientation'>): { width: number; height: number } {
  const page = pageSize(ctx.format, ctx.orientation);
  return { width: page.width - MARGIN.left - MARGIN.right, height: page.height - MARGIN.top - MARGIN.bottom - TITLE_BLOCK_PT };
}

function titleBlock(ctx: DocContext, opts: PlanDocOptions, tileLabel: string): Content {
  const m = ctx.meta;
  const cell = (label: string, value: string | undefined) => ({ stack: [{ text: label, fontSize: 6.5, color: '#64748b' }, { text: pdfText(value) || '–', fontSize: 8.5, bold: true }] });
  const legendItems: Content[] = [
    ...opts.legend.slice(0, 8).map((l) => ({ columns: [colorSquare(l.color), { text: pdfText(l.name), fontSize: 7 }], columnGap: 3, width: 'auto' })),
    ...opts.lineLegend.map((l) => ({
      columns: [{ canvas: [{ type: 'line', x1: 0, y1: 6, x2: 16, y2: 6, lineWidth: l.width ?? 1.5, lineColor: l.color, ...(l.dashed ? { dash: { length: 3, space: 2 } } : {}) }], width: 18 }, { text: l.name, fontSize: 7 }],
      columnGap: 3,
      width: 'auto',
    })),
  ];
  return {
    table: {
      widths: [30, '*', 80, 70, 70, 60, 70, 60],
      body: [
        [
          { ...logo(26), alignment: 'center' },
          { stack: [{ text: pdfText(opts.title), fontSize: 10, bold: true }, { columns: legendItems, columnGap: 8, margin: [0, 3, 0, 0] }] },
          cell('Projekt', m.name),
          cell('Ort', m.venue),
          cell('Datum', m.date && /^\d{4}-\d{2}-\d{2}$/.test(m.date) ? m.date.split('-').reverse().join('.') : m.date),
          cell('Planer', m.planner),
          cell('Version / Maßstab', `${m.version ? `${m.version} · ` : ''}${opts.scaleText}`),
          cell('Blatt', tileLabel),
        ],
      ],
    },
    layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => '#475569', vLineColor: () => '#475569', paddingTop: () => 3, paddingBottom: () => 3 },
    margin: [0, 6, 0, 0],
  };
}

export function planDoc(tiles: PlanTile[], opts: PlanDocOptions, ctx: DocContext): DocDefinition {
  const area = drawableArea(ctx);
  const content: Content[] = tiles.flatMap((tile, i) => [
    { svg: tile.svg, width: area.width, height: area.height, ...(i > 0 ? { pageBreak: 'before' } : {}) },
    titleBlock(ctx, opts, tile.label),
  ]);
  return base(ctx, opts.title, content);
}

// ---------- Kacheln für große Pläne ----------

export interface TileSpec {
  view: Rect;
  row: number;
  col: number;
  rows: number;
  cols: number;
}

/**
 * Teilt den Inhalt (Weltkoordinaten in mm) in Seiten auf.
 * worldPerPt = wie viele Welt-Millimeter einem Punkt auf dem Papier entsprechen; overlapPt = Überlappung.
 */
export function tilePlan(bounds: Rect, area: { width: number; height: number }, worldPerPt: number, overlapPt = 28): TileSpec[] {
  const tileW = area.width * worldPerPt;
  const tileH = area.height * worldPerPt;
  const overlap = overlapPt * worldPerPt;
  const cols = Math.max(1, Math.ceil((bounds.width - overlap) / (tileW - overlap)));
  const rows = Math.max(1, Math.ceil((bounds.height - overlap) / (tileH - overlap)));
  // Inhalt mittig, wenn er kleiner als eine Seite ist
  const offsetX = cols === 1 ? (bounds.width - tileW) / 2 : 0;
  const offsetY = rows === 1 ? (bounds.height - tileH) / 2 : 0;
  const tiles: TileSpec[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({ view: { x: bounds.x + offsetX + c * (tileW - overlap), y: bounds.y + offsetY + r * (tileH - overlap), width: tileW, height: tileH }, row: r, col: c, rows, cols });
    }
  }
  return tiles;
}

/** Welt-Millimeter pro Punkt für einen Maßstab 1:n (Welt in mm). */
export function worldPerPtForScale(denominator: number): number {
  return denominator / PT_PER_MM;
}

export type { Rect };
