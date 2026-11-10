import { expect, test } from '@playwright/test';
import { loginAs, makeWebm, openPerformance, uploadMediaFile } from './helpers';

test('Textfenster: Videos als Hintergrund – mehrere hintereinander, in Schleife oder einmalig; eigener Hintergrund je Eintrag', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const red = await makeWebm(page, '#c00000');
  const blue = await makeWebm(page, '#0000c0');
  const media = (id: string, size: number) => ({ id, name: `${id}.webm`, mime: 'video/webm', sizeBytes: size, sha256: '', addedAt: '', addedBy: '' });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'videos',
        meta: { name: 'Videos' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [
            { id: 'a', order: 0, kind: 'song', title: 'Mit Standard', durationSec: 60 },
            { id: 'b', order: 1, kind: 'song', title: 'Eigene Videos', durationSec: 60 },
          ],
          sections: [
            { id: 's1', itemId: 'a', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'a1', text: 'Erstes Lied', atSec: 0 }] },
            { id: 's2', itemId: 'b', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'b1', text: 'Zweites Lied', atSec: 0 }] },
          ],
        },
        media: [media('rot', red.length), media('blau', blue.length)],
      },
    })
  ).json();
  await uploadMediaFile(page, id, 'rot', red);
  await uploadMediaFile(page, id, 'blau', blue);

  // Standard: zwei Videos in Schleife (Regie-Einstellungen)
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('button', { name: 'Regie-Einstellungen' }).click();
  const settings = page.getByTestId('lyrics-settings');
  await settings.locator('input[type=file]').setInputFiles({ name: 'rot.webm', mimeType: 'video/webm', buffer: red });
  await expect(settings.getByTestId('background-video').first()).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await settings.getByTestId('lyrics-add-slide').click();
  await (await chooser).setFiles({ name: 'blau.webm', mimeType: 'video/webm', buffer: blue });
  await expect(settings.getByTestId('lyrics-slide')).toHaveCount(2);
  await expect(settings.getByTestId('lyrics-slide').first()).toHaveAttribute('data-kind', 'video');
  await expect(settings.getByLabel('In Schleife')).toBeChecked();
  await page.getByRole('button', { name: 'Fertig' }).click();

  // Eintrag 2: eigener Hintergrund, ein Video einmalig
  await page.getByTestId('regie-item').filter({ hasText: 'Eigene Videos' }).click();
  const own = page.getByTestId('regie-item-background');
  await expect(own).toContainText('Standard');
  await own.locator('summary').click();
  await own.locator('input[type=file]').setInputFiles({ name: 'blau2.webm', mimeType: 'video/webm', buffer: blue });
  await expect(own.getByTestId('background-video')).toBeVisible();
  await expect(own.getByLabel('Einmalig')).toBeVisible();
  await own.getByLabel('Einmalig').check();
  const saved = async () => (await (await page.request.get(`/api/projects/${id}/download`)).json()) as { showSettings: { lyricsBackground?: { mediaId: string; slides?: string[] } }; show: { items: { id: string; lyricsBackground?: { mediaId: string; loop?: boolean } }[] } };
  await expect.poll(async () => (await saved()).show.items.find((i) => i.id === 'b')?.lyricsBackground?.loop).toBe(false);
  const standard = (await saved()).showSettings.lyricsBackground!;
  expect(standard.slides).toHaveLength(1);
  await page.screenshot({ path: 'test-results/videos-eintrag.png' });

  // Textfenster: Eintrag 1 → Standard-Videos laufen nacheinander (Schleife: wieder das erste)
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Textfenster', exact: true }).click();
  const lyrics = await popupPromise;
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  await perf.getByRole('radio', { name: 'Führen' }).click();
  const active = lyrics.getByTestId('lyrics-background');
  await expect(active).toHaveAttribute('data-kind', 'video');
  const first = await active.getAttribute('data-media');
  expect(first).toBe(standard.mediaId);
  await expect.poll(async () => lyrics.locator('video[data-testid=lyrics-background]').evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0)).toBe(true);
  // nach dem Ende des ersten: das zweite, danach wieder das erste
  await expect(active).toHaveAttribute('data-media', standard.slides![0]!, { timeout: 10_000 });
  await expect(active).toHaveAttribute('data-media', first!, { timeout: 10_000 });

  // Eintrag 2: eigenes Video, einmalig → bleibt am Ende stehen
  await perf.getByRole('button', { name: 'Eintrag weiter' }).click();
  await expect(lyrics.getByTestId('lyrics-active-line')).toContainText('Zweites Lied');
  const ownId = (await saved()).show.items.find((i) => i.id === 'b')!.lyricsBackground!.mediaId;
  await expect(active).toHaveAttribute('data-media', ownId);
  await expect.poll(async () => lyrics.locator('video[data-testid=lyrics-background]').evaluate((v: HTMLVideoElement) => v.ended), { timeout: 10_000 }).toBe(true);
  await expect(active).toHaveAttribute('data-media', ownId);
  await lyrics.screenshot({ path: 'test-results/videos-textfenster.png' });
});
