import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyLibrary, createEmptyProject, EMPTY_FILTER, type Library, type Template } from '@steckplan/core';
import type { ProjectData } from '../lib/useProjectData';
import { drawableArea, fitText, LABEL_FORMATS, pdfText, textWidth, tilePlan, worldPerPtForScale, type DocDefinition } from './documents';
import { buildCsv, buildExportDoc, DEFAULT_OPTIONS, exportFileName, type ExportOptions } from './export';

const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake') as {
  addFonts(f: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(fn: () => boolean): void;
  setLocalAccessPolicy(fn: () => boolean): void;
  createPdf(d: DocDefinition): { getBuffer(): Promise<Uint8Array> };
};
const fontDir = join(dirname(require.resolve('pdfmake/package.json')), 'fonts/Roboto');
pdfmake.addFonts({ Roboto: { normal: join(fontDir, 'Roboto-Regular.ttf'), bold: join(fontDir, 'Roboto-Medium.ttf'), italics: join(fontDir, 'Roboto-Italic.ttf'), bolditalics: join(fontDir, 'Roboto-MediumItalic.ttf') } });
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(() => true);

async function render(doc: DocDefinition): Promise<{ pages: number; text: string }> {
  const buffer = await pdfmake.createPdf(doc).getBuffer();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    text += content.items.map((x) => ('str' in x ? x.str : '')).join(' ') + '\n';
  }
  return { pages: pdf.numPages, text };
}

interface TextItem {
  page: number;
  text: string;
  x: number;
  /** von oben gemessen */
  top: number;
  right: number;
  pageWidth: number;
  pageHeight: number;
}

/** Textstücke mit Position (pt), um Ränder zu prüfen; optional die PDF-Datei ablegen (STECKPLAN_PDF_OUT). */
async function renderItems(doc: DocDefinition, name: string): Promise<{ pages: number; items: TextItem[] }> {
  const buffer = await pdfmake.createPdf(doc).getBuffer();
  if (process.env.STECKPLAN_PDF_OUT) (await import('node:fs')).writeFileSync(join(process.env.STECKPLAN_PDF_OUT, `${name}.pdf`), buffer);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const items: TextItem[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const [, , pageWidth, pageHeight] = page.view as [number, number, number, number];
    for (const x of (await page.getTextContent()).items) {
      if (!('str' in x) || !x.str.trim()) continue;
      const [, , , , e, f] = x.transform as number[];
      items.push({ page: i, text: x.str, x: e!, top: pageHeight - f!, right: e! + x.width, pageWidth, pageHeight });
    }
  }
  return { pages: pdf.numPages, items };
}

const T0 = '2026-01-01T00:00:00.000Z';
const t = (x: Partial<Template> & Pick<Template, 'id' | 'kind' | 'name'>): Template => ({ version: 1, updatedAt: T0, ...x });

