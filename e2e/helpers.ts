import { expect, type Browser, type Page } from '@playwright/test';
import { E2E } from '../playwright.config';

export async function loginAs(page: Page, access: 'edit' | 'read', name: string): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/anmelden/);
  await page.getByLabel('Dein Name').fill(name);
  await page.getByLabel('Passwort', { exact: true }).fill(access === 'edit' ? E2E.editPassword : E2E.readPassword);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Projekte' })).toBeVisible();
}

export async function newContextPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

export async function createProject(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: /Neues Projekt/ }).click();
  await page.getByLabel('Projektname').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Neues Projekt' }).click();
  await expect(page).toHaveURL(/\/projekt\//);
  await expect(page.getByLabel('Projektname')).toHaveValue(name);
  return page.url();
}
