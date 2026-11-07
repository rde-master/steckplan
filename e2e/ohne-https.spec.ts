import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

// Die Weboberfläche des Desktops läuft über http://<LAN-Adresse> – dort fehlt crypto.randomUUID (nur in sicherem
// Kontext). Die Tests laufen über 127.0.0.1 (gilt als sicher), daher hier nachgestellt.
test('ohne sicheren Kontext (http über LAN): neue Einträge und Tonszenen lassen sich anlegen', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: { schemaVersion: 9, id: 'http', meta: { name: 'Ohne HTTPS' }, layers: [{ id: 'l1', name: 'Bühne', order: 0 }], show: { items: [{ id: 'a', order: 0, kind: 'song', title: 'Lied über LAN', number: 1 }], sections: [] } },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);

  // neuer Eintrag im Ablauf
  await page.getByRole('button', { name: '+ Ansage' }).click();
  await expect(page.getByTestId('regie-list').getByRole('button', { name: /Ansage|ohne Titel/ }).first()).toBeVisible();

  // Tonszene anlegen
  await page.getByRole('radio', { name: 'Tonszenen' }).click();
  await page.getByTestId('sound-items').getByRole('button', { name: /Lied über LAN/ }).click();
  await page.getByRole('button', { name: '+ Szene', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Notiz zur Tonszene „Szene 1“' })).toBeVisible();
  expect(errors).toEqual([]);
});
