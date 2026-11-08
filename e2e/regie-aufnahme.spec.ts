import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

// Simuliertes Mikrofon (Chromium), Erlaubnis ohne Nachfrage
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }, permissions: ['microphone'] });

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

test('Aufnahme: einschalten, mit der Wiedergabe aufnehmen, beim Anhalten als Audiodatei beim Punkt gespeichert', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: { schemaVersion: 9, id: 'aufnahme', meta: { name: 'Aufnahme' }, layers: [{ id: 'l1', name: 'Bühne', order: 0 }], show: { items: [{ id: 'a', order: 0, kind: 'song', title: 'Probe', durationSec: 30 }], sections: [] } },
    })
  ).json();
  const media = async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()) as { show: { items: { media?: { label: string; isDefault?: boolean }[] }[] }; media: { mime: string; sizeBytes: number }[] });
  await page.goto(`/projekt/${id}?ansicht=regie`);
  const detail = page.getByTestId('regie-detail');
  await detail.locator('input[type=file]').setInputFiles({ name: 'Playback.wav', mimeType: 'audio/wav', buffer: wav(20) });
  await expect(detail.getByTestId('regie-media-file')).toHaveCount(1);
  const player = detail.getByTestId('regie-player');
  const control = player.getByTestId('record-control');
  await expect(control).toHaveAttribute('data-status', 'off');
  // einschalten: Mikrofon bereit, Aufnahme startet erst mit der Wiedergabe
  await control.getByText('Aufnahme').click();
  await expect(control).toHaveAttribute('data-status', 'ready');
  await player.getByRole('button', { name: 'Abspielen' }).click();
  await expect(control).toHaveAttribute('data-status', 'recording');
  await page.waitForTimeout(2000);
  await player.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(control).toHaveAttribute('data-status', 'ready');
  // gespeichert: zweite Audiodatei „Aufnahme … ab 0:00“, das Playback bleibt Standard
  await expect(detail.getByTestId('regie-media-file')).toHaveCount(2, { timeout: 10_000 });
  await expect.poll(async () => (await media()).show.items[0]!.media!.map((m) => `${m.label.replace(/\d\d\.\d\d\. \d\d:\d\d/, 'X')}|${m.isDefault === true}`)).toEqual(['Playback|true', 'Aufnahme X ab 0:00|false']);
  const rec = (await media()).media.find((m) => m.mime.startsWith('audio/') && m.mime !== 'audio/wav')!;
  expect(rec.sizeBytes).toBeGreaterThan(1000);
  // ausschalten: keine weitere Aufnahme
  await control.getByText('Aufnahme').click();
  await expect(control).toHaveAttribute('data-status', 'off');
  await player.getByRole('button', { name: 'Abspielen' }).click();
  await page.waitForTimeout(800);
  await player.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForTimeout(800);
  await expect(detail.getByTestId('regie-media-file')).toHaveCount(2);

  // auch in der Vorstellung
  const show = await openPerformance(page);
  await expect(show.getByTestId('performance').getByTestId('record-control')).toBeVisible();
});
