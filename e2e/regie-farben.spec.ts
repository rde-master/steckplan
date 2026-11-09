import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

test('Lied-Farben: Grund- und Sekundärfarbe je Lied (bei den Lichtszenen), als Punkte im Ablauf, in der Vorstellung und der Liedliste; entfernen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: { schemaVersion: 9, id: 'farben', meta: { name: 'Farben' }, layers: [{ id: 'l1', name: 'Bühne', order: 0 }], show: { items: [{ id: 'a', order: 0, kind: 'song', title: 'Rot und Gold' }], sections: [] } },
    })
  ).json();
  const saved = async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()) as { show: { items: { primaryColor?: string; secondaryColor?: string }[] } }).show.items[0]!;
  await page.goto(`/projekt/${id}?ansicht=regie`);
  // nicht mehr im Ablauf, sondern bei den Lichtszenen
  await expect(page.getByTestId('regie-detail')).toBeVisible();
  await expect(page.getByTestId('color-fields')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Lichtszenen' }).click();
  const fields = page.getByTestId('scenes-colors').getByTestId('color-fields');
  await expect(fields).toContainText('keine');
  await fields.getByLabel('Grundfarbe', { exact: true }).fill('#dc2626');
  await fields.getByLabel('Sekundärfarbe', { exact: true }).fill('#eab308');
  await expect.poll(saved).toMatchObject({ primaryColor: '#dc2626', secondaryColor: '#eab308' });
  // Farbpunkte auch in der Liste der Lichtszenen und im Kopf
  const sceneItem = page.getByTestId('scenes-items').locator('li').first();
  await expect(sceneItem.getByTestId('item-primary-color')).toHaveCSS('background-color', 'rgb(220, 38, 38)');
  await expect(sceneItem.getByTestId('item-secondary-color')).toHaveCSS('background-color', 'rgb(234, 179, 8)');
  await expect(page.getByTestId('scenes-detail').getByTestId('item-primary-color')).toBeVisible();
  // Punkte in der Ablaufliste
  await page.getByRole('radio', { name: 'Ablauf' }).click();
  const item = page.getByTestId('regie-item').first();
  await expect(item.getByTestId('item-primary-color')).toHaveCSS('background-color', 'rgb(220, 38, 38)');
  await expect(item.getByTestId('item-secondary-color')).toHaveCSS('background-color', 'rgb(234, 179, 8)');
  // Vorstellung: im Kopf
  const show = await openPerformance(page);
  await expect(show.getByTestId('performance').getByTestId('item-primary-color').first()).toHaveCSS('background-color', 'rgb(220, 38, 38)');
  await show.close();
  // entfernen
  await page.getByRole('radio', { name: 'Lichtszenen' }).click();
  await fields.getByRole('button', { name: 'Sekundärfarbe entfernen' }).click();
  await expect.poll(async () => (await saved()).secondaryColor).toBeUndefined();
  await page.getByRole('radio', { name: 'Ablauf' }).click();
  await expect(item.getByTestId('item-secondary-color')).toHaveCount(0);
});
