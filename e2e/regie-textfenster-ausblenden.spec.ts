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
  await expect(lyrics.getByTestId('lyrics-background-layer')).toHaveAttribute('data-level', '0');
  await expect(lyrics.getByTestId('lyrics-background-layer')).toHaveCSS('opacity', '0');
  await control.screenshot({ path: 'test-results/textfenster-ausblenden.png' });

  // wieder ein
  await control.getByTestId('lyrics-toggle-text').click();
  await control.getByTestId('lyrics-toggle-background').click();
  await expect(lyrics.getByTestId('lyrics-text-off')).toHaveCount(0);
  await expect(lyrics.getByTestId('lyrics-active-line')).toContainText('Erste Zeile');
  await expect(lyrics.getByTestId('lyrics-background')).toBeVisible();
  await expect(other.getByTestId('lyrics-text-off')).toHaveCount(0);

  // Blendzeit der Knöpfe: 2 s (wird mitgeschickt), Standard 0,7 s
  await expect(control.getByTestId('lyrics-fade-value')).toHaveText('0,7 s');
  await expect(lyrics.getByTestId('lyrics-text-layer')).toHaveCSS('transition-duration', '0.7s');
  await control.getByTestId('lyrics-fade').fill('2');
  await expect(control.getByTestId('lyrics-fade-value')).toHaveText('2,0 s');
  await control.getByTestId('lyrics-toggle-text').click();
  await expect(lyrics.getByTestId('lyrics-text-off')).toHaveCSS('transition-duration', '2s');
  await expect(other.getByTestId('lyrics-text-off')).toHaveCSS('transition-duration', '2s');
  await control.getByTestId('lyrics-toggle-text').click();
  await expect(lyrics.getByTestId('lyrics-text-layer')).toHaveAttribute('data-level', '1');

  // Schieberegler: direkt (kurz geglättet), auch auf dem anderen Gerät
  await control.getByTestId('lyrics-level-text').fill('0.4');
  await expect(control.getByTestId('lyrics-level-text-value')).toHaveText('40 %');
  await expect(control.getByTestId('lyrics-toggle-text')).toContainText('40 %');
  await expect(lyrics.getByTestId('lyrics-text-layer')).toHaveAttribute('data-level', '0.4');
  await expect(lyrics.getByTestId('lyrics-text-layer')).toHaveCSS('transition-duration', '0.15s');
  await expect(lyrics.getByTestId('lyrics-text-layer')).toHaveCSS('opacity', '0.4');
  await expect(other.getByTestId('lyrics-text-layer')).toHaveAttribute('data-level', '0.4');
  await control.getByTestId('lyrics-level-background').fill('0');
  await expect(control.getByTestId('lyrics-toggle-background')).toContainText('ausgeblendet');
  await expect(lyrics.getByTestId('lyrics-background-layer')).toHaveAttribute('data-level', '0');
  // Knopf bei teilweise sichtbarem Text: ganz aus
  await control.getByTestId('lyrics-toggle-text').click();
  await expect(lyrics.getByTestId('lyrics-text-off')).toBeAttached();
  await expect(control.getByTestId('lyrics-level-text-value')).toHaveText('0 %');
  // die Blendzeit gilt je Gerät auch nach dem Neuladen
  await show.reload();
  await show.getByTestId('performance').getByRole('radio', { name: 'Führen' }).click();
  await expect(show.getByTestId('lyrics-fade-value')).toHaveText('2,0 s');
});
