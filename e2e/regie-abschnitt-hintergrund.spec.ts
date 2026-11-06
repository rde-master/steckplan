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
// 1×1-PNG; ein angehängtes Byte macht verschiedene Dateien (eigene Kennung im Medienspeicher)
const png = (tag: string) => Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'), Buffer.from(tag)]);

test('Hintergrundbild je Abschnitt: eigenes, vom vorigen Abschnitt übernommen (abschaltbar), sonst Standardbild', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'abschnitt-bild',
        meta: { name: 'Abschnittsbilder' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [],
        cables: [],
        show: {
          items: [{ id: 'lied', order: 0, kind: 'song', title: 'Bilderlied', number: 1, durationSec: 6 }],
          sections: [
            { id: 's1', itemId: 'lied', order: 0, kind: 'verse', label: 'Strophe 1', lines: [{ id: 'z1', text: 'Erste', atSec: 0.5 }] },
            { id: 's2', itemId: 'lied', order: 1, kind: 'chorus', label: 'Refrain', lines: [{ id: 'z2', text: 'Zweite', atSec: 2 }] },
            { id: 's3', itemId: 'lied', order: 2, kind: 'verse', label: 'Strophe 2', lines: [{ id: 'z3', text: 'Dritte', atSec: 4 }] },
          ],
        },
      },
    })
  ).json();
  const project = async () => (await page.request.get(`/api/projects/${id}/download`)).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Ablauf' }).click();
  await page.getByTestId('regie-detail').locator('input[type=file]').setInputFiles({ name: 'Lied.wav', mimeType: 'audio/wav', buffer: wav(6) });
  await expect(page.getByTestId('regie-detail').getByTestId('regie-player').locator('audio')).toHaveCount(1);

  // Standardbild in den Regie-Einstellungen
  await page.getByRole('button', { name: 'Regie-Einstellungen' }).click();
  await page.getByTestId('lyrics-settings').locator('input[type=file]').setInputFiles({ name: 'standard.png', mimeType: 'image/png', buffer: png('standard') });
  await expect(page.getByTestId('lyrics-settings').getByRole('img', { name: 'Hintergrundbild' })).toBeVisible();
  await page.getByRole('button', { name: 'Fertig' }).click();
  const standard = (await project()).showSettings.lyricsBackground.mediaId as string;

  // eigenes Bild für den Refrain (Bereich „Texte“)
  await page.getByRole('radio', { name: 'Texte', exact: true }).click();
  await page.getByLabel('Bild …: Refrain').setInputFiles({ name: 'refrain.png', mimeType: 'image/png', buffer: png('refrain') });
  const sources = page.getByTestId('section-background-source');
  await expect(sources).toHaveText(['Hintergrund im Textfenster: Standardbild', 'Hintergrund im Textfenster: eigenes Bild', 'Hintergrund im Textfenster: von „Refrain“ übernommen']);
  await page.getByTestId('texts-detail').screenshot({ path: 'test-results/abschnitt-hintergrund.png' });
  const refrain = ((await project()).show.sections as { id: string; backgroundMediaId?: string }[]).find((s) => s.id === 's2')!.backgroundMediaId!;
  expect(refrain).not.toBe(standard);

  // Textfenster + Vorstellung: Bild wechselt mit dem Abschnitt der aktuellen Zeile
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Textfenster', exact: true }).click();
  const lyrics = await popupPromise;
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  const active = lyrics.getByTestId('lyrics-background');
  await expect(active).toHaveAttribute('data-media', standard); // vor dem Start: Strophe 1
  await perf.getByLabel('Position').fill('2.5');
  await expect(active).toHaveAttribute('data-media', refrain);
  await perf.getByLabel('Position').fill('4.5');
  await expect(active).toHaveAttribute('data-media', refrain); // Strophe 2 übernimmt

  // Übernahme bei Strophe 2 abschalten → Standardbild
  await page.getByLabel('Bild vom vorigen Abschnitt übernehmen: Strophe 2').uncheck();
  await expect(sources.nth(2)).toHaveText('Hintergrund im Textfenster: Standardbild');
  await expect(active).toHaveAttribute('data-media', standard);
  // Bild am Refrain entfernen → überall Standard, Verweis weg
  await page.getByRole('button', { name: 'Entfernen: Refrain' }).click();
  await expect(sources.nth(1)).toHaveText('Hintergrund im Textfenster: Standardbild');
  await expect.poll(async () => ((await project()).media as { id: string }[]).some((m) => m.id === refrain)).toBe(false);
});
