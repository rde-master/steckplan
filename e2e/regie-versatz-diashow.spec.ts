import { crc32, deflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

function wav(seconds: number): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 220) * 8000), i * 2);
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

/** 1×1-PNG in einer Farbe (verschiedene Farben = verschiedene Dateien) */
function png(r: number, g: number, b: number): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), body])) >>> 0);
    return Buffer.concat([len, Buffer.from(type), body, crc]);
  };
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, r, g, b]))), chunk('IEND', Buffer.alloc(0))]);
}

test('Audio-Versatz: Startpunkt in der Datei (negativ) per Zeitleiste und Eingabe; Musik spielt ab dieser Stelle', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: { schemaVersion: 9, id: 'versatz', meta: { name: 'Versatz' }, layers: [{ id: 'l1', name: 'Bühne', order: 0 }], show: { items: [{ id: 'a', order: 0, kind: 'song', title: 'Intro weg', durationSec: 6 }], sections: [] } },
    })
  ).json();
  const saved = async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()) as { show: { items: { audioOffsetSec?: number }[] } }).show.items[0]!.audioOffsetSec;
  await page.goto(`/projekt/${id}?ansicht=regie`);
  const detail = page.getByTestId('regie-detail');
  await detail.locator('input[type=file]').setInputFiles({ name: 'Song.wav', mimeType: 'audio/wav', buffer: wav(10) });
  const timeline = detail.getByTestId('offset-timeline');
  const music = timeline.getByTestId('offset-music');
  await expect(music).toBeVisible();
  await expect(timeline.getByTestId('offset-status')).toHaveText('Musik beginnt mit dem Punkt');
  // Wellenform immer sichtbar
  await expect(timeline.getByTestId('waveform')).toHaveAttribute('data-ready', 'true', { timeout: 10_000 });

  // Musik 3 s nach links ziehen → 0:00 des Punkts = 0:03 der Datei
  const track = timeline.getByTestId('offset-track');
  const pxPerSec = (await track.boundingBox())!.width / Number(await track.getAttribute('data-span'));
  const box = (await music.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 1.5 * pxPerSec, box.y + box.height / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 - 3 * pxPerSec, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(saved).toBe(-3);
  await expect(timeline.getByTestId('offset-status')).toHaveText('Start bei 0:03 der Datei');
  await expect(detail.getByLabel('Audio-Versatz')).toHaveValue('-0:03');

  // abspielen: die Musik läuft ab 0:03 der Datei
  await detail.getByRole('button', { name: 'Abspielen' }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('audio')!.currentTime)).toBeGreaterThan(3.2);
  await detail.getByRole('button', { name: 'Pause', exact: true }).click();

  // Eingabe mit Minus
  await detail.getByLabel('Audio-Versatz').fill('-0:01,5');
  await detail.getByLabel('Audio-Versatz').press('Enter');
  await expect.poll(saved).toBe(-1.5);
  // nach rechts: Musik setzt später ein
  await detail.getByLabel('Audio-Versatz').fill('2');
  await detail.getByLabel('Audio-Versatz').press('Enter');
  await expect.poll(saved).toBe(2);
  await expect(timeline.getByTestId('offset-status')).toHaveText('Musik setzt bei 0:02 ein');
  await timeline.getByRole('button', { name: 'Auf 0' }).click();
  await expect.poll(saved).toBeUndefined();

  // Zoom: vergrößern → kleinerer Ausschnitt mit Scrollbalken, Musik feiner verschiebbar; „Alles“ zurück
  const spanAll = Number(await track.getAttribute('data-span'));
  await timeline.getByRole('button', { name: 'Versatz-Zeitleiste vergrößern' }).click();
  await timeline.getByRole('button', { name: 'Versatz-Zeitleiste vergrößern' }).click();
  const spanZoomed = Number(await track.getAttribute('data-span'));
  expect(spanZoomed).toBeLessThan(spanAll * 0.6);
  await expect(timeline.getByTestId('timeline-scrollbar')).toBeVisible();
  const zpx = (await track.boundingBox())!.width / spanZoomed;
  const mb = (await music.boundingBox())!;
  const x0 = Math.max(mb.x + 20, (await track.boundingBox())!.x + 20);
  await page.mouse.move(x0, mb.y + mb.height / 2);
  await page.mouse.down();
  await page.mouse.move(x0 - 0.25 * zpx, mb.y + mb.height / 2, { steps: 3 });
  await page.mouse.move(x0 - 0.5 * zpx, mb.y + mb.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect.poll(saved).toBe(-0.5);
  await timeline.getByRole('button', { name: 'Alles' }).click();
  await expect(timeline.getByTestId('timeline-scrollbar')).toHaveCount(0);
});

