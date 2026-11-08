import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

test('Führen-Ansicht: ohne Licht/Ton, Text klein (vorige/aktuelle/nächste), Zeitstrahl mit Taktstrichen und Abspielstand, Tap und Timecode groß', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const line = (id: string, text: string, atSec: number) => ({ id, text, atSec });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'fuehren',
        meta: { name: 'Führen' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [{ id: 'a', order: 0, kind: 'song', title: 'Marsch', number: 1, durationSec: 20, bpm: 120, timeSignature: '4/4' }],
          sections: [{ id: 's', itemId: 'a', order: 0, kind: 'verse', label: 'Strophe', lines: [line('z1', 'Eins', 0.2), line('z2', 'Zwei', 1), line('z3', 'Drei', 1.8), line('z4', 'Vier', 2.6), line('z5', 'Fünf', 6)] }],
        },
        lightScenes: [
          { id: 'ls', itemId: 'a', order: 0, name: 'Hell', atSec: 0 },
          { id: 'ls2', itemId: 'a', order: 1, name: 'Dunkel', atSec: 12 },
        ],
        soundScenes: [{ id: 'ts', itemId: 'a', order: 0, name: 'Laut', atSec: 4 }],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  // Frei: wie bisher mit Licht/Ton
  await expect(perf.getByRole('tab', { name: 'Licht' })).toBeVisible();
  await expect(perf.getByTestId('lead-view')).toHaveCount(0);

  await perf.getByRole('radio', { name: 'Führen' }).click();
  const lead = perf.getByTestId('lead-view');
  await expect(lead).toBeVisible();
  // keine Licht- und Tonszenen
  await expect(perf.getByRole('tab', { name: 'Licht' })).toHaveCount(0);
  await expect(perf.getByRole('tab', { name: 'Ton' })).toHaveCount(0);
  // Zeitstrahl über 20 s: 120 BPM 4/4 → alle 2 s ein Takt (11 Taktstriche), Textblöcke
  const timeline = lead.getByTestId('lead-timeline');
  await expect(timeline.getByTestId('lead-bar-line')).toHaveCount(11);
  await expect(timeline).toContainText('Fünf');
  // groß: Tap und Timecode, Szenen-/Eintrag-Knöpfe; Audio klein unten
  await expect(lead.getByTestId('beat-tap')).toBeVisible();
  await expect(lead.getByTestId('timecode-panel').getByTestId('timecode')).toBeVisible();
  const startBox = (await lead.getByRole('button', { name: 'Timecode starten' }).boundingBox())!;
  expect(startBox.height).toBeGreaterThanOrEqual(60);
  await expect(lead.getByRole('button', { name: 'Szene weiter' })).toBeVisible();
  await expect(perf.getByTestId('regie-player')).toBeVisible();

  // Abspielen: Text zeigt nur vorige, aktuelle, nächste – mit grünem und rotem Balken; Abspielstand wandert
  const head = timeline.getByTestId('lead-playhead');
  const left0 = (await head.boundingBox())!.x;
  await lead.getByRole('button', { name: 'Timecode starten' }).click();
  await expect(lead.locator('[data-testid=lead-line][data-current]')).toHaveText(/Zwei/, { timeout: 4000 });
  await expect(lead.getByTestId('lead-line')).toHaveCount(3);
  await expect(lead.getByTestId('lead-text')).toContainText('Eins');
  await expect(lead.getByTestId('lead-text')).toContainText('Drei');
  await expect(lead.getByTestId('lead-text')).not.toContainText('Fünf');
  await expect(lead.getByTestId('line-progress-current')).toBeVisible();
  await expect(lead.getByTestId('line-progress-next')).toBeVisible();
  expect((await head.boundingBox())!.x).toBeGreaterThan(left0 + 20);
  // Klick in den Zeitstrahl springt (zur Hälfte: 10 s)
  const track = (await timeline.getByTestId('lead-timeline-track').boundingBox())!;
  await show.mouse.click(track.x + track.width / 2, track.y + 10);
  await expect.poll(async () => Number((await lead.getByTestId('timecode').textContent())!.split(':')[2])).toBeGreaterThanOrEqual(10);
  // Szenen als Balken über dem Zeitstrahl und als Liste rechts
  await expect(timeline.getByTestId('lead-light-scenes').getByTestId('lead-scene-bar')).toHaveCount(2);
  await expect(timeline.getByTestId('lead-sound-scenes').getByTestId('lead-scene-bar')).toHaveCount(1);
  const list = timeline.getByTestId('lead-scene-list');
  await expect(list.getByTestId('lead-scene-item')).toHaveCount(3);
  // Klick in der Liste springt dorthin (Dunkel bei 12 s)
  await lead.getByRole('button', { name: 'Timecode anhalten' }).click();
  await list.getByRole('button', { name: /Dunkel/ }).click();
  const seconds = async () => Number((await lead.getByTestId('timecode').textContent())!.split(':')[2]);
  await expect.poll(seconds).toBe(12);
  await expect(list.locator('[data-testid=lead-scene-item][data-current]').filter({ hasText: 'Dunkel' })).toHaveCount(1);
  await expect(lead.getByTestId('performance-scene')).toContainText('Dunkel');
  // Schlag vor/zurück (120 BPM: 0,5 s je Schlag)
  await lead.getByRole('button', { name: 'Einen Schlag vor' }).click();
  await expect(lead.getByTestId('timecode')).toHaveText('00:00:12:12');
  await lead.getByRole('button', { name: 'Einen Schlag zurück' }).click();
  await lead.getByRole('button', { name: 'Einen Schlag zurück' }).click();
  await expect(lead.getByTestId('timecode')).toHaveText('00:00:11:12');
  await lead.getByRole('button', { name: 'Einen Schlag vor' }).click();
  await expect(lead.getByTestId('timecode')).toHaveText('00:00:12:00');
  // Zoom, dann Mausrad verschiebt den Ausschnitt – die Abspielposition bleibt
  const trackEl = timeline.getByTestId('lead-timeline-track');
  await timeline.getByRole('button', { name: 'Zeitstrahl vergrößern' }).click();
  await timeline.getByRole('button', { name: 'Zeitstrahl vergrößern' }).click();
  const spanZoomed = Number(await trackEl.getAttribute('data-span'));
  expect(spanZoomed).toBeLessThan(20);
  const startBefore = Number(await trackEl.getAttribute('data-start'));
  const box = (await trackEl.boundingBox())!;
  await show.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await show.mouse.wheel(0, -300);
  await expect.poll(async () => Number(await trackEl.getAttribute('data-start'))).toBeLessThan(startBefore);
  expect(await seconds()).toBe(12);
  // Scrollbalken: Klick ans Ende verschiebt den Ausschnitt dorthin, die Abspielposition bleibt
  const bar = timeline.getByTestId('timeline-scrollbar');
  await expect(bar).toBeVisible();
  const barBox = (await bar.boundingBox())!;
  await show.mouse.click(barBox.x + barBox.width - 2, barBox.y + barBox.height / 2);
  await expect.poll(async () => Number(await trackEl.getAttribute('data-start')) + Number(await trackEl.getAttribute('data-span'))).toBeGreaterThan(19.9);
  expect(await seconds()).toBe(12);
  await timeline.getByRole('button', { name: 'Alles' }).click();
  await expect(bar).toHaveCount(0);
  await expect(trackEl).toHaveAttribute('data-span', '20.00');
  // Scrubben: aus → Ziehen springt nur beim Drücken; an → gedrückt ziehen verschiebt die Position
  const full = (await trackEl.boundingBox())!;
  const y = full.y + full.height - 10;
  await timeline.getByLabel('Scrubben').check({ force: true });
  await show.mouse.move(full.x + full.width * 0.1, y);
  await show.mouse.down();
  await show.mouse.move(full.x + full.width * 0.4, y, { steps: 5 });
  await show.mouse.move(full.x + full.width * 0.75, y, { steps: 5 });
  await show.mouse.up();
  await expect.poll(seconds).toBe(15);
  await timeline.getByLabel('Scrubben').uncheck({ force: true });
  await show.mouse.move(full.x + full.width * 0.25, y);
  await show.mouse.down();
  await show.mouse.move(full.x + full.width * 0.6, y, { steps: 5 });
  await show.mouse.up();
  await expect.poll(seconds).toBe(5);

  // zurück auf Frei: alte Ansicht
  await perf.getByRole('radio', { name: 'Frei' }).click();
  await expect(perf.getByTestId('lead-view')).toHaveCount(0);
  await expect(perf.getByRole('tab', { name: 'Licht' })).toBeVisible();
});
