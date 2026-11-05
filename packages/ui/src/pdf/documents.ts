// PDF-Dokumente als pdfmake-Definitionen (reine Daten – getestet ohne Browser).
import type { CheckMark, PackGroup, PackingList, PackRow, PortRole, ProjectMeta, SignalKind } from '@steckplan/core';
import { LOGO_PNG } from './logo';
import { sortRows, type SortKey } from './sorting';
import { formatCableLength } from '@steckplan/core';
import type { Rect } from './svg';

export type PageFormat = 'A4' | 'A3';
export type Orientation = 'portrait' | 'landscape';
export type DocDefinition = Record<string, unknown>;
type Content = unknown;

export interface DocContext {
  /** Sortierung der Tabellen (Spaltenüberschrift, auf-/absteigend) */
  sort?: SortKey[];
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

/**
 * Geschätzte Textbreite in pt (Schrift Roboto), eher großzügig – damit Gekürztes sicher in den Platz passt.
 */
export function textWidth(text: string, fontSize: number, bold = false): number {
  let em = 0;
  for (const ch of text) {
    if (/[mwMW@%]/.test(ch)) em += 0.86;
    else if (/[A-ZÄÖÜ&]/.test(ch)) em += 0.68;
    else if (/[0-9]/.test(ch)) em += 0.57;
    else if (/[iljtfr.,:;'|!·()[\] ]/.test(ch)) em += 0.32;
    else em += 0.55;
  }
  return em * fontSize * (bold ? 1.06 : 1);
}

/** Text so kürzen (mit „…“), dass er in maxWidth passt. */
export function fitText(text: string, fontSize: number, maxWidth: number, bold = false): string {
  if (textWidth(text, fontSize, bold) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 0 && textWidth(`${cut}…`, fontSize, bold) > maxWidth) cut = cut.slice(0, -1);
  return cut.length ? `${cut.trimEnd()}…` : '';
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

const FOOTER_FONT = 7;
/** Breite der Fußzeilen-Spalte (ohne „Seite x von y“) */
function footerWidth(ctx: Pick<DocContext, 'format' | 'orientation'>): number {
  return pageSize(ctx.format, ctx.orientation).width - MARGIN.left - MARGIN.right - 70 - 10;
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
        // höchstens zwei Zeilen, damit die Fußzeile im unteren Rand bleibt
        { text: fitText(footerText(ctx, title), FOOTER_FONT, 2 * footerWidth(ctx) - 20), fontSize: FOOTER_FONT, color: '#64748b' },
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
          ...sortRows(section.headers, section.rows, ctx.sort).map((r) => r.map((cell, i) => (i === 0 ? { text: String(cell), bold: true, alignment: 'right' } : pdfText(String(cell))))),
        ],
      },
      layout: { hLineWidth: () => 0.4, vLineWidth: () => 0, hLineColor: () => '#cbd5e1', fillColor: (i: number) => (i > 0 && i % 2 === 0 ? '#f8fafc' : null), paddingTop: () => 4, paddingBottom: () => 4 },
    });
  });
  return base(ctx, title, content);
}

// ---------- Tabellen-Listen (Kabel, Stück, DMX, Geräte, Netzwerk) ----------

