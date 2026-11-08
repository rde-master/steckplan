import dgram from 'node:dgram';
import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

/** Zeichenketten einer OSC-Nachricht (Adresse, Typen, Text-Argumente) */
function oscStrings(buf: Buffer): string[] {
  const out: string[] = [];
  let offset = 0;
  while (offset < buf.length) {
    const end = buf.indexOf(0, offset);
    if (end < 0) break;
    out.push(buf.toString('utf8', offset, end));
    offset = (end + 4) & ~3;
  }
  return out;
}

test('Tempo per OSC: beim Führen /cmd "Master 3.1 At BPM …", getapptes Tempo als manuelles (Vorrang), „Jetzt senden“', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'osc-bpm',
        meta: { name: 'Tempo' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [
            { id: 'a', order: 0, kind: 'song', title: 'Marsch', number: 1, durationSec: 120, bpm: 120, timeSignature: '4/4' },
            { id: 'b', order: 1, kind: 'song', title: 'Walzer', number: 2, durationSec: 120, bpm: 90, timeSignature: '3/4' },
          ],
          sections: [],
        },
      },
    })
  ).json();
  const saved = async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()) as { show: { items: { bpm?: number; manualBpm?: number }[] } }).show.items[0]!;

  const received: string[][] = [];
  const socket = dgram.createSocket('udp4');
  socket.on('message', (msg) => received.push(oscStrings(msg)));
  await new Promise<void>((resolve) => socket.bind(18_766, '127.0.0.1', resolve));
  try {
    await page.goto(`/projekt/${id}?ansicht=regie`);
    await page.getByRole('button', { name: 'Regie-Einstellungen' }).click();
    const settings = page.getByTestId('osc-bpm-settings');
    // Vorgaben: /cmd und „Master 3.1 At BPM {bpm}“
    await expect(settings.getByTestId('osc-bpm-address')).toHaveValue('/cmd');
    await expect(settings.getByTestId('osc-bpm-command')).toHaveValue('Master 3.1 At BPM {bpm}');
    await expect(settings).toContainText('/cmd "Master 3.1 At BPM 120"');
    await settings.getByTestId('osc-bpm-host').fill('127.0.0.1');
    await settings.getByTestId('osc-bpm-host').press('Enter');
    await settings.getByTestId('osc-bpm-port').fill('18766');
    await settings.getByTestId('osc-bpm-port').press('Enter');
    await settings.getByLabel('Tempo senden').check();
    // niemand führt: „Jetzt senden“ meldet das
    await settings.getByRole('button', { name: 'Jetzt senden' }).click();
    await expect(settings.getByRole('status')).toContainText('Niemand führt');
    await page.getByRole('button', { name: 'Fertig' }).click();

    const show = await openPerformance(page);
    const perf = show.getByTestId('performance');
    await perf.getByRole('radio', { name: 'Führen' }).click();
    await expect(perf.getByTestId('osc-bpm-state')).toContainText('127.0.0.1:18766');
    await expect.poll(() => received.length).toBeGreaterThan(0);
    expect(received.at(-1)).toEqual(['/cmd', ',s', 'Master 3.1 At BPM 120']);

    // Tap per Fernsteuerung: 9 × alle 0,6 s (4/4: nach zwei Takten) → manuell ~100, das gespeicherte bleibt 120
    await perf.getByRole('button', { name: 'Timecode starten' }).click();
    for (let i = 0; i < 9; i++) {
      await page.request.post('/api/remote', { data: { action: 'tap' } });
      if (i < 8) await show.waitForTimeout(600);
    }
    await expect.poll(async () => (await saved()).manualBpm ?? 0).toBeLessThan(115);
    expect((await saved()).bpm).toBe(120);
    await expect.poll(() => received.at(-1)?.[2] ?? '').toMatch(/^Master 3\.1 At BPM (9\d|10\d|11[0-4])(\.\d)?$/);
    await expect(perf.getByTestId('beat-manual')).toContainText('manuell');

    // nächstes Lied → dessen Tempo
    await perf.getByRole('button', { name: 'Eintrag weiter' }).click();
    await expect.poll(() => received.at(-1)?.[2]).toBe('Master 3.1 At BPM 90');

    // „Jetzt senden“ in den Einstellungen (jemand führt)
    const count = received.length;
    await page.getByRole('button', { name: 'Regie-Einstellungen' }).click();
    await page.getByTestId('osc-bpm-settings').getByRole('button', { name: 'Jetzt senden' }).click();
    await expect(page.getByTestId('osc-bpm-settings').getByRole('status')).toContainText('Gesendet: Master 3.1 At BPM 90');
    await expect.poll(() => received.length).toBe(count + 1);
  } finally {
    socket.close();
  }
});
