import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { loginAs, newContextPage } from './helpers';

async function pdfText(path: string): Promise<{ pages: number; text: string }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)) }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    text += content.items.map((x) => ('str' in x ? x.str : '')).join(' ') + '\n';
  }
  return { pages: pdf.numPages, text };
}

async function exportPdf(page: Page, document: string, configure?: () => Promise<void>): Promise<{ name: string; pages: number; text: string }> {
  await page.getByRole('button', { name: 'Exportieren' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Dokument').selectOption({ label: document });
  await configure?.();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '⇩ PDF' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  return { name: download.suggestedFilename(), ...(await pdfText(path)) };
}

test('Export: Packliste als PDF und CSV, Bühnenplan, WLAN-Aushang (Lese-Zugang ohne Passwort)', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const trailer = await (await page.request.post('/api/library/master/trailers', { data: { name: 'Hänger M7' } })).json();
  const spot = await (await page.request.post('/api/library/templates', { data: { template: { kind: 'device', name: 'Spot M7', shape: { form: 'rect', widthMm: 400, depthMm: 400 } } } })).json();
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 3,
        id: 'm7',
        meta: { name: 'Export-Test', venue: 'Stadthalle', date: '2026-09-12', planner: 'Ralf', version: '2' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: Array.from({ length: 6 }, (_, i) => ({
          id: `s${i}`,
          templateId: spot.id,
          layerId: 'l1',
          label: `Spot ${i + 1}`,
          ...(i < 4 ? { trailerId: trailer.id } : {}),
          stagePlan: { position: { x: i * 3000, y: 2000 }, rotationDeg: 0 },
          ...(i === 5 ? { check: { in: { at: '2026-09-13T23:00:00Z', by: 'Anna', status: 'missing', note: 'nicht zurück' } } } : {}),
        })),
        network: { subnets: [], wifi: [{ id: 'w1', ssid: 'Crew-M7', security: 'WPA2', hidden: false }] },
        secrets: { wifiPasswords: [{ wifiId: 'w1', password: 'pw-M7-geheim' }] },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=listen`);
  await expect(page.getByRole('button', { name: /× Spot M7/ }).first()).toBeVisible();

  // Packliste als PDF, gruppiert nach Anhänger
  const packing = await exportPdf(page, 'Packliste', async () => {
    await page.getByRole('dialog').getByLabel('Gruppieren nach').selectOption({ label: 'Anhänger' });
  });
  expect(packing.name).toBe('Export-Test - Packliste.pdf');
  expect(packing.text).toContain('Packliste');
  expect(packing.text).toContain('Hänger M7');
  expect(packing.text).toContain('ohne Anhänger');
  expect(packing.text).toContain('Fehlt / defekt');
  expect(packing.text).toContain('nicht zurück');
  expect(packing.text).toContain('Export-Test · Stadthalle · 12.09.2026');

  // dieselbe Liste als CSV
  await page.getByRole('button', { name: 'Exportieren' }).click();
  await page.getByRole('dialog').getByLabel('Dokument').selectOption({ label: 'Packliste' });
  const csvPromise = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: '⇩ CSV' }).click();
  const csv = readFileSync(await (await csvPromise).path(), 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('Bezeichnung;Typ;Länge;Kategorie;Besitzer;Anhänger');
  expect(csv).toContain('Spot 6;Spot M7;;;;;;;;fehlt;nicht zurück');
  await page.getByRole('dialog').getByRole('button', { name: 'Abbrechen' }).click();

  // Bühnenplan 1:50 auf A4 → mehrere Blätter
  const plan = await exportPdf(page, 'Bühnenplan', async () => {
    await page.getByRole('dialog').getByLabel('Maßstab').selectOption({ label: '1:50' });
  });
  expect(plan.pages).toBeGreaterThan(1);
  expect(plan.text).toContain('1:50');
  expect(plan.text).toContain('Spot 1');

  // WLAN-Aushang: Bearbeiten-Zugang mit Passwort
  const poster = await exportPdf(page, 'WLAN-Aushang');
  expect(poster.text).toContain('Crew-M7');
  expect(poster.text).toContain('pw-M7-geheim');

  // Lese-Zugang: darf drucken, aber ohne Passwort
  const anna = await newContextPage(browser);
  await loginAs(anna, 'read', 'Anna');
  await anna.goto(`/projekt/${id}`);
  const readPoster = await exportPdf(anna, 'WLAN-Aushang', async () => {
    await expect(anna.getByRole('dialog')).toContainText('kein Passwort im Klartext');
  });
  expect(readPoster.text).toContain('Crew-M7');
  expect(readPoster.text).not.toContain('pw-M7-geheim');
});
