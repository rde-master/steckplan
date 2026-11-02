import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loginAs } from './helpers';

async function project(request: APIRequestContext, id: string) {
  return (await request.get(`/api/projects/${id}/download`)).json();
}

async function clickDevice(page: Page, label: string) {
  const pt = await page.evaluate((l) => {
    const stage = window.__steckplanStage!;
    const g = stage.find('.device').find((n) => (n as unknown as { findOne: (s: string) => { text(): string } }).findOne('Text').text() === l)!;
    const r = g.getClientRect();
    const b = stage.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + 12 };
  }, label);
  await page.mouse.click(pt.x, pt.y);
}

async function pdfText(path: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)) }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    text += content.items.map((x) => ('str' in x ? x.str : '')).join(' ') + '\n';
  }
  return text;
}

test('M8c: Stammdaten direkt anlegen, Vorlage kopieren, Personen, Gruppen, T-Bar, Lager, Cases, Etiketten', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');

  // ---------- Bibliothek: neues Gerät mit neuer Kategorie und neuem Case, benutzt von Mensch, Lager 1 ----------
  await page.goto('/bibliothek?bereich=device');
  await page.getByRole('button', { name: '＋ Neu: Gerät' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Funkmikro M8c');
  await page.getByRole('combobox', { name: 'Kategorie' }).selectOption({ label: '+ Kategorie neu anlegen …' });
  await page.getByLabel('Name (Kategorie)').fill('Funk M8c');
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Kategorie' })).toHaveValue(/.+/);
  await page.getByRole('combobox', { name: 'Standard-Case' }).selectOption({ label: '+ Case neu anlegen …' });
  await page.getByLabel('Name (Case)').fill('Mikrocase M8c');
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
  await page.getByLabel('Benutzt von Mensch').check();
  await page.getByLabel('Im Lager (Stück)').fill('1');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Gespeichert.')).toBeVisible();

  // Kopieren
  await page.getByRole('button', { name: 'Kopieren: Funkmikro M8c' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Funkmikro M8c (Kopie)');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Gespeichert.')).toBeVisible();

  const library = await (await page.request.get('/api/library')).json();
  const mic = library.templates.find((t: { name: string }) => t.name === 'Funkmikro M8c');
  const copy = library.templates.find((t: { name: string }) => t.name === 'Funkmikro M8c (Kopie)');
  const box = library.masterData.cases.find((c: { name: string }) => c.name === 'Mikrocase M8c');
  expect(mic).toMatchObject({ usedByPerson: true, stock: 1, defaultCaseId: box.id });
  expect(copy).toMatchObject({ usedByPerson: true, categoryId: mic.categoryId });
  expect(copy.id).not.toBe(mic.id);

  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const spot = await post({ kind: 'device', name: 'Spot M8c', shape: { form: 'rect', widthMm: 300, depthMm: 300 } });
  const stand = await post({ kind: 'stand', name: 'Stativ M8c', tBarLengthMm: 1000, shape: { form: 'circle', widthMm: 1600, depthMm: 1600, heightMm: 2500 } });

  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 4,
        id: 'm8c',
        meta: { name: 'M8c-Test' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [
          { id: 'mic1', templateId: mic.id, layerId: 'l1', label: 'Mikro 1', caseId: box.id, signalFlow: { position: { x: 40, y: 40 } } },
          { id: 'mic2', templateId: mic.id, layerId: 'l1', label: 'Mikro 2', caseId: box.id, signalFlow: { position: { x: 340, y: 40 } } },
          { id: 'st', templateId: stand.id, layerId: 'l1', label: 'Stativ 1', stagePlan: { position: { x: 5000, y: 3000 }, rotationDeg: 0 } },
          { id: 'sp1', templateId: spot.id, layerId: 'l1', label: 'Spot A', mountedOnId: 'st', stagePlan: { position: { x: 5000, y: 3000 }, rotationDeg: 0 } },
          { id: 'sp2', templateId: spot.id, layerId: 'l1', label: 'Spot B', mountedOnId: 'st', stagePlan: { position: { x: 5000, y: 3000 }, rotationDeg: 0 } },
        ],
      },
    })
  ).json();

  // ---------- Projektdaten: Person anlegen ----------
  await page.goto(`/projekt/${id}?ansicht=projektdaten`);
  await page.getByLabel('Name der neuen Person', { exact: true }).fill('Muster');
  await page.getByLabel('Vorname der neuen Person').fill('Anna');
  await page.getByLabel('Art der neuen Person').fill('Sängerin');
  await page.getByRole('button', { name: '＋ Person' }).click();
  await expect(page.getByTestId('people-table')).toBeVisible();

  // ---------- Signalfluss: Person zuordnen, Name im Kasten, Lagerwarnung, Gruppe ----------
  await page.getByRole('tab', { name: 'Signalfluss' }).click();
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.device').length ?? 0)).toBe(4);
  await clickDevice(page, 'Mikro 1');
  const props = page.getByRole('complementary', { name: 'Eigenschaften' });
  await props.getByRole('combobox', { name: 'Person' }).selectOption({ label: 'Anna Muster (Sängerin)' });
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.person-label').length ?? 0)).toBe(1);

  await page.getByRole('button', { name: /^Prüfungen/ }).click();
  await expect(page.getByRole('region', { name: 'Prüfungen' }).getByText('Funkmikro M8c: 2 verwendet, aber nur 1 im Lager.')).toBeVisible();
  await expect(props.getByText('Funkmikro M8c: 2 verwendet, aber nur 1 im Lager.')).toBeVisible();

  await page.keyboard.press('Control+a');
  await page.getByRole('button', { name: '▣ Gruppieren' }).click();
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.group-frame').length ?? 0)).toBe(1);
  await expect.poll(async () => (await project(page.request, id)).groups.length).toBe(1);

  // ---------- Bühnenplan: Stativ wählen, T-Bar verlängern → Spots nebeneinander ----------
  await page.getByRole('tab', { name: 'Bühnenplan' }).click();
  await expect.poll(() => page.evaluate(() => window.__steckplanStagePlan?.find('.t-bar').length ?? 0)).toBe(1);
  const standPoint = await page.evaluate(() => {
    const stage = window.__steckplanStagePlan!;
    const node = stage.findOne('#stage-device-st') as unknown as { findOne: (s: string) => { getClientRect(): { x: number; y: number; width: number; height: number } } };
    const r = node.findOne('Ellipse').getClientRect();
    const b = stage.container().getBoundingClientRect();
    // unterhalb der T-Bar, aber noch innerhalb der Grundfläche
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height * 0.8 };
  });
  await page.mouse.click(standPoint.x, standPoint.y);
  await expect(props.getByRole('heading', { name: 'Stativ 1' })).toBeVisible();
  await props.getByLabel('Länge der T-Bar').fill('2');
  await expect
    .poll(async () => {
      const p = await project(page.request, id);
      return p.devices.filter((d: { id: string }) => d.id.startsWith('sp')).map((d: { stagePlan: { position: { x: number } } }) => d.stagePlan.position.x).sort();
    })
    .toEqual([4500, 5500]);

  // ---------- Listen: Packliste mit Case und Person, Personenliste ----------
  await page.getByRole('tab', { name: 'Listen' }).click();
  await page.getByRole('combobox', { name: 'Gruppieren nach' }).selectOption({ label: 'Case' });
  await expect(page.getByRole('region', { name: 'Mikrocase M8c' })).toBeVisible();
  await expect(page.getByTestId('pack-info').filter({ hasText: 'Anna Muster' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Sortieren nach' }).selectOption({ label: 'Case' });
  await expect(page.getByTestId('pack-row').first()).toContainText('Funkmikro M8c');
  await page.getByRole('tab', { name: 'Cases' }).click();
  const caseList = page.getByTestId('case-lists').getByRole('region', { name: 'Mikrocase M8c' });
  await expect(caseList).toContainText('2 ×');
  await expect(caseList.getByTestId('case-progress')).toContainText('0');
  await caseList.getByRole('button', { name: /^Hin: Funkmikro M8c – 0 von 2/ }).click();
  await expect(caseList.getByRole('button', { name: /^Hin: Funkmikro M8c – 1 von 2/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Personen' }).click();
  await expect(page.getByRole('region', { name: 'Anna Muster' })).toContainText('Mikro 1');
  await expect(page.getByRole('region', { name: 'Noch keiner Person zugeordnet' })).toContainText('Mikro 2');

  // ---------- Etiketten als PDF ----------
  await page.getByRole('button', { name: 'Exportieren' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Dokument').selectOption({ label: 'Geräte-Etiketten' });
  await dialog.getByLabel('Etikettenbogen (A4)').selectOption({ index: 2 });
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '⇩ PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('M8c-Test - Geraete-Etiketten.pdf');
  const text = await pdfText((await download.path())!);
  expect(text).toContain('Mikro 1');
  expect(text).toContain('Anna Muster');
  expect(text).toContain('Person nicht zugeordnet');
});
