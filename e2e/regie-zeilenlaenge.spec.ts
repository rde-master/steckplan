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
  const perf = show.getByTestId('performance');
  await perf.getByRole('radio', { name: 'Führen' }).click();
  const lyrics = await page.context().newPage();
  await lyrics.setViewportSize({ width: 1920, height: 1080 });
  await lyrics.goto(`/projekt/${id}/text`);
  const cut = (text: string) => lyrics.locator('span.truncate', { hasText: text }).first().evaluate((el) => el.scrollWidth > el.clientWidth);
  // aktuelle kurze Zeile passt (läuft nicht), die lange (noch nicht dran) ist mit „…“ abgeschnitten
  await expect(lyrics.locator('[data-scroll-line]', { hasText: 'Kurze Zeile' })).toHaveAttribute('data-scroll', '');
  await expect.poll(() => cut('Diese Zeile')).toBe(true);

  // ist die lange Zeile dran (ab 4 s, letzte Zeile mit Zeit → bis zum Ende bei 30 s), läuft sie je nach Zeit durch:
  // 1 s steht der Anfang, dann läuft sie gleichmäßig, die letzte Sekunde steht das Ende
  const long = lyrics.locator('[data-scroll-line]', { hasText: 'Diese Zeile' });
  const progress = async () => Number(await long.getAttribute('data-scroll'));
  const shift = () => long.locator('span').first().evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
  await perf.getByLabel('Position').fill('4.2');
  await expect.poll(progress).toBe(0);
  await expect.poll(shift).toBe(0);
  await perf.getByLabel('Position').fill('17');
  await expect.poll(progress).toBeCloseTo(0.5, 1);
  await expect.poll(shift).toBeLessThan(-20);
  await lyrics.screenshot({ path: 'test-results/zeile-scrollt.png' });
  await perf.getByLabel('Position').fill('29.5');
  await expect.poll(progress).toBe(1);
  // am Ende: das Ende der Zeile steht rechts im Fenster
  const endVisible = await long.evaluate((el) => {
    const inner = el.firstElementChild!.getBoundingClientRect();
    return Math.abs(inner.right - el.getBoundingClientRect().right) < 2;
  });
  expect(endVisible).toBe(true);
});
