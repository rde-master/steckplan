import { expect, test } from '@playwright/test';
import { loginAs, newContextPage, openPerformance } from './helpers';

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

test('Folgen: Timecode, Text, Countdown und Szenen laufen mit der führenden Vorstellung mit (ohne eigenen Ton)', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const lines = Array.from({ length: 6 }, (_, i) => ({ id: `z${i + 1}`, text: `Zeile ${i + 1}`, atSec: 0.5 + i }));
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'folgen',
        meta: { name: 'Folgen' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [],
        cables: [],
        show: { items: [{ id: 'lied', order: 0, kind: 'song', title: 'Mitlauf', number: 1, durationSec: 8 }], sections: [{ id: 's1', itemId: 'lied', order: 0, kind: 'verse', label: 'Strophe', lines }] },
        lightScenes: [
          { id: 'a', itemId: 'lied', order: 0, name: 'Anfang', atSec: 0 },
          { id: 'b', itemId: 'lied', order: 1, name: 'Mitte', atSec: 3 },
        ],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Ablauf' }).click();
  await page.getByTestId('regie-detail').locator('input[type=file]').setInputFiles({ name: 'Mitlauf.wav', mimeType: 'audio/wav', buffer: wav(8) });
  await expect(page.getByTestId('regie-detail').getByTestId('regie-player').locator('audio')).toHaveCount(1);
  const lead = await openPerformance(page);
  const r = lead.getByTestId('performance');
  await r.getByRole('radio', { name: 'Führen' }).click();
  await expect(r.getByTestId('performance-lead')).toHaveText('Du führst');

  // Lesen öffnet die Vorstellung → folgt
  const reader = await newContextPage(browser);
  await reader.setViewportSize({ width: 1440, height: 900 });
  await loginAs(reader, 'read', 'Leo');
  await reader.goto(`/projekt/${id}?ansicht=regie`);
  const follow = await openPerformance(reader);
  const l = follow.getByTestId('performance');
  await expect(l.getByRole('radio', { name: 'Folgen' })).toHaveAttribute('aria-checked', 'true');
  const clock = l.getByTestId('timecode-panel').getByTestId('timecode');
  // beim Folgen keine Bedienknöpfe für Audio, Szenen, Timecode und Liedliste
  await expect(l.getByTestId('regie-player')).toHaveCount(0);
  await expect(l.getByRole('button', { name: 'Szene weiter' })).toHaveCount(0);
  await expect(l.getByRole('button', { name: 'Eintrag weiter' })).toHaveCount(0);
  await expect(l.getByRole('button', { name: 'Timecode starten' })).toBeHidden();
  await expect(l.getByRole('button', { name: 'Liedliste' })).toBeHidden();
  await expect(l.getByTestId('timecode-remaining')).toBeVisible();
  await expect(clock).toHaveText('00:00:00:00');

  // Führende startet: beim Folgenden laufen Timecode, Text und Szenen mit
  await r.getByRole('button', { name: 'Abspielen' }).click();
  await expect.poll(() => clock.textContent()).not.toBe('00:00:00:00');
  await expect(l.locator('li[data-current]')).toHaveText(/Zeile 2/, { timeout: 4000 });
  await expect(l.getByTestId('performance-scene')).toHaveText('2. Mitte', { timeout: 4000 });
  await expect(l.getByTestId('performance-elapsed')).toBeVisible();
  // läuft weiter (nicht nur bei Meldungen)
  const t1 = await clock.textContent();
  await follow.waitForTimeout(400);
  expect(await clock.textContent()).not.toBe(t1);
  // kein eigener Ton beim Folgenden
  expect(await follow.evaluate(() => [...document.querySelectorAll('audio')].every((a) => a.paused))).toBe(true);
  // Pause bei der Führenden: Folgender steht
  await r.getByRole('button', { name: 'Pause', exact: true }).click();
  await follow.waitForTimeout(300);
  const stopped = await clock.textContent();
  await follow.waitForTimeout(400);
  expect(await clock.textContent()).toBe(stopped);
  await reader.context().close();
});
