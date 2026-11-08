import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

test('Leerzeile im Text (Zwischenspiel): Textfenster hebt nichts hervor, Vorstellung zeigt „Zwischenspiel“', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'leerzeile',
        meta: { name: 'Leerzeile' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [{ id: 'a', order: 0, kind: 'song', title: 'Mit Solo', durationSec: 30 }],
          sections: [{ id: 's1', itemId: 'a', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'z1', text: 'Vor dem Solo', atSec: 0 }, { id: 'z2', text: '', atSec: 4 }, { id: 'z3', text: 'Nach dem Solo', atSec: 8 }] }],
        },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  // im Editor bleibt die Leerzeile im Abschnitt
  await page.getByRole('radio', { name: 'Texte' }).click();
  await expect(page.getByRole('textbox', { name: 'Text Strophe' })).toHaveValue('Vor dem Solo\n\nNach dem Solo');
  await expect(page.getByText('Leere Zeile im Text = Zwischenspiel')).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Textfenster', exact: true }).click();
  const popup = await popupPromise;
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  // erste Zeile: hervorgehoben
  await expect(popup.getByTestId('lyrics-active-line')).toHaveAttribute('data-highlight', 'true');
  // ins Zwischenspiel springen: nichts hervorgehoben
  await page.request.post('/api/remote', { data: { action: 'seek', value: 5 } });
  await expect(popup.locator('[data-testid=lyrics-row][data-current]')).toBeVisible();
  await expect(popup.getByTestId('lyrics-active-line')).not.toHaveAttribute('data-highlight', 'true');
  await expect(popup.locator('[data-highlight]')).toHaveCount(0);
  // in der Vorstellung als „Zwischenspiel“ markiert
  await expect(perf.getByTestId('break-line').first()).toHaveText('♪ Zwischenspiel');
  // danach wieder hervorgehoben
  await page.request.post('/api/remote', { data: { action: 'seek', value: 9 } });
  await expect(popup.getByTestId('lyrics-active-line')).toContainText('Nach dem Solo');
  await expect(popup.getByTestId('lyrics-active-line')).toHaveAttribute('data-highlight', 'true');
});
