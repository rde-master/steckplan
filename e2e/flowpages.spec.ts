import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loginAs } from './helpers';

async function project(request: APIRequestContext, id: string) {
  return (await request.get(`/api/projects/${id}/download`)).json();
}

async function clickDevice(page: Page, label: string) {
  const pt = await page.evaluate((l) => {
    const stage = window.__steckplanStage!;
    const r = stage.findOne(`#device-${l}`)!.getClientRect();
    const b = stage.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + 10 };
  }, label);
  await page.mouse.click(pt.x, pt.y);
}

const deviceCount = (page: Page) => page.evaluate(() => window.__steckplanStage?.find('.device').length ?? 0);

test('Signalfluss-Seiten: anlegen, Geräte verschieben, Verweis anklicken, verwalten; Export mit Vorschau', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Seiten-Ralf');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const mic = await post({ kind: 'device', name: 'Mikro Seiten', ports: [{ id: 'o', label: 'Out', connector: 'XLR S', direction: 'out', signal: 'Audio' }] });
  const amp = await post({ kind: 'device', name: 'Amp Seiten', ports: [{ id: 'i', label: 'In', connector: 'XLR S', direction: 'in', signal: 'Audio' }] });
  const d = (id: string, t: { id: string }, x: number) => ({ id, templateId: t.id, layerId: 'l1', label: id, signalFlow: { position: { x, y: 60 } } });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 5,
        id: 'seiten',
        meta: { name: 'Seiten' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [d('Vox', mic, 40), d('Amp', amp, 400), d('Spot', amp, 760)],
        cables: [{ id: 'k', from: { deviceId: 'Vox', portId: 'o' }, to: { deviceId: 'Amp', portId: 'i' }, waypoints: [] }],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}`);
  await expect.poll(() => deviceCount(page)).toBe(3);

  // erste Seite anlegen: vorhandene Geräte kommen auf „Licht“, neue Seite „Ton“ ist aktiv und leer
  // „Neue Seite“ liegt im Dialog „Seiten verwalten“ (ohne Seiten ist das Formular gleich offen)
  await expect(page.getByRole('button', { name: 'Neue Seite' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Seiten verwalten' }).click();
  const dialog = page.getByRole('dialog', { name: 'Seiten verwalten' });
  const form = dialog.getByRole('region', { name: 'Neue Seite im Signalfluss' });
  await form.getByLabel('Name der Seite', { exact: true }).fill('Ton');
  await form.getByLabel('Name der Seite für die vorhandenen Geräte').fill('Licht');
  await form.getByRole('button', { name: 'Anlegen' }).click();
  await expect(dialog.getByTestId('flow-pages').locator('li')).toHaveCount(2);
  // weitere Seite: Formular ohne „vorhandene Geräte“
  await dialog.getByRole('button', { name: 'Neue Seite' }).click();
  await expect(form.getByLabel('Name der Seite für die vorhandenen Geräte')).toHaveCount(0);
  await form.getByRole('button', { name: 'Abbrechen' }).click();
  await dialog.getByRole('button', { name: 'Schließen' }).click();
  const tabs = page.getByRole('tablist', { name: 'Seiten' });
  await expect(tabs.getByRole('tab', { name: /^Ton/ })).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.getByRole('tab', { name: /^Licht/ })).toContainText('(3)');
  await expect.poll(() => deviceCount(page)).toBe(0);

  // Gerät auf „Ton“ anlegen
  await page.getByRole('button', { name: 'Hinzufügen: Mikro Seiten' }).click();
  await expect.poll(() => deviceCount(page)).toBe(1);
  await expect(tabs.getByRole('tab', { name: /^Ton/ })).toContainText('(1)');

  // Vox auf „Ton“ verschieben → auf „Licht“ steht am Amp ein Verweis
  await tabs.getByRole('tab', { name: /^Licht/ }).click();
  await expect.poll(() => deviceCount(page)).toBe(3);
  await clickDevice(page, 'Vox');
  const props = page.getByRole('complementary', { name: 'Eigenschaften' });
  await props.getByLabel('Seite im Signalfluss').selectOption({ label: 'Ton' });
  await expect.poll(() => deviceCount(page)).toBe(2);
  const refText = () => page.evaluate(() => window.__steckplanStage!.find('.page-ref').map((t) => (t as unknown as { text(): string }).text()));
  await expect.poll(refText).toEqual(['→ Ton: Vox']);

  // Verweis anklicken → Seite „Ton“, Vox ausgewählt
  const ref = await page.evaluate(() => {
    const stage = window.__steckplanStage!;
    const r = stage.findOne('.page-ref')!.getClientRect();
    const b = stage.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width - 20, y: b.top + r.y + r.height / 2 };
  });
  await page.mouse.click(ref.x, ref.y);
  await expect(tabs.getByRole('tab', { name: /^Ton/ })).toHaveAttribute('aria-selected', 'true');
  await expect(props.getByRole('heading', { name: 'Vox' })).toBeVisible();

  // Export mit Vorschau: zwei Blätter (je Seite)
  await page.getByRole('button', { name: 'Exportieren' }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Exportieren (PDF/CSV)' });
  await exportDialog.getByLabel('Dokument').selectOption({ label: 'Signalfluss' });
  await expect(exportDialog.getByTestId('preview-image')).toBeVisible({ timeout: 15_000 });
  await expect(exportDialog.getByTestId('preview-pages')).toHaveText('Seite 1 von 2');
  await exportDialog.getByRole('group', { name: 'Seiten des Signalflusses' }).getByLabel('Licht').uncheck();
  await expect(exportDialog.getByTestId('preview-pages')).toHaveText('Seite 1 von 1', { timeout: 15_000 });
  // CSV-Vorschau einer Liste
  await exportDialog.getByLabel('Dokument').selectOption({ label: 'Geräteliste' });
  await exportDialog.getByRole('radio', { name: 'CSV' }).click();
  await expect(exportDialog.getByTestId('preview-csv')).toContainText('Kennung');
  // Sortierung: Kennung absteigend → „Vox“ steht oben
  await exportDialog.getByLabel('Sortieren nach (1)').selectOption('Kennung');
  await exportDialog.getByRole('button', { name: 'aufsteigend (1)' }).click();
  await expect(exportDialog.getByTestId('preview-csv').locator('tr').nth(1)).toContainText('Vox');
  await expect(exportDialog.getByLabel('dann nach (2)')).toBeVisible();
  await exportDialog.getByRole('button', { name: 'Abbrechen' }).click();

  // verwalten: umbenennen, löschen (Geräte ziehen um)
  await page.getByRole('button', { name: 'Seiten verwalten' }).click();
  const manage = page.getByRole('dialog', { name: 'Seiten verwalten' });
  await manage.getByLabel('Name der Seite: Ton').fill('Audio');
  await manage.getByRole('button', { name: 'Löschen: Audio' }).click();
  await manage.getByRole('button', { name: 'Seite löschen' }).click();
  await expect(manage.getByTestId('flow-pages').locator('li')).toHaveCount(1);
  await expect.poll(async () => (await project(page.request, id)).flowPages.map((p: { name: string }) => p.name)).toEqual(['Licht']);
});