function setup(): { data: ProjectData; library: Library } {
  const library: Library = {
    ...createEmptyLibrary('l'),
    templates: [
      t({ id: 'mic', kind: 'device', name: 'Funkmikro', usedByPerson: true, ports: [{ id: 'o', label: 'Out', connector: 'XLR', direction: 'out', signal: 'Audio' }] }),
      t({ id: 'spot', kind: 'device', name: 'Spot Ü', categoryId: 'licht', defaultColor: '#f59e0b', shape: { form: 'rect', widthMm: 400, depthMm: 400 }, ports: [{ id: 'o', label: 'Out', connector: 'XLR', direction: 'out', signal: 'DMX' }, { id: 'i', label: 'In', connector: 'XLR', direction: 'in', signal: 'DMX' }], dmxModes: [{ name: '16ch', channels: 16 }] }),
      t({ id: 'pultT', kind: 'device', name: 'Digitalpult', mixer: true, ports: [{ id: 'i1', label: 'In 1', connector: 'XLR', direction: 'in', signal: 'Audio' }, { id: 'i2', label: 'In 2', connector: 'XLR', direction: 'in', signal: 'Audio' }, { id: 'o1', label: 'Mix 1', connector: 'XLR', direction: 'out', signal: 'Audio' }] }),
      t({ id: 'hvT', kind: 'device', name: 'Verteiler', ports: [{ id: 'in', label: 'CEE 32', connector: 'CEE 32', direction: 'in', signal: 'Strom', isPower: true, fuseA: 32, phase: '3P' }, { id: 'a1', label: 'A1', connector: 'Schuko', direction: 'out', signal: 'Strom', isPower: true, fuseA: 16, phase: 'L1' }] }),
      t({ id: 'amp', kind: 'device', name: 'Endstufe', powerW: 4000, ports: [{ id: 'in', label: 'Netz', connector: 'Schuko', direction: 'in', signal: 'Strom', isPower: true }] }),
      t({ id: 'stand', kind: 'stand', name: 'Stativ', shape: { form: 'circle', widthMm: 1200, depthMm: 1200, heightMm: 3000 } }),
      t({ id: 'xlr', kind: 'cableType', name: 'XLR', connectorA: 'XLR', connectorB: 'XLR', availableLengthsMm: [5000, 10000, 20000, 50000] }),
    ],
    masterData: { categories: [{ id: 'licht', name: 'Licht', color: '#f59e0b' }], owners: [{ id: 'r', name: 'Ralf' }], trailers: [{ id: 'h', name: 'Hänger 1' }], cases: [{ id: 'k', name: 'Kabelcase 1', defaultTrailerId: 'h' }] },
  };
  const project = createEmptyProject({ name: 'Stadtfest', meta: { venue: 'Marktplatz', date: '2026-07-04', planner: 'Ralf', version: '3' } });
  const devices = Array.from({ length: 60 }, (_, i) => ({
    id: `d${i}`,
    templateId: 'spot',
    layerId: project.layers[0]!.id,
    label: `Spot ${i + 1}`,
    trailerId: i % 2 ? 'h' : undefined,
    ownerId: 'r',
    stagePlan: { position: { x: (i % 10) * 2000, y: Math.floor(i / 10) * 2000 }, rotationDeg: 0 },
    signalFlow: { position: { x: (i % 10) * 220, y: Math.floor(i / 10) * 120 } },
    dmx: { modeName: '16ch', universe: 1, address: 1 + i * 16 },
  }));
  const mics = [
    { id: 'm1', templateId: 'mic', layerId: project.layers[0]!.id, label: 'Mikro 1', personId: 'anna' },
    { id: 'm2', templateId: 'mic', layerId: project.layers[0]!.id, label: 'Mikro 2' },
  ];
  const data: ProjectData = {
    devices: [...devices, ...mics, { id: 'pult', templateId: 'pultT', layerId: project.layers[0]!.id, label: 'FOH' }, { id: 'hv', templateId: 'hvT', layerId: project.layers[0]!.id, label: 'HV 1' }, { id: 'amp1', templateId: 'amp', layerId: project.layers[0]!.id, label: 'Endstufe 1' }, { id: 's', templateId: 'stand', layerId: project.layers[0]!.id, label: 'Stativ 1', stagePlan: { position: { x: 0, y: 14000 }, rotationDeg: 0 } }],
    cables: [
      ...devices.slice(0, 20).map((d, i) => ({ id: `c${i}`, templateId: 'xlr', from: { deviceId: d.id, portId: 'o' }, to: { deviceId: devices[i + 1]!.id, portId: 'i' }, waypoints: [], ...(i === 0 ? { check: { in: { at: T0, by: 'Anna', status: 'damaged' as const, note: 'Knick' } } } : {}), ...(i === 1 ? { caseId: 'k' } : {}) })),
      { id: 'cm', templateId: 'xlr', from: { deviceId: 'm1', portId: 'o' }, to: { deviceId: 'd5', portId: 'i' }, waypoints: [], manualLengthMm: 10000, label: 'A5' },
      { id: 'cs', templateId: 'xlr', from: { deviceId: 'hv', portId: 'a1' }, to: { deviceId: 'amp1', portId: 'in' }, waypoints: [], manualLengthMm: 5000 },
      { id: 'cp', templateId: 'xlr', from: { deviceId: 'm2', portId: 'o' }, to: { deviceId: 'pult', portId: 'i1' }, waypoints: [], manualLengthMm: 5000 },
    ],
    layers: project.layers,
    shapes: [{ id: 'w', kind: 'wall', layerId: project.layers[0]!.id, points: [{ x: -1000, y: -1000 }, { x: 20000, y: -1000 }], rotationDeg: 0, strokeWidthMm: 200 }],
    background: undefined,
    settings: project.settings,
    network: { subnets: [], wifi: [{ id: 'w1', ssid: 'Crew-Netz', security: 'WPA2', hidden: false }] },
    people: [{ id: 'anna', lastName: 'Muster', firstName: 'Anna', kind: 'Sängerin' }],
    groups: [],
    caseTrailers: [],
    patch: [{ id: 'pult:i1', name: 'Lead Vox' }],
    flowPages: [],
    show: { items: [], sections: [] },
    showSettings: {},
    media: [],
    lightGrid: { cols: 12, rows: 6, rowLabels: [] },
    lightPlacements: [],
    lightTargets: [],
    lightScenes: [],
    sceneStates: [],
    soundScenes: [],
    gigs: [],
    helperSignups: [],
    helperMessages: [],
    handovers: [],
    trailerTrips: [],
  };
  return { data, library };
}

