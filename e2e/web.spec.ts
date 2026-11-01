import { expect, test } from '@playwright/test';
import { createProject, loginAs, newContextPage } from './helpers';

test('falsches Passwort zeigt einen Fehler', async ({ page }) => {
  await page.goto('/anmelden');
  await page.getByLabel('Dein Name').fill('Test');
  await page.getByLabel('Passwort', { exact: true }).fill('falsch');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('alert')).toContainText('Passwort ist falsch');
});

test('zwei Browser bearbeiten live dasselbe Projekt, Lese-Zugang kann nichts ändern', async ({ page, browser }) => {
  await loginAs(page, 'edit', 'Ralf');
  const url = await createProject(page, 'Stadtfest E2E');

  const tom = await newContextPage(browser);
  await loginAs(tom, 'edit', 'Tom');
  await tom.goto(url);

  const anna = await newContextPage(browser);
  await loginAs(anna, 'read', 'Anna');
  await anna.goto(url);

  // Anwesenheit
  for (const p of [page, tom, anna]) {
    const presence = p.getByTestId('presence');
    await expect(presence).toContainText('Ralf');
    await expect(presence).toContainText('Tom');
    await expect(presence).toContainText('Anna');
  }

  // Live-Bearbeitung in beide Richtungen
  await page.getByLabel('Ort / Veranstaltungsstätte').fill('Marktplatz');
  await expect(tom.getByLabel('Ort / Veranstaltungsstätte')).toHaveValue('Marktplatz');
  await expect(anna.getByLabel('Ort / Veranstaltungsstätte')).toHaveValue('Marktplatz');
  await tom.getByLabel('Planer').fill('Tom Technik');
  await expect(page.getByLabel('Planer')).toHaveValue('Tom Technik');

  // Lese-Zugang: alles gesperrt
  await expect(anna.getByText('Nur lesen', { exact: true })).toBeVisible();
  await expect(anna.getByLabel('Projektname')).toBeDisabled();
  await expect(anna.getByLabel('Notizen')).toBeDisabled();

  // Projektliste mit Lese-Zugang: kein Anlegen/Löschen
  await anna.goto('/');
  await expect(anna.getByText('Stadtfest E2E')).toBeVisible();
  await expect(anna.getByRole('button', { name: /Neues Projekt/ })).toHaveCount(0);
  await expect(anna.getByRole('button', { name: /Löschen/ })).toHaveCount(0);

  // Speichern + Version: nach dem Autosave (1,5 s) gibt es eine erste Version
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Versionen' }).click();
  await expect(page.getByRole('dialog')).toContainText(/von (Ralf|Tom)/, { timeout: 10_000 });
});

test('Projekt löschen und aus dem Papierkorb wiederherstellen', async ({ page }) => {
  await loginAs(page, 'edit', 'Ralf');
  await createProject(page, 'Wegwerfprojekt');
  await page.getByRole('button', { name: 'Zur Projektliste' }).click();
  await page.getByRole('button', { name: 'Löschen: Wegwerfprojekt' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('Wegwerfprojekt')).toHaveCount(0);
  await page.getByRole('button', { name: /Papierkorb/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Wegwerfprojekt');
  await dialog.getByRole('button', { name: 'Wiederherstellen' }).click();
  await dialog.getByRole('button', { name: 'Schließen' }).click();
  await expect(page.getByText('Wegwerfprojekt')).toBeVisible();
});
