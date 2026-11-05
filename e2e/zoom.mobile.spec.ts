import { expect, test, type Page } from '@playwright/test';
import { loginAs, openTab } from './helpers';

// Zwei Finger auseinander: Erst liegt ein Finger (verschiebt die Zeichenfläche), dann kommt der zweite dazu.
async function pinchOut(page: Page, selector: string) {
  const box = (await page.locator(selector).first().boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, points: { x: number; y: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ ...p, id })) });
  await touch('touchStart', [{ x: cx - 20, y: cy }]);
  await touch('touchMove', [{ x: cx - 25, y: cy }]);
  await touch('touchStart', [{ x: cx - 25, y: cy }, { x: cx + 20, y: cy }]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: cx - 25 - i * 12, y: cy }, { x: cx + 20 + i * 12, y: cy }]);
  await touch('touchEnd', []);
}

test('Handy: Zwei-Finger-Zoom in Signalfluss und Bühnenplan', async ({ page }) => {
  await loginAs(page, 'edit', 'Zoom');
  const { id } = await (
    await page.request.post('/api/projects/upload', { data: { schemaVersion: 9, id: 'zoom-handy', meta: { name: 'Zoomprobe' }, layers: [{ id: 'l1', name: 'Bühne', order: 0 }], devices: [], cables: [] } })
  ).json();
  await page.goto(`/projekt/${id}`);

  await openTab(page, 'Signalfluss');
  await expect.poll(() => page.evaluate(() => !!window.__steckplanStage)).toBe(true);
  const before = await page.evaluate(() => window.__steckplanStage!.scaleX());
  await pinchOut(page, '.konvajs-content');
  await expect.poll(() => page.evaluate(() => window.__steckplanStage!.scaleX())).toBeGreaterThan(before * 1.4);

  await openTab(page, 'Bühnenplan');
  await expect.poll(() => page.evaluate(() => !!window.__steckplanStagePlan)).toBe(true);
  const planBefore = await page.evaluate(() => window.__steckplanStagePlan!.scaleX());
  await pinchOut(page, '.konvajs-content');
  await expect.poll(() => page.evaluate(() => window.__steckplanStagePlan!.scaleX())).toBeGreaterThan(planBefore * 1.4);
});
