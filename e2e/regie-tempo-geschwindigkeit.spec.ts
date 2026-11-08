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

test('Manuelles Tempo ändert die Geschwindigkeit: Lied und Timecode laufen um manuell ÷ gespeichert schneller', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: { schemaVersion: 9, id: 'geschwindigkeit', meta: { name: 'Tempo' }, layers: [{ id: 'l1', name: 'Bühne', order: 0 }], show: { items: [{ id: 'a', order: 0, kind: 'song', title: 'Schneller', durationSec: 30, bpm: 120, manualBpm: 132, timeSignature: '4/4' }], sections: [] } },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByTestId('regie-detail').locator('input[type=file]').setInputFiles({ name: 'Song.wav', mimeType: 'audio/wav', buffer: wav(20) });
  await expect(page.getByTestId('regie-detail').getByTestId('regie-media-file')).toHaveCount(1);
  // auch beim Proben im Ablauf
  await expect.poll(() => page.evaluate(() => document.querySelector('audio')?.playbackRate)).toBeCloseTo(1.1, 3);

  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  await perf.getByRole('radio', { name: 'Führen' }).click();
  const lead = perf.getByTestId('lead-view');
  await expect(lead.getByTestId('beat-bpm')).toContainText('132');
  await expect(lead.getByTestId('beat-rate')).toHaveText('110 %');
  await expect.poll(() => show.evaluate(() => document.querySelector('audio')?.playbackRate)).toBeCloseTo(1.1, 3);

  // Timecode läuft 10 % schneller als die Uhr
  await lead.getByRole('button', { name: 'Timecode starten' }).click();
  // nach dem Einschwingen im Fenster selbst messen (Timecode gegen die Uhr des Browsers)
  await show.waitForTimeout(1000);
  const ratio = await show.evaluate(async () => {
    const read = () => {
      const [h, m, s, f] = document.querySelector('[data-testid=lead-view] [data-testid=timecode]')!.textContent!.split(':').map(Number);
      return h! * 3600 + m! * 60 + s! + f! / 25;
    };
    const t0 = read();
    const w0 = performance.now();
    await new Promise((r) => setTimeout(r, 4000));
    return (read() - t0) / ((performance.now() - w0) / 1000);
  });
  expect(ratio).toBeGreaterThan(1.05);
  expect(ratio).toBeLessThan(1.15);
  await lead.getByRole('button', { name: 'Timecode anhalten' }).click();

  // Standard: wieder Originalgeschwindigkeit
  await lead.getByTestId('beat-reset').click();
  await expect(lead.getByTestId('beat-rate')).toHaveCount(0);
  await expect(lead.getByTestId('beat-bpm')).toContainText('120');
  await expect.poll(() => show.evaluate(() => document.querySelector('audio')?.playbackRate)).toBe(1);
});
