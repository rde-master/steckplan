import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loginAs, newContextPage } from './helpers';

// Zugriff auf die Konva-Zeichenfläche: Mittelpunkte von Knoten in Seitenkoordinaten.
interface NodeInfo {
  id: string;
  x: number;
  y: number;
  attrs: Record<string, unknown>;
}

async function nodes(page: Page, selector: string): Promise<NodeInfo[]> {
  return page.evaluate((sel) => {
    const stage = window.__steckplanStage;
    if (!stage) return [];
    const box = stage.container().getBoundingClientRect();
    return stage.find(sel).map((n) => {
      const r = n.getClientRect();
      const attrs = n.getAttrs() as Record<string, unknown>;
      return {
        id: n.id(),
        x: box.left + r.x + r.width / 2,
        y: box.top + r.y + r.height / 2,
        attrs: { deviceId: attrs.deviceId, portId: attrs.portId, fill: attrs.fill, stroke: attrs.stroke, dash: attrs.dash, draggable: n.draggable?.() },
      };
    });
  }, selector);
}

async function port(page: Page, deviceLabel: string, portId: string): Promise<NodeInfo> {
  const deviceId = await page.evaluate((label) => {
    const stage = window.__steckplanStage!;
    const group = stage.find('.device').find((g) => (g as unknown as { findOne: (s: string) => { text(): string } }).findOne('Text').text() === label);
    return group?.id().replace('device-', '');
  }, deviceLabel);
  const found = (await nodes(page, '.port')).find((p) => p.attrs.deviceId === deviceId && p.attrs.portId === portId);
  if (!found) throw new Error(`Anschluss ${deviceLabel}/${portId} nicht gefunden`);
  return found;
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

/** Punkt auf einem Kabel nahe einem Anschluss (Seitenkoordinaten) – zum Anfassen des Kabelendes */
async function cableNear(page: Page, near: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const found = await page.evaluate((p) => {
    const stage = window.__steckplanStage!;
    const box = stage.container().getBoundingClientRect();
    for (let r = 14; r <= 60; r += 2) {
      for (let a = 0; a < 360; a += 10) {
        const x = p.x - box.left + r * Math.cos((a * Math.PI) / 180);
        const y = p.y - box.top + r * Math.sin((a * Math.PI) / 180);
        if (stage.getIntersection({ x, y })?.name() === 'cable') return { x: x + box.left, y: y + box.top };
      }
    }
    return null;
  }, near);
  if (!found) throw new Error('Kein Kabel in der Nähe');
  return found;
}
async function project(request: APIRequestContext, id: string) {
  return (await request.get(`/api/projects/${id}/download`)).json();
}

async function setupLibrary(request: APIRequestContext) {
  const post = async (template: object) => (await request.post('/api/library/templates', { data: { template } })).json();
  const mic = await post({ kind: 'device', name: 'SM58', defaultColor: '#22c55e', shape: { form: 'rect', widthMm: 200, depthMm: 50 }, ports: [{ id: 'out', label: 'Out', connector: 'XLR 3 SF', direction: 'out', signal: 'Audio' }] });
  const desk = await post({
    kind: 'device',
    name: 'Pult',
    defaultColor: '#1e293b',
    shape: { form: 'rect', widthMm: 800, depthMm: 500 },
    ports: [
      { id: 'in1', label: 'In 1', connector: 'XLR 3 SF', direction: 'in', signal: 'Audio' },
      { id: 'in2', label: 'In 2', connector: 'XLR 3 SF', direction: 'in', signal: 'Audio' },
    ],
  });
  const xlr = await post({ kind: 'cableType', name: 'XLR 10 m', connectorA: 'XLR 3 SF', connectorB: 'XLR 3 SF', signal: 'Audio' });
  const speakon = await post({ kind: 'cableType', name: 'Speakon', connectorA: 'Speakon', connectorB: 'Speakon', signal: 'Lautsprecher' });
  const snake = await post({
    kind: 'cableType',
    name: 'Multicore 1/1',
    endALabel: 'Bühne',
    endBLabel: 'FOH',
    channels: [
      { id: 's1', label: 'Send 1', connectorA: 'XLR 3 SF', connectorB: 'XLR 3 SF', direction: 'aToB', signal: 'Audio' },
      { id: 'r1', label: 'Return 1', connectorA: 'XLR 3 SF', connectorB: 'XLR 3 SF', direction: 'bToA', signal: 'Audio' },
    ],
  });
  return { mic, desk, xlr, speakon, snake };
}

test('Signalfluss: Geräte platzieren, Kabel ziehen, Multicore, Prüfungen, Rückgängig, live bei anderen', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const lib = await setupLibrary(page.request);
  const { id } = await (await page.request.post('/api/projects', { data: { name: 'Signalfluss-Test' } })).json();
  await page.goto(`/projekt/${id}`);
  await expect(page.getByRole('tab', { name: 'Signalfluss' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Geräte aus der Bibliothek links hierher ziehen')).toBeVisible();

  // Geräte hinzufügen (＋) und verschieben
  await page.getByRole('button', { name: 'Hinzufügen: SM58', exact: true }).click();
  await expect.poll(async () => (await nodes(page, '.device')).length).toBe(1);
  const mic = (await nodes(page, '.device'))[0]!;
  await drag(page, { x: mic.x, y: mic.y - 10 }, { x: mic.x - 300, y: mic.y - 150 });
  await page.getByRole('button', { name: 'Hinzufügen: Pult', exact: true }).click();
  await expect.poll(async () => (await nodes(page, '.device')).length).toBe(2);
  await expect(page.getByRole('complementary', { name: 'Eigenschaften' }).getByRole('heading', { name: 'Pult 1' })).toBeVisible();

  // Mitleser mit Lese-Zugang
  const anna = await newContextPage(browser);
  await anna.setViewportSize({ width: 1400, height: 900 });
  await loginAs(anna, 'read', 'Anna');
  await anna.goto(`/projekt/${id}`);
  // Verbindungsaufbau kann unter Last dauern
  await expect.poll(async () => (await nodes(anna, '.device')).length, { timeout: 15_000 }).toBe(2);
  await expect(anna.getByRole('button', { name: 'Hinzufügen: SM58', exact: true })).toHaveCount(0);
  expect((await nodes(anna, '.device')).every((d) => d.attrs.draggable === false)).toBe(true);

  // Kabel ziehen: genau ein passender Kabeltyp → automatisch
  await drag(page, await port(page, 'SM58 1', 'out'), await port(page, 'Pult 1', 'in1'));
  await expect.poll(async () => (await project(page.request, id)).cables.length).toBe(1);
  expect((await project(page.request, id)).cables[0]).toMatchObject({ templateId: lib.xlr.id, from: { portId: 'out' }, to: { portId: 'in1' } });
  await expect.poll(async () => (await nodes(anna, '.cable')).length).toBe(1);

  // falsche Richtung: Eingang → Eingang
  await drag(page, await port(page, 'Pult 1', 'in1'), await port(page, 'Pult 1', 'in2'));
  await expect(page.getByText('Ein Eingang kann nur mit einem Ausgang verbunden werden.')).toBeVisible();

  // Kabel umstecken: Ende am Pult anfassen und auf In 2 ziehen – dasselbe Kabel (Typ bleibt), dann zurück
  const cableId = (await project(page.request, id)).cables[0].id;
  await drag(page, await cableNear(page, await port(page, 'Pult 1', 'in1')), await port(page, 'Pult 1', 'in2'));
  await expect.poll(async () => (await project(page.request, id)).cables.map((c: { id: string; to: { portId: string } }) => `${c.id}:${c.to.portId}`)).toEqual([`${cableId}:in2`]);
  expect((await project(page.request, id)).cables[0]).toMatchObject({ templateId: lib.xlr.id, from: { portId: 'out' } });
  // ins Leere fallen lassen: nichts ändert sich
  const nowhere = await port(page, 'Pult 1', 'in2');
  await drag(page, await cableNear(page, nowhere), { x: nowhere.x + 200, y: nowhere.y + 250 });
  await drag(page, await cableNear(page, await port(page, 'Pult 1', 'in2')), await port(page, 'Pult 1', 'in1'));
  await expect.poll(async () => (await project(page.request, id)).cables.map((c: { to: { portId: string } }) => c.to.portId)).toEqual(['in1']);

  // Multicore als Kasten: Mikrofon per Kabel an die Ader (Auswahl), Fan-out direkt ins Pult
  await page.getByRole('button', { name: 'Hinzufügen: Multicore 1/1', exact: true }).click();
  await expect.poll(async () => (await nodes(page, '.device')).length).toBe(3);
  const snakeBox = (await nodes(page, '.device')).at(-1)!;
  await drag(page, { x: snakeBox.x, y: snakeBox.y - 15 }, { x: snakeBox.x - 120, y: snakeBox.y + 220 });
  await page.getByRole('button', { name: 'Hinzufügen: SM58', exact: true }).click();
  await expect.poll(async () => (await nodes(page, '.device')).length).toBe(4);
  const mic2 = (await nodes(page, '.device')).at(-1)!;
  await drag(page, { x: mic2.x, y: mic2.y - 10 }, { x: mic2.x - 420, y: mic2.y + 220 });

  await drag(page, await port(page, 'SM58 2', 'out'), await port(page, 'Multicore 1/1 1', 's1:a'));
  const chooser = page.getByRole('dialog');
  await expect(chooser.getByText('Kabeltyp wählen')).toBeVisible();
  await chooser.getByRole('button', { name: /XLR 10 m/ }).click();
  await drag(page, await port(page, 'Multicore 1/1 1', 's1:b'), await port(page, 'Pult 1', 'in2'));
  await chooser.getByRole('button', { name: /Direkt gesteckt/ }).click();
  await expect.poll(async () => (await project(page.request, id)).cables.length).toBe(3);
  const cables = (await project(page.request, id)).cables;
  expect(cables.find((c: { direct?: boolean }) => c.direct)).toMatchObject({ to: { portId: 'in2' } });

  // Prüfungen: Kabeltyp auf Speakon ändern → Stecker passen nicht
  // keine Fehler/Warnungen – nur der Hinweis, dass die Geräte im Bühnenplan noch nicht platziert sind
  await expect(page.getByRole('region', { name: 'Prüfungen' })).toContainText('1 Hinweis');
  await expect(page.getByRole('region', { name: 'Prüfungen' })).not.toContainText('Warnung');
  const firstCable = (await nodes(page, '.cable')).find((c) => c.id === `cable-${cables.find((x: { templateId?: string; from: { portId: string }; to: { portId: string } }) => x.to.portId === 'in1').id}`)!;
  await page.mouse.click(firstCable.x, firstCable.y);
  await page.getByRole('complementary', { name: 'Eigenschaften' }).getByRole('combobox', { name: 'Kabeltyp' }).selectOption({ label: 'Speakon' });
  const checks = page.getByRole('region', { name: 'Prüfungen' });
  await expect(checks).toContainText('1 Warnung');
  await checks.getByRole('button', { name: /Prüfungen/ }).click();
  await expect(page.getByTestId('checks-list')).toContainText('Stecker passen nicht');
  await expect.poll(async () => (await nodes(page, '.cable')).filter((c) => c.attrs.stroke === '#dc2626').length).toBe(1);

  // Gerät löschen (samt Kabeln) und rückgängig machen
  const desk = (await nodes(page, '.device')).find((d) => d.id.startsWith('device-'))!;
  void desk;
  const deskNode = await page.evaluate(() => {
    const stage = window.__steckplanStage!;
    const g = stage.find('.device').find((n) => (n as unknown as { findOne: (s: string) => { text(): string } }).findOne('Text').text() === 'Pult 1')!;
    const r = g.getClientRect();
    const b = stage.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + 12 };
  });
  await page.mouse.click(deskNode.x, deskNode.y);
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await project(page.request, id)).devices.length).toBe(3);
  expect((await project(page.request, id)).cables.length).toBe(1);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await project(page.request, id)).devices.length).toBe(4);
  expect((await project(page.request, id)).cables.length).toBe(3);

  // Eigenschaften: Kennung ändern (erst klicken, wenn das wiederhergestellte Gerät gezeichnet ist)
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.device').length ?? 0)).toBe(4);
  await page.mouse.click(deskNode.x, deskNode.y);
  const props = page.getByRole('complementary', { name: 'Eigenschaften' });
  await props.getByLabel('Kennung').fill('FOH-Pult');
  await expect.poll(async () => (await project(page.request, id)).devices.some((d: { label: string }) => d.label === 'FOH-Pult')).toBe(true);

  // Vorlagen-Änderung wirkt sofort auf alle Instanzen (auch beim Lese-Client)
  await page.request.put(`/api/library/templates/${lib.mic.id}`, { data: { template: { ...lib.mic, defaultColor: '#ef4444' }, baseVersion: lib.mic.version } });
  await expect
    .poll(async () => (await anna.evaluate(() => window.__steckplanStage!.find('.device').map((g) => (g as unknown as { findOne: (s: string) => { fill(): string } }).findOne('Rect').fill()))).filter((f) => f === '#ef4444').length)
    .toBe(2);
});

test('Signalfluss: Vorlage aus der Bibliothek auf die Zeichenfläche ziehen', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (await page.request.post('/api/projects', { data: { name: 'Drag & Drop' } })).json();
  await page.goto(`/projekt/${id}`);
  const item = page.getByRole('complementary', { name: 'Bibliothek' }).getByRole('listitem').filter({ has: page.getByText('Pult', { exact: true }) });
  await item.dragTo(page.getByTestId('signalflow-canvas'), { targetPosition: { x: 400, y: 300 } });
  await expect.poll(async () => (await project(page.request, id)).devices.length).toBe(1);
  const device = (await project(page.request, id)).devices[0];
  expect(device.label).toBe('Pult 1');
  // abgelegt in der Nähe der Zielposition (Weltkoordinaten, Raster 10)
  expect(device.signalFlow.position.x % 10).toBe(0);
  expect(device.signalFlow.position.x).toBeGreaterThan(200);
});
