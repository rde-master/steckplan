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

test('Schauspiel mit Tonaufnahme: Audio im Ablauf, Mitlesen und Mitschreiben in Texte', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'schauspiel-ton',
        meta: { name: 'Schauspiel' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [{ id: 'p', order: 0, kind: 'play', title: 'Der Brunnen', roles: [{ id: 'r1', name: 'Hexe' }] }],
          sections: [{ id: 's1', itemId: 'p', order: 0, kind: 'scene', label: 'Auftritt', lines: [{ id: 'z1', text: 'Wer da?', roleId: 'r1' }, { id: 'z2', text: 'Ich bin es', roleId: 'r1' }] }],
        },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  const detail = page.getByTestId('regie-detail');
  // Ablauf: Audio auch beim Schauspiel
  await expect(detail.getByRole('button', { name: 'Audio hinzufügen' })).toBeVisible();
  await detail.locator('input[type=file]').setInputFiles({ name: 'Probe.wav', mimeType: 'audio/wav', buffer: wav(8) });
  await expect(detail.getByTestId('regie-media-file')).toHaveCount(1);
  await expect(detail.getByTestId('offset-timeline')).toBeVisible();

  // Texte: Mitlesen und Mitschreiben
  await page.getByRole('radio', { name: 'Texte' }).click();
  const texts = page.getByTestId('texts-detail');
  await expect(texts.getByRole('radio', { name: 'Mitlesen' })).toBeVisible();
  await texts.getByRole('radio', { name: 'Mitschreiben' }).click();
  await texts.getByRole('button', { name: 'Abspielen' }).click();
  const next = texts.getByRole('button', { name: /Nächste Zeile/ });
  await expect(next).toContainText('Wer da?');
  await page.waitForTimeout(600);
  await next.click();
  await expect.poll(async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()) as { show: { sections: { lines: { atSec?: number }[] }[] } }).show.sections[0]!.lines[0]!.atSec ?? 0).toBeGreaterThan(0.3);
});
