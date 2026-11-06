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

test('Tonszenen: formatierter Text je Punkt (bereinigt), Vorstellung mit Licht/Ton, nächstes Lied und Liedliste', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const evil = '<h3>Mikros</h3><p><b>Funk 1</b> <span style="color: rgb(220, 38, 38)">laut</span></p><img src="x" onerror="window.__xss=1"><script>window.__xss=2</script><a href="javascript:window.__xss=3">Link</a>';
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'ton',
        meta: { name: 'Ton' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [],
        cables: [],
        show: {
          items: [
            { id: 'a', order: 0, kind: 'song', title: 'Auftakt', number: 1, soundNotes: evil },
            { id: 'b', order: 1, kind: 'play', title: 'Brunnenszene', number: 2 },
            { id: 'c', order: 2, kind: 'song', title: 'Chorfinale', number: 3 },
          ],
          sections: [],
        },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Tonszenen' }).click();
  await expect(page.getByTestId('sound-items').getByRole('button')).toHaveCount(3);

  // bereinigt: Formatierung bleibt, Bild/Skript/Link nicht, nichts wird ausgeführt
  const editor = page.getByRole('textbox', { name: 'Toninfos zu „Auftakt“' });
  await expect(editor.locator('h3')).toHaveText('Mikros');
  await expect(editor.locator('b')).toHaveText('Funk 1');
  await expect(editor.locator('span')).toHaveCSS('color', 'rgb(220, 38, 38)');
  await expect(editor.locator('img, script, a')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();

  // schreiben und formatieren: Fett + Rot
  await page.getByTestId('sound-items').getByRole('button', { name: /Chorfinale/ }).click();
  const c = page.getByRole('textbox', { name: 'Toninfos zu „Chorfinale“' });
  await c.click();
  await page.keyboard.type('Chor-Mikros an');
  await page.keyboard.press('Control+A');
  await page.getByRole('button', { name: 'Fett' }).click();
  await page.getByRole('button', { name: 'Textfarbe #dc2626' }).click();
  await expect(c.locator('[style*="font-weight"], b')).toHaveCount(1);
  await expect
    .poll(async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()).show.items as { id: string; soundNotes?: string }[]).find((i) => i.id === 'c')?.soundNotes ?? '')
    .toMatch(/Chor-Mikros an/);
  const saved = ((await (await page.request.get(`/api/projects/${id}/download`)).json()).show.items as { id: string; soundNotes?: string }[]).find((i) => i.id === 'c')!.soundNotes!;
  expect(saved).toMatch(/color: rgb\(220, 38, 38\)|#dc2626/);
  expect(saved).toMatch(/font-weight: bold|<b>/);
  await expect(page.getByTestId('sound-items').getByRole('button', { name: /Chorfinale/ }).getByLabel('Toninfos vorhanden')).toBeVisible();

  // Vorstellung: nächstes Lied im Kopf, rechts Licht/Ton
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  await expect(perf.getByTestId('performance-title')).toContainText('Auftakt');
  await expect(perf.getByTestId('performance-next-item')).toContainText('Als Nächstes: 2 Brunnenszene');
  await perf.getByRole('tab', { name: 'Ton' }).click();
  await expect(perf.locator('.rich-text h3')).toHaveText('Mikros');
  await expect(perf.locator('.rich-text img, .rich-text script')).toHaveCount(0);
  expect(await show.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  // Liedliste: direkt zu „Chorfinale“
  await perf.getByRole('button', { name: 'Liedliste' }).click();
  await perf.getByTestId('performance-list').getByRole('button', { name: /Chorfinale/ }).click();
  await expect(perf.getByTestId('performance-list')).toBeHidden();
  await expect(perf.getByTestId('performance-title')).toContainText('Chorfinale');
  await expect(perf.getByTestId('performance-next-item')).toHaveCount(0);
  await expect(perf.locator('.rich-text')).toContainText('Chor-Mikros an');
  await show.screenshot({ path: 'test-results/vorstellung-ton.png' });
  // Esc schließt die Liste (die Vorstellung bleibt – eigener Tab)
  await perf.getByRole('button', { name: 'Liedliste' }).click();
  await show.keyboard.press('Escape');
  await expect(perf.getByTestId('performance-list')).toBeHidden();
  await expect(perf).toBeVisible();
  // die Wahl Licht/Ton bleibt
  await perf.getByRole('tab', { name: 'Licht' }).click();
  await expect(perf.getByRole('tab', { name: 'Licht' })).toHaveAttribute('aria-selected', 'true');
});

test('Tonszenen wie beim Licht: vom Licht übernehmen, Vorstellung mit nächster Szene, Countdown, laufender Zeit, Balken, bleibenden Notizen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'tonszenen',
        meta: { name: 'Tonszenen' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [],
        cables: [],
        show: { items: [{ id: 'lied', order: 0, kind: 'song', title: 'Ballade', number: 1, durationSec: 6 }], sections: [] },
        lightScenes: [
          { id: 'l1', itemId: 'lied', order: 0, name: 'Intro', atSec: 0 },
          { id: 'l2', itemId: 'lied', order: 1, name: 'Refrain', atSec: 2, notes: 'Nebel an' },
          { id: 'l3', itemId: 'lied', order: 2, name: 'Bridge', atSec: 4 },
        ],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Ablauf' }).click();
  const detail = page.getByTestId('regie-detail');
  await detail.locator('input[type=file]').setInputFiles({ name: 'Ballade.wav', mimeType: 'audio/wav', buffer: wav(6) });
  await expect(detail.getByTestId('regie-player').locator('audio')).toHaveCount(1);

  // Tonszenen vom Licht übernehmen, Notiz zur 2. Szene
  await page.getByRole('radio', { name: 'Tonszenen' }).click();
  const sound = page.getByTestId('sound-scenes');
  await sound.getByRole('button', { name: 'Szenen vom Licht übernehmen' }).click();
  await expect(sound.getByRole('status')).toHaveText('3 Szenen übernommen');
  await expect(sound.getByTestId('sound-scene-tab')).toHaveText([/1Intro0:00/, /2Refrain0:02/, /3Bridge0:04/]);
  await sound.getByTestId('sound-scene-tab').nth(1).click();
  await sound.getByRole('textbox', { name: 'Notiz zur Tonszene „Refrain“' }).click();
  await page.keyboard.type('Funk 2 laut');
  await sound.getByLabel('Name der Szene').click(); // Feld verlassen
  await expect
    .poll(async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()).soundScenes as { name: string; notes?: string }[]).find((s) => s.name === 'Refrain')?.notes ?? '')
    .toContain('Funk 2 laut');
  // erneut übernehmen: abgeglichen, Notiz bleibt
  await sound.getByRole('button', { name: 'Szenen vom Licht übernehmen' }).click();
  await expect(sound.getByRole('status')).toHaveText('Abgeglichen – keine neuen Szenen');

  // Vorstellung: Gesamtdauer im Kopf, Licht mit nächster Szene, Countdown, Balken
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  await expect(perf.getByTestId('performance-duration')).toHaveText('(0:06)');
  await perf.getByRole('tab', { name: 'Licht' }).click();
  await expect(perf.getByTestId('performance-scene')).toHaveText('1. Intro');
  await expect(perf.getByTestId('performance-next')).toContainText('Als Nächstes: 2. Refrain');
  await expect(perf.getByTestId('performance-next')).toContainText('ab 0:02');
  await expect(perf.getByTestId('performance-countdown')).toHaveText('−0:02');
  await expect(perf.getByTestId('performance-progress')).toHaveAttribute('data-progress', '0.00');
  await perf.getByLabel('Position').fill('3');
  await expect(perf.getByTestId('performance-scene')).toHaveText('2. Refrain');
  await expect(perf.getByTestId('performance-elapsed')).toHaveText('läuft 0:01');
  await expect(perf.getByTestId('performance-progress')).toHaveAttribute('data-progress', '0.50');
  await expect(perf.getByTestId('performance-scene-note')).toHaveText('Nebel an');
  // Bridge ohne Notiz: die letzte bleibt stehen
  await perf.getByLabel('Position').fill('5');
  await expect(perf.getByTestId('performance-scene')).toHaveText('3. Bridge');
  await expect(perf.getByTestId('performance-scene-note')).toHaveText('Nebel an');
  await expect(perf.getByTestId('performance-next')).toContainText('Ende des Ablaufs');
  // Ton: dieselben Anzeigen, Notiz bleibt ebenso
  await perf.getByRole('tab', { name: 'Ton' }).click();
  await expect(perf.getByTestId('sound-scene')).toHaveText('3. Bridge');
  await expect(perf.locator('.rich-text').first()).toContainText('Funk 2 laut');
  await perf.getByLabel('Position').fill('1');
  await expect(perf.getByTestId('sound-scene')).toHaveText('1. Intro');
  await expect(perf.getByTestId('sound-next')).toContainText('Als Nächstes: 2. Refrain');
  await expect(perf.getByTestId('sound-countdown')).toHaveText('−0:01');
  await expect(perf.getByText('Noch keine Notiz zur Szene.')).toBeVisible();
  await show.screenshot({ path: 'test-results/vorstellung-tonszenen.png' });
  await perf.getByRole('tab', { name: 'Licht' }).click();
  await show.screenshot({ path: 'test-results/vorstellung-lichtszenen.png' });
});
