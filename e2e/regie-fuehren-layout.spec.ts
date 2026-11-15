import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

test('Führen: alles ohne Scrollen sichtbar (auch 1280×720), Einstellungen rechts einklappbar (gemerkt), wartender Player wird angezeigt', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'fuehren-layout',
        meta: { name: 'Layout' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [
            { id: 'a', order: 0, kind: 'song', title: 'Eröffnung', durationSec: 200, bpm: 120 },
            { id: 'b', order: 1, kind: 'break', title: 'Pause', durationSec: 900 },
            { id: 'c', order: 2, kind: 'announcement', title: 'Ansage' },
          ],
          sections: [{ id: 's1', itemId: 'a', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'l1', text: 'Erste', atSec: 0 }, { id: 'l2', text: 'Zweite', atSec: 5 }] }],
        },
        lightScenes: [{ id: 'sc1', itemId: 'a', order: 0, name: 'Intro', atSec: 0 }],
        showSettings: { startTime: '19:30' },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  const show = await openPerformance(page);
  await show.setViewportSize({ width: 1280, height: 720 });
  const perf = show.getByTestId('performance');
  await perf.getByRole('radio', { name: 'Führen' }).click();
  const view = perf.getByTestId('lead-view');
  const noScroll = async () => view.evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
  await expect.poll(noScroll).toBe(true);
  // Bedienung und Einstellungen sichtbar, nichts verdeckt
  await expect(perf.getByRole('button', { name: 'Eintrag weiter' })).toBeInViewport();
  await expect(perf.getByTestId('timecode-panel')).toBeInViewport();
  await expect(perf.getByTestId('osc-lead')).toBeInViewport();

  // rechts neben dem Player: Uhrzeit und voraussichtliches Ende (jetzt + 200 s + 900 s), geplantes Ende 19:48:20 → 19:48
  const showClock = perf.getByTestId('show-clock');
  await expect(showClock).toBeInViewport();
  await expect(showClock.getByTestId('show-clock-now')).toHaveText(/^\d\d:\d\d:\d\d$/);
  const expected = await show.evaluate(() => {
    const d = new Date(Date.now() + 1100 * 1000);
    return [d, new Date(d.getTime() + 60_000)].map((x) => `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`);
  });
  await expect(showClock.getByTestId('show-clock-end')).toHaveText(new RegExp(`^(${expected.join('|')})$`));
  await expect(showClock.getByTestId('show-clock-plan')).toContainText('geplant 19:48');
  await expect(showClock.getByTestId('show-clock-plan')).toContainText('(1 ohne Dauer)');
  // die Sekunden laufen
  const first = await showClock.getByTestId('show-clock-now').textContent();
  await expect(showClock.getByTestId('show-clock-now')).not.toHaveText(first!, { timeout: 3000 });
  await perf.locator('footer').screenshot({ path: 'test-results/fuehren-uhr.png' });

  // einklappen → schmale Leiste; bleibt nach dem Neuladen eingeklappt
  await perf.getByTestId('lead-side-hide').click();
  await expect(perf.getByTestId('lead-side')).toHaveCount(0);
  await expect(perf.getByTestId('lead-side-show')).toContainText('Einstellungen');
  await show.reload();
  await show.getByTestId('performance').getByRole('radio', { name: 'Führen' }).click();
  await expect(show.getByTestId('lead-side-show')).toBeVisible();
  await expect.poll(noScroll).toBe(true);

  // Player möchte sich koppeln → Hinweis an der Leiste; ausklappen zeigt die Anfrage
  await page.request.post('/api/player/pair', { data: { name: 'Layout-Beamer', deviceId: 'layout-1' } });
  await expect(show.getByTestId('lead-side-show')).toContainText('möchte sich verbinden', { timeout: 10_000 });
  await expect(show.getByTestId('lead-side-pairing')).toBeVisible();
  await show.getByTestId('lead-side-show').click();
  await expect(show.getByTestId('player-pairing').filter({ hasText: 'Layout-Beamer' })).toBeVisible();
  await show.getByTestId('player-pairing').filter({ hasText: 'Layout-Beamer' }).getByRole('button', { name: 'Ablehnen' }).click();
});