export function tableDoc(title: string, headers: string[], unsorted: (string | number)[][], ctx: DocContext, options: { widths?: (number | string)[]; subtitle?: string; summary?: string[] } = {}): DocDefinition {
  const rows = sortRows(headers, unsorted, ctx.sort);
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

export interface LabelConnection {
  port: string;
  target: string;
  cable: string;
  cableLabel?: string;
  signal: SignalKind;
  role: PortRole;
}

export interface LabelContent {
  title: string;
  person: string;
  personKind: string;
  templateName: string;
  lines: string[];
  /** grafisch gezeichnet (sonst die Textzeilen) */
  connections?: LabelConnection[];
}

/** Etiketten auf A4: je Etikett Gerät, Person und wo es mit welchem Kabel eingesteckt wird. Optional Schnittlinien. */
export function labelsDoc(labels: LabelContent[], format: LabelFormat, ctx: Pick<DocContext, 'meta' | 'appTitle'>, options: { cutLines: boolean }): DocDefinition {
  const perPage = format.cols * format.rows;
  const sheet = pageSize('A4', 'portrait');
  const w = format.widthMm * PT_PER_MM;
  const h = format.heightMm * PT_PER_MM;
  const scale = Math.min(1.4, Math.max(0.8, h / (37 * PT_PER_MM)));
  const titleSize = 10 * scale;
  const lineSize = 6.8 * scale;
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
    // Sicherheitsabstand: im Etikett und zum Blattrand (Drucker bedrucken den Rand nicht)
    const inner = {
      left: Math.max(x + LABEL_PAD_MM * PT_PER_MM, SHEET_SAFE_MM * PT_PER_MM),
      top: Math.max(y + LABEL_PAD_MM * PT_PER_MM, SHEET_SAFE_MM * PT_PER_MM),
      right: Math.min(x + w - LABEL_PAD_MM * PT_PER_MM, sheet.width - SHEET_SAFE_MM * PT_PER_MM),
      bottom: Math.min(y + h - LABEL_PAD_MM * PT_PER_MM, sheet.height - SHEET_SAFE_MM * PT_PER_MM),
    };
    content.push(...labelContent(label, inner, titleSize, lineSize));
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

/** Abstand des Inhalts zum Etikettenrand bzw. zum Blattrand (mm) */
export const LABEL_PAD_MM = 3;
export const SHEET_SAFE_MM = 5;

/** Farben je Signalart (Etiketten) */
export const SIGNAL_COLORS: Record<SignalKind, string> = {
  audio: '#0284c7',
  dmx: '#9333ea',
  network: '#16a34a',
  power: '#dc2626',
  video: '#ea580c',
  other: '#64748b',
};

/** Weiße Symbole (10 × 10) im farbigen Kreis */
const SIGNAL_ICONS: Record<SignalKind, string> = {
  audio: '<path d="M3 4.2v1.6M5 2.6v4.8M7 3.6v2.8" stroke="#fff" stroke-width="1.2" stroke-linecap="round" fill="none"/>',
  dmx: '<circle cx="5" cy="5" r="1.5" fill="#fff"/><path d="M5 1.9v.9M5 7.2v.9M1.9 5h.9M7.2 5h.9M2.8 2.8l.6.6M6.6 6.6l.6.6M2.8 7.2l.6-.6M6.6 3.4l.6-.6" stroke="#fff" stroke-width=".8" stroke-linecap="round"/>',
  network: '<path d="M5 3.4v1.6M3 6.6V5h4v1.6" stroke="#fff" stroke-width=".8" fill="none"/><rect x="4" y="2" width="2" height="1.6" fill="#fff"/><rect x="2" y="6.4" width="2" height="1.6" fill="#fff"/><rect x="6" y="6.4" width="2" height="1.6" fill="#fff"/>',
  power: '<path d="M5.7 1.8 3.2 5.4h1.9l-.7 2.8 2.5-3.7H5z" fill="#fff"/>',
  video: '<rect x="2.3" y="3" width="4" height="4" rx=".6" fill="#fff"/><path d="M6.5 4.4 8 3.6v2.8l-1.5-.8z" fill="#fff"/>',
  other: '<circle cx="5" cy="5" r="1.6" fill="#fff"/>',
};

function signalIcon(kind: SignalKind, size: number): Content {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><circle cx="5" cy="5" r="5" fill="${SIGNAL_COLORS[kind]}"/>${SIGNAL_ICONS[kind]}</svg>`;
  return { svg, width: size, height: size };
}

/** Richtung am eigenen Anschluss: Ausgang →, Eingang ←, beides ↔ */
function directionArrow(role: PortRole, size: number): Content {
  const right = '<path d="M1 5h7M5.5 2.5 8 5 5.5 7.5" />';
  const left = '<path d="M9 5H2M4.5 2.5 2 5l2.5 2.5" />';
  const both = '<path d="M2 5h6M4 3 2 5l2 2M6 3l2 2-2 2" />';
  const path = role === 'out' ? right : role === 'in' ? left : both;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><g stroke="#475569" stroke-width="1.1" fill="none" stroke-linecap="round" stroke-linejoin="round">${path}</g></svg>`, width: size, height: size };
}

function personIcon(size: number, color: string): Content {
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><circle cx="5" cy="3.2" r="2" fill="${color}"/><path d="M1.4 9.4c.3-2.2 1.8-3.4 3.6-3.4s3.3 1.2 3.6 3.4z" fill="${color}"/></svg>`, width: size, height: size };
}

/** Inhalt eines Etiketts: farbiger Kopf (Gerät, Vorlage), Person, je Verbindung Symbol, Anschluss, Richtung, Gegenstelle, Kabel. */
function labelContent(label: LabelContent, box: { left: number; top: number; right: number; bottom: number }, titleSize: number, lineSize: number): Content[] {
  const out: Content[] = [];
  const width = box.right - box.left;
  let y = box.top;
  // Kopf: Gerätename weiß auf Farbe, rechts die Vorlage
  const headH = titleSize * 1.6;
  const headPad = 0.35 * headH;
  out.push({ canvas: [{ type: 'rect', x: 0, y: 0, w: width, h: headH, r: 2, color: '#075985' }], absolutePosition: { x: box.left, y } });
  const smallSize = lineSize * 0.95;
  const templateText = fitText(pdfText(label.templateName), smallSize, width * 0.4);
  const templateW = templateText ? textWidth(templateText, smallSize) : 0;
  const titleText = fitText(pdfText(label.title), titleSize, width - 2 * headPad - (templateW ? templateW + 4 : 0), true);
  out.push({ text: titleText, bold: true, fontSize: titleSize, color: '#ffffff', noWrap: true, absolutePosition: { x: box.left + headPad, y: y + (headH - titleSize * 1.15) / 2 } });
  if (templateText) out.push({ text: templateText, fontSize: smallSize, color: '#e0f2fe', noWrap: true, absolutePosition: { x: box.right - headPad - templateW, y: y + (headH - smallSize * 1.15) / 2 } });
  y += headH + lineSize * 0.45;

  // Person
  const personSize = lineSize * 1.15;
  const personColor = label.person ? '#0369a1' : '#b91c1c';
  out.push({ ...(personIcon(personSize, personColor) as object), absolutePosition: { x: box.left, y: y + personSize * 0.05 } });
  const personText = fitText(pdfText(label.person || 'Person nicht zugeordnet'), personSize, width - personSize - 3, true);
  const kindText = label.personKind ? fitText(pdfText(label.personKind), lineSize, width - personSize - 3 - textWidth(personText, personSize, true) - 6) : '';
  out.push({
    text: [{ text: personText, bold: true, color: personColor, fontSize: personSize }, kindText ? { text: `  ${kindText}`, color: '#64748b', fontSize: lineSize } : ''],
    noWrap: true,
    absolutePosition: { x: box.left + personSize + 3, y },
  });
  y += personSize * 1.35;
  out.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.4, lineColor: '#cbd5e1' }], absolutePosition: { x: box.left, y } });
  y += lineSize * 0.4;

  // Verbindungen
  const rowH = lineSize * 1.5;
  const icon = lineSize * 1.2;
  const arrow = lineSize * 1.1;
  const connections: LabelConnection[] = label.connections ?? label.lines.map((line) => ({ port: '', target: line, cable: '', signal: 'other', role: 'bi' }));
  if (connections.length === 0) {
    out.push({ text: 'Keine Verbindungen', italics: true, color: '#64748b', fontSize: lineSize, noWrap: true, absolutePosition: { x: box.left, y } });
    return out;
  }
  const fits = Math.max(1, Math.floor((box.bottom - y) / rowH));
  const shown = connections.length > fits ? connections.slice(0, fits - 1) : connections;
  for (const c of shown) {
    let x = box.left;
    out.push({ ...(signalIcon(c.signal, icon) as object), absolutePosition: { x, y: y + (lineSize * 1.15 - icon) / 2 } });
    x += icon + 3;
    if (c.port) {
      const port = fitText(pdfText(c.port), lineSize, width * 0.3, true);
      out.push({ text: port, bold: true, fontSize: lineSize, noWrap: true, absolutePosition: { x, y } });
      x += textWidth(port, lineSize, true) + 2;
      out.push({ ...(directionArrow(c.role, arrow) as object), absolutePosition: { x, y: y + (lineSize * 1.15 - arrow) / 2 } });
      x += arrow + 2;
    }
    const rest = box.right - x;
    const cable = [c.cable, c.cableLabel].filter(Boolean).join(', ');
    const cableSize = lineSize * 0.9;
    const targetFull = pdfText(c.target);
    const targetW = Math.min(textWidth(targetFull, lineSize), cable ? rest * 0.62 : rest);
    const target = fitText(targetFull, lineSize, targetW);
    const cableText = cable ? fitText(pdfText(cable), cableSize, rest - textWidth(target, lineSize) - 5) : '';
    out.push({
      text: [{ text: target, fontSize: lineSize }, cableText ? { text: `  ${cableText}`, fontSize: cableSize, color: '#64748b' } : ''],
      noWrap: true,
      absolutePosition: { x, y },
    });
    y += rowH;
  }
  if (shown.length < connections.length) out.push({ text: `… und ${connections.length - shown.length} weitere`, italics: true, color: '#64748b', fontSize: lineSize, noWrap: true, absolutePosition: { x: box.left, y } });
  return out;
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
const LEGEND_FONT = 7;
const LEGEND_ROW_PT = 10.5;
/** höchstens so viele Legendenzeilen, der Rest als „+ n weitere“ */
export const LEGEND_MAX_ROWS = 3;

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

type LegendItem = { kind: 'color'; name: string; color?: string; width: number } | { kind: 'line'; name: string; color: string; dashed?: boolean; lineWidth?: number; width: number } | { kind: 'more'; name: string; width: number };

const LEGEND_GAP = 10;

/** Legende auf Zeilen über die ganze Breite verteilen (höchstens LEGEND_MAX_ROWS, dann „+ n weitere“). */
export function legendRows(opts: Pick<PlanDocOptions, 'legend' | 'lineLegend'>, ctx: Pick<DocContext, 'format' | 'orientation'>): LegendItem[][] {
  const available = pageSize(ctx.format, ctx.orientation).width - MARGIN.left - MARGIN.right - 12;
  const maxName = Math.min(160, available / 3);
  const items: LegendItem[] = [
    ...opts.legend.map((l): LegendItem => {
      const name = fitText(pdfText(l.name), LEGEND_FONT, maxName);
      return { kind: 'color', name, ...(l.color ? { color: l.color } : {}), width: 12 + textWidth(name, LEGEND_FONT) };
    }),
    ...opts.lineLegend.map((l): LegendItem => {
      const name = fitText(pdfText(l.name), LEGEND_FONT, maxName);
      return { kind: 'line', name, color: l.color, ...(l.dashed ? { dashed: true } : {}), ...(l.width ? { lineWidth: l.width } : {}), width: 21 + textWidth(name, LEGEND_FONT) };
    }),
  ];
  const rows: LegendItem[][] = [];
  let used = 0;
  for (const item of items) {
    const row = rows[rows.length - 1];
    if (row && used + LEGEND_GAP + item.width <= available) {
      row.push(item);
      used += LEGEND_GAP + item.width;
    } else {
      rows.push([item]);
      used = item.width;
    }
  }
  if (rows.length <= LEGEND_MAX_ROWS) return rows;
  const kept = rows.slice(0, LEGEND_MAX_ROWS);
  const last = kept[LEGEND_MAX_ROWS - 1]!;
  const shownCount = () => kept.reduce((n, r) => n + r.length, 0);
  const more = (): LegendItem => {
    const name = `+ ${items.length - shownCount()} weitere`;
    return { kind: 'more', name, width: textWidth(name, LEGEND_FONT) };
  };
  while (last.length > 1 && last.reduce((sum, i) => sum + i.width + LEGEND_GAP, 0) + more().width > available) last.pop();
  last.push(more());
  return kept;
}

/** Höhe des Planköpfchens (mit Legende) in pt */
export function titleBlockHeight(rows: number): number {
  return Math.max(TITLE_BLOCK_PT, 44 + rows * LEGEND_ROW_PT + 10);
}

/** Zeichenfläche einer Seite (ohne Ränder und Planköpfchen) in pt. */
export function drawableArea(ctx: Pick<DocContext, 'format' | 'orientation'>, legend?: Pick<PlanDocOptions, 'legend' | 'lineLegend'>): { width: number; height: number } {
  const page = pageSize(ctx.format, ctx.orientation);
  const rows = legend ? legendRows(legend, ctx).length : 1;
  return { width: page.width - MARGIN.left - MARGIN.right, height: page.height - MARGIN.top - MARGIN.bottom - titleBlockHeight(rows) };
}

function legendItem(item: LegendItem): Content {
  const label = { text: item.name, fontSize: LEGEND_FONT, noWrap: true };
  if (item.kind === 'more') return { ...label, color: '#64748b', italics: true, width: item.width };
  const symbol =
    item.kind === 'color'
      ? colorSquare(item.color ?? '#ffffff')
      : { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 16, y2: 5, lineWidth: item.lineWidth ?? 1.5, lineColor: item.color, ...(item.dashed ? { dash: { length: 3, space: 2 } } : {}) }], width: 18 };
  return { columns: [symbol, label], columnGap: 3, width: item.width };
}

function titleBlock(ctx: DocContext, opts: PlanDocOptions, tileLabel: string): Content {
  const m = ctx.meta;
  // Hochformat: schmalere Spalten, damit das Köpfchen nicht über den Rand ragt
  const widths = ctx.orientation === 'portrait' ? [24, '*', 64, 54, 44, 46, 62, 74] : [30, '*', 90, 70, 60, 60, 80, 100];
  // Werte höchstens zweizeilig (sonst gekürzt), damit die Höhe des Köpfchens fest bleibt
  const cell = (label: string, value: string | undefined, index: number) => ({
    stack: [
      { text: label, fontSize: 6.5, color: '#64748b', noWrap: true },
      { text: fitText(pdfText(value) || '–', 8.5, 2 * ((widths[index] as number) - 8), true), fontSize: 8.5, bold: true },
    ],
  });
  const rows = legendRows(opts, ctx);
  const legendRow = rows.length
    ? [[{ colSpan: 8, stack: rows.map((r) => ({ columns: r.map(legendItem), columnGap: LEGEND_GAP, margin: [0, 0, 0, 1.5] })) }, {}, {}, {}, {}, {}, {}, {}]]
    : [];
  return {
    table: {
      widths,
      body: [
        [
          { ...logo(ctx.orientation === 'portrait' ? 22 : 26), alignment: 'center' },
          { text: pdfText(opts.title), fontSize: 10, bold: true },
          cell('Projekt', m.name, 2),
          cell('Ort', m.venue, 3),
          cell('Datum', m.date && /^\d{4}-\d{2}-\d{2}$/.test(m.date) ? m.date.split('-').reverse().join('.') : m.date, 4),
          cell('Planer', m.planner, 5),
          cell('Version / Maßstab', `${m.version ? `${m.version} · ` : ''}${opts.scaleText}`, 6),
          cell('Blatt', tileLabel, 7),
        ],
        ...legendRow,
      ],
    },
    layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => '#475569', vLineColor: () => '#475569', paddingTop: () => 3, paddingBottom: () => 3 },
    margin: [0, 6, 0, 0],
  };
}

export function planDoc(tiles: PlanTile[], opts: PlanDocOptions, ctx: DocContext): DocDefinition {
  const area = drawableArea(ctx, opts);
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
