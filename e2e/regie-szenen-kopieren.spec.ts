import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('Lichtszenen: Gerätearten wählen, Tastenkürzel, in andere Szenen kopieren, Kopieren/Einfügen, 8×8-Raster passt', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const mh = await post({ kind: 'device', name: 'Moving Head K', light: { showInScenes: true, colorMixing: 'rgb', moving: { panDeg: 540, tiltDeg: 270 } } });
  const par = await post({ kind: 'device', name: 'PAR K', light: { showInScenes: true, colorMixing: 'rgb' } });
  const devices = [
    ...Array.from({ length: 4 }, (_, i) => ({ id: `MH ${i + 1}`, templateId: mh.id, layerId: 'l1', label: `MH ${i + 1}` })),
    ...Array.from({ length: 8 }, (_, i) => ({ id: `PAR ${i + 1}`, templateId: par.id, layerId: 'l1', label: `PAR ${i + 1}` })),
  ];
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'szenen-kopieren',
        meta: { name: 'Kopierprobe' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices,
        cables: [],
        lightGrid: { cols: 8, rows: 8, rowLabels: ['Traverse 1', 'Traverse 2'] },
        lightPlacements: devices.map((d, i) => ({ id: d.id, col: i % 8, row: Math.floor(i / 8) })),
        show: {
          items: [
            { id: 'a', order: 0, kind: 'song', title: 'Erstes Lied' },
            { id: 'b', order: 1, kind: 'play', title: 'Zweites Stück' },
          ],
          sections: [],
        },
        lightScenes: [
          { id: 'a1', itemId: 'a', order: 0, name: 'Anfang' },
          { id: 'a2', itemId: 'a', order: 1, name: 'Refrain' },
          { id: 'b1', itemId: 'b', order: 0, name: 'Auftritt' },
          { id: 'b2', itemId: 'b', order: 1, name: 'Abgang' },
        ],
        sceneStates: [{ id: 'b1:PAR 8', sceneId: 'b1', deviceId: 'PAR 8', dimmer: 30 }],
      },
    })
  ).json();

  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Lichtszenen' }).click();
  const scenes = page.getByTestId('scenes-detail').getByTestId('regie-scenes');
  const fixture = (name: string) => scenes.locator(`[data-testid="scene-fixture"][data-device="${name}"]`);

  // 8×8 passt neben die Werte, ohne seitliches Scrollen
  const gridBox = scenes.getByTestId('scene-grid').locator('..');
  expect(await gridBox.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);

  // Werte erst mit gewähltem Gerät; Gerätearten links neben dem Raster
  const panel = scenes.getByTestId('fixture-panel');
  await expect(panel).toBeHidden();
  const typesBox = (await scenes.getByTestId('scene-types').boundingBox())!;
  const gridBoxRect = (await scenes.getByTestId('scene-grid').boundingBox())!;
  expect(typesBox.x + typesBox.width).toBeLessThanOrEqual(gridBoxRect.x);

  // Gerätearten mit Anzahl; Antippen wählt alle dieser Art, Strg dazu
  const types = scenes.getByTestId('scene-types');
  await expect(types.getByRole('button')).toHaveText(['Moving Head K (4)', 'PAR K (8)']);
  await types.getByRole('button', { name: 'Moving Head K (4)' }).click();
  await expect(scenes).toContainText('4 Geräte gewählt');
  await expect(fixture('MH 3')).toHaveAttribute('aria-pressed', 'true');
  await expect(fixture('PAR 1')).toHaveAttribute('aria-pressed', 'false');
  await expect(panel).toBeVisible();
  expect(await gridBox.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0); // 8×8 auch neben den Werten
  await page.screenshot({ path: 'test-results/szenen-1440.png' });
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.screenshot({ path: 'test-results/szenen-1920.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Tastenkürzel: 7 = 70 %, Esc hebt auf, Strg+A alle, − aus, Entf löscht
  await page.keyboard.press('7');
  await expect(fixture('MH 1')).toContainText('70 %');
  await expect(fixture('PAR 1')).toContainText('–');
  await types.getByRole('button', { name: 'PAR K (8)' }).click({ modifiers: ['Control'] });
  await expect(scenes).toContainText('12 Geräte gewählt');
  await page.keyboard.press('Escape');
  await expect(scenes).toContainText('Geräte antippen');
  await fixture('PAR 2').click();
  await page.keyboard.press('-');
  await expect(fixture('PAR 2')).toContainText('aus');
  await fixture('PAR 2').click();
  await fixture('PAR 3').click();
  await page.keyboard.press('0');
  await expect(fixture('PAR 3')).toContainText('100 %');
  await page.keyboard.press('Delete');
  await expect(fixture('PAR 3')).toContainText('–');

  // Kürzel stehen beim Überfahren dran
  await expect(scenes.getByRole('button', { name: 'Alle', exact: true })).toHaveAttribute('title', /Strg\+A/);
  await scenes.getByRole('button', { name: 'Tastenkürzel' }).hover();
  await expect(scenes.getByRole('tooltip')).toContainText('neue Szene wie die gewählte');

  // → nächste Szene, ← zurück
  await page.keyboard.press('ArrowRight');
  await expect(scenes.getByTestId('scene-tab').nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(scenes.getByTestId('scene-tab').first()).toHaveAttribute('aria-selected', 'true');

  // „Kopieren nach …“: in Szenen beider Stücke, ersetzt vollständig
  await scenes.getByRole('button', { name: 'Kopieren nach …' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Erstes Lied: Anfang')).toBeDisabled();
  await dialog.getByLabel('Erstes Lied: Refrain').check();
  await dialog.getByLabel('Zweites Stück: alle Szenen').check();
  await dialog.getByRole('button', { name: 'In 3 Szenen kopieren' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('toast')).toContainText('In 3 Szenen kopiert');
  const states = async () => (await (await page.request.get(`/api/projects/${id}/download`)).json()).sceneStates as { sceneId: string; deviceId: string; dimmer?: number }[];
  const summary = (all: { sceneId: string; deviceId: string; dimmer?: number }[], scene: string) =>
    all
      .filter((s) => s.sceneId === scene)
      .map((s) => `${s.deviceId}=${s.dimmer}`)
      .sort();
  const expected = ['MH 1=70', 'MH 2=70', 'MH 3=70', 'MH 4=70', 'PAR 2=0'];
  await expect.poll(async () => summary(await states(), 'b1')).toEqual(expected); // PAR 8 = 30 ist ersetzt
  const all = await states();
  expect(summary(all, 'a2')).toEqual(expected);
  expect(summary(all, 'b2')).toEqual(expected);

  // Strg+C / Strg+V über Stücke hinweg
  await page.keyboard.press('Control+n'); // kein Kürzel mit Strg → nichts passiert
  await expect(scenes.getByTestId('scene-tab')).toHaveCount(2);
  await page.keyboard.press('Shift+N'); // leere Szene
  await expect(scenes.getByTestId('scene-tab')).toHaveCount(3);
  await expect(fixture('MH 1')).toContainText('–');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Control+c');
  await expect(scenes.getByRole('status').filter({ hasText: 'Werte aus „Anfang“ kopiert' })).toHaveCount(1);
  await page.getByTestId('scenes-items').getByRole('button', { name: /Zweites Stück/ }).click();
  await scenes.getByTestId('scene-tab').nth(1).click();
  await fixture('MH 1').click();
  await page.keyboard.press('3');
  await expect(fixture('MH 1')).toContainText('30 %');
  await page.keyboard.press('Control+v');
  await expect(fixture('MH 1')).toContainText('70 %');
  // grüner Hinweis unten rechts (auch beim Einfügen per Tastenkürzel)
  await expect(page.getByTestId('toast')).toContainText('Inhalt aus „Anfang“ eingefügt');
  await expect(scenes.getByRole('button', { name: 'Einfügen' })).toHaveAttribute('title', /Anfang/);
});
