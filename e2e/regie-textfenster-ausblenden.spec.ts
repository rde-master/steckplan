import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

test('Führen: Text und Hintergrund im Textfenster per Knopf aus- und einblenden', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'textfenster-ausblenden',
        meta: { name: 'Ausblenden' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [{ id: 'song', order: 0, kind: 'song', title: 'Lied', durationSec: 30 }],
          sections: [{ id: 's1', itemId: 'song', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'a1', text: 'Erste Zeile', atSec: 0 }, { id: 'a2', text: 'Zweite Zeile', atSec: 5 }] }],
        },
      },
    })
  ).json();

  await page.goto(`/projekt/${id}?ansicht=regie`);
  // Hintergrundbild einrichten
  await page.getByRole('button', { name: 'Regie-Einstellungen' }).click();
  const setup = page.getByTestId('lyrics-settings');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await setup.locator('input[type=file]').setInputFiles({ name: 'Buehne.png', mimeType: 'image/png', buffer: png });
  await expect(setup.getByRole('img', { name: 'Hintergrundbild' })).toBeVisible();
  await page.getByRole('button', { name: 'Fertig' }).click();

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Textfenster', exact: true }).click();
  const lyrics = await popupPromise;
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  await perf.getByRole('radio', { name: 'Führen' }).click();
  const control = perf.getByTestId('lyrics-control');
  await expect(lyrics.getByTestId('lyrics-active-line')).toContainText('Erste Zeile');
  await expect(lyrics.getByTestId('lyrics-background')).toBeVisible();

  // Text aus: der Text verschwindet, der Hintergrund bleibt
  await control.getByTestId('lyrics-toggle-text').click();
  await expect(control.getByTestId('lyrics-toggle-text')).toHaveAttribute('aria-pressed', 'false');
  await expect(control.getByTestId('lyrics-toggle-text')).toContainText('ausgeblendet');
  await expect(lyrics.getByTestId('lyrics-text-off')).toHaveCSS('opacity', '0');
  await expect(lyrics.getByTestId('lyrics-background')).toBeVisible();
  // auch auf einem anderen Gerät (über den Server)
  const other = await page.context().newPage();
  await other.goto(`/projekt/${id}/text`);
  await expect(other.getByTestId('lyrics-text-off')).toBeAttached();

  // Hintergrund aus: schwarz
  await control.getByTestId('lyrics-toggle-background').click();
  await expect(control.getByTestId('lyrics-toggle-background')).toHaveAttribute('aria-pressed', 'false');
  await expect(lyrics.getByTestId('lyrics-background')).toHaveCount(0);
  await expect(lyrics.locator('[data-media]')).toHaveCSS('opacity', '0');
  await control.screenshot({ path: 'test-results/textfenster-ausblenden.png' });

  // wieder ein
  await control.getByTestId('lyrics-toggle-text').click();
  await control.getByTestId('lyrics-toggle-background').click();
  await expect(lyrics.getByTestId('lyrics-text-off')).toHaveCount(0);
  await expect(lyrics.getByTestId('lyrics-active-line')).toContainText('Erste Zeile');
  await expect(lyrics.getByTestId('lyrics-background')).toBeVisible();
  await expect(other.getByTestId('lyrics-text-off')).toHaveCount(0);
});
