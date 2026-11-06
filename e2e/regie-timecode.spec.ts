import dgram from 'node:dgram';
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

test('Timecode je Ablaufpunkt ab 00:00:00:00, feste Nummern, Lied hängt am Timecode, Stopp am Ende der Dauer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  // ältere Projekte ohne Nummern: in Reihenfolge 1, 2
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'timecode',
        meta: { name: 'Timecode' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [],
        cables: [],
        show: {
          items: [
            { id: 'lied', order: 0, kind: 'song', title: 'Eröffnung', durationSec: 5 },
            { id: 'stueck', order: 1, kind: 'play', title: 'Szene am Brunnen', durationSec: 2 },
          ],
          sections: [],
        },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Ablauf' }).click();
  await expect(page.getByTestId('regie-list').getByTestId('item-number')).toHaveText(['1', '2']);
  const detail = page.getByTestId('regie-detail');
  // Lied: Audio (3 s) kürzer als die Dauer (5 s)
  await page.getByTestId('regie-item').filter({ hasText: 'Eröffnung' }).click();
  await detail.locator('input[type=file]').setInputFiles({ name: 'Eroeffnung.wav', mimeType: 'audio/wav', buffer: wav(3) });
  await expect(detail.getByTestId('regie-player').locator('audio')).toHaveCount(1);
  await expect(detail.getByTestId('timecode')).toHaveText('00:00:00:00');

  // Vorstellung: große Uhr unten rechts; Audio endet bei 3 s, der Timecode läuft bis 5 s und hält an
  let show = await openPerformance(page);
  let perf = show.getByTestId('performance');
  const clock = perf.locator('footer [data-testid=timecode]');
  await expect(clock).toHaveText('00:00:00:00');
  await perf.getByRole('button', { name: 'Abspielen' }).click();
  await expect.poll(() => clock.textContent(), { timeout: 5000 }).toMatch(/^00:00:0[34]:\d\d$/);
  await expect.poll(() => show.evaluate(() => document.querySelector('audio')!.ended || document.querySelector('audio')!.paused)).toBe(true);
  await expect(clock).toHaveText('00:00:05:00', { timeout: 4000 });
  await expect(perf.getByRole('button', { name: 'Abspielen' })).toBeVisible();
  await expect(perf.getByTestId('remaining')).toHaveText('−0:00');
  await show.screenshot({ path: 'test-results/timecode-vorstellung.png' });

  // nächster Punkt ohne Audio: beginnt wieder bei 0, läuft mit eigener Uhr bis zur Dauer
  await show.keyboard.press('ArrowDown');
  await expect(clock).toHaveText('00:00:00:00');
  await perf.getByRole('button', { name: 'Abspielen' }).click();
  await expect(clock).toHaveText('00:00:02:00', { timeout: 4000 });
  await expect(perf.getByRole('button', { name: 'Abspielen' })).toBeVisible();
  await show.close();

  // Umsortieren behält die Nummern, „Neu nummerieren“ zählt in Reihenfolge
  await page.getByTestId('regie-item').filter({ hasText: 'Szene am Brunnen' }).click();
  await detail.getByRole('button', { name: 'Nach oben' }).click();
  await expect(page.getByTestId('regie-list').getByTestId('item-number')).toHaveText(['2', '1']);
  await expect(detail.getByLabel('Nr.', { exact: true })).toHaveValue('2');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Neu nummerieren' }).click();
  await expect(page.getByTestId('regie-list').getByTestId('item-number')).toHaveText(['1', '2']);
  // von Hand
  await detail.getByLabel('Nr.', { exact: true }).fill('7');
  await detail.getByLabel('Nr.', { exact: true }).press('Enter');
  await expect(page.getByTestId('regie-list').getByTestId('item-number')).toHaveText(['7', '2']);
  await expect(detail.getByTestId('timecode')).toHaveText('00:00:00:00');
  await page.screenshot({ path: 'test-results/timecode-ablauf.png' });
  // Art-Net: Empfänger auf 127.0.0.1:6454, einstellen, führen, abspielen → ArtTimeCode-Pakete kommen an
  const received: Buffer[] = [];
  const socket = dgram.createSocket('udp4');
  socket.on('message', (msg) => received.push(msg));
  await new Promise<void>((resolve) => socket.bind(6454, '127.0.0.1', resolve));
  try {
    await page.getByRole('button', { name: 'Regie-Einstellungen' }).click();
    const settings = page.getByTestId('lyrics-settings');
    await settings.getByLabel('Ziel (IP oder Broadcast)').fill('127.0.0.1');
    await settings.getByLabel('Ziel (IP oder Broadcast)').press('Enter');
    await settings.getByLabel('Senden').check();
    await page.getByRole('button', { name: 'Fertig' }).click();
    show = await openPerformance(page);
    perf = show.getByTestId('performance');
    await expect(perf.getByTestId('artnet-state')).toContainText('„Führen“ wählen');
    await perf.getByRole('radio', { name: 'Führen' }).click();
    await expect(perf.getByTestId('artnet-state')).toContainText('sendet an 127.0.0.1');
    await perf.getByRole('button', { name: 'Abspielen' }).click();
    await expect.poll(() => received.length, { timeout: 5000 }).toBeGreaterThan(20);
    const last = received.at(-1)!;
    expect(last.subarray(0, 8).toString('latin1')).toBe('Art-Net\0');
    expect([last[8], last[9], last[11], last[18]]).toEqual([0x00, 0x97, 14, 1]);
    // läuft: Sekunden zählen hoch
    expect(last[15]! * 25 + last[14]!).toBeGreaterThan(10);
  } finally {
    socket.close();
  }

  await expect
    .poll(async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()).show.items as { title: string; number: number }[]).map((i) => `${i.title}:${i.number}`).sort())
    .toEqual(['Eröffnung:2', 'Szene am Brunnen:7']);
});