const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h3v3H0z M7 0h3v3H7z M0 7h3v3H0z" fill="#000"/></svg>';

async function exportDoc(overrides: Partial<ExportOptions>, passwords?: Record<string, string>) {
  const { data, library } = setup();
  return buildExportDoc(
    { ...DEFAULT_OPTIONS, ...overrides },
    { data, library, meta: { name: 'Stadtfest', venue: 'Marktplatz', date: '2026-07-04', planner: 'Ralf', version: '3' }, filter: EMPTY_FILTER, colorMode: 'device', issues: [], appTitle: 'Steckplan 0.8.0', by: 'Ralf', fetchQr: async () => QR_SVG, ...(passwords ? { passwords } : {}), now: new Date(T0) },
  );
}

describe('Kacheln für große Pläne', () => {
  it('teilt nach Maßstab auf, mit Überlappung', () => {
    const area = drawableArea({ format: 'A4', orientation: 'landscape' });
    const bounds = { x: 0, y: 0, width: 40000, height: 20000 }; // 40 × 20 m
    const tiles = tilePlan(bounds, area, worldPerPtForScale(50));
    // 1:50 → 1 m = 20 mm; A4 quer ≈ 271 × 155 mm Zeichenfläche → ≈ 13,6 × 7,7 m pro Blatt
    expect(tiles.length).toBe(tiles[0]!.rows * tiles[0]!.cols);
    expect(tiles[0]!.cols).toBe(4);
    expect(tiles[0]!.rows).toBe(3);
    expect(tiles[1]!.view.x).toBeLessThan(tiles[0]!.view.x + tiles[0]!.view.width); // Überlappung
    expect(tilePlan(bounds, area, worldPerPtForScale(200))).toHaveLength(1);
  });

  it('Logo im Kopf jeder Seite und im Schriftfeld der Pläne', async () => {
    const doc = (await exportDoc({ kind: 'cables' })) as { header: () => { columns: { image?: string }[] } };
    expect(doc.header().columns[0]!.image).toMatch(/^data:image\/png;base64,/);
    const plan = JSON.stringify(await exportDoc({ kind: 'stageplan', scale: 'fill' }));
    expect(plan).toContain('data:image/png;base64,');
  });

  it('ersetzt fehlende Zeichen', () => expect(pdfText('A → B ✓ ☐')).toBe('A –> B x '));
});

