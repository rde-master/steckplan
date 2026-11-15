import { expect, test } from '@playwright/test';
import { loginAs, openPerformance, uploadMediaFile } from './helpers';

// 1×1-PNG; ein angehängtes Byte macht verschiedene Dateien
const png = (tag: string) => Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'), Buffer.from(tag)]);

test('Textfenster: jeder Bildwechsel nutzt die eingestellte Überblendung (Abschnittsbilder, Wechsel des Hintergrunds)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const files = { std: png('std'), sec1: png('sec1'), sec2: png('sec2'), own: png('own') };
  const ref = (id: keyof typeof files) => ({ id, name: `${id}.png`, mime: 'image/png', sizeBytes: files[id].length, sha256: '', addedAt: '', addedBy: '' });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'ueberblendung',
        meta: { name: 'Überblendung' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [
            { id: 'a', order: 0, kind: 'song', title: 'Mit Abschnittsbildern', durationSec: 30 },
            { id: 'b', order: 1, kind: 'song', title: 'Eigener Hintergrund', durationSec: 30, lyricsBackground: { mediaId: 'own', dim: 0.2, fadeSec: 4 } },
          ],
          sections: [
            { id: 's1', itemId: 'a', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'z1', text: 'Erste', atSec: 0 }], backgroundMediaId: 'sec1' },
            { id: 's2', itemId: 'a', order: 1, kind: 'chorus', label: 'Refrain', lines: [{ id: 'z2', text: 'Zweite', atSec: 5 }], backgroundMediaId: 'sec2' },
            { id: 's3', itemId: 'b', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'z3', text: 'Dritte', atSec: 0 }] },
          ],
        },
        showSettings: { lyricsBackground: { mediaId: 'std', dim: 0.3, fadeSec: 2.5 } },
        media: [ref('std'), ref('sec1'), ref('sec2'), ref('own')],
      },
    })
  ).json();
  for (const [mediaId, data] of Object.entries(files)) await uploadMediaFile(page, id, mediaId, data);

  // Überblendung einstellbar, auch wenn der Hintergrund nur ein Bild hat
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('button', { name: 'Regie-Einstellungen' }).click();
  await expect(page.getByTestId('lyrics-settings').getByText('Überblendung')).toBeVisible();
  await page.getByRole('button', { name: 'Fertig' }).click();

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Textfenster', exact: true }).click();
  const lyrics = await popupPromise;
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  await perf.getByRole('radio', { name: 'Führen' }).click();

  // Abschnittsbilder: in der Überblendung des (Standard-)Hintergrunds
  const active = lyrics.getByTestId('lyrics-background');
  await expect(active).toHaveAttribute('data-media', 'sec1');
  await expect(active).toHaveCSS('transition-duration', '2.5s');
  await perf.getByLabel('Position').fill('6');
  await expect(active).toHaveAttribute('data-media', 'sec2');
  await expect(active).toHaveCSS('transition-duration', '2.5s');

  // anderer Eintrag mit eigenem Hintergrund: blendet in dessen Überblendung (4 s) über den alten – kein Schnitt
  await perf.getByRole('button', { name: 'Eintrag weiter' }).click();
  await expect(active).toHaveAttribute('data-media', 'own');
  const incoming = lyrics.locator('[data-background-key="item-b"]');
  await expect(incoming).toHaveCSS('transition-duration', '4s');
  // während der Überblendung liegen beide übereinander, danach nur noch der neue
  await expect(lyrics.locator('[data-background-key]')).toHaveCount(2);
  await expect(incoming).toHaveCSS('opacity', '1', { timeout: 6000 });
  await expect(lyrics.locator('[data-background-key]')).toHaveCount(1, { timeout: 6000 });

  // zurück: in der Überblendung des Standards (2,5 s)
  await perf.getByRole('button', { name: 'Eintrag zurück' }).click();
  await expect(active).toHaveAttribute('data-media', /sec1|sec2/);
  await expect(lyrics.locator('[data-background-key="standard"]').last()).toHaveCSS('transition-duration', '2.5s');
});
