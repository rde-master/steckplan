import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

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

test('Vorstellung: Tastenkürzel zum Spulen, Stopp, Start/Pause, Liedliste und Übersicht', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'tasten',
        meta: { name: 'Tasten' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [],
        cables: [],
        show: { items: [{ id: 'lied', order: 0, kind: 'song', title: 'Spullied', number: 1, durationSec: 20 }], sections: [] },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Ablauf' }).click();
  await page.getByTestId('regie-detail').locator('input[type=file]').setInputFiles({ name: 'Spul.wav', mimeType: 'audio/wav', buffer: wav(20) });
  await expect(page.getByTestId('regie-detail').getByTestId('regie-player').locator('audio')).toHaveCount(1);
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  const clock = perf.getByTestId('timecode-panel').getByTestId('timecode');
  await expect(clock).toHaveText('00:00:00:00');

  const press = async (key: string, expected: string) => {
    await show.keyboard.press(key);
    await expect(clock).toHaveText(expected);
  };
  await press('.', '00:00:00:12'); // +0,5 s
  await press('l', '00:00:05:12'); // +5 s
  await press('Shift+ArrowRight', '00:00:06:12'); // +1 s
  await press(',', '00:00:06:00'); // −0,5 s
  await press('j', '00:00:01:00'); // −5 s
  await press(']', '00:00:01:02'); // Timecode +0,1 s
  await press('[', '00:00:01:00'); // Timecode −0,1 s
  await press('Shift+ArrowLeft', '00:00:00:00'); // −1 s
  // Start/Pause mit K, Stopp mit S
  await show.keyboard.press('k');
  await expect.poll(() => clock.textContent()).not.toBe('00:00:00:00');
  await show.keyboard.press('k');
  await expect(perf.getByTestId('timecode-panel').getByRole('button', { name: 'Timecode starten' })).toBeVisible();
  await press('s', '00:00:00:00');

  // Übersicht: Knopf bzw. „?“, Esc schließt
  await show.keyboard.press('?');
  const keys = perf.getByTestId('performance-keys');
  await expect(keys).toContainText('5 s zurück / vor');
  await expect(keys).toContainText('nur Timecode 0,1 s zurück / vor');
  await show.screenshot({ path: 'test-results/vorstellung-tasten.png' });
  await show.keyboard.press('Escape');
  await expect(keys).toBeHidden();
  await perf.getByRole('button', { name: 'Tastenkürzel' }).click();
  await expect(keys).toBeVisible();
  await show.keyboard.press('Escape');
  // Z öffnet die Liedliste
  await show.keyboard.press('z');
  await expect(perf.getByTestId('performance-list')).toBeVisible();
  await show.keyboard.press('Escape');
  await expect(perf.getByTestId('performance-list')).toBeHidden();
});
