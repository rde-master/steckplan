import { expect, test } from '@playwright/test';
import { createProject, loginAs } from './helpers';

// Fehlerseite: Lässt sich ein Teil der Oberfläche nicht laden (oder stürzt eine Ansicht ab), bleibt der Bildschirm
// nicht weiß. Hier ausgelöst über eine Datei der Oberfläche, die nicht ankommt.

test('Fehlerseite: Meldung mit „Neu laden“ statt weißem Bildschirm; Neu laden öffnet die Seite wieder', async ({ page }) => {
  await loginAs(page, 'edit', 'Ralf');
  const url = await createProject(page, 'Fehlerseite');
  await page.route(/\/assets\/ProjectPage-[^/]+\.js/, (route) => route.abort());
  await page.goto(url);
  // erst lädt die Seite einmal von selbst neu (es könnte eine neue Version geben), dann die Meldung
  const screen = page.getByTestId('error-screen');
  await expect(screen).toBeVisible({ timeout: 15_000 });
  await expect(screen).toHaveAttribute('data-mode', 'page');
  await expect(screen.getByRole('heading', { name: 'Da ist etwas schiefgegangen' })).toBeVisible();
  await expect(screen.getByRole('button', { name: 'Zur Startseite' })).toBeVisible();

  await page.unroute(/\/assets\/ProjectPage-[^/]+\.js/);
  await screen.getByRole('button', { name: 'Neu laden' }).click();
  await expect(page.getByRole('tab', { name: 'Projektdaten' })).toBeVisible();
  await expect(page.getByTestId('error-screen')).toHaveCount(0);
});

test('Fehlerseite im Textfenster: bleibt dunkel und lädt von selbst neu', async ({ page }) => {
  await loginAs(page, 'edit', 'Ralf');
  const url = await createProject(page, 'Fehlerseite Text');
  const id = new URL(url).pathname.split('/')[2]!;
  await page.route(/\/assets\/LyricsPage-[^/]+\.js/, (route) => route.abort());
  await page.goto(`/projekt/${id}/text`);
  const screen = page.getByTestId('error-screen');
  await expect(screen).toBeVisible({ timeout: 15_000 });
  await expect(screen).toHaveAttribute('data-mode', 'display');
  await expect(screen).toContainText('lädt gleich neu');
  // kein Knopf – niemand steht am Beamer
  await expect(screen.getByRole('button')).toHaveCount(0);
  expect(await screen.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgb(255, 255, 255)');

  // Datei wieder erreichbar: nach wenigen Sekunden lädt das Textfenster von selbst
  await page.unroute(/\/assets\/LyricsPage-[^/]+\.js/);
  await expect(page.getByTestId('lyrics-page')).toBeVisible({ timeout: 15_000 });
});
