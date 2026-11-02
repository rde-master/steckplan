import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loginAs } from './helpers';

async function project(request: APIRequestContext, id: string) {
  return (await request.get(`/api/projects/${id}/download`)).json();
}

/** Mittelpunkt eines Konva-Knotens in Bildschirmkoordinaten */
async function center(page: Page, stageVar: '__steckplanStage' | '__steckplanStagePlan', selector: string) {
  return page.evaluate(
    ([v, sel]) => {
      const stage = (window as unknown as Record<string, import('konva').default.Stage>)[v as string]!;
      const node = stage.findOne(sel as string)!;
      const r = node.getClientRect();
      const b = stage.container().getBoundingClientRect();
      return { x: b.left + r.x + r.width / 2, y: b.top + r.y + 10, left: b.left + r.x, top: b.top + r.y, right: b.left + r.x + r.width, bottom: b.top + r.y + r.height };
    },
    [stageVar, selector] as const,
  );
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

test('Markieren: Rahmen ziehen, mehrere Objekte auswählen und gemeinsam verschieben (Signalfluss und Bühnenplan)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Markier-Ralf');
  const box = await (await page.request.post('/api/library/templates', { data: { template: { kind: 'device', name: 'Kasten Markieren', shape: { form: 'rect', widthMm: 500, depthMm: 500 } } } })).json();
  const d = (id: string, x: number, y: number) => ({ id, templateId: box.id, layerId: 'l1', label: id, signalFlow: { position: { x, y } }, stagePlan: { position: { x: x * 10 + 2000, y: y * 10 + 2000 }, rotationDeg: 0 } });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: { schemaVersion: 4, id: 'marquee', meta: { name: 'Markieren' }, layers: [{ id: 'l1', name: 'Bühne', order: 0 }], devices: [d('A', 40, 40), d('B', 300, 40), d('C', 40, 400)] },
    })
  ).json();

  // Knopf „Bibliothek“ im Projekt öffnet die Bibliothek in einem neuen Tab, das Projekt bleibt offen
  await page.goto(`/projekt/${id}`);
  const popupPromise = page.context().waitForEvent('page');
  await page.getByRole('button', { name: 'Bibliothek', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/bibliothek$/);
  await expect(popup.getByRole('heading', { name: 'Bibliothek' })).toBeVisible();
  await popup.close();

  // ---------- Signalfluss ----------
  await page.goto(`/projekt/${id}`);
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.device').length ?? 0)).toBe(3);
  await page.getByRole('toolbar').getByRole('button', { name: 'Markieren', exact: true }).click();
  await expect(page.getByTestId('signalflow-canvas')).toHaveAttribute('data-mode', 'marquee');
  const a = await center(page, '__steckplanStage', '#device-A');
  const b = await center(page, '__steckplanStage', '#device-B');
  // Rahmen um A und B (C liegt darunter und bleibt draußen)
  await drag(page, { x: a.left - 15, y: a.top - 15 }, { x: b.right + 15, y: b.bottom + 15 });
  const props = page.getByRole('complementary', { name: 'Eigenschaften' });
  await expect(props).toContainText('2 Objekte ausgewählt');
  // A ziehen → B kommt mit, C bleibt
  await drag(page, a, { x: a.x + 100, y: a.y + 60 });
  await expect
    .poll(async () => {
      const p = await project(page.request, id);
      const pos = (x: string) => p.devices.find((dev: { id: string }) => dev.id === x).signalFlow.position;
      return [pos('A').x > 100, pos('B').x > 360, pos('C').x === 40];
    })
    .toEqual([true, true, true]);

  // ---------- Bühnenplan ----------
  await page.getByRole('tab', { name: 'Bühnenplan' }).click();
  await expect.poll(() => page.evaluate(() => window.__steckplanStagePlan?.find('.stage-device').length ?? 0)).toBe(3);
  await page.getByRole('toolbar').getByRole('button', { name: 'Markieren', exact: true }).click();
  await expect(page.getByTestId('tool-hint')).toContainText('Markieren');
  const before = await project(page.request, id);
  const sa = await center(page, '__steckplanStagePlan', '#stage-device-A');
  const sc = await center(page, '__steckplanStagePlan', '#stage-device-C');
  await drag(page, { x: Math.min(sa.left, sc.left) - 20, y: Math.min(sa.top, sc.top) - 20 }, { x: Math.max(sa.right, sc.right) + 20, y: Math.max(sa.bottom, sc.bottom) + 20 });
  await expect(props).toContainText('2 Objekte ausgewählt');
  await drag(page, { x: sc.x, y: sc.y }, { x: sc.x + 80, y: sc.y });
  await expect
    .poll(async () => {
      const p = await project(page.request, id);
      const moved = (x: string) => p.devices.find((dev: { id: string }) => dev.id === x).stagePlan.position.x - before.devices.find((dev: { id: string }) => dev.id === x).stagePlan.position.x;
      return [moved('A') > 0, moved('C') > 0, moved('B') === 0];
    })
    .toEqual([true, true, true]);
});

test('Markieren am Rand scrollt die Ansicht und markiert auch Objekte außerhalb des sichtbaren Bereichs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Markier-Rand');
  const box = await (await page.request.post('/api/library/templates', { data: { template: { kind: 'device', name: 'Kasten Rand', shape: { form: 'rect', widthMm: 500, depthMm: 500 } } } })).json();
  const d = (id: string, x: number, y: number) => ({ id, templateId: box.id, layerId: 'l1', label: id, signalFlow: { position: { x, y } } });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: { schemaVersion: 4, id: 'marquee-rand', meta: { name: 'Rand' }, layers: [{ id: 'l1', name: 'Bühne', order: 0 }], devices: [d('Links', 40, 40), d('Fern', 2200, 40), d('Unten', 40, 500)] },
    })
  ).json();
  await page.goto(`/projekt/${id}`);
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.device').length ?? 0)).toBe(3);
  await page.getByRole('toolbar').getByRole('button', { name: 'Markieren', exact: true }).click();
  const canvas = (await page.getByTestId('signalflow-canvas').boundingBox())!;
  const links = await center(page, '__steckplanStage', '#device-Links');
  // „Fern“ liegt rechts außerhalb des sichtbaren Bereichs
  expect(await page.evaluate(() => window.__steckplanStage!.findOne('#device-Fern')!.getClientRect().x > window.__steckplanStage!.width())).toBe(true);
  const viewBefore = await page.evaluate(() => window.__steckplanStage!.x());
  await page.mouse.move(links.left - 15, links.top - 15);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width - 4, links.bottom + 15, { steps: 6 });
  await page.waitForTimeout(2500);
  await page.mouse.move(canvas.x + canvas.width - 5, links.bottom + 15);
  await page.mouse.up();
  expect(await page.evaluate(() => window.__steckplanStage!.x())).toBeLessThan(viewBefore - 1000);
  const props = page.getByRole('complementary', { name: 'Eigenschaften' });
  await expect(props).toContainText('2 Objekte ausgewählt'); // Links und Fern, nicht Unten
});
