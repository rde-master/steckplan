import { expect, test } from '@playwright/test';
import { createProject, loginAs, newContextPage } from './helpers';

test('Bearbeiter trennt ein verbundenes Gerät; dieses verbindet sich erst auf Wunsch neu', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  await createProject(page, 'Trennprobe');
  const url = page.url();

  const reader = await newContextPage(browser);
  await reader.setViewportSize({ width: 1440, height: 900 });
  await loginAs(reader, 'read', 'Leo');
  await reader.goto(url);
  const presence = page.getByTestId('presence');
  await expect(presence).toContainText('Leo');
  // Lesen sieht keinen Trennen-Knopf
  await expect(reader.getByTestId('presence').getByRole('button', { name: /trennen/ })).toHaveCount(0);
  // eigene Verbindung: kein Knopf
  await expect(presence.getByRole('button', { name: 'Ralf trennen' })).toHaveCount(0);

  page.once('dialog', (d) => void d.accept());
  await presence.getByRole('button', { name: 'Leo trennen' }).click();
  await expect(reader.getByTestId('kicked')).toContainText('Die Verbindung wurde von Ralf getrennt.');
  await expect(presence).not.toContainText('Leo');
  // bleibt getrennt
  await reader.waitForTimeout(800);
  await expect(reader.getByTestId('kicked')).toBeVisible();
  // bewusst neu verbinden
  await reader.getByRole('button', { name: 'Neu verbinden' }).click();
  await expect(reader.getByTestId('kicked')).toHaveCount(0);
  await expect(presence).toContainText('Leo');
  await reader.context().close();
});
