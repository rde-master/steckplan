import { expect, test, type Page } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

// Simuliertes APC40 (Web MIDI): schreibt gesendete Nachrichten mit, Tastendrücke per window.__apcPress
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const w = window as unknown as { __apcSent: number[][]; __apcPress: (bytes: number[]) => void };
    w.__apcSent = [];
    const input = Object.assign(new EventTarget(), { id: 'in', name: 'Akai APC40', state: 'connected' });
    const output = { id: 'out', name: 'Akai APC40', state: 'connected', send: (data: number[]) => void w.__apcSent.push(Array.from(data)) };
    const access = Object.assign(new EventTarget(), { inputs: new Map([['in', input]]), outputs: new Map([['out', output]]), sysexEnabled: true });
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: async () => access });
    w.__apcPress = (bytes) => {
      const e = new Event('midimessage') as Event & { data: Uint8Array };
      e.data = new Uint8Array(bytes);
      input.dispatchEvent(e);
    };
  });
});

const sent = (page: Page) => page.evaluate(() => (window as unknown as { __apcSent: number[][] }).__apcSent);
/** zuletzt gesendeter Zustand einer LED (Status mit Kanal, Note) */
const led = async (page: Page, status: number, note: number) => {
  const all = await sent(page);
  const last = [...all].reverse().find((m) => (m[0]! & 0x0f) === (status & 0x0f) && m[1] === note && (m[0]! & 0xf0) !== 0xf0);
  return last ? ((last[0]! & 0xf0) === 0x80 ? 0 : last[2]) : undefined;
};
const press = (page: Page, channel: number, note: number) =>
  page.evaluate(([c, n]) => {
    const w = window as unknown as { __apcPress: (bytes: number[]) => void };
    w.__apcPress([0x90 | c!, n!, 127]);
    w.__apcPress([0x80 | c!, n!, 127]);
  }, [channel, note]);

test('APC40: Modus 2, Ablaufpunkte farbig in der Matrix, Tasten steuern die Vorstellung, Belegung grafisch einstellbar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'apc40',
        meta: { name: 'APC40' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [
            { id: 'a', order: 0, kind: 'song', title: 'Erstes', number: 1, durationSec: 60 },
            { id: 'b', order: 1, kind: 'song', title: 'Zweites', number: 2, durationSec: 60 },
            { id: 'c', order: 2, kind: 'song', title: 'Drittes', number: 3, durationSec: 60 },
          ],
          sections: [],
        },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  const title = perf.getByRole('heading', { level: 2 });
  await expect(title).toContainText('Erstes');

  // verbunden: Modus 2, Matrix = Ablaufpunkte (aktuell grün, nächster rot, übrige gelb, leer aus)
  await expect(perf.getByTestId('apc40-open')).toBeVisible();
  await expect.poll(async () => (await sent(show)).some((m) => m.join(',') === '240,71,127,115,96,0,4,66,1,0,0,247')).toBe(true);
  await expect.poll(() => led(show, 0x90, 0x35)).toBe(1);
  await expect.poll(() => led(show, 0x91, 0x35)).toBe(3);
  await expect.poll(() => led(show, 0x92, 0x35)).toBe(5);
  await expect.poll(() => led(show, 0x93, 0x35)).toBe(0);

  // Bank ▼ = Eintrag weiter, LEDs folgen
  await press(show, 0, 0x5f);
  await expect(title).toContainText('Zweites');
  await expect.poll(() => led(show, 0x91, 0x35)).toBe(1);
  await expect.poll(() => led(show, 0x92, 0x35)).toBe(3);
  // Clip-Taste 1 = Ablaufpunkt 1
  await press(show, 0, 0x35);
  await expect(title).toContainText('Erstes');
  // Play = Start/Pause: Taste blinkt grün
  await press(show, 0, 0x5b);
  await expect.poll(() => led(show, 0x90, 0x35)).toBe(2);
  await press(show, 0, 0x5b);
  await expect.poll(() => led(show, 0x90, 0x35)).toBe(1);

  // Einstellungen: grafisch, Taste am Gerät drücken wählt sie aus, Aktion ändern
  await perf.getByTestId('apc40-open').click();
  const settings = show.getByTestId('apc40-settings');
  await expect(settings.getByTestId('apc40-status')).toHaveAttribute('data-status', 'connected');
  await expect(settings.getByTestId('apc-key')).toHaveCount(APC_KEYS);
  await show.getByRole('dialog', { name: 'APC40 (MIDI) – Belegung' }).screenshot({ path: 'test-results/apc40-einstellungen.png' });
  // Matrix zeigt die Ablaufnummer und die LED-Farbe
  const first = settings.locator('[data-testid=apc-key][data-id="clip:0:0"]');
  await expect(first).toHaveText('#1');
  await expect(first).toHaveAttribute('data-led', 'green');
  await press(show, 0, 0x63); // Tap am Gerät → ausgewählt, nichts ausgelöst
  await expect(settings.getByTestId('apc40-selected')).toHaveText('Tap Tempo');
  await settings.getByTestId('apc40-action').selectOption('next');
  await expect(settings.locator('[data-testid=apc-key][data-id="tap"]')).toHaveText('Eintr. +');
  // Klick im Bild wählt eine Taste, Wert einstellbar
  await settings.locator('[data-testid=apc-key][data-id="clip:7:3"]').click();
  await expect(settings.getByTestId('apc40-selected')).toHaveText('Clip 8/4');
  await settings.getByTestId('apc40-value').fill('3');
  await expect(settings.locator('[data-testid=apc-key][data-id="clip:7:3"]')).toHaveText('#3');
  // untere Reihe: Metronom
  await expect(settings.locator('[data-testid=apc-key][data-id="clip:0:4"]')).toHaveText('♩1');
  await show.getByRole('button', { name: 'Fertig' }).click();
  await expect(title).toContainText('Erstes');

  // neue Belegung wirkt: Tap = Eintrag weiter; Clip 8/4 = Ablaufpunkt 3 (gelb, bzw. rot als übernächster nicht)
  await press(show, 0, 0x63);
  await expect(title).toContainText('Zweites');
  await press(show, 7, 0x38);
  await expect(title).toContainText('Drittes');
  await expect.poll(() => led(show, 0x97, 0x38)).toBe(1);

  // Cue Level dreht fein: 0,1 s je Raste vor
  const tc = perf.getByTestId('timecode').first();
  await show.evaluate(() => (window as unknown as { __apcPress: (b: number[]) => void }).__apcPress([0xb0, 47, 5]));
  await expect(tc).toHaveText('00:00:00:12');

  // gemerkt (je Gerät)
  await show.reload();
  await show.getByTestId('performance').getByTestId('apc40-open').click();
  await expect(show.getByTestId('apc40-settings').locator('[data-testid=apc-key][data-id="tap"]')).toHaveText('Eintr. +');
});

