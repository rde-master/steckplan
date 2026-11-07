import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('Regie exportieren und in ein anderes Projekt importieren (Regie-Zugang): ersetzen bzw. anhängen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const upload = async (id: string, name: string, items: { id: string; title: string }[]) =>
    (
      await (
        await page.request.post('/api/projects/upload', {
          data: {
            schemaVersion: 9,
            id,
            meta: { name },
            layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
            people: [{ id: `${id}-p`, firstName: 'Erna', lastName: 'Export' }],
            show: {
              items: items.map((i, order) => ({ ...i, order, kind: 'song', number: order + 1, personIds: [`${id}-p`] })),
              sections: items.map((i, order) => ({ id: `${i.id}-s`, itemId: i.id, order, kind: 'verse', label: 'Strophe 1', lines: [{ id: `${i.id}-l`, text: `Text von ${i.title}` }] })),
            },
            showSettings: { startTime: '19:30' },
          },
        })
      ).json()
    ).id as string;
  const source = await upload('rx-quelle', 'Regie Quelle', [
    { id: 'rx-a', title: 'Exportlied Eins' },
    { id: 'rx-b', title: 'Exportlied Zwei' },
  ]);
  const target = await upload('rx-ziel', 'Regie Ziel', [{ id: 'rx-c', title: 'Ziellied' }]);

  // Export
  await page.goto(`/projekt/${source}?ansicht=regie`);
  const list = page.getByTestId('regie-list');
  await expect(list.getByText('Exportlied Zwei')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Regie exportieren' }).click()]);
  expect(download.suggestedFilename()).toBe('Regie Quelle - Regie.regie.json');
  const file = await readFile((await download.path())!, 'utf8');
  expect(JSON.parse(file)).toMatchObject({ format: 'steckplan-regie', projectName: 'Regie Quelle' });

  // Import mit dem Regie-Zugang: Anhängen (Vorgabe bei vorhandener Regie)
  await page.context().clearCookies();
  await loginAs(page, 'direction', 'Rita');
  await page.goto(`/projekt/${target}?ansicht=regie`);
  await expect(page.getByTestId('regie-list').getByText('Ziellied')).toBeVisible();
  await page.getByRole('button', { name: 'Regie importieren' }).click();
  const dialog = page.getByRole('dialog', { name: 'Regie importieren' });
  await dialog.getByLabel('Datei wählen …').setInputFiles({ name: 'regie.regie.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await expect(dialog.getByTestId('regie-import-summary')).toContainText('Aus „Regie Quelle“');
  await expect(dialog.getByTestId('regie-import-summary')).toContainText('2 Einträge');
  // Person gleichen Namens ist im Ziel vorhanden
  await expect(dialog.getByText('Alle Geräte, Personen und Dateien sind im Projekt vorhanden.')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /Anhängen/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Anhängen' }).click();
  await expect(dialog.getByText('2 Einträge übernommen.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).last().click();
  const targetList = page.getByTestId('regie-list');
  await expect(targetList.getByText('Exportlied Zwei')).toBeVisible();
  await expect(targetList.getByText('Ziellied')).toBeVisible();

  // Ersetzen: nur noch die importierten Einträge; nach Neuladen vom Server bestätigt
  await page.getByRole('button', { name: 'Regie importieren' }).click();
  await dialog.getByLabel('Datei wählen …').setInputFiles({ name: 'regie.regie.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await dialog.getByRole('radio', { name: /Ersetzen/ }).check();
  await expect(dialog.getByText(/Die bisherige Regie \(3 Einträge/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Regie ersetzen' }).click();
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).last().click();
  await page.reload();
  await expect(targetList.getByText('Exportlied Eins')).toBeVisible();
  await expect(targetList.getByText('Exportlied Zwei')).toBeVisible();
  await expect(targetList.getByText('Ziellied')).toHaveCount(0);
});
