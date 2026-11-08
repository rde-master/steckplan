import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

test('BPM und Taktart je Lied: Takt-Kreis in der Vorstellung, Tap per Taste und Fernsteuerung (OSC/HTTP) passt das Tempo live an', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'bpm',
        meta: { name: 'Takt' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: { items: [{ id: 'a', order: 0, kind: 'song', title: 'Walzer', number: 1, durationSec: 120 }], sections: [] },
      },
    })
  ).json();
  const saved = async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()) as { show: { items: { bpm?: number; timeSignature?: string; beatOffsetSec?: number; manualBpm?: number; manualBeatOffsetSec?: number }[] } }).show.items[0]!;

  // Ablauf: BPM und Taktart
  await page.goto(`/projekt/${id}?ansicht=regie`);
  const tempo = page.getByTestId('tempo-field');
  await tempo.getByLabel('BPM').fill('90');
  await tempo.getByLabel('BPM').press('Enter');
  await tempo.getByLabel('Taktart').selectOption('3/4');
  await expect.poll(saved).toMatchObject({ bpm: 90, timeSignature: '3/4' });

  // Vorstellung: links Tempo und Takt, Kreis mit drei Zählzeiten
  const show = await openPerformance(page);
  const beat = show.getByTestId('beat-panel');
  await expect(beat.getByTestId('beat-bpm')).toContainText('90');
  await expect(beat.getByTestId('beat-signature')).toHaveText('3/4');
  await expect(beat.getByTestId('beat-dot')).toHaveCount(3);
  // abspielen: die Zählzeit läuft 1, 2, 3 (genau ein Punkt hervorgehoben)
  await show.keyboard.press('k');
  const seen = new Set<string>();
  await expect
    .poll(async () => {
      seen.add((await beat.getByTestId('beat-count').textContent()) ?? '');
      return [...seen].filter((c) => ['1', '2', '3'].includes(c)).length;
    }, { timeout: 8000, intervals: [100] })
    .toBe(3);
  await expect(beat.locator('[data-testid=beat-dot][data-active]')).toHaveCount(1);

  // Tap per Taste T (live, während es läuft): nach zwei vollen Takten (6 Taps) als manuelles Tempo – 150 BPM;
  // das gespeicherte (90) bleibt
  await expect(beat.getByTestId('beat-manual')).toHaveCount(0);
  for (let i = 0; i < 6; i++) {
    await show.keyboard.press('t');
    if (i < 5) await show.waitForTimeout(400);
  }
  await expect.poll(async () => (await saved()).manualBpm ?? 0).toBeGreaterThan(135);
  expect((await saved()).manualBpm!).toBeLessThan(165);
  expect((await saved()).manualBeatOffsetSec).toBeDefined();
  expect((await saved()).bpm).toBe(90);
  await expect(beat.getByTestId('beat-bpm')).toContainText(/1[3-6]\d/);
  await expect(beat.getByTestId('beat-manual')).toContainText('manuell');

  // Tap per Fernsteuerung (wie /steckplan/tap per OSC): 6 × alle 0,6 s → 100 BPM
  await show.waitForTimeout(3000); // neue Tap-Folge
  for (let i = 0; i < 6; i++) {
    await page.request.post('/api/remote', { data: { action: 'tap' } });
    if (i < 5) await show.waitForTimeout(600);
  }
  await expect.poll(async () => (await saved()).manualBpm ?? 0).toBeLessThan(115);
  expect((await saved()).manualBpm!).toBeGreaterThan(88);
  await expect(show.getByTestId('performance-remote')).toContainText('Tap');

  // manuelles Tempo verwerfen → wieder das gespeicherte
  await beat.getByTestId('beat-reset').click();
  await expect.poll(async () => (await saved()).manualBpm).toBeUndefined();
  expect((await saved()).bpm).toBe(90);
  await expect(beat.getByTestId('beat-bpm')).toContainText('90');
  await expect(beat.getByTestId('beat-manual')).toHaveCount(0);
});