test('Timecode-Steuerung: Restzeit rot, „Mit Musik“ an/aus, eigene Knöpfe, Länge aus dem Projekt', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'timecode-steuerung',
        meta: { name: 'Timecode-Steuerung' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [],
        cables: [],
        // geplant 2 s, das Audio ist 4 s lang
        show: { items: [{ id: 'lied', order: 0, kind: 'song', title: 'Kurz geplant', durationSec: 2, number: 1 }], sections: [] },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Ablauf' }).click();
  const detail = page.getByTestId('regie-detail');
  await detail.locator('input[type=file]').setInputFiles({ name: 'Lang.wav', mimeType: 'audio/wav', buffer: wav(4) });
  await expect(detail.getByTestId('regie-player').locator('audio')).toHaveCount(1);
  let show = await openPerformance(page);
  let perf = show.getByTestId('performance');
  const panel = perf.getByTestId('timecode-panel');
  const clock = panel.getByTestId('timecode');
  const audioPaused = () => show.evaluate(() => document.querySelector('audio')!.paused);
  await expect(panel.getByTestId('timecode-remaining')).toHaveText('−00:00:02:00');

  // mit Musik: Länge aus dem Projekt – Timecode und Musik halten bei 2 s an (Audio wäre 4 s)
  await expect(panel.getByLabel('Mit Musik')).toBeChecked();
  await panel.getByRole('button', { name: 'Timecode starten' }).click();
  await expect.poll(audioPaused).toBe(false);
  await expect(clock).toHaveText('00:00:02:00', { timeout: 4000 });
  await expect(panel.getByTestId('timecode-remaining')).toHaveText('−00:00:00:00');
  await expect.poll(audioPaused).toBe(true);
  // Stopp: zurück auf 0
  await panel.getByRole('button', { name: 'Timecode stoppen (zurück auf 0)' }).click();
  await expect(clock).toHaveText('00:00:00:00');

  // ohne Musik: Timecode läuft für sich, die Musik unabhängig
  await panel.getByLabel('Mit Musik').uncheck();
  await panel.getByRole('button', { name: 'Timecode starten' }).click();
  await expect.poll(() => clock.textContent()).not.toBe('00:00:00:00');
  expect(await audioPaused()).toBe(true);
  await perf.getByRole('button', { name: 'Abspielen' }).click();
  await expect.poll(audioPaused).toBe(false);
  await panel.getByRole('button', { name: 'Timecode anhalten' }).click();
  const stopped = await clock.textContent();
  await page.waitForTimeout(300);
  expect(await clock.textContent()).toBe(stopped);
  expect(await audioPaused()).toBe(false); // Musik läuft weiter
  await perf.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(audioPaused).toBe(true);
  // Spulen am Timecode
  await panel.getByRole('button', { name: 'Timecode 1 s zurück' }).click();
  await panel.getByRole('button', { name: 'Timecode stoppen (zurück auf 0)' }).click();
  await panel.getByRole('button', { name: 'Timecode 1 s vor' }).click();
  await expect(clock).toHaveText('00:00:01:00');
  // Feinschritt 0,1 s
  await panel.getByRole('button', { name: 'Timecode 0,1 s vor' }).click();
  await expect(clock).toHaveText('00:00:01:02');
  await panel.getByRole('button', { name: 'Timecode 0,1 s zurück' }).click();
  await expect(clock).toHaveText('00:00:01:00');
  await show.screenshot({ path: 'test-results/timecode-steuerung.png' });
  // die Wahl bleibt (je Gerät)
  await show.close();
  show = await openPerformance(page);
  perf = show.getByTestId('performance');
  await expect(perf.getByTestId('timecode-panel').getByLabel('Mit Musik')).not.toBeChecked();
  await perf.getByTestId('timecode-panel').getByLabel('Mit Musik').check();
});

