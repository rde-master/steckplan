import { expect, test } from '@playwright/test';
import { loginAs, newContextPage } from './helpers';

function wav(seconds: number): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(rate * seconds * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test('Textfenster: eigene Seite, im selben Browser und auf anderen Geräten (Führen mit Abspielposition), Countdown, Spulen', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const lines = Array.from({ length: 8 }, (_, i) => ({ id: `z${i + 1}`, text: `Zeile ${i + 1}`, atSec: 0.5 + i }));
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'textfenster',
        meta: { name: 'Textfenster' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [],
        cables: [],
        show: { items: [{ id: 'song', order: 0, kind: 'song', title: 'Mitsinglied' }], sections: [{ id: 's1', itemId: 'song', order: 0, kind: 'verse', label: 'Strophe', lines }] },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Ablauf' }).click();
  const detail = page.getByTestId('regie-detail');
  await detail.locator('input[type=file]').setInputFiles({ name: 'Lied.wav', mimeType: 'audio/wav', buffer: wav(12) });
  await expect(detail.getByTestId('regie-player')).toBeVisible();

  // Textfenster aus dem Regie-Menü: eigene Seite mit eigenem Link
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Textfenster', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(new RegExp(`/projekt/${id}/text$`));
  await expect(popup.getByTestId('lyrics-page')).toContainText('Warte auf die Vorstellung');

  // Hintergrundbild einrichten (Medienspeicher), abdunkeln
  await page.getByRole('button', { name: 'Regie-Einstellungen' }).click();
  const setup = page.getByTestId('lyrics-settings');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await setup.locator('input[type=file]').setInputFiles({ name: 'Buehne.png', mimeType: 'image/png', buffer: png });
  await expect(setup.getByRole('img', { name: 'Hintergrundbild' })).toBeVisible();
  await setup.getByRole('slider').fill('0.7');
  // Restzeit: rot ab 5 s, blinkend ab 2 s
  await setup.getByLabel('Restzeit rot ab').fill('5');
  await setup.getByLabel('blinkt ab').fill('2');
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(popup.getByTestId('lyrics-background')).toHaveAttribute('style', /\/media\//);
  const bg = await (await page.request.get(`/api/projects/${id}/download`)).json();
  expect(bg.showSettings.lyricsBackground).toMatchObject({ dim: 0.7 });
  expect(bg.media.some((m: { id: string; mime: string }) => m.id === bg.showSettings.lyricsBackground.mediaId && m.mime === 'image/png')).toBe(true);

  // Vorstellung (ohne Führen): das Fenster im selben Browser folgt
  await page.getByRole('button', { name: 'Vorstellung' }).click();
  const perf = page.getByTestId('performance');
  await expect(perf.getByTestId('regie-player')).toBeVisible();
  const rows = popup.getByTestId('lyrics-row');
  // vor dem Start: die ersten Zeilen auf den Plätzen 3–5
  await expect(rows).toHaveText(['Zeile 1', 'Zeile 2', 'Zeile 3']);
  // Countdown zu den nächsten fünf Zeilen, danach feste Zeiten
  await expect(perf.getByTestId('line-countdown')).toHaveCount(5);
  await expect(perf.getByTestId('line-countdown').first()).toHaveText('0,5 s');
  await expect(perf.getByTestId('line-time').nth(0)).toHaveText('0:05.5');

  // an 2,0 s: vorige Zeile 1, aktuelle Zeile 2 (zentriert), dann 3–5
  await perf.getByLabel('Position').fill('2');
  await expect(rows).toHaveText(['Zeile 1', 'Zeile 2', 'Zeile 3', 'Zeile 4', 'Zeile 5']);
  await expect(popup.locator('[data-current]')).toHaveText('Zeile 2');
  await expect(popup.locator('[data-current]')).toHaveCSS('text-align', 'center');
  await expect(perf.getByTestId('line-countdown').first()).toHaveText('0,5 s');
  // Balken: aktuelle Zeile 2 (1,5 s) halb um (bis 2,5 s), nächste Zeile 3 noch halb
  await expect(perf.getByTestId('line-progress-current')).toHaveAttribute('data-progress', '0.50');
  await expect(perf.getByTestId('line-progress-next')).toHaveAttribute('data-progress', '0.50');
  await expect(perf.locator('li[data-current]').getByTestId('line-progress-current')).toHaveCount(1);
  await expect(popup.getByTestId('line-progress-current')).toHaveCount(0);
  await popup.setViewportSize({ width: 1100, height: 600 });
  await popup.waitForTimeout(900); // Animation abwarten
  await popup.screenshot({ path: 'test-results/textfenster.png' });
  await page.screenshot({ path: 'test-results/vorstellung-countdown.png' });

  // anderes Gerät: Link öffnen (Lese-Zugang), Vorstellung führt mit Abspielposition
  const other = await newContextPage(browser);
  await loginAs(other, 'read', 'Bühne links');
  await other.goto(`/projekt/${id}/text`);
  await expect(other.getByTestId('lyrics-page')).toContainText('Führen');
  await perf.getByRole('radio', { name: 'Führen' }).click();
  const otherCurrent = other.locator('[data-current]');
  await expect(otherCurrent).toHaveText('Zeile 2');
  // Spulen: +5 s, −1 s (Knöpfe), Umschalt+→ (+1 s) – wirkt auch auf dem anderen Gerät
  await perf.getByRole('button', { name: '5 s vor', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('audio')!.currentTime)).toBeCloseTo(7, 1);
  await perf.getByRole('button', { name: '1 s zurück', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('audio')!.currentTime)).toBeCloseTo(6, 1);
  await perf.getByRole('button', { name: '0,5 s vor' }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('audio')!.currentTime)).toBeCloseTo(6.5, 1);
  await perf.getByRole('button', { name: '0,5 s zurück' }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('audio')!.currentTime)).toBeCloseTo(6, 1);
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => page.evaluate(() => document.querySelector('audio')!.currentTime)).toBeCloseTo(7, 1);
  await expect(otherCurrent).toHaveText('Zeile 7');
  await expect(popup.locator('[data-current]')).toHaveText('Zeile 7');
  // Wiedergabe läuft: das andere Gerät zählt selbst weiter
  await perf.getByLabel('Position').fill('3');
  await expect(otherCurrent).toHaveText('Zeile 3');
  await perf.getByRole('button', { name: 'Abspielen' }).click();
  await expect(otherCurrent).toHaveText('Zeile 4', { timeout: 3000 });
  await other.context().close();

  // Zeilen vor/nach der aktuellen einstellen: 2 davor, 5 danach
  await page.keyboard.press('Escape');
  await expect(perf).toBeHidden();
  // Schließen der Vorstellung: Seite bleibt bedienbar, das Textfenster wartet wieder
  await expect(page.getByRole('radio', { name: 'Lichtszenen' })).toBeVisible();
  await expect(popup.getByTestId('lyrics-page')).toContainText('Warte auf die Vorstellung');
  await page.getByRole('button', { name: 'Regie-Einstellungen' }).click();
  await page.getByLabel('vor der aktuellen').selectOption('2');
  await page.getByLabel('nach der aktuellen').selectOption('5');
  await page.getByRole('button', { name: 'Fertig' }).click();
  await page.getByRole('button', { name: 'Vorstellung' }).click();
  await perf.getByLabel('Position').fill('3');
  // aktuell Zeile 3 → Zeile 1–2 davor, Zeile 4–8 danach
  await expect(rows).toHaveText(['Zeile 1', 'Zeile 2', 'Zeile 3', 'Zeile 4', 'Zeile 5', 'Zeile 6', 'Zeile 7', 'Zeile 8']);
  await expect(popup.locator('[data-current]')).toHaveText('Zeile 3');
  const saved = await (await page.request.get(`/api/projects/${id}/download`)).json();
  expect(saved.showSettings).toMatchObject({ lyricsBefore: 2, lyricsAfter: 5, remainWarnSec: 5, remainBlinkSec: 2 });

  // Restzeit rechts im Player (Titel 12 s): normal, dann rot, dann blinkend
  const remaining = perf.getByTestId('remaining');
  await expect(remaining).toHaveText('−0:09');
  await expect(remaining).toHaveAttribute('data-state', 'normal');
  await perf.getByLabel('Position').fill('9');
  await expect(remaining).toHaveText('−0:03');
  await expect(remaining).toHaveAttribute('data-state', 'warn');
  await perf.getByTestId('regie-player').screenshot({ path: 'test-results/restzeit.png' });
  await perf.getByLabel('Position').fill('10.5');
  // angehalten: rot, aber kein Blinken; läuft: blinkt in den letzten 2 s
  await expect(remaining).toHaveAttribute('data-state', 'warn');
  await perf.getByRole('button', { name: 'Abspielen' }).click();
  await expect(remaining).toHaveAttribute('data-state', 'blink');
});
