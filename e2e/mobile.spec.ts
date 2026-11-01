import { expect, test } from '@playwright/test';
import { createProject, loginAs } from './helpers';

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
  await expect(page.getByRole('tab', { name: 'Listen' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Packliste' })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  // Signalfluss: langes Drücken auf das Gerät → Auswahl + Eigenschaften
  await page.getByRole('tab', { name: 'Signalfluss' }).click();
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

  // Änderungsprotokoll als eigene Liste
  await page.getByRole('tab', { name: 'Listen' }).click();
  await page.getByRole('tab', { name: 'Änderungen' }).click();
  await expect(page.getByTestId('changelog')).toContainText('Handy Ralf');
  await expect(page.getByTestId('changelog')).toContainText('1 Gerät geändert');
});
