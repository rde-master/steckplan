import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('Etiketten-QR: Einstellungen, Export mit QR, Scannen öffnet ohne Passwort die Leseansicht beim Gerät – nur dieses Projekt', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const mic = await (await page.request.post('/api/library/templates', { data: { template: { kind: 'device', name: 'Funkmikro QR', usedByPerson: true, ports: [{ id: 'o', label: 'Out', connector: 'XLR', direction: 'out', signal: 'Audio' }] } } })).json();
  const upload = async (id: string, name: string) =>
    (
      await (
        await page.request.post('/api/projects/upload', {
          data: { schemaVersion: 9, id, meta: { name }, layers: [{ id: 'l1', name: 'Bühne', order: 0 }], devices: [{ id: 'mic1', templateId: mic.id, layerId: 'l1', label: 'Mikro 1', signalFlow: { position: { x: 40, y: 40 } } }], cables: [] },
        })
      ).json()
    ).id as string;
  const id = await upload('qr', 'QR-Fest');
  const other = await upload('qr2', 'Anderes Projekt');

  // Einstellungen: Hinweis ändern
  await page.goto('/einstellungen');
  const settings = page.getByTestId('label-qr-settings');
  await expect(settings.getByLabel('QR-Code auf die Etiketten drucken')).toBeChecked();
  await settings.getByLabel('Hinweis neben dem QR-Code').fill('Aktuelle Infos hier.');
  await settings.getByRole('button', { name: 'Speichern' }).click();
  await expect(settings).toContainText('Gespeichert.');

  // Export der Etiketten legt den Schlüssel an und zeigt den QR-Hinweis
  await page.goto(`/projekt/${id}?ansicht=projektdaten`);
  await page.getByRole('button', { name: 'Exportieren' }).click();
  const dialog = page.getByRole('dialog', { name: 'Exportieren' });
  await dialog.getByLabel('Dokument').selectOption({ label: 'Geräte-Etiketten' });
  await expect(dialog.getByTestId('label-qr-note')).toContainText('Mit QR-Code');
  const share = await (await page.request.get(`/api/projects/${id}/share`)).json();
  expect(share.token).toBeTruthy();

  // Scannen in einem frischen Browser (ohne Anmeldung)
  const phone = await (await browser.newContext({ viewport: { width: 412, height: 860 } })).newPage();
  await phone.goto(`/s/${share.token}?g=mic1`);
  await expect(phone).toHaveURL(new RegExp(`/projekt/${id}\\?ansicht=signalfluss$`));
  const props = phone.getByRole('complementary', { name: 'Eigenschaften' });
  await expect(props.getByRole('heading', { name: 'Mikro 1' })).toBeVisible();
  await expect(props.getByLabel('Kennung')).toBeDisabled();
  // nur dieses Projekt
  expect((await phone.request.get(`/api/projects/${other}`)).status()).toBe(403);
  const list = await (await phone.request.get('/api/projects')).json();
  expect(list.projects.map((p: { id: string }) => p.id)).toEqual([id]);

  // Einstellungen: Schlüssel erneuern → alter Code öffnet nichts mehr
  await page.goto('/einstellungen');
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('label-qr-links').getByRole('button', { name: 'Erneuern' }).click();
  await expect(page.getByText('Neuer Schlüssel')).toBeVisible();
  const again = await phone.request.get(`/s/${share.token}?g=mic1`, { maxRedirects: 0 });
  expect(again.status()).toBe(404);
});
