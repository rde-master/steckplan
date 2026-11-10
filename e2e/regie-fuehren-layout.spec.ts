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
          items: [{ id: 'a', order: 0, kind: 'song', title: 'Eröffnung', durationSec: 200, bpm: 120 }],
          sections: [{ id: 's1', itemId: 'a', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'l1', text: 'Erste', atSec: 0 }, { id: 'l2', text: 'Zweite', atSec: 5 }] }],
        },
        lightScenes: [{ id: 'sc1', itemId: 'a', order: 0, name: 'Intro', atSec: 0 }],
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
