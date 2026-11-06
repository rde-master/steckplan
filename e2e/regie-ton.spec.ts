import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

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
  await page.getByRole('button', { name: 'Vorstellung' }).click();
  const perf = page.getByTestId('performance');
  await expect(perf.getByTestId('performance-title')).toContainText('Auftakt');
  await expect(perf.getByTestId('performance-next-item')).toContainText('Als Nächstes: 2 Brunnenszene');
  await perf.getByRole('tab', { name: 'Ton' }).click();
  await expect(perf.locator('.rich-text h3')).toHaveText('Mikros');
  await expect(perf.locator('.rich-text img, .rich-text script')).toHaveCount(0);
  // Liedliste: direkt zu „Chorfinale“
  await perf.getByRole('button', { name: 'Liedliste' }).click();
  await perf.getByTestId('performance-list').getByRole('button', { name: /Chorfinale/ }).click();
  await expect(perf.getByTestId('performance-list')).toBeHidden();
  await expect(perf.getByTestId('performance-title')).toContainText('Chorfinale');
  await expect(perf.getByTestId('performance-next-item')).toHaveCount(0);
  await expect(perf.locator('.rich-text')).toContainText('Chor-Mikros an');
  await page.screenshot({ path: 'test-results/vorstellung-ton.png' });
  // Esc schließt erst die Liste, dann die Vorstellung
  await perf.getByRole('button', { name: 'Liedliste' }).click();
  await page.keyboard.press('Escape');
  await expect(perf.getByTestId('performance-list')).toBeHidden();
  await expect(perf).toBeVisible();
  // die Wahl Licht/Ton bleibt
  await perf.getByRole('tab', { name: 'Licht' }).click();
  await expect(perf.getByRole('tab', { name: 'Licht' })).toHaveAttribute('aria-selected', 'true');
});
