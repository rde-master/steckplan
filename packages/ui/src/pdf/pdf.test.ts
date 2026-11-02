import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyLibrary, createEmptyProject, EMPTY_FILTER, type Library, type Template } from '@steckplan/core';
import type { ProjectData } from '../lib/useProjectData';
import { drawableArea, pdfText, tilePlan, worldPerPtForScale, type DocDefinition } from './documents';
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
    expect(labels.text).toContain('Out –> Spot 6 · In (XLR 10 m, A5)');
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
