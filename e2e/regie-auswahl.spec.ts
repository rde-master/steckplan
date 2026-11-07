import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('Regie: gewähltes Lied bleibt beim Wechsel zwischen Ablauf, Texte, Lichtszenen und Tonszenen (auch nach Neuladen)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'auswahl',
        meta: { name: 'Auswahl' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [
            { id: 's1', kind: 'song', order: 0, title: 'Erstes Lied' },
            { id: 's2', kind: 'song', order: 1, title: 'Zweites Lied' },
          ],
          sections: [],
        },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  const tab = (name: string) => page.getByRole('radio', { name, exact: true }).click();
  // Ablauf: zweites Lied wählen
  await page.getByTestId('regie-list').getByText('Zweites Lied').click();
  await expect(page.getByTestId('regie-detail').getByLabel('Titel')).toHaveValue('Zweites Lied');
  await tab('Texte');
  await expect(page.getByTestId('texts-detail').getByRole('heading', { name: 'Zweites Lied' })).toBeVisible();
  await tab('Lichtszenen');
  await expect(page.getByTestId('scenes-detail')).toHaveAttribute('aria-label', 'Zweites Lied');
  await tab('Tonszenen');
  await expect(page.getByTestId('sound-detail')).toHaveAttribute('aria-label', 'Zweites Lied');
  // in den Tonszenen das erste wählen → auch im Ablauf das erste
  await page.getByTestId('sound-items').getByText('Erstes Lied').click();
  await expect(page.getByTestId('sound-detail')).toHaveAttribute('aria-label', 'Erstes Lied');
  await tab('Ablauf');
  await expect(page.getByTestId('regie-detail').getByLabel('Titel')).toHaveValue('Erstes Lied');
  // nach Neuladen noch dasselbe
  await page.getByTestId('regie-list').getByText('Zweites Lied').click();
  await page.reload();
  await expect(page.getByTestId('regie-detail').getByLabel('Titel')).toHaveValue('Zweites Lied');
  await tab('Texte');
  await expect(page.getByTestId('texts-detail').getByRole('heading', { name: 'Zweites Lied' })).toBeVisible();
});
