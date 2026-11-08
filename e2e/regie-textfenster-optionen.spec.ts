import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

test('Textfenster: ganzer Textabschnitt, Hervorhebung abschaltbar, Übersetzung (im Bereich Texte eintragen)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'textoptionen',
        meta: { name: 'Textoptionen' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [{ id: 'song', order: 0, kind: 'song', title: 'Zweisprachig', durationSec: 30 }],
          sections: [
            { id: 's1', itemId: 'song', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'a1', text: 'Guten Morgen', atSec: 0.5, translation: 'Good morning' }, { id: 'a2', text: 'Die Sonne scheint', atSec: 1.5 }] },
            { id: 's2', itemId: 'song', order: 1, kind: 'chorus', label: 'Refrain', lines: [{ id: 'b1', text: 'Wir singen', atSec: 10 }, { id: 'b2', text: 'Alle mit', atSec: 12 }] },
          ],
        },
      },
    })
  ).json();
  const saved = async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()) as { show: { sections: { id: string; lines: { id: string; text: string; translation?: string }[] }[] } }).show.sections;

  // Texte: Übersetzung neben dem Text, je Zeile eine
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Texte' }).click();
  await expect(page.getByTestId('translation-toggle')).toBeChecked();
  const translations = page.getByTestId('section-translation');
  await expect(translations).toHaveCount(2);
  await expect(translations.first()).toHaveValue('Good morning');
  await translations.first().fill('Good morning\nThe sun is shining');
  await translations.nth(1).fill('We sing\nEveryone joins\nzu viel');
  await expect(page.getByText('1 Zeile mehr als der Text')).toBeVisible();
  await expect.poll(async () => (await saved()).flatMap((s) => s.lines.map((l) => l.translation))).toEqual(['Good morning', 'The sun is shining', 'We sing', 'Everyone joins']);
  // Text ändern (Zeile eingefügt, Zeile geändert): die Übersetzungen bleiben an ihren Zeilen
  await page.getByRole('textbox', { name: 'Text Strophe' }).fill('Guten Morgen!\nHallo\nDie Sonne scheint');
  await expect.poll(async () => (await saved())[0]!.lines.map((l) => `${l.text}|${l.translation ?? ''}`)).toEqual(['Guten Morgen!|Good morning', 'Hallo|', 'Die Sonne scheint|The sun is shining']);
  await page.getByRole('textbox', { name: 'Text Strophe' }).fill('Guten Morgen!\nDie Sonne scheint');
  await translations.first().fill('Good morning!\nThe sun is shining');

  // Einstellungen: ganzer Abschnitt, Übersetzung
  await page.getByRole('button', { name: 'Regie-Einstellungen' }).click();
  const settings = page.getByTestId('lyrics-settings');
  await settings.getByLabel('Ganzer Textabschnitt').check();
  await expect(settings.getByText('Zeilen davor')).toHaveCount(0);
  await settings.getByLabel('Übersetzung anzeigen').check();
  await page.getByRole('button', { name: 'Fertig' }).click();

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Textfenster', exact: true }).click();
  const popup = await popupPromise;
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  const block = popup.getByTestId('lyrics-block');
  await expect(popup.getByTestId('lyrics-window')).toHaveAttribute('data-mode', 'block');
  // vor dem Start: der erste Abschnitt ganz, mit Übersetzung
  await expect(block).toHaveAttribute('data-section', 's1');
  await expect(block.getByTestId('lyrics-row')).toHaveCount(2);
  await expect(block.getByTestId('lyrics-translation')).toHaveText(['Good morning!', 'The sun is shining']);

  // zum Refrain springen: der ganze Refrain, aktuelle Zeile hervorgehoben
  await page.request.post('/api/remote', { data: { action: 'seek', value: 12.5 } });
  await expect(block).toHaveAttribute('data-section', 's2');
  await expect(block.getByTestId('lyrics-row')).toHaveCount(2);
  await expect(block.getByTestId('lyrics-active-line')).toContainText('Alle mit');
  await expect(block.getByTestId('lyrics-active-line')).toHaveAttribute('data-highlight', 'true');
  await expect(block.getByTestId('lyrics-translation')).toHaveText(['We sing', 'Everyone joins']);

  // Hervorhebung aus
  await page.getByRole('button', { name: 'Regie-Einstellungen' }).click();
  await settings.getByLabel('Aktuelle Zeile hervorheben').uncheck();
  await expect(settings.getByTestId('lyrics-colors')).toHaveCount(0);
  await expect(block.getByTestId('lyrics-active-line')).not.toHaveAttribute('data-highlight', 'true');
  // zurück zu einzelnen Zeilen (mit Übersetzung)
  await settings.getByLabel('Einzelne Zeilen').check();
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(popup.getByTestId('lyrics-window')).toHaveAttribute('data-mode', 'lines');
  await expect(popup.locator('[data-testid=lyrics-row][data-current]')).toContainText('Everyone joins');
  await expect(perf).toBeVisible();
});
