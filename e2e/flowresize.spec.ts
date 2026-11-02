import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loginAs } from './helpers';

async function project(request: APIRequestContext, id: string) {
  return (await request.get(`/api/projects/${id}/download`)).json();
}

/** Bildschirmposition eines Konva-Knotens (Mitte) */
async function center(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const stage = window.__steckplanStage!;
    const r = stage.findOne(sel)!.getClientRect();
    const b = stage.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 };
  }, selector);
}

test('Signalfluss: Kasten am Griff größer ziehen, zurücksetzen; Kabel geschwungen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Groesse-Gabi');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const mic = await post({ kind: 'device', name: 'Mikro Größe', ports: [{ id: 'o', label: 'Out', connector: 'XLR G', direction: 'out', signal: 'Audio' }] });
  const amp = await post({ kind: 'device', name: 'Amp Größe', ports: [{ id: 'i', label: 'In', connector: 'XLR G', direction: 'in', signal: 'Audio' }] });
  const d = (id: string, t: { id: string }, x: number) => ({ id, templateId: t.id, layerId: 'l1', label: id, signalFlow: { position: { x, y: 60 }, pageId: 'p1' } });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 7,
        id: 'groesse',
        meta: { name: 'Größe' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        flowPages: [{ id: 'p1', name: 'Ton', order: 0 }, { id: 'p2', name: 'Licht', order: 1 }],
        devices: [d('Vox', mic, 40), d('Amp', amp, 500)],
        cables: [{ id: 'k', from: { deviceId: 'Vox', portId: 'o' }, to: { deviceId: 'Amp', portId: 'i' }, waypoints: [] }],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}`);
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.device').length ?? 0)).toBe(2);
  await page.getByRole('button', { name: 'Einpassen' }).click().catch(() => undefined);
  const size = () => page.evaluate(() => window.__steckplanStage!.findOne('#device-Vox')!.getClientRect({ skipShadow: true, skipStroke: true }));
  const before = await size();

  // Griff rechts unten ziehen → größer, im Projekt gespeichert, Position bleibt
  const handle = await center(page, '#resize-Vox');
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 60, handle.y + 40, { steps: 5 });
  await page.mouse.move(handle.x + 120, handle.y + 80, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await size()).width).toBeGreaterThan(before.width + 50);
  const stored = (await project(page.request, id)).devices.find((x: { id: string }) => x.id === 'Vox').signalFlow;
  expect(stored.position).toEqual({ x: 40, y: 60 });
  expect(stored.pageId).toBe('p1');
  expect(stored.width).toBeGreaterThan(160);
  expect(stored.height).toBeGreaterThan(60);
  expect(stored.width % 10).toBe(0);

  // kleiner als automatisch geht nicht
  const handle2 = await center(page, '#resize-Vox');
  await page.mouse.move(handle2.x, handle2.y);
  await page.mouse.down();
  await page.mouse.move(handle2.x - 600, handle2.y - 400, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await size()).width)).toBe(Math.round(before.width));

  // Doppelklick auf den Griff: automatische Größe (Feld entfällt)
  const handle3 = await center(page, '#resize-Vox');
  await page.mouse.dblclick(handle3.x, handle3.y);
  await expect.poll(async () => (await project(page.request, id)).devices.find((x: { id: string }) => x.id === 'Vox').signalFlow).toEqual({ position: { x: 40, y: 60 }, pageId: 'p1' });

  // Verschieben behält Seite und Größe
  const ampAt = await center(page, '#device-Amp');
  await page.mouse.move(ampAt.x, ampAt.y - 10);
  await page.mouse.down();
  await page.mouse.move(ampAt.x + 40, ampAt.y + 30, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await project(page.request, id)).devices.find((x: { id: string }) => x.id === 'Amp').signalFlow.position.x).not.toBe(500);
  expect((await project(page.request, id)).devices.find((x: { id: string }) => x.id === 'Amp').signalFlow.pageId).toBe('p1');

  // Kabel geschwungen: gilt für das Projekt
  const bezier = () => page.evaluate(() => (window.__steckplanStage!.findOne('#cable-k') as unknown as { bezier(): boolean }).bezier());
  expect(await bezier()).toBe(false);
  await page.getByRole('radiogroup', { name: 'Kabel' }).getByRole('radio', { name: 'geschwungen' }).click();
  await expect.poll(bezier).toBe(true);
  await expect.poll(async () => (await project(page.request, id)).settings.cableStyle).toBe('curved');
  await page.getByRole('radiogroup', { name: 'Kabel' }).getByRole('radio', { name: 'eckig' }).click();
  await expect.poll(bezier).toBe(false);
});
