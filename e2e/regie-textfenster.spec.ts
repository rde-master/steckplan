import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

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

test('Vorstellung: Textfenster mit fünf Zeilen, Countdown zu den nächsten Zeilen, Spulen', async ({ page }) => {
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

  await page.getByRole('button', { name: 'Vorstellung' }).click();
  const perf = page.getByTestId('performance');
  await expect(perf.getByTestId('regie-player')).toBeVisible();
  // vor dem Start: Countdown zu den nächsten fünf Zeilen, danach feste Zeiten
  await expect(perf.getByTestId('line-countdown')).toHaveCount(5);
  await expect(perf.getByTestId('line-countdown').first()).toHaveText('0,5 s');
  await expect(perf.getByTestId('line-time').nth(0)).toHaveText('0:05.5');

  // Textfenster
  const popupPromise = page.waitForEvent('popup');
  await perf.getByRole('button', { name: 'Textfenster' }).click();
  const popup = await popupPromise;
  const rows = popup.getByTestId('lyrics-row');
  await expect(rows).toHaveCount(5);
  await expect(rows).toHaveText([' ', ' ', 'Zeile 1', 'Zeile 2', 'Zeile 3']);

  // an 2,0 s: vorige Zeile 1, aktuelle Zeile 2, dann 3–5; Countdown zur nächsten Zeile 0,5 s
  await page.evaluate(() => {
    document.querySelector('audio')!.currentTime = 2;
  });
  await expect(rows).toHaveText(['Zeile 1', 'Zeile 2', 'Zeile 3', 'Zeile 4', 'Zeile 5']);
  await expect(popup.locator('[data-current]')).toHaveText('Zeile 2');
  await popup.setViewportSize({ width: 1100, height: 560 });
  await popup.screenshot({ path: 'test-results/textfenster.png' });
  await page.screenshot({ path: 'test-results/vorstellung-countdown.png' });
  await expect(perf.getByTestId('line-countdown').first()).toHaveText('0,5 s');

  // Spulen: +5 s, −1 s (Knöpfe), Umschalt+→ (+1 s)
  await perf.getByRole('button', { name: '5 s vor' }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('audio')!.currentTime)).toBeCloseTo(7, 1);
  await perf.getByRole('button', { name: '1 s zurück' }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('audio')!.currentTime)).toBeCloseTo(6, 1);
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => page.evaluate(() => document.querySelector('audio')!.currentTime)).toBeCloseTo(7, 1);
  await expect(popup.locator('[data-current]')).toHaveText('Zeile 7');

  // Vorstellung beenden schließt das Fenster
  await page.keyboard.press('Escape');
  await expect.poll(() => popup.isClosed()).toBe(true);
});
