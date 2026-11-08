import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

test('Schauspiel: Farbe je Rolle, auf gleichnamige Rollen aller Schauspielstücke übertragen, Sprecher farbig in Vorstellung und Textfenster', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'rollenfarben',
        meta: { name: 'Rollenfarben' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [
            { id: 'p1', order: 0, kind: 'play', title: 'Akt 1', durationSec: 30, roles: [{ id: 'r1', name: 'Hexe' }, { id: 'r2', name: 'Prinz' }] },
            { id: 'p2', order: 1, kind: 'play', title: 'Akt 2', roles: [{ id: 'r3', name: 'hexe' }, { id: 'r4', name: 'König' }] },
          ],
          sections: [{ id: 's1', itemId: 'p1', order: 0, kind: 'scene', label: 'Auftritt', lines: [{ id: 'z1', text: 'Hokuspokus', roleId: 'r1', atSec: 0 }, { id: 'z2', text: 'Halt!', roleId: 'r2', atSec: 5 }] }],
        },
      },
    })
  ).json();
  const roles = async (itemId: string) => ((await (await page.request.get(`/api/projects/${id}/download`)).json()) as { show: { items: { id: string; roles?: { name: string; color?: string }[] }[] } }).show.items.find((i) => i.id === itemId)!.roles;

  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Texte' }).click();
  // ohne Farben: kein Übertragen
  await expect(page.getByTestId('role-colors-apply')).toHaveCount(0);
  await page.getByLabel('Farbe Hexe').fill('#dc2626');
  await expect.poll(async () => (await roles('p1'))![0]!.color).toBe('#dc2626');
  // eine gleichnamige Rolle im anderen Stück („hexe“)
  const apply = page.getByTestId('role-colors-apply');
  await expect(apply).toHaveText('Farben auf alle Schauspielstücke übertragen (1)');
  await apply.click();
  await expect(page.getByRole('status').filter({ hasText: '1 Rolle übernommen' })).toBeVisible();
  await expect.poll(async () => (await roles('p2'))!.map((r) => r.color)).toEqual(['#dc2626', undefined]);
  await expect(apply).toBeDisabled();
  // Farbe entfernen
  await page.getByLabel('Farbe Prinz').fill('#2563eb');
  await page.getByRole('button', { name: 'keine Farbe Prinz' }).click();
  await expect.poll(async () => (await roles('p1'))![1]!.color).toBeUndefined();

  // Sprecher farbig: Vorstellung und Textfenster
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Textfenster', exact: true }).click();
  const popup = await popupPromise;
  const show = await openPerformance(page);
  await expect(show.getByTestId('performance-speaker').first()).toHaveCSS('color', 'rgb(220, 38, 38)');
  await expect(popup.getByTestId('lyrics-speaker').filter({ hasText: 'Hexe' }).first()).toHaveCSS('color', 'rgb(220, 38, 38)');
});
