import { expect, test } from '@playwright/test';
import { loginAs, newContextPage } from './helpers';

test('Regie: Ablauf, Texte, Rollen; Regie-Zugang bearbeitet nur die Regie', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 8,
        id: 'regie',
        meta: { name: 'Sommerfest' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        people: [{ id: 'anna', lastName: 'Muster', firstName: 'Anna', kind: 'Sängerin' }],
        devices: [],
        cables: [],
      },
    })
  ).json();

  await page.goto(`/projekt/${id}?ansicht=regie`);
  const list = page.getByTestId('regie-list');
  await expect(list).toContainText('Noch nichts im Ablauf');
  await list.getByLabel('Beginn').fill('19:30');

  // Lied mit Dauer, Person und eingefügtem Text
  await list.getByRole('button', { name: '+ Lied' }).click();
  const detail = page.getByTestId('regie-detail');
  await detail.getByLabel('Titel').fill('Opener');
  await detail.getByLabel('Dauer').fill('3:40');
  await detail.getByLabel('Dauer').press('Enter');
  // Personen und Notiz sind eingeklappt; geschlossen zeigt die Zeile, was eingetragen ist
  const peopleBox = detail.getByTestId('regie-people');
  await expect(detail.getByRole('checkbox', { name: /Anna Muster/ })).toBeHidden();
  await expect(peopleBox).toContainText('–');
  await peopleBox.getByText('Beteiligte Personen').click();
  await detail.getByRole('checkbox', { name: /Anna Muster/ }).click();
  await peopleBox.getByText('Beteiligte Personen').click();
  await expect(peopleBox).toContainText('Anna Muster');
  const notesBox = detail.getByTestId('regie-notes');
  await notesBox.getByText('Notiz').click();
  await notesBox.getByLabel('Notiz').fill('Mit Gitarre\nzweite Zeile');
  await notesBox.getByText('Notiz', { exact: true }).click();
  await expect(notesBox).toContainText('Mit Gitarre');
  await expect(notesBox.getByLabel('Notiz')).toBeHidden();
  await detail.getByRole('button', { name: 'Text einfügen …' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('[Strophe 1]\nEs war einmal\nein kleiner Ton\n\nRefrain:\nLa la la\nLa la la');
  await page.getByRole('dialog').getByRole('button', { name: 'Einfügen' }).click();
  await expect(detail.getByTestId('regie-section')).toHaveCount(2);
  await expect(detail.getByLabel('Text Refrain')).toHaveValue('La la la\nLa la la');
  // Refrain kopieren
  await detail.getByRole('button', { name: 'Kopieren: Refrain' }).click();
  await expect(detail.getByTestId('regie-section')).toHaveCount(3);

  // Schauspiel: Rollen aus dem Text
  await list.getByRole('button', { name: '+ Schauspiel' }).click();
  await detail.getByLabel('Titel').fill('Die Begegnung');
  await detail.getByLabel('Dauer').fill('8:00');
  await detail.getByLabel('Dauer').press('Enter');
  await detail.getByRole('button', { name: '+ Abschnitt' }).click();
  await detail.getByLabel('Text Szene 1').fill('Hamlet: Sein oder nicht sein,\ndas ist die Frage.\n(Ophelia tritt auf)\nOphelia: Mein Prinz!');
  await detail.getByLabel('Titel').click(); // Feld verlassen
  await expect(detail.getByTestId('regie-role')).toHaveCount(2);
  await detail.getByLabel('gespielt von Ophelia').selectOption({ label: 'Anna Muster' });
  await expect(detail.getByTestId('regie-role').first()).toContainText('2 Zeilen');

  // Pause, Reihenfolge, Startzeiten
  await list.getByRole('button', { name: '+ Pause' }).click();
  await detail.getByLabel('Dauer').fill('15');
  await detail.getByLabel('Dauer').press('Enter');
  const items = list.getByTestId('regie-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(1)).toContainText('19:33');
  await items.nth(0).click();
  await detail.getByRole('button', { name: 'Nach unten', exact: true }).click();
  await expect(items.nth(0)).toContainText('Die Begegnung');
  await expect(items.nth(1)).toContainText('19:38');
  await expect(page.getByTestId('regie-total')).toHaveText('Gesamt 26:40');
  await expect(items.nth(2)).toContainText('15:00');

  // gespeichert
  await expect
    .poll(async () => {
      const p = await (await page.request.get(`/api/projects/${id}/download`)).json();
      return [p.schemaVersion, p.show.items.length, p.show.sections.length, p.showSettings.startTime];
    })
    .toEqual([9, 3, 4, '19:30']);

  // Regie-Zugang: startet in der Regie, darf sie bearbeiten, den Steckplan nicht
  const regie = await newContextPage(browser);
  await regie.setViewportSize({ width: 1440, height: 900 });
  await loginAs(regie, 'direction', 'Regina');
  await regie.goto(`/projekt/${id}`);
  await expect(regie.getByRole('tab', { name: 'Regie' })).toHaveAttribute('aria-selected', 'true');
  await regie.getByTestId('regie-item').filter({ hasText: 'Opener' }).click();
  await regie.getByTestId('regie-detail').getByLabel('Titel').fill('Opener (neu)');
  await expect(items.filter({ hasText: 'Opener (neu)' })).toHaveCount(1);
  await regie.getByRole('tab', { name: 'Projektdaten' }).click();
  await expect(regie.getByLabel('Projektname')).toBeDisabled();
  await regie.getByRole('tab', { name: 'Signalfluss' }).click();
  await expect(regie.getByRole('button', { name: 'Rückgängig' })).toHaveCount(0);
  await expect(regie.getByText('Regie', { exact: true }).first()).toBeVisible();
  // Lese-Zugang sieht die Regie, ändert nichts
  const reader = await newContextPage(browser);
  await reader.setViewportSize({ width: 1440, height: 900 });
  await loginAs(reader, 'read', 'Leo');
  await reader.goto(`/projekt/${id}?ansicht=regie`);
  await reader.getByTestId('regie-item').first().click();
  await expect(reader.getByTestId('regie-detail').getByLabel('Titel')).toBeDisabled();
  await expect(reader.getByRole('button', { name: '+ Lied' })).toHaveCount(0);
});
