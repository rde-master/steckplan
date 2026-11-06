import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { loginAs } from './helpers';

/** WAV (Mono, 8 kHz, 16 Bit) mit leisem Ton – spielt in jedem Browser */
function wav(seconds: number): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 2000), i * 2);
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

test('Regie Medien: Audio hochladen, abspielen, Zeiten mitschreiben, mitlesen; mit Medien herunter- und wieder hochladen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', { data: { schemaVersion: 8, id: 'medien', meta: { name: 'Konzert' }, layers: [{ id: 'l1', name: 'Bühne', order: 0 }], devices: [], cables: [] } })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('button', { name: '+ Lied' }).click();
  const detail = page.getByTestId('regie-detail');
  await detail.getByLabel('Titel').fill('Ballade');

  // Audio hochladen → Dauer des Lieds aus der Datei
  await detail.locator('input[type=file]').setInputFiles({ name: 'Playback.wav', mimeType: 'audio/wav', buffer: wav(6) });
  await expect(detail.getByTestId('regie-media-file')).toHaveCount(1);
  await expect(detail.getByTestId('regie-media-file').getByLabel('Bezeichnung')).toHaveValue('Playback');
  await expect(detail.getByLabel('Dauer')).toHaveValue('0:06');
  await expect(detail.getByTestId('regie-player')).toBeVisible();

  // Text im Bereich „Texte“ (dort auch Mitlesen und Mitschreiben mit Player)
  await page.getByRole('radio', { name: 'Texte', exact: true }).click();
  const textDetail = page.getByTestId('texts-detail');
  await textDetail.getByRole('button', { name: 'Text einfügen …' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Erste Zeile\nZweite Zeile\nDritte Zeile');
  await page.getByRole('dialog').getByRole('button', { name: 'Einfügen' }).click();

  // Mitschreiben: abspielen, „Nächste Zeile“ dreimal
  await textDetail.getByRole('radio', { name: 'Mitschreiben' }).click();
  await textDetail.getByRole('button', { name: 'Abspielen' }).click();
  const next = textDetail.getByRole('button', { name: /Nächste Zeile/ });
  await expect(next).toContainText('Erste Zeile');
  for (const wait of [500, 900, 900]) {
    await page.waitForTimeout(wait);
    await next.click();
  }
  await expect(next).toBeDisabled();
  const lyrics = textDetail.getByTestId('regie-lyrics');
  await expect(lyrics.locator('li')).toHaveCount(3);
  for (const li of await lyrics.locator('li').all()) await expect(li).not.toContainText('–');
  // fein verschieben
  await lyrics.getByRole('button', { name: 'Später: Dritte Zeile' }).click();
  // Zeit vorne direkt bearbeiten; Klick auf die Zeile springt dorthin (setzt nicht die Zeit)
  const firstTime = lyrics.getByLabel('Zeit: Erste Zeile');
  await firstTime.fill('0:00.2');
  await firstTime.press('Enter');
  await expect(firstTime).toHaveValue('0:00.2');
  await textDetail.getByRole('button', { name: 'Pause' }).click({ timeout: 2000 }).catch(() => undefined);
  await lyrics.getByRole('button', { name: 'Erste Zeile', exact: true }).click();
  await expect(lyrics.locator('li[data-current]')).toContainText('Erste Zeile');
  await expect(firstTime).toHaveValue('0:00.2');
  // neu mitschreiben, obwohl alle Zeilen Zeiten haben: nach dem Springen setzt „Nächste Zeile“ die Zeile danach
  await expect(next).toContainText('Zweite Zeile');
  await next.click();
  await expect(lyrics.locator('li[data-current]')).toContainText('Zweite Zeile');
  await expect(next).toContainText('Dritte Zeile');

  // Mitlesen: Sprung auf eine Zeile setzt die Position, die Zeile ist die aktuelle
  await textDetail.getByRole('radio', { name: 'Mitlesen' }).click();
  // anklickbare Zeilen zeigen den Hand-Zeiger
  await expect(lyrics.getByRole('button').first()).toHaveCSS('cursor', 'pointer');
  await textDetail.getByRole('button', { name: 'Pause' }).click({ timeout: 2000 }).catch(() => undefined);
  await lyrics.getByRole('button', { name: 'Zweite Zeile', exact: true }).click();
  await expect(lyrics.locator('li[data-current]')).toContainText('Zweite Zeile');

  // gespeichert: Zeiten und Medienverweis
  const saved = async () => (await (await page.request.get(`/api/projects/${id}/download`)).json()) as { media: { id: string; name: string }[]; show: { sections: { lines: { atSec?: number }[] }[] } };
  await expect.poll(async () => (await saved()).show.sections[0]?.lines.every((l) => l.atSec !== undefined)).toBe(true);
  const project = await saved();
  expect(project.media.map((m) => m.name)).toEqual(['Playback.wav']);
  const mediaId = project.media[0]!.id;
  // Abspielen mit Spulen
  const range = await page.request.get(`/api/projects/${id}/media/${mediaId}`, { headers: { range: 'bytes=0-43' } });
  expect(range.status()).toBe(206);
  expect((await range.body()).subarray(0, 4).toString()).toBe('RIFF');

  // Mit Medien herunterladen …
  await expect(page.getByRole('link', { name: 'Mit Medien herunterladen' })).toBeVisible();
  const zip = await page.request.get(`/api/projects/${id}/download?medien=1`);
  const files = unzipSync(new Uint8Array(await zip.body()));
  expect(Object.keys(files).sort()).toEqual(['Konzert.steckplan', `medien/${mediaId}`]);

  // … und als .steckplan.zip wieder hochladen → neues Projekt mit derselben Audiodatei
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'Konzert.steckplan.zip', mimeType: 'application/zip', buffer: Buffer.from(await zip.body()) });
  await expect(page).toHaveURL(/\/projekt\//);
  const newId = page.url().split('/projekt/')[1]!.split('?')[0]!;
  expect(newId).not.toBe(id);
  await expect.poll(async () => (await page.request.get(`/api/projects/${newId}/media/${mediaId}`)).status()).toBe(200);
});