test('Textfenster: Diashow mit mehreren Bildern, Standzeit und Überblendung', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: { schemaVersion: 9, id: 'diashow', meta: { name: 'Diashow' }, layers: [{ id: 'l1', name: 'Bühne', order: 0 }], show: { items: [{ id: 'a', order: 0, kind: 'song', title: 'Bilder' }], sections: [] } },
    })
  ).json();
  const bg = async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()) as { showSettings: { lyricsBackground?: { mediaId: string; slides?: string[]; slideSec?: number; fadeSec?: number } } }).showSettings.lyricsBackground;
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('button', { name: 'Regie-Einstellungen' }).click();
  const setup = page.getByTestId('lyrics-settings');
  const input = setup.locator('input[type=file][accept="image/*"]');
  await input.setInputFiles({ name: 'rot.png', mimeType: 'image/png', buffer: png(255, 0, 0) });
  await expect(setup.getByRole('img', { name: 'Hintergrundbild' })).toBeVisible();
  // weitere Bilder: Diashow
  const chooser = page.waitForEvent('filechooser');
  await setup.getByTestId('lyrics-add-slide').click();
  await (await chooser).setFiles([
    { name: 'gruen.png', mimeType: 'image/png', buffer: png(0, 255, 0) },
    { name: 'blau.png', mimeType: 'image/png', buffer: png(0, 0, 255) },
  ]);
  await expect(setup.getByTestId('lyrics-slide')).toHaveCount(3);
  await expect.poll(async () => (await bg())?.slides?.length).toBe(2);
  // Reihenfolge ändern, Zeiten setzen
  const first = (await bg())!.mediaId;
  await setup.getByRole('button', { name: 'Bild 2 nach vorn' }).click();
  await expect.poll(async () => (await bg())!.slides).toContain(first);
  await setup.getByLabel('Standzeit je Bild').fill('1');
  await setup.getByLabel('Überblendung').fill('0.5');
  await expect.poll(async () => (await bg())).toMatchObject({ slideSec: 1, fadeSec: 0.5 });
  await page.getByRole('button', { name: 'Fertig' }).click();

  // Textfenster: die Bilder wechseln (Standzeit 1 s), mit Überblendung 0,5 s
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Textfenster', exact: true }).click();
  const popup = await popupPromise;
  const shown = new Set<string>();
  await expect
    .poll(
      async () => {
        const media = await popup.getByTestId('lyrics-background').getAttribute('data-media');
        if (media) shown.add(media);
        return shown.size;
      },
      { timeout: 6000, intervals: [200] },
    )
    .toBe(3);
  await expect(popup.getByTestId('lyrics-background')).toHaveCSS('transition-duration', '0.5s');

  // ein Bild entfernen
  await page.getByRole('button', { name: 'Regie-Einstellungen' }).click();
  await setup.getByRole('button', { name: 'Bild 3 entfernen' }).click();
  await expect(setup.getByTestId('lyrics-slide')).toHaveCount(2);
  await expect.poll(async () => (await bg())?.slides?.length).toBe(1);
});
