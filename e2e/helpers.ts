import { expect, type Browser, type Page } from '@playwright/test';
import { E2E } from '../playwright.config';

export async function loginAs(page: Page, access: 'edit' | 'read' | 'direction', name: string): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/anmelden/);
  await page.getByLabel('Dein Name').fill(name);
  await page.getByLabel('Passwort', { exact: true }).fill(access === 'edit' ? E2E.editPassword : access === 'direction' ? E2E.directionPassword : E2E.readPassword);
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
  await openTab(page, 'Projektdaten');
  await expect(page.getByLabel('Projektname')).toHaveValue(name);
  return page.url();
}

/** Reiter der Projektseite öffnen – in der Handy-Ansicht über das Burgermenü */
export async function openTab(page: Page, name: string): Promise<void> {
  const menuButton = page.getByRole('button', { name: 'Menü öffnen' });
  const tab = page.getByRole('tab', { name, exact: true });
  await tab.or(menuButton).first().waitFor();
  if (await menuButton.isVisible()) await menuButton.click();
  await tab.click();
}

/** Vorstellung öffnen (eigener Tab): Knopf im Regie-Menü, Ergebnis ist der neue Tab */
export async function openPerformance(page: Page): Promise<Page> {
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Vorstellung' }).click();
  const show = await popup;
  const size = page.viewportSize();
  if (size) await show.setViewportSize(size);
  await show.getByTestId('performance').waitFor();
  return show;
}

/** Datei in den Medienspeicher eines Projekts laden (in Teilen wie die Oberfläche), unter fester Kennung */
export async function uploadMediaFile(page: Page, projectId: string, mediaId: string, data: Buffer): Promise<void> {
  const base = `/api/projects/${encodeURIComponent(projectId)}/media/uploads`;
  const start = (await (await page.request.post(base, { data: { size: data.length, mediaId } })).json()) as { uploadId: string; complete?: unknown };
  if (start.complete) return;
  const put = await page.request.put(`${base}/${start.uploadId}?offset=0`, { data, headers: { 'Content-Type': 'application/octet-stream' } });
  expect(put.ok()).toBe(true);
  const done = await page.request.post(`${base}/${start.uploadId}/complete`);
  expect(done.ok()).toBe(true);
}

/** Kurzes WebM-Video (Farbfläche) im Browser aufnehmen – ohne ffmpeg */
export async function makeWebm(page: Page, color: string, ms = 1200): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ color, ms }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 36;
      const ctx = canvas.getContext('2d')!;
      const stream = canvas.captureStream(15);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      const stopped = new Promise((resolve) => (recorder.onstop = resolve));
      recorder.start(100);
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const draw = () => {
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 64, 36);
          ctx.fillStyle = '#fff';
          ctx.fillRect(((performance.now() - started) / ms) * 64, 10, 6, 16);
          if (performance.now() - started < ms) requestAnimationFrame(draw);
          else resolve();
        };
        draw();
      });
      recorder.stop();
      await stopped;
      const buffer = await new Blob(chunks, { type: 'video/webm' }).arrayBuffer();
      let binary = '';
      for (const b of new Uint8Array(buffer)) binary += String.fromCharCode(b);
      return btoa(binary);
    },
    { color, ms },
  );
  return Buffer.from(base64, 'base64');
}
