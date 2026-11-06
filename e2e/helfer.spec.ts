import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('Helfer: Auftritte in den Projektdaten, QR-Code führt auf die Seite der Person (wo einstecken, Anmeldung), Übersicht für Bearbeiten', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const mic = await post({ kind: 'device', name: 'Funkmikro Helfer', usedByPerson: true, ports: [{ id: 'out', label: 'Out', connector: 'XLR', direction: 'out', signal: 'Audio' }] });
  const desk = await post({ kind: 'device', name: 'Pult Helfer', ports: [{ id: 'i1', label: 'In 1', connector: 'XLR', direction: 'in', signal: 'Audio' }] });
  const place = (x: number) => ({ position: { x, y: 1000 }, rotationDeg: 0 });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'helfer',
        meta: { name: 'Helferfest' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0, visible: true, locked: false }],
        people: [
          { id: 'anna', lastName: 'Muster', firstName: 'Anna', kind: 'Gesang' },
          { id: 'ben', lastName: 'Beispiel', firstName: 'Ben' },
        ],
        devices: [
          { id: 'v', templateId: mic.id, layerId: 'l1', label: 'Vox Anna', personId: 'anna', stagePlan: place(1000), signalFlow: { position: { x: 40, y: 40 } } },
          { id: 'desk', templateId: desk.id, layerId: 'l1', label: 'Pult', stagePlan: place(4000), signalFlow: { position: { x: 400, y: 40 } } },
        ],
        cables: [{ id: 'c1', direct: true, from: { deviceId: 'v', portId: 'out' }, to: { deviceId: 'desk', portId: 'i1' }, waypoints: [] }],
      },
    })
  ).json();

  // Auftritt in den Projektdaten anlegen
  await page.goto(`/projekt/${id}?ansicht=projektdaten`);
  const gigs = page.getByTestId('gigs-panel');
  await gigs.getByRole('button', { name: 'Auftritt' }).click();
  const row = gigs.getByTestId('gig-row');
  await row.getByLabel('Titel', { exact: true }).fill('Frühjahrskonzert');
  await row.getByLabel('Ort').fill('Stadthalle');
  await row.getByLabel('Datum').fill('2026-03-14');
  await row.getByLabel('Aufbau ab').fill('16:00');
  await row.getByLabel('Beginn').fill('19:30');

  // Tab „Helfer“: Bearbeiten sieht zuerst die Übersicht
  await page.getByRole('tab', { name: 'Helfer' }).click();
  await expect(page).toHaveURL(/ansicht=helfer/);
  const table = page.getByTestId('helpers-overview-table');
  await expect(table).toContainText('Frühjahrskonzert');
  await expect(table).toContainText('Sa., 14.03.2026 · Aufbau 16:00 · Beginn 19:30');

  // QR-Code auf dem Etikett des Mikros von Anna → ihre Seite (ohne Passwort, auf dem Handy)
  const share = await (await page.request.post(`/api/projects/${id}/share`, { data: {} })).json();
  const phone = await (await browser.newContext({ viewport: { width: 412, height: 860 } })).newPage();
  await phone.goto(`/s/${share.token}?g=v`);
  await expect(phone).toHaveURL(new RegExp(`/projekt/${id}\\?ansicht=helfer&person=anna$`));
  const mine = phone.getByTestId('helper-page');
  await expect(mine.getByRole('heading', { name: 'Hallo Anna!' })).toBeVisible();
  // Helfer sehen nur ihre eigene Seite – keine Auswahl anderer Personen, keine Übersicht
  await expect(phone.getByLabel('Person', { exact: true })).toHaveCount(0);
  await expect(phone.getByRole('button', { name: 'Übersicht' })).toHaveCount(0);
  // wo einstecken: Anschluss → Gegenstelle, Bühnenplan mit dem eigenen Gerät
  await expect(mine.getByTestId('helper-connection')).toContainText('Out');
  await expect(mine.getByTestId('helper-connection')).toContainText('Pult · In 1');
  await expect(mine.getByTestId('helper-stage').locator('svg')).toBeVisible();
  await expect(mine.getByTestId('helper-stage').locator('circle[stroke="#dc2626"]')).toHaveCount(1);
  // ein Klick: anmelden; Anhänger; Bemerkung
  const gig = mine.getByTestId('helper-gig');
  await expect(gig).toContainText('Stadthalle');
  await gig.getByRole('button', { name: 'Ich helfe beim Aufbau' }).click();
  await expect(gig.getByRole('button', { name: /Angemeldet/ })).toBeVisible();
  await expect(gig).toContainText('1 Helfer');
  await gig.getByLabel('Ich fahre einen Anhänger zur Location').check();
  await expect(gig.getByLabel('Ich fahre einen Anhänger zur Location')).toBeChecked();
  await gig.getByLabel('Bemerkung: Frühjahrskonzert').fill('komme erst um 17 Uhr');
  await gig.getByLabel('Bemerkung: Frühjahrskonzert').blur();

  // Übersicht beim Bearbeiten: live aktualisiert
  await expect(table).toContainText('Muster');
  await expect(table.locator('tbody tr').first().locator('td').nth(2)).toContainText('Anna Muster');
  await expect(table).toContainText('komme erst um 17 Uhr');
  const matrix = page.getByTestId('helpers-matrix');
  await expect(matrix.getByRole('row', { name: /Anna Muster/ })).toContainText('✓');
  await expect(matrix.getByRole('row', { name: /Ben Beispiel/ })).not.toContainText('✓');
  // Seite einer Person aus der Übersicht öffnen
  await matrix.getByRole('button', { name: 'Anna Muster' }).click();
  await expect(page.getByTestId('helper-page').getByRole('button', { name: /Angemeldet/ })).toBeVisible();

  // wieder abmelden (Anhänger und Bemerkung bleiben)
  await gig.getByRole('button', { name: /Angemeldet/ }).click();
  await expect(gig.getByRole('button', { name: 'Ich helfe beim Aufbau' })).toBeVisible();
  await expect(gig).toContainText('0 Helfer');
  await page.getByRole('button', { name: 'Übersicht' }).click();
  await expect(matrix.getByRole('row', { name: /Anna Muster/ })).not.toContainText('✓');
  await expect(matrix.getByRole('row', { name: /Anna Muster/ })).toContainText('H');

  // Bearbeiten darf auch für andere eintragen
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Ben Beispiel' });
  const benGig = page.getByTestId('helper-gig');
  await benGig.getByRole('button', { name: 'Ich helfe beim Aufbau' }).click();
  await expect(benGig.getByRole('button', { name: /Angemeldet/ })).toBeVisible();
  // die QR-Sitzung von Anna darf Ben nicht eintragen
  const gigId = (await (await page.request.get(`/api/projects/${id}/download`)).json()).gigs[0].id as string;
  expect((await phone.request.post(`/api/projects/${id}/helper`, { data: { gigId, personId: 'ben', helps: false } })).status()).toBe(403);

  // QR-Sitzung darf sonst nichts ändern
  expect((await phone.request.post(`/api/projects/${id}/check`, { data: { kind: 'device', id: 'v', direction: 'out', status: 'ok' } })).status()).toBe(403);
});
