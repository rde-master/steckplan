import dgram from 'node:dgram';
import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

const OSC_PORT = 18_767;

function osc(address: string, value?: number): Buffer {
  const pad = (s: string) => {
    const b = Buffer.from(`${s}\0`);
    return Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  };
  if (value === undefined) return Buffer.concat([pad(address), pad(',')]);
  const v = Buffer.alloc(4);
  if (Number.isInteger(value)) v.writeInt32BE(value);
  else v.writeFloatBE(value);
  return Buffer.concat([pad(address), pad(Number.isInteger(value) ? ',i' : ',f'), v]);
}

test('OSC: in den Einstellungen einschalten, Vorstellung per OSC steuern (Punkt, Start, Pause, spulen, Stopp, Szene)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  // einschalten
  await page.goto('/einstellungen');
  const settings = page.getByTestId('osc-settings');
  await settings.getByLabel('OSC empfangen').check();
  await settings.getByLabel('UDP-Port').fill(String(OSC_PORT));
  await settings.getByRole('button', { name: 'Speichern' }).click();
  await expect(settings.getByTestId('osc-status')).toContainText(`Empfängt auf Port ${OSC_PORT}`);

  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'osc',
        meta: { name: 'OSC' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [],
        cables: [],
        show: {
          items: [
            { id: 'a', order: 0, kind: 'song', title: 'Erstes', number: 1, durationSec: 60 },
            { id: 'b', order: 1, kind: 'play', title: 'Zweites', number: 2, durationSec: 60 },
          ],
          sections: [],
        },
        lightScenes: [
          { id: 's1', itemId: 'b', order: 0, name: 'Auftritt' },
          { id: 's2', itemId: 'b', order: 1, name: 'Abgang' },
        ],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  const clock = perf.getByTestId('timecode-panel').getByTestId('timecode');
  await expect(perf.getByTestId('performance-title')).toHaveText('Erstes');

  const socket = dgram.createSocket('udp4');
  const send = (address: string, value?: number) => new Promise<void>((r) => socket.send(osc(address, value), OSC_PORT, '127.0.0.1', () => r()));
  try {
    await send('/steckplan/item', 2);
    await expect(perf.getByTestId('performance-title')).toHaveText('Zweites');
    await expect(perf.getByTestId('performance-remote')).toContainText('Punkt 2');
    await send('/steckplan/play');
    await expect.poll(() => clock.textContent()).not.toBe('00:00:00:00');
    await send('/steckplan/pause');
    await expect(perf.getByTestId('timecode-panel').getByRole('button', { name: 'Timecode starten' })).toBeVisible();
    const paused = (await clock.textContent())!;
    await send('/steckplan/forward', 5);
    await expect.poll(() => clock.textContent()).not.toBe(paused);
    expect(Number((await clock.textContent())!.split(':')[2])).toBeGreaterThanOrEqual(5);
    await send('/steckplan/stop');
    await expect(clock).toHaveText('00:00:00:00');
    await send('/steckplan/scene/next');
    await expect(perf.getByTestId('performance-scene')).toHaveText('2. Abgang');
    await send('/steckplan/prev');
    await expect(perf.getByTestId('performance-title')).toHaveText('Erstes');
    // Liedliste: Nummer in der Adresse (z. B. aus grandMA3: SendOSC 1 "/steckplan/lied/2,,")
    await send('/steckplan/lied/2');
    await expect(perf.getByTestId('performance-title')).toHaveText('Zweites');
    await send('/steckplan/lied/1');
    await expect(perf.getByTestId('performance-title')).toHaveText('Erstes');
    // nur den Timecode verschieben: ohne Wert 0,1 s (= 2 Frames bei 25 fps), mit Wert beliebig
    await expect(clock).toHaveText('00:00:00:00');
    await send('/steckplan/tc/forward');
    await expect(clock).toHaveText('00:00:00:02');
    await send('/steckplan/tc/forward', 1.5);
    await expect(clock).toHaveText('00:00:01:15');
    await send('/steckplan/tc/back');
    await expect(clock).toHaveText('00:00:01:12');
  } finally {
    socket.close();
  }

  // Übersicht aller Befehle: Zustand, Tabelle, Ausprobieren wirkt auf die offene Vorstellung
  await page.goto('/osc');
  const overview = page.getByTestId('osc-page');
  await expect(overview.getByTestId('osc-page-status')).toContainText(`UDP-Port ${OSC_PORT}`);
  await expect(overview.getByTestId('osc-commands').locator('tbody tr')).toHaveCount(15);
  await expect(overview.getByTestId('osc-commands')).toContainText('/steckplan/scene/next');
  await expect(overview.getByTestId('osc-grandma3').first()).toHaveText('SendOSC 1 "/steckplan/play,,"');
  await expect(overview.getByTestId('osc-commands')).toContainText('SendOSC 1 "/steckplan/lied/13,,"');
  await expect(overview.getByTestId('osc-grandma3-help')).toContainText('In & Out');
  await overview.getByLabel('Nummer: /steckplan/item').fill('2');
  await overview.getByRole('button', { name: 'Ausprobieren: /steckplan/item' }).click();
  await expect(page.getByText('/steckplan/item gesendet')).toBeVisible();
  await expect(perf.getByTestId('performance-title')).toHaveText('Zweites');
  await page.screenshot({ path: 'test-results/osc-befehle.png', fullPage: true });
  // wieder aus (Port frei für andere Läufe)
  await show.close();
  expect((await page.request.put('/api/settings/osc', { data: { enabled: false } })).ok()).toBe(true);
});