describe('PDF-Export', () => {
  it('Packliste: Gruppen, Unterschrift, Fehlt/defekt, mehrere Seiten', async () => {
    const { pages, text } = await render(await exportDoc({ kind: 'packing', groupBy: 'trailer', mode: 'single' }));
    expect(pages).toBeGreaterThan(1);
    expect(text).toContain('Packliste');
    expect(text).toContain('Hänger 1');
    expect(text).toContain('ohne Anhänger');
    expect(text).toContain('Gepackt (Hin)');
    expect(text).toContain('Fehlt / defekt');
    expect(text).toContain('Knick');
    expect(text).toContain('Seite 1 von');
    expect(text).toContain('Stadtfest · Marktplatz · 04.07.2026');
    // Fußzeile: Version, was exportiert wurde, Datum und Uhrzeit, von wem
    expect(text).toMatch(/Steckplan 0\.8\.0 · Packliste · erstellt am 01\.01\.2026, \d{2}:\d{2} Uhr von Ralf/);
  });

  it('Bühnenplan 1:50 auf mehrere Blätter, „Seite füllen“ auf eines', async () => {
    const tiled = await render(await exportDoc({ kind: 'stageplan', scale: 50, format: 'A4', orientation: 'landscape' }));
    expect(tiled.pages).toBeGreaterThan(1);
    expect(tiled.text).toContain('1:50');
    expect(tiled.text).toMatch(/1 von \d+ \(Zeile 1, Spalte 1\)/);
    expect(tiled.text).toContain('Spot 1');
    const fill = await render(await exportDoc({ kind: 'stageplan', scale: 'fill' }));
    expect(fill.pages).toBe(1);
    expect(fill.text).toContain('Seite füllen');
    expect(fill.text).toContain('Licht'); // Legende
  });

  it('Signalfluss: je Seite ein Blatt, Seiten wählbar, Verweise auf andere Seiten', async () => {
    const { data, library } = setup();
    const paged: ProjectData = {
      ...data,
      flowPages: [
        { id: 'licht', name: 'Licht', order: 0 },
        { id: 'ton', name: 'Ton', order: 1 },
      ],
      devices: data.devices.map((d) => (d.id === 'm1' || d.id === 'm2' || d.id === 'pult' ? { ...d, signalFlow: { position: { x: 40, y: 40 }, pageId: 'ton' } } : d)),
    };
    const make = (flowPageIds: string[]) =>
      buildExportDoc({ ...DEFAULT_OPTIONS, kind: 'signalflow', flowPageIds }, { data: paged, library, meta: { name: 'Stadtfest' }, filter: EMPTY_FILTER, colorMode: 'device', issues: [], appTitle: 'Steckplan', by: 'Ralf', fetchQr: async () => QR_SVG, now: new Date(T0) });
    const both = await render(await make([]));
    expect(both.pages).toBe(2);
    expect(both.text).toContain('Licht (1 von 2)');
    expect(both.text).toContain('Ton (2 von 2)');
    // Mikro 1 (Ton) ist mit Spot 6 (Licht) verbunden → Verweis
    expect(both.text).toContain('–> Licht: Spot 6');
    const onlyTon = await render(await make(['ton']));
    expect(onlyTon.pages).toBe(1);
    expect(onlyTon.text).toContain('Ton (1 von 1)');
  });

  it('Signalfluss auf einer Seite', async () => {
    const { pages, text } = await render(await exportDoc({ kind: 'signalflow' }));
    expect(pages).toBe(1);
    expect(text).toContain('Signalfluss');
    expect(text).toContain('ohne Maßstab');
  });

  it('Listen: Kabel, Stück, DMX, Geräte, Netzwerk', async () => {
    const cables = (await render(await exportDoc({ kind: 'cables' }))).text;
    expect(cables).toContain('20 × XLR 5 m'); // 18 Spot-Kabel + Mikro zum Pult + Strom zur Endstufe
    expect(cables).toContain('2 × XLR 50 m');
    expect(cables.indexOf('Spot 2 · Out')).toBeLessThan(cables.indexOf('Spot 10 · Out')); // natürliche Sortierung
    expect((await render(await exportDoc({ kind: 'bom' }))).text).toContain('Spot Ü');
    expect((await render(await exportDoc({ kind: 'dmx' }))).text).toContain('1.017');
    expect((await render(await exportDoc({ kind: 'devices' }))).text).toContain('Stativ 1');
    expect((await render(await exportDoc({ kind: 'network' }))).text).toContain('Keine Einträge');
  });

  it('Planköpfchen: viele Kategorien mehrzeilig (höchstens 3 Zeilen), nichts über den Rand', async () => {
    const { data, library } = setup();
    const categories = Array.from({ length: 45 }, (_, i) => ({ id: `k${i}`, name: `Kategorie mit langem Namen ${i + 1}`, color: `#${(0x123456 + i * 0x0a0b0c).toString(16).slice(-6)}` }));
    library.masterData.categories.push(...categories);
    library.templates.push(...categories.map((c) => t({ id: `t-${c.id}`, kind: 'device', name: `Gerät ${c.id}`, categoryId: c.id, shape: { form: 'rect', widthMm: 400, depthMm: 400 }, ports: [] })));
    data.devices.push(...categories.map((c, i) => ({ id: `x${i}`, templateId: `t-${c.id}`, layerId: data.layers[0]!.id, label: `X ${i}`, stagePlan: { position: { x: i * 500, y: 20000 }, rotationDeg: 0 }, signalFlow: { position: { x: i * 220, y: 900 } } })));
    const input = { data, library, meta: { name: 'Stadtfest', venue: 'Marktplatz', date: '2026-07-04', planner: 'Ralf', version: '3' }, filter: EMPTY_FILTER, colorMode: 'device' as const, issues: [], appTitle: 'Steckplan 0.8.0', by: 'Ralf', fetchQr: async () => QR_SVG, now: new Date(T0) };
    for (const [kind, orientation] of [
      ['stageplan', 'portrait'],
      ['stageplan', 'landscape'],
      ['signalflow', 'portrait'],
    ] as const) {
      const { pages, items } = await renderItems(await buildExportDoc({ ...DEFAULT_OPTIONS, kind, scale: 'fill', format: 'A4', orientation }, input), `plan-${kind}-${orientation}`);
      expect(pages, `${kind} ${orientation}`).toBe(1);
      expect(items.map((i) => i.text).join(' ')).toMatch(/\+ \d+ weitere/);
      for (const item of items) {
        expect(item.x, item.text).toBeGreaterThanOrEqual(30);
        expect(item.right, item.text).toBeLessThanOrEqual(item.pageWidth - 30);
        expect(item.top, item.text).toBeLessThanOrEqual(item.pageHeight - 4);
      }
    }
  });

  it('Fußzeile: höchstens zwei Zeilen, auch bei langem Namen', async () => {
    const { data, library } = setup();
    const input = { data, library, meta: { name: 'Stadtfest' }, filter: EMPTY_FILTER, colorMode: 'device' as const, issues: [], appTitle: 'Steckplan 0.8.0', by: 'Jemand mit einem wirklich sehr sehr langen Namen '.repeat(6), fetchQr: async () => QR_SVG, now: new Date(T0) };
    const { items } = await renderItems(await buildExportDoc({ ...DEFAULT_OPTIONS, kind: 'devices', format: 'A4', orientation: 'portrait' }, input), 'footer');
    const footer = items.filter((i) => i.page === 1 && i.top > i.pageHeight - 38);
    expect(footer.length).toBeGreaterThan(0);
    for (const item of footer) {
      expect(item.top, item.text).toBeLessThanOrEqual(item.pageHeight - 4);
      expect(item.right, item.text).toBeLessThanOrEqual(item.pageWidth - 30);
    }
  });

  it('Geräte-Etiketten: Sicherheitsabstand zum Etiketten- und Blattrand, auch bei langen Texten', async () => {
    const { data, library } = setup();
    data.people[0]!.firstName = 'Anna-Maria Konstanze';
    data.people[0]!.kind = 'Sängerin und Gitarristin im Hintergrundchor';
    data.devices.find((d) => d.id === 'm1')!.label = 'Funkmikrofon Hauptgesang links Bühnenrand';
    data.devices.find((d) => d.id === 'd5')!.label = 'Stagebox Bühne links hinten neben dem Schlagzeugpodest';
    data.cables.push(...Array.from({ length: 12 }, (_, i) => ({ id: `extra${i}`, templateId: 'xlr', from: { deviceId: 'm1', portId: 'o' }, to: { deviceId: `d${10 + i}`, portId: 'i' }, waypoints: [], manualLengthMm: 20000, label: `Sehr lange Kabelbezeichnung ${i}` })));
    for (const formatId of ['70x37', '63x38', '105x48', '105x74']) {
      const format = LABEL_FORMATS.find((f) => f.id === formatId)!;
      // mit Fußzeile: Logo, Projektname, QR-Code und Hinweis
      const input = {
        data,
        library,
        meta: { name: 'Stadtfest am Marktplatz mit sehr langem Projektnamen' },
        filter: EMPTY_FILTER,
        colorMode: 'device' as const,
        issues: [],
        appTitle: 'Steckplan 0.8.0',
        by: 'Ralf',
        fetchQr: async () => QR_SVG,
        now: new Date(T0),
        labelQr: { base: 'https://steckplan.example.de', token: 'abc123', hint: 'Aktuelle Informationen finden Sie hier.' },
      };
      const doc = await buildExportDoc({ ...DEFAULT_OPTIONS, kind: 'labels', labelFormat: formatId, cutLines: true }, input);
      // je Etikett ein QR-Code mit dem Gerät
      const qrs = JSON.stringify(doc).match(/"qr":"[^"]+"/g) ?? [];
      expect(qrs, formatId).toContain('"qr":"https://steckplan.example.de/s/abc123?g=m1"');
      const { items } = await renderItems(doc, `labels-${formatId}`);
      const all = items.map((i) => i.text).join(' ');
      expect(all, formatId).toContain('Stadtfest');
      if (formatId !== '70x37') expect(all, formatId).toContain('Aktuelle Informationen');
      const mm = 72 / 25.4;
      for (const item of items) {
        expect(item.x, `${formatId}: ${item.text}`).toBeGreaterThanOrEqual(5 * mm - 0.5);
        expect(item.right, `${formatId}: ${item.text}`).toBeLessThanOrEqual(item.pageWidth - 5 * mm + 0.5);
        // innerhalb des eigenen Etiketts (mit Abstand)
        const col = Math.floor((item.x / mm - format.marginLeftMm) / (format.widthMm + format.gapXMm));
        const right = (format.marginLeftMm + col * (format.widthMm + format.gapXMm) + format.widthMm - 3) * mm;
        expect(item.right, `${formatId}: ${item.text}`).toBeLessThanOrEqual(right + 0.5);
        const row = Math.floor(((item.top - 2) / mm - format.marginTopMm) / (format.heightMm + format.gapYMm));
        const bottom = (format.marginTopMm + row * (format.heightMm + format.gapYMm) + format.heightMm - 3) * mm;
        expect(item.top, `${formatId}: ${item.text}`).toBeLessThanOrEqual(bottom + 1);
      }
      // nur der erste Steckplatz, vollständig (umbrochen) – nirgends „…“
      expect(all, formatId).not.toMatch(/weitere/);
      expect(all, formatId).not.toContain('…');
      for (const word of ['Stagebox', 'Bühne', 'links', 'hinten', 'neben', 'Schlagzeugpodest', 'In']) expect(all, `${formatId}: ${word}`).toContain(word);
      expect(all, formatId).not.toContain('Sehr lange Kabelbezeichnung');
    }
  });

  it('Regie: Ablaufplan, Lichtszenen (Raster + Tabelle), Textbuch mit Szenenwechseln am Rand', async () => {
    const { data, library } = setup();
    library.templates.push(t({ id: 'mh', kind: 'device', name: 'Moving Head', light: { showInScenes: true, dimmer: true, colorMixing: 'none', colorWheels: [{ name: 'Rad', colors: [{ name: 'Rot', hex: '#ff0000' }] }], goboWheels: [{ name: 'Gobos', rotating: true, gobos: ['Sterne'] }], moving: { panDeg: 540, tiltDeg: 270 } } }));
    data.devices.push({ id: 'mh1', templateId: 'mh', layerId: data.layers[0]!.id, label: 'MH 1' }, { id: 'mh2', templateId: 'mh', layerId: data.layers[0]!.id, label: 'MH 2' });
    data.people[0]!.kind = 'Sängerin';
    data.showSettings = { startTime: '19:30' };
    data.show = {
      items: [
        { id: 'a', order: 0, kind: 'song', title: 'Opener', artist: 'Band', durationSec: 220, personIds: ['anna'] },
        { id: 'b', order: 1, kind: 'break', title: 'Pause', durationSec: 900, personIds: [] },
        { id: 'c', order: 2, kind: 'play', title: 'Die Begegnung', durationSec: 480, personIds: [], roles: [{ id: 'r1', name: 'Hamlet', personId: 'anna' }, { id: 'r2', name: 'Ophelia' }] },
      ],
      sections: [
        { id: 's1', itemId: 'a', order: 0, kind: 'verse', label: 'Strophe 1', lines: [{ id: 'l1', text: 'Es war einmal', atSec: 1 }, { id: 'l2', text: 'ein kleiner Ton', atSec: 5 }] },
        { id: 's2', itemId: 'c', order: 0, kind: 'scene', label: 'Szene 1', lines: [{ id: 'p1', text: 'Sein oder nicht sein', roleId: 'r1' }, { id: 'p2', text: 'Ophelia tritt auf', direction: true }, { id: 'p3', text: 'Mein Prinz!', roleId: 'r2' }] },
      ],
    };
    data.lightGrid = { cols: 2, rows: 1, rowLabels: ['Traverse'] };
    data.lightPlacements = [{ id: 'mh1', col: 0, row: 0 }];
    data.lightTargets = [{ id: 'z', order: 0, name: 'Sängerin', color: '#e11d48' }];
    data.lightScenes = [
      { id: 'x1', itemId: 'a', order: 0, name: 'Intro', atSec: 0 },
      { id: 'x2', itemId: 'a', order: 1, name: 'Strophe', lineId: 'l2' },
      { id: 'x3', itemId: 'c', order: 0, name: 'Auftritt', lineId: 'p2' },
    ];
    data.sceneStates = [
      { id: 'x1:mh1', sceneId: 'x1', deviceId: 'mh1', dimmer: 80, color: { hex: '#ff0000', name: 'Rot' }, gobo: { wheel: 0, name: 'Sterne', rotate: 'cw' }, targetId: 'z', effect: { kind: 'circle', speed: 'slow' } },
      { id: 'x1:mh2', sceneId: 'x1', deviceId: 'mh2', dimmer: 0 },
    ];
    const input = { data, library, meta: { name: 'Stadtfest' }, filter: EMPTY_FILTER, colorMode: 'device' as const, issues: [], appTitle: 'Steckplan 0.8.0', by: 'Ralf', fetchQr: async () => QR_SVG, now: new Date(T0) };
    const text = async (kind: 'showPlan' | 'lightScenes' | 'scriptBook', orientation: 'portrait' | 'landscape') => {
      const { pages, items } = await renderItems(await buildExportDoc({ ...DEFAULT_OPTIONS, kind, format: 'A4', orientation }, input), kind);
      for (const item of items) expect(item.right, `${kind}: ${item.text}`).toBeLessThanOrEqual(item.pageWidth - 30);
      return { pages, all: items.map((i) => i.text).join(' ') };
    };
    const plan = await text('showPlan', 'portrait');
    expect(plan.all).toContain('Beginn 19:30');
    expect(plan.all).toContain('Gesamt 26:40');
    expect(plan.all).toMatch(/19:33.*Pause/);
    expect(plan.all).toContain('Anna Muster');
    const scenes = await text('lightScenes', 'landscape');
    expect(scenes.all).toContain('Szene 1: Intro');
    expect(scenes.all).toContain('bei „ein kleiner Ton“ (0:05)');
    expect(scenes.all).toContain('Sterne (rechts herum)');
    expect(scenes.all).toContain('Kreis, langsam');
    expect(scenes.all).toContain('Nicht im Raster'); // MH 2 hat keinen Platz
    expect(scenes.pages).toBe(2); // je Eintrag mit Szenen eine Seite
    const book = await text('scriptBook', 'portrait');
    expect(book.all).toContain('Hamlet: ');
    expect(book.all).toContain('(Ophelia tritt auf)');
    expect(book.all).toContain('Szene 2: Strophe');
    expect(book.all).toContain('Szene 1: Intro (0:00)');
    expect(book.all).toContain('Hamlet – Anna Muster');
  });

  it('Personenliste und Geräte-Etiketten', async () => {
    const people = (await render(await exportDoc({ kind: 'people' }))).text;
    expect(people).toContain('Muster, Anna');
    expect(people).toContain('Sängerin');
    expect(people).toContain('Spot 6 · In');
    expect(people).toContain('(nicht zugeordnet)');
    const labels = await render(await exportDoc({ kind: 'labels', labelFormat: '105x48', cutLines: true }));
    expect(labels.pages).toBe(1);
    expect(labels.text).toContain('Mikro 1');
    expect(labels.text).toContain('Anna Muster');
    expect(labels.text).toContain('Out');
    expect(labels.text).toContain('Spot 6 · In');
    expect(labels.text).toContain('XLR 10 m, A5');
    expect(labels.text).toContain('Person nicht zugeordnet');
  });

  it('Input-/Output-Liste je Mischpult', async () => {
    const { pages, text } = await render(await exportDoc({ kind: 'patch' }));
    expect(pages).toBe(2);
    expect(text).toContain('Input-Liste – FOH');
    expect(text).toContain('Lead Vox');
    expect(text).toContain('Mikro 2');
    expect(text).toContain('offen');
    expect(text).toContain('Output-Liste – FOH');
  });

  it('Stromliste mit Überlast', async () => {
    const { text } = await render(await exportDoc({ kind: 'power' }));
    expect(text).toContain('Stromliste');
    expect(text).toContain('HV 1');
    expect(text).toContain('Endstufe 1');
    expect(text).toContain('17,4 A');
    expect(text).toContain('109 % !');
  });

  it('Case-Listen: je Case eine Seite mit Inhalt und Anhänger', async () => {
    const { pages, text } = await render(await exportDoc({ kind: 'cases', orientation: 'portrait' }));
    expect(pages).toBe(1);
    expect(text).toContain('Kabelcase 1');
    expect(text).toContain('Anhänger: Hänger 1');
    expect(text).toContain('XLR');
    expect(text).toContain('Gepackt (Hin)');
    const sorted = (await render(await exportDoc({ kind: 'packing', groupBy: 'trailer', sortBy: 'case' }))).text;
    expect(sorted).toContain('sortiert nach Case');
  });

  it('Packliste mit Case-Spalte und Gruppierung nach Case', async () => {
    const { text } = await render(await exportDoc({ kind: 'packing', groupBy: 'trailer', thenBy: 'case' }));
    expect(text).toContain('Kabelcase 1');
    expect(text).toContain('nicht im Case');
    expect(text).toContain('Anna Muster');
  });

  it('Tabellen sortierbar (mehrstufig, auf-/absteigend)', async () => {
    const asc = (await render(await exportDoc({ kind: 'devices', sort: [{ column: 'Kennung' }] }))).text;
    expect(asc.indexOf('Endstufe 1')).toBeLessThan(asc.indexOf('FOH'));
    const desc = (await render(await exportDoc({ kind: 'devices', sort: [{ column: 'Kennung', desc: true }] }))).text;
    expect(desc.indexOf('Stativ 1')).toBeLessThan(desc.indexOf('Endstufe 1'));
    const cables = (await render(await exportDoc({ kind: 'cables', sort: [{ column: 'Gewählt', desc: true }, { column: 'Von' }] }))).text;
    expect(cables.indexOf('Spot 10 · Out')).toBeLessThan(cables.indexOf('Spot 1 · Out'));
  });

  it('WLAN-Aushang: Passwort nur, wenn vorhanden und gewünscht', async () => {
    const withPw = await render(await exportDoc({ kind: 'wifi', format: 'A4', orientation: 'portrait' }, { w1: 'ge;heim' }));
    expect(withPw.text).toContain('Crew-Netz');
    expect(withPw.text).toContain('ge;heim');
    const without = await render(await exportDoc({ kind: 'wifi', printPassword: false }, { w1: 'ge;heim' }));
    expect(without.text).not.toContain('ge;heim');
    const readOnly = await render(await exportDoc({ kind: 'wifi' }));
    expect(readOnly.text).not.toContain('Passwort');
  });
});

