import { expect, test } from '@playwright/test';
import { createProject, loginAs } from './helpers';

test('Handy: Anmeldung und Projekt ohne seitliches Scrollen', async ({ page }) => {
  await loginAs(page, 'edit', 'Handy');
  await createProject(page, 'Handyprojekt');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByLabel('Ort / Veranstaltungsstätte').fill('Wiese');
  await page.screenshot({ path: 'test-results/handy-projekt.png', fullPage: true });
});
