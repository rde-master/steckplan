import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

function wav(seconds: number): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(rate * seconds * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
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

test('Leerzeile im Text (Zwischenspiel): Textfenster hebt nichts hervor, Vorstellung zeigt „Zwischenspiel“', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'leerzeile',
        meta: { name: 'Leerzeile' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [{ id: 'a', order: 0, kind: 'song', title: 'Mit Solo', durationSec: 30 }],
          sections: [{ id: 's1', itemId: 'a', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'z1', text: 'Vor dem Solo', atSec: 0 }, { id: 'z2', text: '', atSec: 4 }, { id: 'z3', text: 'Nach dem Solo', atSec: 8 }] }],
        },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  // im Editor bleibt die Leerzeile im Abschnitt
  await page.getByRole('radio', { name: 'Texte' }).click();
  await expect(page.getByRole('textbox', { name: 'Text Strophe' })).toHaveValue('Vor dem Solo\n\nNach dem Solo');
  await expect(page.getByText('Leere Zeile im Text = Zwischenspiel')).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Textfenster', exact: true }).click();
  const popup = await popupPromise;
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  // erste Zeile: hervorgehoben
  await expect(popup.getByTestId('lyrics-active-line')).toHaveAttribute('data-highlight', 'true');
  // ins Zwischenspiel springen: nichts hervorgehoben
  await page.request.post('/api/remote', { data: { action: 'seek', value: 5 } });
  await expect(popup.locator('[data-testid=lyrics-row][data-current]')).toBeVisible();
  await expect(popup.getByTestId('lyrics-active-line')).not.toHaveAttribute('data-highlight', 'true');
  await expect(popup.locator('[data-highlight]')).toHaveCount(0);
  // in der Vorstellung als „Zwischenspiel“ markiert
  await expect(perf.getByTestId('break-line').first()).toHaveText('♪ Zwischenspiel');
  // danach wieder hervorgehoben
  await page.request.post('/api/remote', { data: { action: 'seek', value: 9 } });
  await expect(popup.getByTestId('lyrics-active-line')).toContainText('Nach dem Solo');
  await expect(popup.getByTestId('lyrics-active-line')).toHaveAttribute('data-highlight', 'true');
});

test('Leerer Abschnitt (Textfeld ohne Text) kommt beim Mitschreiben als Leerzeile und bekommt eine Zeit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'leerer-abschnitt',
        meta: { name: 'Leerer Abschnitt' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [{ id: 'a', order: 0, kind: 'song', title: 'Mit Solo' }],
          sections: [
            { id: 's1', itemId: 'a', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'z1', text: 'Vor dem Solo' }] },
            { id: 's2', itemId: 'a', order: 1, kind: 'other', label: 'Gitarrensolo', lines: [] },
            { id: 's3', itemId: 'a', order: 2, kind: 'chorus', label: 'Refrain', lines: [{ id: 'z3', text: 'Nach dem Solo' }] },
          ],
        },
      },
    })
  ).json();
  const solo = async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()) as { show: { sections: { id: string; lines: { text: string; atSec?: number }[] }[] } }).show.sections.find((s) => s.id === 's2')!.lines;
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByTestId('regie-detail').locator('input[type=file]').setInputFiles({ name: 'Solo.wav', mimeType: 'audio/wav', buffer: wav(6) });
  await expect(page.getByTestId('regie-detail').getByTestId('regie-player')).toBeVisible();

  await page.getByRole('radio', { name: 'Texte', exact: true }).click();
  const textDetail = page.getByTestId('texts-detail');
  await expect(page.getByRole('textbox', { name: 'Text Gitarrensolo' })).toHaveValue('');
  await textDetail.getByRole('radio', { name: 'Mitschreiben' }).click();
  const lyrics = textDetail.getByTestId('regie-lyrics');
  // der leere Abschnitt steht als Leerzeile (Zwischenspiel) in der Liste
  await expect(lyrics.locator('li')).toHaveCount(3);
  await expect(lyrics.locator('li').nth(1)).toContainText('Gitarrensolo');
  await expect(lyrics.locator('li').nth(1).getByTestId('break-line')).toBeVisible();

  await textDetail.getByRole('button', { name: 'Abspielen' }).click();
  const next = textDetail.getByRole('button', { name: /Nächste Zeile/ });
  for (const wait of [300, 800, 800]) {
    await page.waitForTimeout(wait);
    await next.click();
  }
  await expect(next).toBeDisabled();
  await expect.poll(async () => (await solo()).length).toBe(1);
  expect((await solo())[0]).toMatchObject({ text: '' });
  expect((await solo())[0]!.atSec).toBeGreaterThan(0.5);
  for (const li of await lyrics.locator('li').all()) await expect(li).not.toContainText('–');

  // im Bearbeiten bleibt das Textfeld leer, die Zeit bleibt erhalten
  await textDetail.getByRole('radio', { name: 'Bearbeiten' }).click();
  await expect(page.getByRole('textbox', { name: 'Text Gitarrensolo' })).toHaveValue('');
});