describe('CSV und Dateinamen', () => {
  it('CSV gefiltert wie auf dem Bildschirm', () => {
    const { data, library } = setup();
    const csv = buildCsv('packing', data, library, { ...EMPTY_FILTER, trailers: ['h'] });
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1 + 31); // Kopf + 30 Spots mit Anhänger + 1 Kabel im Case dieses Anhängers
    expect(buildCsv('dmx', data, library, EMPTY_FILTER)).toContain('1;17;32;Spot 2');
  });

  it('Dateiname nur ASCII (Browser verwerfen sonst Umlaute beim Download)', () => {
    expect(exportFileName({ name: 'Fest: Süd/Nord' }, 'packing', 'pdf')).toBe('Fest_ Sued_Nord - Packliste.pdf');
    expect(exportFileName({ name: 'Straße – Bühne Ø' }, 'stageplan', 'pdf')).toBe('Strasse - Buehne - Buehnenplan.pdf');
    expect(exportFileName({ name: '' }, 'wifi', 'pdf')).toBe('Projekt - WLAN-Aushang.pdf');
  });
});

describe('Textbreite schätzen und kürzen', () => {
  it('kürzt mit „…“ auf die verfügbare Breite, lässt Passendes unverändert', () => {
    expect(fitText('Kurz', 8, 100)).toBe('Kurz');
    const cut = fitText('Ein sehr langer Gerätename, der nicht passt', 8, 60);
    expect(cut.endsWith('…')).toBe(true);
    expect(textWidth(cut, 8)).toBeLessThanOrEqual(60);
    expect(fitText('Egal', 8, 1)).toBe('');
  });
});
