import dgram from 'node:dgram';
import { expect, test, type Locator } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

/** Adresse und Argumente einer OSC-Nachricht (Text und int32) */
function decode(buf: Buffer): string {
  const strings: string[] = [];
  let offset = 0;
  const readString = () => {
    const end = buf.indexOf(0, offset);
    const s = buf.toString('utf8', offset, end);
    offset = (end + 4) & ~3;
    return s;
  };
  const address = readString();
  const tags = readString().slice(1);
  for (const tag of tags) {
    if (tag === 's') strings.push(readString());
    else if (tag === 'i') {
      strings.push(String(buf.readInt32BE(offset)));
      offset += 4;
    }
  }
  return [address, ...strings].join(' ');
}

async function fillCommand(row: Locator, values: { label?: string; address: string; args?: string }) {
  if (values.label) await row.getByLabel('Beschriftung').fill(values.label);
  await row.getByLabel('Adresse').fill(values.address);
  if (values.args) await row.getByLabel('Argumente').fill(values.args);
  await row.getByLabel('Adresse').focus();
  await row.getByLabel('Adresse').press('Tab');
}

test('OSC-Befehle der Regie: Reiter OSC (Start, Szenen, Events, von Hand), Testen; beim Führen mit „OSC senden“ automatisch, Knöpfe von Hand', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'osc-befehle',
        meta: { name: 'OSC' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [
            { id: 'a', order: 0, kind: 'song', title: 'Eröffnung', number: 1, durationSec: 30 },
            { id: 'b', order: 1, kind: 'announcement', title: 'Begrüßung', number: 2 },
          ],
          sections: [],
        },
        lightScenes: [{ id: 's1', itemId: 'a', order: 0, name: 'Intro', atSec: 0 }],
        lightEvents: [{ id: 'e1', itemId: 'a', atSec: 1, note: 'Pyro' }],
      },
    })
  ).json();

  const received: string[] = [];
  const socket = dgram.createSocket('udp4');
  socket.on('message', (msg) => received.push(decode(msg)));
  await new Promise<void>((resolve) => socket.bind(18_767, '127.0.0.1', resolve));
  try {
    await page.goto(`/projekt/${id}?ansicht=regie`);
    await page.getByRole('radio', { name: 'OSC' }).click();
    const detail = page.getByTestId('osc-detail');
    await expect(detail).toContainText('Eröffnung');
    await detail.getByTestId('osc-target-host').fill('127.0.0.1');
    await detail.getByTestId('osc-target-port').fill('18767');
    await detail.getByTestId('osc-target-port').press('Tab');

    // Start des Eintrags
    const startList = detail.getByTestId('osc-list-item');
    await startList.getByTestId('osc-add').click();
    await fillCommand(startList.getByTestId('osc-command'), { address: '/a/start', args: '"Go Cue 1"' });
    // Szene, Event, von Hand
    await detail.getByTestId('osc-scene').getByTestId('osc-add').click();
    await fillCommand(detail.getByTestId('osc-scene').getByTestId('osc-command'), { address: '/a/scene' });
    await detail.getByTestId('osc-event').getByTestId('osc-add').click();
    await fillCommand(detail.getByTestId('osc-event').getByTestId('osc-command'), { address: '/a/event', args: '1' });
    const manualList = detail.getByTestId('osc-list-manual');
    await manualList.getByTestId('osc-add').click();
    await fillCommand(manualList.getByTestId('osc-command'), { label: 'Blackout', address: '/a/manual' });
    await expect
      .poll(async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()) as { oscCommands: unknown[] }).oscCommands.length)
      .toBe(4);

    await detail.screenshot({ path: 'test-results/osc-reiter.png' });
    // Testen sendet sofort, grüner Hinweis
    await startList.getByTestId('osc-test').click();
    await expect.poll(() => received.at(-1)).toBe('/a/start Go Cue 1');
    await expect(page.getByTestId('toast')).toContainText('OSC gesendet: /a/start "Go Cue 1" → 127.0.0.1:18767');
    const afterTest = received.length;

    // Führen: ohne „OSC senden“ geht nichts automatisch
    const show = await openPerformance(page);
    const perf = show.getByTestId('performance');
    await perf.getByRole('radio', { name: 'Führen' }).click();
    const panel = perf.getByTestId('osc-lead');
    await perf.getByRole('button', { name: 'Eintrag weiter' }).click();
    await perf.getByRole('button', { name: 'Eintrag zurück' }).click();
    await show.waitForTimeout(500);
    expect(received.length).toBe(afterTest);

    // einschalten, weiter und zurück: Start-Befehl und Szene; abspielen: nach 1 s das Event
    await panel.getByText('OSC senden').click();
    await expect(panel.getByTestId('osc-auto')).toBeChecked();
    await perf.getByRole('button', { name: 'Eintrag weiter' }).click();
    await perf.getByRole('button', { name: 'Eintrag zurück' }).click();
    await expect.poll(() => received.slice(afterTest)).toEqual(['/a/start Go Cue 1', '/a/scene']);
    await perf.getByRole('button', { name: 'Timecode starten' }).click();
    await expect.poll(() => received.at(-1), { timeout: 5000 }).toBe('/a/event 1');
    await perf.getByRole('button', { name: 'Timecode anhalten' }).click();

    // von Hand
    await panel.getByTestId('osc-manual-button').filter({ hasText: 'Blackout' }).click();
    await expect.poll(() => received.at(-1)).toBe('/a/manual');
    await expect(panel.getByTestId('osc-log')).toContainText('Von Hand (Ralf): Blackout');
    await expect(panel.getByTestId('osc-log')).toContainText('Event: Pyro');
    await panel.screenshot({ path: 'test-results/osc-fuehren.png' });
  } finally {
    socket.close();
  }
});
