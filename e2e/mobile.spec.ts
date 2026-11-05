import { expect, test } from '@playwright/test';
import { createProject, loginAs, openTab } from './helpers';

test('Handy: Anmeldung und Projekt ohne seitliches Scrollen', async ({ page }) => {
  await loginAs(page, 'edit', 'Handy');
  await createProject(page, 'Handyprojekt');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByLabel('Ort / Veranstaltungsstätte').fill('Wiese');
  await page.screenshot({ path: 'test-results/handy-projekt.png', fullPage: true });
});

test('Handy: Packliste als Startansicht, langes Drücken zeigt Eigenschaften, Änderungsprotokoll', async ({ page }) => {
  await loginAs(page, 'edit', 'Handy Ralf');
  const spot = await (
    await page.request.post('/api/library/templates', {
      data: { template: { kind: 'device', name: 'Spot M8', ports: [{ id: 'in', label: 'DMX In', connector: 'XLR 5', direction: 'in', signal: 'DMX' }] } },
    })
  ).json();
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 3,
        id: 'm8-handy',
        meta: { name: 'Handy-Fest' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [{ id: 'spot', templateId: spot.id, layerId: 'l1', label: 'Spot links', signalFlow: { position: { x: 40, y: 40 } } }],
        cables: [],
      },
    })
  ).json();

  // Ohne Angabe: Packliste
  await page.goto(`/projekt/${id}`);
  const menu = page.getByTestId('mobile-menu');
  await page.getByRole('button', { name: 'Menü öffnen' }).click();
  await expect(menu.getByRole('tab', { name: 'Listen' })).toHaveAttribute('aria-selected', 'true');
  await menu.getByRole('button', { name: 'Menü schließen' }).first().click();
  await expect(page.getByRole('tab', { name: 'Packliste' })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  // Signalfluss: Kopfzeile, große Zeichenfläche, Fußzeile; Werkzeuge im Menü
  await openTab(page, 'Signalfluss');
  await expect(menu).toBeHidden();
  await expect(page.getByRole('toolbar', { name: 'Werkzeuge' })).toBeHidden();
  const footer = page.getByRole('navigation', { name: 'Werkzeuge unten' });
  await expect(footer.getByRole('button', { name: 'Hinzufügen' })).toBeVisible();
  const canvasBox = (await page.locator('.konvajs-content').first().boundingBox())!;
  expect(canvasBox.height).toBeGreaterThan(page.viewportSize()!.height * 0.7);
  await page.getByRole('button', { name: 'Menü öffnen' }).click();
  await expect(menu.getByRole('toolbar', { name: 'Werkzeuge' })).toBeVisible();
  await menu.getByRole('button', { name: 'Menü schließen' }).first().click();

  // Langes Drücken auf das Gerät → Auswahl + Eigenschaften
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.device').length ?? 0)).toBe(1);
  const center = await page.evaluate(() => {
    const stage = window.__steckplanStage!;
    const r = stage.findOne('.device')!.getClientRect();
    const b = stage.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + 8 };
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: center.x, y: center.y }] });
  await page.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const props = page.getByRole('complementary', { name: 'Eigenschaften' });
  await expect(props.getByRole('heading', { name: 'Spot links' })).toBeVisible();

  // Bearbeiten → Server stempelt „zuletzt geändert“
  await props.getByLabel('Kennung').fill('Spot rechts');
  await expect(props.getByTestId('last-modified')).toContainText('Zuletzt geändert von Handy Ralf');

  // Eigenschaften bleiben offen (auch nach Abwählen), bis man sie über ✕ schließt
  await page.keyboard.press('Escape');
  await expect(props).toBeVisible();
  await page.getByRole('button', { name: 'Eigenschaften schließen' }).click();
  await expect(props).toBeHidden();
  // Antippen öffnet die Eigenschaften wieder
  await page.touchscreen.tap(center.x, center.y);
  await expect(props.getByRole('heading', { name: 'Spot rechts' })).toBeVisible();

  // Änderungsprotokoll als eigene Liste
  await openTab(page, 'Listen');
  await page.getByRole('tab', { name: 'Änderungen' }).click();
  await expect(page.getByTestId('changelog')).toContainText('Handy Ralf');
  await expect(page.getByTestId('changelog')).toContainText('1 Gerät geändert');
});
