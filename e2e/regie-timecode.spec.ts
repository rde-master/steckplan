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

test('Timecode je Ablaufpunkt: feste Nummern = Stunde, Lied hängt am Timecode, Stopp am Ende der Dauer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  // ältere Projekte ohne Nummern: in Reihenfolge 1, 2
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'timecode',
        meta: { name: 'Timecode' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [],
        cables: [],
        show: {
          items: [
            { id: 'lied', order: 0, kind: 'song', title: 'Eröffnung', durationSec: 5 },
            { id: 'stueck', order: 1, kind: 'play', title: 'Szene am Brunnen', durationSec: 2 },
          ],
          sections: [],
        },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Ablauf' }).click();
  await expect(page.getByTestId('regie-list').getByTestId('item-number')).toHaveText(['1', '2']);
  const detail = page.getByTestId('regie-detail');
  // Lied: Audio (3 s) kürzer als die Dauer (5 s)
  await page.getByTestId('regie-item').filter({ hasText: 'Eröffnung' }).click();
  await detail.locator('input[type=file]').setInputFiles({ name: 'Eroeffnung.wav', mimeType: 'audio/wav', buffer: wav(3) });
  await expect(detail.getByTestId('regie-player').locator('audio')).toHaveCount(1);
  await expect(detail.getByTestId('timecode')).toHaveText('01:00:00:00');

  // Vorstellung: große Uhr unten rechts; Audio endet bei 3 s, der Timecode läuft bis 5 s und hält an
  await page.getByRole('button', { name: 'Vorstellung' }).click();
  const perf = page.getByTestId('performance');
  const clock = perf.locator('footer > [data-testid=timecode]');
  await expect(clock).toHaveText('01:00:00:00');
  await perf.getByRole('button', { name: 'Abspielen' }).click();
  await expect.poll(() => clock.textContent(), { timeout: 5000 }).toMatch(/^01:00:0[34]:\d\d$/);
  await expect.poll(() => page.evaluate(() => document.querySelector('audio')!.ended || document.querySelector('audio')!.paused)).toBe(true);
  await expect(clock).toHaveText('01:00:05:00', { timeout: 4000 });
  await expect(perf.getByRole('button', { name: 'Abspielen' })).toBeVisible();
  await expect(perf.getByTestId('remaining')).toHaveText('−0:00');
  await page.screenshot({ path: 'test-results/timecode-vorstellung.png' });

  // nächster Punkt ohne Audio: eigene Stunde, läuft mit eigener Uhr bis zur Dauer
  await page.keyboard.press('ArrowDown');
  await expect(clock).toHaveText('02:00:00:00');
  await perf.getByRole('button', { name: 'Abspielen' }).click();
  await expect(clock).toHaveText('02:00:02:00', { timeout: 4000 });
  await expect(perf.getByRole('button', { name: 'Abspielen' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Umsortieren behält die Nummern, „Neu nummerieren“ zählt in Reihenfolge
  await page.getByTestId('regie-item').filter({ hasText: 'Szene am Brunnen' }).click();
  await detail.getByRole('button', { name: 'Nach oben' }).click();
  await expect(page.getByTestId('regie-list').getByTestId('item-number')).toHaveText(['2', '1']);
  await expect(detail.getByLabel('Nr. (Timecode-Stunde)')).toHaveValue('2');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Neu nummerieren' }).click();
  await expect(page.getByTestId('regie-list').getByTestId('item-number')).toHaveText(['1', '2']);
  // von Hand
  await detail.getByLabel('Nr. (Timecode-Stunde)').fill('7');
  await detail.getByLabel('Nr. (Timecode-Stunde)').press('Enter');
  await expect(detail.getByTestId('timecode')).toHaveText('07:00:00:00');
  await page.screenshot({ path: 'test-results/timecode-ablauf.png' });
  await expect
    .poll(async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()).show.items as { title: string; number: number }[]).map((i) => `${i.title}:${i.number}`).sort())
    .toEqual(['Eröffnung:2', 'Szene am Brunnen:7']);
});
