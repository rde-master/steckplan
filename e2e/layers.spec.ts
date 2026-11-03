import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers';

/** Zeichenreihenfolge im Bühnenplan: IDs der Objekte und Gruppenrahmen von unten nach oben */
const drawOrder = (page: Page) =>
  page.evaluate(() =>
    (window.__steckplanStagePlan?.find('.stage-device, .stage-group-frame') ?? [])
      .slice()
      .sort((a, b) => a.zIndex() - b.zIndex())
      .map((n) => n.id().replace('stage-device-', '').replace('stage-group-frame-', 'frame:')),
  );

test('Bühnenplan: Ebenen sortieren (oben/unten), Gruppenrahmen folgen; dunkles Design mit heller Schrift', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ebenen-Erik');
  const box = await (await page.request.post('/api/library/templates', { data: { template: { kind: 'device', name: 'Box Ebenen', shape: { form: 'rect', widthMm: 400, depthMm: 100 }, ports: [] } } })).json();
  const place = (x: number) => ({ position: { x, y: 1000 }, rotationDeg: 0 });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 8,
        id: 'ebenen',
        meta: { name: 'Ebenen' },
        layers: [
          { id: 'unten', name: 'Licht', order: 0, visible: true, locked: false },
          { id: 'oben', name: 'Ton', order: 1, visible: true, locked: false },
        ],
        groups: [{ id: 'g', name: 'Lichtgruppe' }],
        devices: [
          { id: 'L', templateId: box.id, layerId: 'unten', label: 'Spot', groupId: 'g', stagePlan: place(1000) },
          { id: 'T', templateId: box.id, layerId: 'oben', label: 'Monitor', stagePlan: place(1200) },
        ],
        cables: [],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}`);
  await page.getByRole('tab', { name: 'Bühnenplan' }).click();
  await expect.poll(() => drawOrder(page)).toEqual(['frame:g', 'L', 'T']);

  // Ebenen-Liste: oben = oben im Plan; „Licht“ nach oben
  await page.getByRole('tab', { name: 'Ebenen' }).click();
  const layers = page.getByTestId('layers').getByRole('listitem');
  await expect(layers.nth(0).getByLabel('Name der Ebene: Ton')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nach oben: Ton' })).toBeDisabled();
  await page.getByRole('button', { name: 'Nach oben: Licht' }).click();
  await expect(layers.nth(0).getByLabel('Name der Ebene: Licht')).toBeVisible();
  // Licht (mit Gruppenrahmen) liegt jetzt über Ton
  await expect.poll(() => drawOrder(page)).toEqual(['T', 'frame:g', 'L']);
  const saved = (await (await page.request.get(`/api/projects/${id}/download`)).json()).layers;
  expect(Object.fromEntries(saved.map((l: { id: string; order: number }) => [l.id, l.order]))).toEqual({ unten: 1, oben: 0 });

  // dunkles Design: Beschriftung unter dem Objekt (flaches Objekt) wird hell
  const labelFill = () => page.evaluate(() => (window.__steckplanStagePlan!.findOne('#stage-device-T')!.findOne('.stage-label') as unknown as { fill(): string }).fill());
  expect(await labelFill()).toBe('#0f172a');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(labelFill).toBe('#f8fafc');
});