test('Audio-Versatz: Musik setzt erst beim Versatz ein, Player zeigt die Werte der Audiodatei, Zeitstrahl zeigt ihre Lage', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'audio-versatz',
        meta: { name: 'Versatz' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [],
        cables: [],
        show: {
          items: [{ id: 'lied', order: 0, kind: 'song', title: 'Mit Vorlauf', number: 1, durationSec: 6 }],
          sections: [{ id: 's1', itemId: 'lied', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'z1', text: 'Erste Zeile', atSec: 1 }, { id: 'z2', text: 'Zweite Zeile', atSec: 2.5 }] }],
        },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Ablauf' }).click();
  const detail = page.getByTestId('regie-detail');
  await detail.locator('input[type=file]').setInputFiles({ name: 'Kurz.wav', mimeType: 'audio/wav', buffer: wav(3) });
  await expect(detail.getByTestId('regie-player').locator('audio')).toHaveCount(1);
  await detail.getByLabel('Audio-Versatz').fill('2');
  await detail.getByLabel('Audio-Versatz').press('Enter');
  await expect.poll(async () => (await (await page.request.get(`/api/projects/${id}/download`)).json()).show.items[0].audioOffsetSec).toBe(2);

  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  const player = perf.getByTestId('regie-player');
  // Werte der Audiodatei; Lage im Punkt: ab 2 s (von 6 s), 3 s lang
  await expect(player.getByTestId('regie-time')).toHaveText('0:00 / 0:03');
  const segment = player.getByTestId('audio-segment');
  await expect(segment).toHaveAttribute('style', /left: 33\.3\d*%; width: 50%/);
  await perf.locator('footer').screenshot({ path: 'test-results/audio-versatz.png' });
  const clock = perf.getByTestId('timecode-panel').getByTestId('timecode');
  const audio = () => show.evaluate(() => ({ paused: document.querySelector('audio')!.paused, t: document.querySelector('audio')!.currentTime }));

  await perf.getByRole('button', { name: 'Abspielen' }).click();
  // vor dem Versatz: Timecode läuft, Musik wartet am Anfang
  await expect.poll(() => clock.textContent()).toMatch(/^00:00:01:/);
  expect(await audio()).toMatchObject({ paused: true, t: 0 });
  // nach dem Versatz: Musik spielt, um 2 s versetzt
  await expect.poll(async () => (await audio()).paused, { timeout: 4000 }).toBe(false);
  await expect.poll(() => clock.textContent()).toMatch(/^00:00:03:/);
  // im selben Moment gelesen: Position im Audio = Timecode − 2 s
  const now = await show.evaluate(() => {
    const tc = document.querySelector('[data-testid=timecode-panel] [data-testid=timecode]')!.textContent!.split(':').map(Number);
    return { t: document.querySelector('audio')!.currentTime, tc: tc[2]! + tc[3]! / 25 };
  });
  expect(Math.abs(now.t - (now.tc - 2))).toBeLessThan(0.3);
  await expect(player.getByTestId('regie-time')).toHaveText(/^0:0[01] \/ 0:03$/);
  // Timecode läuft bis zur geplanten Dauer (6 s), auch nach dem Ende der Datei (2 + 3 = 5 s)
  await expect(clock).toHaveText('00:00:06:00', { timeout: 6000 });
  await expect(perf.getByTestId('timecode-panel').getByTestId('timecode-remaining')).toHaveText('−00:00:00:00');

  // Textzeiten: ohne Option ab Timecode 0, mit Option ab Musikbeginn (+2 s)
  const current = perf.locator('li[data-current]');
  await perf.getByLabel('Position').fill('1.5');
  await expect(current).toHaveText(/Erste Zeile/);
  await detail.getByLabel('Versatz gilt auch für den Text').check();
  await expect(current).toHaveCount(0); // 1,5 s liegt jetzt vor der ersten Zeile (1 + 2 = 3 s)
  await perf.getByLabel('Position').fill('3.2');
  await expect(current).toHaveText(/Erste Zeile/);
  await perf.getByLabel('Position').fill('4.6');
  await expect(current).toHaveText(/Zweite Zeile/);
  expect((await (await page.request.get(`/api/projects/${id}/download`)).json()).show.items[0].audioOffsetText).toBe(true);
});
