import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loginAs } from './helpers';

async function project(request: APIRequestContext, id: string) {
  return (await request.get(`/api/projects/${id}/download`)).json();
}

/** Mittelpunkt eines Konva-Knotens in Seitenkoordinaten */
async function at(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const stage = window.__steckplanStage!;
    const node = stage.findOne(sel);
    if (!node) return null;
    const r = node.getClientRect();
    const b = stage.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 };
  }, selector);
}

test('Defekte Anschlüsse: in den Eigenschaften und per Rechtsklick markieren, rotes X, kein neues Kabel, Prüfung, Ton-Patch', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Defekt-Dora');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const xlr = (id: string, label: string, direction: string) => ({ id, label, connector: 'XLR D', direction, signal: 'Audio' });
  const mic = await post({ kind: 'device', name: 'Mikro Defekt', ports: [xlr('out', 'Out', 'out')] });
  const desk = await post({ kind: 'device', name: 'Pult Defekt', mixer: true, ports: [xlr('i1', 'In 1', 'in'), xlr('i2', 'In 2', 'in')] });
  const snake = await post({
    kind: 'cableType',
    name: 'Multicore Defekt',
    endALabel: 'Bühne',
    endBLabel: 'FOH',
    channels: [
      { id: 's1', label: 'Send 1', connectorA: 'XLR D', connectorB: 'XLR D', direction: 'aToB', signal: 'Audio' },
      { id: 's2', label: 'Send 2', connectorA: 'XLR D', connectorB: 'XLR D', direction: 'aToB', signal: 'Audio' },
    ],
  });
  const d = (id: string, t: { id: string }, x: number, y = 60) => ({ id, templateId: t.id, layerId: 'l1', label: id, signalFlow: { position: { x, y } } });
  const c = (id: string, from: [string, string], to: [string, string]) => ({ id, from: { deviceId: from[0], portId: from[1] }, to: { deviceId: to[0], portId: to[1] }, waypoints: [], direct: true });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 8,
        id: 'defekt',
        meta: { name: 'Defekt' },
        layers: [{ id: 'l1', name: 'Ton', order: 0 }],
        devices: [d('Vox', mic, 20), d('Vox2', mic, 20, 260), d('MC', snake, 300), d('Pult', desk, 650)],
        cables: [c('a', ['Vox', 'out'], ['MC', 's1:a']), c('b', ['MC', 's1:b'], ['Pult', 'i1'])],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}`);
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.device').length ?? 0)).toBe(4);

  // Pult auswählen → „Defekte Anschlüsse“: In 2 defekt mit Notiz
  const pult = (await at(page, '#device-Pult'))!;
  await page.mouse.click(pult.x, pult.y - 20);
  const props = page.getByRole('complementary', { name: 'Eigenschaften' });
  const section = props.getByTestId('defect-section');
  await section.locator('summary').click();
  await section.getByLabel('Defekt: In 2').check();
  await section.getByLabel('Notiz zum Defekt: In 2').fill('Wackelkontakt');
  await expect.poll(async () => (await project(page.request, id)).devices.find((x: { id: string }) => x.id === 'Pult').defectivePorts).toEqual([{ portId: 'i2', note: 'Wackelkontakt' }]);
  await expect.poll(() => at(page, '#defect-Pult-i2')).not.toBeNull();

  // Kabel an den defekten Anschluss: nicht möglich, Hinweis
  const from = (await at(page, '#port-Vox2-out'))!;
  const to = (await at(page, '#port-Pult-i2'))!;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText('Dieser Anschluss ist als defekt markiert')).toBeVisible();
  expect((await project(page.request, id)).cables).toHaveLength(2);

  // Rechtsklick auf die belegte Multicore-Ader: ganze Ader defekt (beide Enden), Warnung in Prüfungen
  const core = (await at(page, '#port-MC-s1:a'))!;
  await page.mouse.click(core.x, core.y, { button: 'right' });
  await expect.poll(async () => (await project(page.request, id)).devices.find((x: { id: string }) => x.id === 'MC').defectivePorts).toEqual([{ portId: 's1' }]);
  await expect.poll(() => at(page, '#defect-MC-s1:b')).not.toBeNull();
  await expect(page.getByRole('region', { name: 'Prüfungen' })).toContainText('Warnung');

  // Ton-Patch: Kanal 1 läuft über die defekte Ader, Kanal 2 ist selbst defekt
  await page.getByRole('tab', { name: 'Listen' }).click();
  await page.getByRole('tab', { name: 'Ton-Patch' }).click();
  await page.getByLabel('Nur belegte Kanäle').uncheck();
  const rows = page.getByTestId('patch-inputs').getByTestId('patch-row');
  await expect(rows.nth(0).getByTestId('patch-defect')).toHaveText('✕ defekt: MC · Send 1');
  await expect(rows.nth(1).getByTestId('patch-defect')).toHaveText('✕ defekt: Pult · In 2');

  // Rechtsklick entfernt die Markierung wieder
  await page.getByRole('tab', { name: 'Signalfluss' }).click();
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.device').length ?? 0)).toBe(4);
  const core2 = (await at(page, '#port-MC-s1:a'))!;
  await page.mouse.click(core2.x, core2.y, { button: 'right' });
  await expect.poll(async () => (await project(page.request, id)).devices.find((x: { id: string }) => x.id === 'MC').defectivePorts).toBeUndefined();
});
