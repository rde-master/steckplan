import { expect, test, type Page } from '@playwright/test';
import { loginAs, newContextPage } from './helpers';

async function openLibrary(page: Page, section = 'device') {
  await page.goto(`/bibliothek?bereich=${section}`);
  await expect(page.getByRole('heading', { name: 'Bibliothek' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('Bibliothek: Stammdaten und Gerätevorlage anlegen, live bei anderen, Lese-Zugang nur ansehen', async ({ page, browser }) => {
  await loginAs(page, 'edit', 'Ralf');
  await openLibrary(page, 'master');
  await page.getByLabel('Kategorie: Name').fill('Licht');
  await page.getByRole('button', { name: 'Farbe #f59e0b' }).click();
  await page.getByRole('button', { name: /Hinzufügen/ }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Licht' })).toBeVisible();

  // Zweiter Browser mit Lese-Zugang schaut zu
  const anna = await newContextPage(browser);
  await loginAs(anna, 'read', 'Anna');
  await openLibrary(anna, 'device');
  await expect(anna.getByRole('button', { name: /Neu: Gerät/ })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Geräte' }).click();
  await page.getByRole('button', { name: /Neu: Gerät/ }).click();
  await page.getByLabel('Name', { exact: true }).fill('Spot 575');
  await page.getByLabel('Hersteller').fill('Lichtbau');
  await page.getByRole('combobox', { name: 'Kategorie', exact: true }).selectOption({ label: 'Licht' });
  await page.getByLabel('Breite (m)').fill('0,45');
  await page.getByLabel('Tiefe (m)').fill('0,3');
  await page.getByRole('button', { name: /Anschluss hinzufügen/ }).click();
  await page.getByLabel('Bezeichnung 1').fill('DMX In');
  await page.getByLabel('Stecker 1').fill('XLR 5');
  await page.getByLabel('Signal 1').fill('DMX');
  await page.getByRole('button', { name: 'Duplizieren 1' }).click();
  await page.getByLabel('Bezeichnung 2').fill('DMX Out');
  await page.getByLabel('Richtung 2').selectOption('out');
  await page.getByRole('button', { name: /Modus hinzufügen/ }).click();
  await page.getByRole('textbox', { name: 'Modus 1' }).fill('16 Kanal');
  await page.getByLabel('Kanäle').fill('16');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Gespeichert.')).toBeVisible();

  // Live beim Lese-Client, ohne Neuladen
  await expect(anna.getByRole('button', { name: /Spot 575/ })).toBeVisible();
  await anna.getByRole('button', { name: /Spot 575/ }).click();
  await expect(anna.getByLabel('Name', { exact: true })).toHaveValue('Spot 575');
  await expect(anna.getByLabel('Name', { exact: true })).toBeDisabled();
  await expect(anna.getByLabel('Breite (m)')).toHaveValue('0,45');
  await expect(anna.getByLabel('Stecker 2')).toHaveValue('XLR 5');
  await expect(anna.getByText('Mit dem Lese-Zugang kann die Bibliothek nur angesehen werden.')).toBeVisible();

  // Kategorie wird verwendet → Löschen nicht möglich, Archivieren angeboten
  await openLibrary(page, 'master');
  await page.getByRole('button', { name: 'Löschen: Licht' }).click();
  await expect(page.getByText('wird noch verwendet')).toBeVisible();
  await expect(page.getByText('Vorlage „Spot 575“')).toBeVisible();
  await page.getByRole('listitem').filter({ hasText: 'Licht' }).getByRole('button', { name: 'Archivieren' }).last().click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Licht' })).toHaveCount(0);
  await page.getByLabel('Archivierte anzeigen').check();
  await expect(page.getByText('archiviert', { exact: true })).toBeVisible();
});

test('Mehrere Anschlüsse auf einmal anlegen (Stagebox mit 32 Eingängen)', async ({ page }) => {
  await loginAs(page, 'edit', 'Ralf');
  await openLibrary(page);
  await page.getByRole('button', { name: /Neu: Gerät/ }).click();
  await page.getByLabel('Name', { exact: true }).fill('Stagebox 32/8');
  await page.getByRole('button', { name: /Mehrere Anschlüsse anlegen/ }).click();

  const bulk = page.getByRole('group', { name: 'Mehrere Anschlüsse anlegen' });
  await bulk.getByLabel('Anzahl').fill('32');
  await bulk.getByLabel('Bezeichnung', { exact: true }).fill('In #');
  await bulk.getByLabel('Stecker').fill('XLR 3');
  await bulk.getByLabel('Signal').fill('Audio');
  await bulk.getByLabel('Führende Nullen').check();
  await expect(bulk.getByTestId('bulk-preview')).toHaveText('Vorschau: In 01, In 02, … In 32');
  await bulk.getByRole('button', { name: '32 Anschlüsse hinzufügen' }).click();
  await expect(bulk).toHaveCount(0);

  // zweiter Block: 8 Ausgänge
  await page.getByRole('button', { name: /Mehrere Anschlüsse anlegen/ }).click();
  await bulk.getByLabel('Anzahl').fill('8');
  await bulk.getByLabel('Bezeichnung', { exact: true }).fill('Out #');
  await bulk.getByRole('combobox', { name: 'Richtung' }).selectOption('out');
  await bulk.getByRole('button', { name: '8 Anschlüsse hinzufügen' }).click();

  await expect(page.getByLabel('Bezeichnung 32', { exact: true })).toHaveValue('In 32');
  await expect(page.getByLabel('Stecker 32', { exact: true })).toHaveValue('XLR 3');
  await expect(page.getByLabel('Bezeichnung 33', { exact: true })).toHaveValue('Out 1');
  await expect(page.getByLabel('Richtung 40', { exact: true })).toHaveValue('out');

  // optische Trennung: Eingänge und Ausgänge in eigenen Gruppen
  await expect(page.getByTestId('ports-in').getByRole('rowheader')).toHaveText('Eingänge (32)');
  await expect(page.getByTestId('ports-out').getByRole('rowheader')).toHaveText('Ausgänge (8)');
  await expect(page.getByTestId('ports-bi')).toHaveCount(0);
  await expect(page.getByTestId('ports-out').getByLabel('Bezeichnung 33', { exact: true })).toHaveValue('Out 1');
  // Richtung ändern → Anschluss wechselt die Gruppe
  await page.getByLabel('Richtung 40', { exact: true }).selectOption('bi');
  await expect(page.getByTestId('ports-bi').getByRole('rowheader')).toHaveText('Ein-/Ausgänge (1)');
  await expect(page.getByTestId('ports-out').getByRole('rowheader')).toHaveText('Ausgänge (7)');

  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Gespeichert.')).toBeVisible();

  const library = await (await page.request.get('/api/library')).json();
  const stagebox = library.templates.find((t: { name: string }) => t.name === 'Stagebox 32/8');
  expect(stagebox.ports).toHaveLength(40);
  expect(new Set(stagebox.ports.map((p: { id: string }) => p.id)).size).toBe(40);

  // alle Anschlüsse auf einmal entfernen (mit Rückfrage)
  await page.getByRole('button', { name: 'Alle Anschlüsse entfernen' }).click();
  await page.getByRole('button', { name: 'Entfernen', exact: true }).click();
  await expect(page.getByLabel('Bezeichnung 1', { exact: true })).toHaveCount(0);
});

test('Gleichzeitiges Ändern: „inzwischen geändert“, trotzdem überschreiben', async ({ page, browser }) => {
  await loginAs(page, 'edit', 'Ralf');
  const tom = await newContextPage(browser);
  await loginAs(tom, 'edit', 'Tom');
  for (const p of [page, tom]) {
    await openLibrary(p);
    await p.getByRole('button', { name: /Spot 575/ }).click();
  }
  await page.getByLabel('Name', { exact: true }).fill('Spot 575 (Ralf)');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Gespeichert.')).toBeVisible();

  await expect(tom.getByText('Ralf hat diese Vorlage gerade geändert')).toBeVisible();
  await tom.getByLabel('Hersteller').fill('Tom Licht');
  await tom.getByRole('button', { name: 'Speichern' }).click();
  await expect(tom.getByText('Diese Vorlage wurde inzwischen von Ralf geändert.')).toBeVisible();
  await tom.getByRole('button', { name: 'Trotzdem überschreiben' }).click();
  await expect(tom.getByText('Gespeichert.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Spot 575/ })).toContainText('Tom Licht');
});

test('Import mit Konfliktabfrage: als Kopie anlegen', async ({ page }) => {
  await loginAs(page, 'edit', 'Ralf');
  const exported = await (await page.request.get('/api/library/export')).json();
  exported.libraryId = 'fremde-bibliothek';
  exported.templates[0].name = 'Spot vom Verein';
  exported.templates.push({ ...exported.templates[0], id: 'neu-wash', name: 'Wash 300' });

  await openLibrary(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Importieren/ }).click();
  await (await chooser).setFiles({ name: 'verein.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Abweichende Vorlagen und Stammdaten')).toBeVisible();
  await expect(dialog.getByText('1 neue Einträge werden ohne Nachfrage übernommen.')).toBeVisible();
  await expect(dialog.getByTestId('conflict')).toContainText('Spot vom Verein');
  await dialog.getByRole('button', { name: 'Als Kopie anlegen' }).first().click();
  await dialog.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  await expect(page.getByText(/Import abgeschlossen: 1 neu, 0 übernommen, 1 als Kopie/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Spot vom Verein \(Kopie\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Wash 300/ })).toBeVisible();
});

test('Projekt aus fremder Bibliothek: Abgleich beim Öffnen', async ({ page, browser }) => {
  await loginAs(page, 'edit', 'Ralf');
  const library = await (await page.request.get('/api/library')).json();
  const spot = library.templates.find((t: { name: string }) => t.name.startsWith('Spot 575'));
  const project = {
    schemaVersion: 3,
    id: 'fremd-1',
    libraryId: 'andere-bibliothek',
    meta: { name: 'Fremdes Projekt' },
    layers: [{ id: 'l1', name: 'Licht', order: 0 }],
    devices: [{ id: 'd1', templateId: spot.id, layerId: 'l1', label: 'Spot 1' }],
    templateSnapshot: [{ ...spot, name: 'Spot (fremde Fassung)' }],
  };
  const uploaded = await page.request.post('/api/projects/upload', { data: project });
  const { id } = await uploaded.json();

  const anna = await newContextPage(browser);
  await loginAs(anna, 'read', 'Anna');
  await anna.goto(`/projekt/${id}?ansicht=projektdaten`);
  await expect(anna.getByText('stammt aus einer anderen Bibliothek')).toBeVisible();
  await expect(anna.getByText('Jemand mit Bearbeiten-Zugang muss entscheiden')).toBeVisible();

  await page.goto(`/projekt/${id}?ansicht=projektdaten`);
  await expect(page.getByLabel('Projektname')).toBeDisabled();
  await page.getByRole('button', { name: 'Abgleich durchführen' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('conflict')).toContainText('Spot (fremde Fassung)');
  await dialog.getByRole('button', { name: 'Eigene behalten' }).first().click();
  await dialog.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  await expect(page.getByLabel('Projektname')).toBeEnabled();
  await expect(anna.getByText('Ralf hat den Vorlagen-Abgleich durchgeführt.')).toBeVisible();
});

test('Multicore-Kabeltyp: 8 Sends und 8 Returns mit XLR an beiden Enden', async ({ page }) => {
  await loginAs(page, 'edit', 'Ralf');
  await openLibrary(page, 'cableType');
  await page.getByRole('button', { name: /Neu: Kabeltyp/ }).click();
  await page.getByLabel('Name', { exact: true }).fill('Multicore 8/8 30 m');
  await page.getByLabel(/Multicore \(mehrere Adern/).check();
  await expect(page.getByLabel('Stecker A', { exact: true })).toHaveCount(0); // einzelner Stecker entfällt
  await page.getByLabel('Name Ende A').fill('Bühne');
  await page.getByLabel('Name Ende B').fill('FOH');

  const bulk = page.getByRole('group', { name: 'Mehrere Adern anlegen' });
  await page.getByRole('button', { name: /Mehrere Adern anlegen/ }).click();
  await bulk.getByLabel('Anzahl').fill('8');
  await bulk.getByLabel('Bezeichnung', { exact: true }).fill('Send #');
  await bulk.getByLabel('Stecker Bühne').fill('XLR 3 Buchse');
  await bulk.getByLabel('Stecker FOH').fill('XLR 3 Stecker');
  await bulk.getByLabel('Signal').fill('Audio');
  await expect(bulk.getByTestId('bulk-channels-preview')).toHaveText('Vorschau: Send 1, Send 2, … Send 8');
  await bulk.getByRole('button', { name: '8 Adern hinzufügen' }).click();

  await page.getByRole('button', { name: /Mehrere Adern anlegen/ }).click();
  await bulk.getByLabel('Anzahl').fill('8');
  await bulk.getByLabel('Bezeichnung', { exact: true }).fill('Return #');
  await bulk.getByLabel('Stecker Bühne').fill('XLR 3 Stecker');
  await bulk.getByLabel('Stecker FOH').fill('XLR 3 Buchse');
  await bulk.getByRole('combobox', { name: 'Richtung' }).selectOption({ label: 'FOH → Bühne' });
  await bulk.getByRole('button', { name: '8 Adern hinzufügen' }).click();

  await expect(page.getByTestId('channels-aToB').getByRole('rowheader')).toHaveText('Bühne → FOH (8)');
  await expect(page.getByTestId('channels-bToA').getByRole('rowheader')).toHaveText('FOH → Bühne (8)');
  await expect(page.getByLabel('Ader 16', { exact: true })).toHaveValue('Return 8');
  await page.getByLabel('Verfügbare Längen (m)').fill('30');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Gespeichert.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Multicore 8\/8 30 m/ })).toContainText('Multicore, 16 Adern');

  const library = await (await page.request.get('/api/library')).json();
  const mc = library.templates.find((t: { name: string }) => t.name === 'Multicore 8/8 30 m');
  expect(mc).toMatchObject({ endALabel: 'Bühne', endBLabel: 'FOH', availableLengthsMm: [30000] });
  expect(mc.channels).toHaveLength(16);
  expect(mc.channels[8]).toMatchObject({ label: 'Return 1', connectorA: 'XLR 3 Stecker', connectorB: 'XLR 3 Buchse', direction: 'bToA' });
});
