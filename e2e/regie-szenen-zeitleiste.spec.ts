import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

/** WAV (Mono, 8 kHz, 16 Bit): erst leise, dann laut */
function wav(seconds: number): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 220) * (i < samples / 2 ? 600 : 20000)), i * 2);
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

/** Maus von der Mitte eines Elements (bzw. x-Versatz darin) um dx Pixel ziehen */
async function drag(page: Page, target: Locator, dx: number, atX?: number) {
  const box = (await target.boundingBox())!;
  const x = box.x + (atX ?? box.width / 2);
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}

test('Tonszenen: Zeitleiste – Szene verschieben, Rand ziehen (vorige kürzer), Klick wählt; Wellenform in allen Zeitleisten', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'zeitleiste',
        meta: { name: 'Zeitleiste' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [{ id: 'a', order: 0, kind: 'song', title: 'Marsch', number: 1, durationSec: 20 }],
          sections: [{ id: 's', itemId: 'a', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'z1', text: 'Eins', atSec: 1 }, { id: 'z2', text: 'Zwei', atSec: 8 }] }],
        },
        soundScenes: [
          { id: 't1', itemId: 'a', order: 0, name: 'Intro', atSec: 0 },
          { id: 't2', itemId: 'a', order: 1, name: 'Strophe', atSec: 5 },
          { id: 't3', itemId: 'a', order: 2, name: 'Refrain', atSec: 10 },
          { id: 't4', itemId: 'a', order: 3, name: 'Ohne Zeit' },
        ],
      },
    })
  ).json();
  const saved = async () => {
    const project = (await (await page.request.get(`/api/projects/${id}/download`)).json()) as { soundScenes: { id: string; atSec?: number }[] };
    return Object.fromEntries(project.soundScenes.map((s) => [s.id, s.atSec]));
  };
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Tonszenen' }).click();
  const timeline = page.getByTestId('scene-timeline');
  await expect(timeline).toBeVisible();
  const blocks = timeline.getByTestId('scene-block');
  await expect(blocks).toHaveCount(3);
  await expect(timeline).toContainText('1 Szene ohne Startpunkt');
  const track = timeline.getByTestId('scene-timeline-track');
  const total = Number(await track.getAttribute('data-total'));
  const pxPerSec = (await track.boundingBox())!.width / total;

  // ganze Szene 2 um 2 s nach rechts: Beginn 5 → 7, die folgende wandert mit (10 → 12), die vorige wird länger
  await drag(page, blocks.nth(1), 2 * pxPerSec);
  await expect.poll(saved).toEqual({ t1: 0, t2: 7, t3: 12, t4: undefined });

  // linken Rand von Szene 3 um 3 s nach links: Szene 3 wird länger (12 → 9), Szene 2 kürzer, sonst nichts
  await drag(page, blocks.nth(2).getByTestId('scene-edge'), -3 * pxPerSec, 3);
  await expect.poll(saved).toEqual({ t1: 0, t2: 7, t3: 9, t4: undefined });

  // nicht über die Nachbarn hinaus: Szene 3 weit nach links → höchstens bis 0,1 s nach Szene 2
  await drag(page, blocks.nth(2).getByTestId('scene-edge'), -8 * pxPerSec, 3);
  await expect.poll(saved).toEqual({ t1: 0, t2: 7, t3: 7.1, t4: undefined });

  // Klick (ohne Ziehen) wählt die Szene
  await blocks.nth(0).click();
  await expect(page.locator('[data-testid=sound-scene-tab][aria-selected=true]')).toContainText('Intro');
  await expect(blocks.nth(0)).toHaveAttribute('data-selected', 'true');

  // gezoomt: Scrollbalken; Griff ziehen bzw. daneben klicken verschiebt den Ausschnitt
  await expect(timeline.getByTestId('timeline-scrollbar')).toHaveCount(0);
  await timeline.getByRole('button', { name: 'Zeitleiste vergrößern' }).click();
  await timeline.getByRole('button', { name: 'Zeitleiste vergrößern' }).click();
  const bar = timeline.getByTestId('timeline-scrollbar');
  await expect(bar).toBeVisible();
  const start0 = Number(await track.getAttribute('data-start'));
  const barBox = (await bar.boundingBox())!;
  await page.mouse.click(barBox.x + barBox.width - 3, barBox.y + barBox.height / 2);
  await expect.poll(async () => Number(await track.getAttribute('data-start'))).toBeGreaterThan(start0 + 5);
  const end = Number(await track.getAttribute('data-start'));
  await drag(page, timeline.getByTestId('timeline-scrollbar-thumb'), -barBox.width / 3);
  await expect.poll(async () => Number(await track.getAttribute('data-start'))).toBeLessThan(end - 3);
  await timeline.getByRole('button', { name: 'Alles' }).click();
  await expect(bar).toHaveCount(0);

  // Wellenform: Standard aus; erst nach Audio sinnvoll
  await expect(timeline.getByTestId('waveform-toggle')).not.toBeChecked();
  await expect(timeline.getByTestId('scene-timeline-wave')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Ablauf' }).click();
  await page.getByTestId('regie-detail').locator('input[type=file]').setInputFiles({ name: 'Playback.wav', mimeType: 'audio/wav', buffer: wav(20) });
  await expect(page.getByTestId('regie-detail').getByTestId('regie-media-file')).toHaveCount(1);
  await page.getByRole('radio', { name: 'Tonszenen' }).click();
  await timeline.getByText('Wellenform').click();
  await expect(timeline.getByTestId('waveform-toggle')).toBeChecked();
  const wave = timeline.getByTestId('scene-timeline-wave').getByTestId('waveform');
  await expect(wave).toHaveAttribute('data-ready', 'true', { timeout: 10_000 });
  // leise erste Hälfte, laute zweite: in der ersten Hälfte gezeichnete Höhe wächst mit der Höhen-Einstellung
  const inked = async () =>
    wave.evaluate((c: HTMLCanvasElement) => {
      const g = c.getContext('2d')!;
      const px = g.getImageData(Math.floor(c.width * 0.2), 0, 1, c.height).data;
      let n = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i]! > 0) n++;
      return n / c.height;
    });
  const low = await inked();
  expect(low).toBeGreaterThan(0);
  expect(low).toBeLessThan(0.15);
  await timeline.getByTestId('waveform-gain').fill('12');
  await expect.poll(inked).toBeGreaterThan(low * 4);

  // gilt auch für die anderen Zeitleisten: Mitschreiben …
  await page.getByRole('radio', { name: 'Texte' }).click();
  await page.getByRole('radio', { name: 'Mitschreiben' }).click();
  const lyrics = page.getByTestId('lyrics-timeline');
  await expect(lyrics.getByTestId('waveform-toggle')).toBeChecked();
  await expect(lyrics.getByTestId('timeline-wave').getByTestId('waveform')).toHaveAttribute('data-ready', 'true');
  // … und Führen; ausschalten gilt überall
  await page.getByRole('radio', { name: 'Ablauf' }).click();
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  await perf.getByRole('radio', { name: 'Führen' }).click();
  const lead = perf.getByTestId('lead-timeline');
  await expect(lead.getByTestId('lead-timeline-wave').getByTestId('waveform')).toHaveAttribute('data-ready', 'true');
  await lead.getByText('Wellenform').click();
  await expect(lead.getByTestId('lead-timeline-wave')).toHaveCount(0);
});
