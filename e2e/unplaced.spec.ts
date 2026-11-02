import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('Bühnenplan: „Nicht platziert“ zeigt Person und Besitzer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Platz-Paula');
  const iem = await (await page.request.post('/api/library/templates', { data: { template: { kind: 'device', name: 'In-Ear Platz', usedByPerson: true, ports: [] } } })).json();
  const owner = await (await page.request.post('/api/library/master/owners', { data: { name: 'Verleih Platz' } })).json();
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 7,
        id: 'platz',
        meta: { name: 'Platz' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        people: [{ id: 'anna', lastName: 'Muster', firstName: 'Anna' }],
        devices: [
          { id: 'a', templateId: iem.id, layerId: 'l1', label: 'IEM Anna', personId: 'anna', ownerId: owner.id },
          { id: 'b', templateId: iem.id, layerId: 'l1', label: 'IEM frei' },
        ],
        cables: [],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}`);
  await page.getByRole('tab', { name: 'Bühnenplan' }).click();
  await page.getByRole('tab', { name: /^Nicht platziert/ }).click();
  const list = page.getByTestId('unplaced-list');
  const anna = list.getByRole('listitem').filter({ hasText: 'IEM Anna' });
  await expect(anna.getByTestId('unplaced-person')).toHaveText('Anna Muster');
  await expect(anna.getByTestId('unplaced-owner')).toHaveText('Verleih Platz');
  const free = list.getByRole('listitem').filter({ hasText: 'IEM frei' });
  await expect(free.getByTestId('unplaced-person')).toHaveCount(0);
  await expect(free.getByTestId('unplaced-owner')).toHaveCount(0);
});
