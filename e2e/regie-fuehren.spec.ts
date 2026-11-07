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
        lightScenes: [{ id: 'ls', itemId: 'a', order: 0, name: 'Hell' }],
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
  // zurück auf Frei: alte Ansicht
  await perf.getByRole('radio', { name: 'Frei' }).click();
  await expect(perf.getByTestId('lead-view')).toHaveCount(0);
  await expect(perf.getByRole('tab', { name: 'Licht' })).toBeVisible();
});
