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

test('Strom: Verteiler, Last je Abgang und Phase, Überlast, Leistung je Gerät, Stromliste', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Strom-Ralf');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const power = (id: string, label: string, direction: 'in' | 'out', extra: object = {}) => ({ id, label, connector: 'Schuko M10', direction, signal: 'Strom', isPower: true, ...extra });
  const hv = await post({
    kind: 'device',
    name: 'Verteiler M10',
    ports: [power('in', 'CEE 32', 'in', { connector: 'CEE 32 M10', fuseA: 32, phase: '3P' }), power('a1', 'A1', 'out', { fuseA: 16, phase: 'L1' }), power('a2', 'A2', 'out', { fuseA: 16, phase: 'L2' })],
  });
  const amp = await post({ kind: 'device', name: 'Endstufe M10', powerW: 3000, ports: [power('in', 'Netz', 'in')] });
  const d = (id: string, t: { id: string }, x: number) => ({ id, templateId: t.id, layerId: 'l1', label: id, signalFlow: { position: { x, y: 60 } } });
  const c = (id: string, from: [string, string], to: [string, string]) => ({ id, templateId: undefined, from: { deviceId: from[0], portId: from[1] }, to: { deviceId: to[0], portId: to[1] }, waypoints: [] });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 4,
        id: 'm10',
        meta: { name: 'Strom-Test' },
        layers: [{ id: 'l1', name: 'Strom', order: 0 }],
        devices: [d('HV', hv, 20), d('Amp 1', amp, 320), d('Amp 2', amp, 620)],
        cables: [c('k1', ['HV', 'a1'], ['Amp 1', 'in'])],
      },
    })
  ).json();

  // Bibliothek: Stromanschluss mit Absicherung und Phase sichtbar
  await page.goto('/bibliothek?bereich=device');
  await page.getByRole('button', { name: /^Verteiler M10/ }).click();
  await expect(page.getByLabel('Strom 1')).toBeChecked();
  await expect(page.getByLabel('Absicherung (A) 2')).toHaveValue('16');
  await expect(page.getByLabel('Phase 2')).toHaveValue('L1');

  // Stromliste: A1 mit Amp 1 (3000 W → 13,0 A, 82 %), Amp 2 ohne Anschluss
  await page.goto(`/projekt/${id}?ansicht=listen`);
  await page.getByRole('tab', { name: 'Strom' }).click();
  const hvSection = page.getByTestId('power-list').getByRole('region', { name: 'HV' });
  await expect(hvSection.getByTestId('outlet-row').first()).toContainText('Amp 1');
  await expect(hvSection.getByTestId('outlet-row').first()).toContainText('82 %');
  await expect(page.getByRole('region', { name: 'Ohne Stromanschluss' })).toContainText('Amp 2');

  // Leistung von Amp 1 im Projekt erhöhen → Überlast
  await page.getByRole('tab', { name: 'Signalfluss' }).click();
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.device').length ?? 0)).toBe(3);
  await clickDevice(page, 'Amp 1');
  const props = page.getByRole('complementary', { name: 'Eigenschaften' });
  await props.getByLabel('Leistung (W)').fill('4000');
  await expect.poll(async () => (await project(page.request, id)).devices.find((x: { id: string }) => x.id === 'Amp 1').powerW).toBe(4000);
  await page.getByRole('button', { name: /^Prüfungen/ }).click();
  await expect(page.getByRole('region', { name: 'Prüfungen' })).toContainText('HV · A1: Überlast – 17,4 A bei 16 A Absicherung.');

  // Stromliste als CSV
  await page.getByRole('button', { name: 'Exportieren' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Dokument').selectOption({ label: 'Stromliste' });
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '⇩ CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Strom-Test - Stromliste.csv');
});