/** Tasten im Bild: 40 Clip, 5 Szenen, 8 Clip-Stopp + Stop All, 8 Track + Master, 3 × 8 Spur-Tasten, 4 Pan/Send, 8 Device, 3 Transport, 4 Bank, Shift, Tap, 2 Nudge */
const APC_KEYS = 40 + 5 + 9 + 9 + 24 + 4 + 8 + 3 + 4 + 2 + 2;

test('APC40: Metronom in der unteren Matrixreihe – Schlag leuchtet im Takt (die „1“ rot), Druck springt auf den Schlag', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'apc40-metronom',
        meta: { name: 'Metronom' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: { items: [{ id: 'a', order: 0, kind: 'song', title: 'Im Takt', number: 1, durationSec: 60, bpm: 120, timeSignature: '3/4' }], sections: [] },
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  await expect(perf.getByTestId('apc40-open')).toBeVisible();
  const ROW5 = 0x39;
  // Stand 0:00 = Schlag 1 (rot); 3/4: Tasten 4–8 aus
  await expect.poll(() => led(show, 0x90, ROW5)).toBe(3);
  await expect.poll(() => led(show, 0x91, ROW5)).toBe(0);
  await expect.poll(() => led(show, 0x93, ROW5)).toBe(0);
  // Taste 3 → Schlag 3 des Takts (120 BPM: 1,0 s), leuchtet grün
  await press(show, 2, ROW5);
  await expect(perf.getByTestId('timecode')).toContainText('00:00:01:00');
  await expect.poll(() => led(show, 0x92, ROW5)).toBe(1);
  await expect.poll(() => led(show, 0x90, ROW5)).toBe(0);
  // Taste 4 gibt es im 3/4-Takt nicht: nichts passiert
  await press(show, 3, ROW5);
  await expect(perf.getByTestId('timecode')).toContainText('00:00:01:00');
  // beim Abspielen wandert das Licht mit
  await press(show, 0, 0x5b);
  await expect.poll(() => led(show, 0x90, ROW5), { timeout: 3000 }).toBe(3);
  await expect.poll(() => led(show, 0x91, ROW5), { timeout: 3000 }).toBe(1);
  await press(show, 0, 0x5b);
});
