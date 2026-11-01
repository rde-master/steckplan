import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loginAs, newContextPage } from './helpers';

async function nodeCenter(page: Page, selector: string, index = 0): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([sel, i]) => {
      const stage = window.__steckplanStagePlan!;
      const node = stage.find(sel as string)[i as number];
      if (!node) throw new Error(`nicht gefunden: ${sel}`);
      const r = node.getClientRect();
      const b = stage.container().getBoundingClientRect();
      return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 };
    },
    [selector, index] as const,
  );
}

async function project(request: APIRequestContext, id: string) {
  return (await request.get(`/api/projects/${id}/download`)).json();
}

test('Kabellänge, Knickpunkte, Kabelliste, Packliste abhaken (auch Lese-Zugang), zurücksetzen, Kopie', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const trailer = await (await page.request.post('/api/library/master/trailers', { data: { name: 'Hänger M5' } })).json();
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const mic = await post({ kind: 'device', name: 'Mikro M5', ports: [{ id: 'out', label: 'Out', connector: 'XLR 3', direction: 'out', signal: 'Audio' }] });
  const box = await post({ kind: 'device', name: 'Box M5', ports: [{ id: 'in', label: 'In', connector: 'XLR 3', direction: 'in', signal: 'Audio' }] });
  const xlr = await post({ kind: 'cableType', name: 'XLR M5', connectorA: 'XLR 3', connectorB: 'XLR 3', availableLengthsMm: [5000, 10000, 20000] });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 3,
        id: 'm5-e2e',
        meta: { name: 'Logistik-Test', date: '2026-08-01', version: '4' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        settings: { gridMm: 500, snap: true, defaultReservePercent: 10, defaultReservePerEndMm: 500 },
        devices: [
          { id: 'mic', templateId: mic.id, layerId: 'l1', label: 'Mikro 1', trailerId: trailer.id, stagePlan: { position: { x: 2000, y: 2000 }, rotationDeg: 0 } },
          { id: 'box', templateId: box.id, layerId: 'l1', label: 'Box 1', stagePlan: { position: { x: 10000, y: 2000 }, rotationDeg: 0 } },
        ],
        cables: [{ id: 'k1', templateId: xlr.id, trailerId: trailer.id, from: { deviceId: 'mic', portId: 'out' }, to: { deviceId: 'box', portId: 'in' }, waypoints: [] }],
      },
    })
  ).json();

  // Bühnenplan: Kabel anklicken → Länge (8 m + 0,8 m + 1 m = 9,8 m → 10 m)
  await page.goto(`/projekt/${id}?ansicht=buehnenplan`);
  await expect.poll(() => page.evaluate(() => window.__steckplanStagePlan?.find('.stage-cable').length ?? 0)).toBe(1);
  const line = await nodeCenter(page, '.stage-cable');
  await page.mouse.click(line.x, line.y);
  const props = page.getByRole('complementary', { name: 'Eigenschaften' });
  await expect(props.getByTestId('chosen-length')).toHaveText('10 m');
  await expect(props.getByTestId('cable-length')).toContainText('8,00 m');

  // Mitte des Kabels nach unten ziehen → Knickpunkt → längeres Kabel (20 m)
  const mid = await nodeCenter(page, '.route-mid');
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y + 200, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await project(page.request, id)).cables[0].waypoints.length).toBe(1);
  await expect(props.getByTestId('chosen-length')).toHaveText('20 m');

  // Kabelliste
  await page.getByRole('tab', { name: 'Listen' }).click();
  await page.getByRole('tab', { name: 'Kabelliste' }).click();
  await expect(page.getByTestId('cable-summary')).toContainText('1 × XLR M5 20 m');
  await expect(page.getByTestId('cable-table')).toContainText('Mikro 1 · Out');

  // Packliste: Lese-Zugang hakt ab
  await page.getByRole('tab', { name: 'Packliste' }).click();
  const anna = await newContextPage(browser);
  await loginAs(anna, 'read', 'Anna');
  await anna.goto(`/projekt/${id}?ansicht=listen`);
  await anna.getByRole('button', { name: /^Hin: XLR M5 20 m – 0 von 1/ }).click();
  await expect(page.getByRole('button', { name: /^Hin: XLR M5 20 m – 1 von 1/ })).toBeVisible();
  await expect(page.getByTestId('packing-progress')).toContainText('Hin 1/3');

  // Lese-Zugang: Box auf dem Rückweg „fehlt“ mit Notiz
  await anna.getByRole('button', { name: /1 × Box M5/ }).click();
  await anna.getByRole('button', { name: 'Zurück: Box 1 – fehlt' }).click();
  const note = anna.getByLabel('Zurück: Box 1 – Notiz');
  await note.fill('nicht im Hänger');
  await note.blur();
  await expect(page.getByTestId('problems')).toContainText('fehlt');
  await expect(page.getByTestId('problems')).toContainText('nicht im Hänger');
  await expect(page.getByTestId('problems')).toContainText('Anna');
  await expect(anna.getByRole('button', { name: /Häkchen zurücksetzen/ })).toHaveCount(0);

  // Filter nach Anhänger: Box (ohne Anhänger) verschwindet
  await page.getByRole('button', { name: /^Anhänger/ }).click();
  await page.getByRole('group', { name: 'Anhänger' }).getByLabel('Hänger M5').check();
  await expect(page.getByRole('button', { name: /× Box M5/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /× Mikro M5/ })).toBeVisible();
  await page.getByRole('button', { name: /Filter aufheben/ }).click();

  // Häkchen zurücksetzen (beides)
  await page.getByRole('button', { name: /Häkchen zurücksetzen/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Beides' }).click();
  await expect(page.getByTestId('packing-progress')).toContainText('Hin 0/3 · Zurück 0/3');
  await expect(anna.getByRole('button', { name: /^Hin: XLR M5 20 m – 0 von 1/ })).toBeVisible();

  // Neues Projekt aus diesem
  await page.getByRole('button', { name: /^Hin: XLR M5 20 m – 0 von 1/ }).click();
  await page.getByRole('tab', { name: 'Projektdaten' }).click();
  await page.getByRole('button', { name: /Neues Projekt aus diesem/ }).click();
  await expect(page.getByLabel('Projektname')).toHaveValue('Logistik-Test (Kopie)');
  const newId = new URL(page.url()).pathname.split('/').pop()!;
  expect(newId).not.toBe(id);
  const copy = await project(page.request, newId);
  expect(copy.meta).toMatchObject({ date: '', version: '' });
  expect(copy.cables[0].check).toBeUndefined();
  expect(copy.cables[0].waypoints).toHaveLength(1);
});
