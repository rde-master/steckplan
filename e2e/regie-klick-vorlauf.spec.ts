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

test('Klick auf jeden Schlag (die „1“ betont) und Vorlauf: am Anfang ein Takt eingezählt, sonst einen Takt früher', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: { schemaVersion: 9, id: 'klick', meta: { name: 'Klick' }, layers: [{ id: 'l1', name: 'Bühne', order: 0 }], show: { items: [{ id: 'a', order: 0, kind: 'song', title: 'Im Takt', durationSec: 20, bpm: 120, timeSignature: '4/4' }], sections: [] } },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  const detail = page.getByTestId('regie-detail');
  await detail.locator('input[type=file]').setInputFiles({ name: 'Song.wav', mimeType: 'audio/wav', buffer: wav(20) });
  await expect(detail.getByTestId('regie-media-file')).toHaveCount(1);
  const player = detail.getByTestId('regie-player');
  const clicks = () => page.evaluate(() => (window as unknown as { __steckplanClicks: { at: number; accent: boolean }[] }).__steckplanClicks.map((c) => c.accent));
  const time = () => page.evaluate(() => document.querySelector('audio')!.currentTime);

  // Vorlauf am Anfang: ein Takt (4 Schläge à 0,5 s) einzählen, erst dann läuft die Musik
  const controls = player.getByTestId('click-controls');
  await controls.getByText('Vorlauf').click();
  await expect(player.getByTestId('preroll-toggle')).toBeChecked();
  await player.getByRole('button', { name: 'Abspielen' }).click();
  await expect.poll(clicks).toEqual([true, false, false, false]);
  await page.waitForTimeout(1000);
  expect(await time()).toBe(0);
  await expect.poll(time, { timeout: 4000 }).toBeGreaterThan(0.3);
  await player.getByRole('button', { name: 'Pause', exact: true }).click();

  // Vorlauf mitten im Lied: einen Takt (2 s) früher
  await player.getByRole('slider', { name: 'Position' }).fill('6');
  await expect.poll(time).toBeCloseTo(6, 0);
  await player.getByRole('button', { name: 'Abspielen' }).click();
  await expect.poll(time).toBeLessThan(5);
  await player.getByRole('button', { name: 'Pause', exact: true }).click();
  await controls.getByText('Vorlauf').click();
  await expect(player.getByTestId('preroll-toggle')).not.toBeChecked();

  // Klick während der Wiedergabe: alle 0,5 s, jede vierte die „1“
  const before = (await clicks()).length;
  await controls.getByText('Klick').click();
  await expect(player.getByTestId('click-toggle')).toBeChecked();
  await player.getByRole('slider', { name: 'Position' }).fill('8');
  await player.getByRole('button', { name: 'Abspielen' }).click();
  await page.waitForTimeout(2600);
  await player.getByRole('button', { name: 'Pause', exact: true }).click();
  const played = (await clicks()).slice(before);
  expect(played.length).toBeGreaterThanOrEqual(4);
  expect(played.length).toBeLessThanOrEqual(7);
  // ab 8 s (Takt 5 beginnt bei 8 s): die erste ist eine „1“, dann drei andere
  expect(played.slice(0, 4)).toEqual([true, false, false, false]);
  // Einstellung bleibt (je Gerät)
  await page.reload();
  await expect(page.getByTestId('regie-player').getByTestId('click-toggle')).toBeChecked();
});
