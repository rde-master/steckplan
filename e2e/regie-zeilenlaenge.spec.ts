import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

const LONG = 'Diese Zeile ist viel zu lang für das Textfenster und wird darum abgeschnitten';

test('Texte: Zeichen je Zeile, Hinweis bei zu langen Zeilen – stimmt mit dem Abschneiden im Textfenster überein', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'zeilenlaenge',
        meta: { name: 'Zeilenlänge' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [{ id: 'a', order: 0, kind: 'song', title: 'Lang', durationSec: 30 }],
          sections: [{ id: 's1', itemId: 'a', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'z1', text: 'Kurze Zeile', atSec: 0 }, { id: 'z2', text: LONG, atSec: 4 }, { id: 'z3', text: '', atSec: 8 }] }],
        },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Texte' }).click();
  const counts = page.getByTestId('line-char-count');
  await expect(counts).toHaveCount(3);
  await expect(counts.nth(0)).toHaveText('11');
  await expect(counts.nth(1)).toHaveText(String(LONG.length));
  await expect(counts.nth(1)).toHaveAttribute('data-too-long', 'true');
  await expect(counts.nth(0)).not.toHaveAttribute('data-too-long', /.*/);
  // Leerzeile (Zwischenspiel): keine Zahl
  await expect(counts.nth(2)).toHaveText(' ');
  await expect(page.getByTestId('lines-too-long')).toContainText('Zeile 2 ist zu lang');
  await expect(page.getByTestId('lines-too-long')).toContainText('abgeschnitten');

  // beim Tippen sofort: Zeile kürzen → Hinweis weg
  const box = page.getByRole('textbox', { name: 'Text Strophe' });
  await box.fill('Kurze Zeile\nJetzt passt sie\n');
  await expect(page.getByTestId('lines-too-long')).toHaveCount(0);
  await expect(counts.nth(1)).toHaveText('15');
  await box.fill(`Kurze Zeile\n${LONG}\n`);
  await expect(page.getByTestId('lines-too-long')).toBeVisible();
  await box.blur();

  // im Textfenster (16:9) wird genau diese Zeile abgeschnitten, die kurze nicht
  const show = await openPerformance(page);
  await show.getByTestId('performance').getByRole('radio', { name: 'Führen' }).click();
  const lyrics = await page.context().newPage();
  await lyrics.setViewportSize({ width: 1920, height: 1080 });
  await lyrics.goto(`/projekt/${id}/text`);
  const cut = (text: string) => lyrics.locator('span.truncate', { hasText: text }).first().evaluate((el) => el.scrollWidth > el.clientWidth);
  await expect.poll(() => cut('Kurze Zeile')).toBe(false);
  await expect.poll(() => cut('Diese Zeile')).toBe(true);
});
