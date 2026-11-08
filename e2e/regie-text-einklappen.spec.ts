import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

test('Vorstellung (Frei/Folgen): Text nach links einklappen – wird nicht mehr gezeichnet, Licht/Ton bleibt; je Gerät gemerkt', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'einklappen',
        meta: { name: 'Einklappen' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [{ id: 'a', order: 0, kind: 'song', title: 'Lied', durationSec: 30 }],
          sections: [{ id: 's', itemId: 'a', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'z1', text: 'Eine Zeile', atSec: 1 }] }],
        },
        soundScenes: [{ id: 't1', itemId: 'a', order: 0, name: 'Laut', atSec: 0 }],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  let show = await openPerformance(page);
  let perf = show.getByTestId('performance');
  await expect(perf.getByTestId('performance-text')).toContainText('Eine Zeile');
  await perf.getByTestId('performance-text-hide').click();
  // eingeklappt: kein Text mehr im Fenster, Licht/Ton bleibt
  await expect(perf.getByTestId('performance-text')).toHaveCount(0);
  await expect(perf.getByText('Eine Zeile')).toHaveCount(0);
  await expect(perf.getByRole('tab', { name: 'Ton' })).toBeVisible();
  await expect(perf.getByTestId('performance-text-show')).toBeVisible();
  // bleibt nach dem Neuöffnen eingeklappt
  await show.close();
  show = await openPerformance(page);
  perf = show.getByTestId('performance');
  await expect(perf.getByTestId('performance-text-show')).toBeVisible();
  await expect(perf.getByTestId('performance-text')).toHaveCount(0);
  // wieder einblenden
  await perf.getByTestId('performance-text-show').click();
  await expect(perf.getByTestId('performance-text')).toContainText('Eine Zeile');
});
