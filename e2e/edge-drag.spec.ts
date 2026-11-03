import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers';

async function center(page: Page, stageVar: '__steckplanStage' | '__steckplanStagePlan', selector: string) {
  return page.evaluate(
    ([v, sel]) => {
      const stage = (window as unknown as Record<string, { findOne(s: string): { getClientRect(): { x: number; y: number; width: number; height: number } }; container(): HTMLElement }>)[v!]!;
      const r = stage.findOne(sel!).getClientRect();
      const b = stage.container().getBoundingClientRect();
      return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 };
    },
    [stageVar, selector],
  );
}

test('Am Rand scrollen beim Ziehen: Kasten und Kabel im Signalfluss, Objekt im Bühnenplan', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Rand-Ralf');
  const xlr = (id: string, label: string, direction: string) => ({ id, label, connector: 'XLR R', direction, signal: 'Audio' });
  const tpl = await (await page.request.post('/api/library/templates', { data: { template: { kind: 'device', name: 'Kasten Randziehen', shape: { form: 'rect', widthMm: 500, depthMm: 500 }, ports: [xlr('o', 'Out', 'out'), xlr('i', 'In', 'in')] } } })).json();
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 8,
        id: 'randziehen',
        meta: { name: 'Rand' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [
          { id: 'A', templateId: tpl.id, layerId: 'l1', label: 'A', signalFlow: { position: { x: 40, y: 40 } }, stagePlan: { position: { x: 3000, y: 3000 }, rotationDeg: 0 } },
          { id: 'B', templateId: tpl.id, layerId: 'l1', label: 'B', signalFlow: { position: { x: 40, y: 300 } } },
        ],
        cables: [],
      },
    })
  ).json();
  const project = async () => (await page.request.get(`/api/projects/${id}/download`)).json();
  await page.goto(`/projekt/${id}`);
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.device').length ?? 0)).toBe(2);
  const canvas = (await page.getByTestId('signalflow-canvas').boundingBox())!;

  // Kasten A an den rechten Rand ziehen und halten → Ansicht scrollt, A wandert weit nach rechts
  const viewX = () => page.evaluate(() => window.__steckplanStage!.x());
  const before = await viewX();
  const a = await center(page, '__steckplanStage', '#device-A');
  await page.mouse.move(a.x, a.y - 15);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width - 5, a.y - 15, { steps: 8 });
  await page.waitForTimeout(1500);
  await page.mouse.up();
  expect(await viewX()).toBeLessThan(before - 500);
  await expect.poll(async () => (await project()).devices.find((d: { id: string }) => d.id === 'A').signalFlow.position.x).toBeGreaterThan(canvas.width + 300);

  // Kabel von B ziehen: am unteren Rand scrollt die Ansicht mit (vorher alles ins Bild holen)
  await page.getByRole('button', { name: 'Einpassen' }).click();
  const viewY = () => page.evaluate(() => window.__steckplanStage!.y());
  const y0 = await viewY();
  const port = await center(page, '__steckplanStage', '#port-B-o');
  await page.mouse.move(port.x, port.y);
  await page.mouse.down();
  await page.mouse.move(port.x + 100, canvas.y + canvas.height - 5, { steps: 8 });
  await page.waitForTimeout(1000);
  await page.mouse.up();
  expect(await viewY()).toBeLessThan(y0 - 300);

  // Bühnenplan: Objekt an den linken Rand ziehen → Ansicht scrollt
  await page.getByRole('tab', { name: 'Bühnenplan' }).click();
  await expect.poll(() => page.evaluate(() => window.__steckplanStagePlan?.find('.stage-device').length ?? 0)).toBe(1);
  const plan = (await page.locator('[data-canvas-theme]').first().boundingBox())!;
  const planX = () => page.evaluate(() => window.__steckplanStagePlan!.x());
  const px0 = await planX();
  const item = await center(page, '__steckplanStagePlan', '#stage-device-A');
  await page.mouse.move(item.x, item.y);
  await page.mouse.down();
  await page.mouse.move(plan.x + 5, item.y, { steps: 8 });
  await page.waitForTimeout(1200);
  await page.mouse.up();
  expect(await planX()).toBeGreaterThan(px0 + 300);
  await expect.poll(async () => (await project()).devices.find((d: { id: string }) => d.id === 'A').stagePlan.position.x).toBeLessThan(0);
});
