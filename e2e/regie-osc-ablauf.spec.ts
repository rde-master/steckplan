import dgram from 'node:dgram';
import { expect, test, type Locator } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

/** Adresse und Argumente einer OSC-Nachricht (Text, int32, float32 mit Kennung) */
function decode(buf: Buffer): string {
  const parts: string[] = [];
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
    if (tag === 's') parts.push(readString());
    else if (tag === 'i') {
      parts.push(String(buf.readInt32BE(offset)));
      offset += 4;
    } else if (tag === 'f') {
      parts.push(`f${Math.round(buf.readFloatBE(offset) * 100) / 100}`);
      offset += 4;
    }
  }
  return [address, ...parts].join(' ');
}

async function fillCommand(row: Locator, values: { address: string; args?: string }) {
  await row.getByLabel('Adresse').fill(values.address);
  if (values.args) await row.getByLabel('Argumente').fill(values.args);
  await row.getByLabel('Adresse').focus();
  await row.getByLabel('Adresse').press('Tab');
}

test('OSC über Lieder und im Stück: jeder Eintrag, Zeitpunkt mit Verlauf, Textzeile, Abschnitt, Bereich; beim Führen gesendet', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'osc-ablauf',
        meta: { name: 'OSC-Ablauf' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [
            { id: 'a', order: 0, kind: 'song', title: 'Eröffnung', number: 1, durationSec: 30 },
            { id: 'b', order: 1, kind: 'song', title: 'Ballade', number: 2, durationSec: 30 },
          ],
          sections: [
            { id: 's1', itemId: 'a', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'z1', text: 'Erste Zeile', atSec: 0.5 }] },
            { id: 's2', itemId: 'a', order: 1, kind: 'chorus', label: 'Refrain', lines: [{ id: 'z2', text: 'Refrainzeile', atSec: 20 }] },
          ],
        },
        lightScenes: [{ id: 'sc1', itemId: 'a', order: 0, name: 'Intro', atSec: 0 }],
      },
    })
  ).json();

  const received: string[] = [];
  const socket = dgram.createSocket('udp4');
  socket.on('message', (msg) => received.push(decode(msg)));
  await new Promise<void>((resolve) => socket.bind(18_768, '127.0.0.1', resolve));
  try {
    await page.goto(`/projekt/${id}?ansicht=regie`);
    await page.getByRole('radio', { name: 'OSC' }).click();
    const items = page.getByTestId('osc-items');

    // Jeder Eintrag: Nummer und Titel
    await items.getByTestId('osc-special-all').click();
    const all = page.getByTestId('osc-all');
    await all.getByTestId('osc-target-host').fill('127.0.0.1');
    await all.getByTestId('osc-target-port').fill('18768');
    await all.getByTestId('osc-target-port').press('Tab');
    await all.getByTestId('osc-list-item').getByTestId('osc-add').click();
    await fillCommand(all.getByTestId('osc-list-item').getByTestId('osc-command'), { address: '/lied', args: '{nr} "{titel}"' });

    // Im Stück: Zeitpunkt (mit Verlauf 0 → 1 in 0,3 s) und Textzeile
    await items.getByRole('button', { name: /Eröffnung/ }).click();
    const detail = page.getByTestId('osc-detail');
    const piece = detail.getByTestId('osc-list-piece');
    await piece.getByTestId('osc-add-time').click();
    const timeRow = piece.getByTestId('osc-command').filter({ has: page.getByTestId('osc-anchor-time') });
    await timeRow.getByTestId('osc-anchor-time').fill('0:00.8');
    await timeRow.getByTestId('osc-anchor-time').press('Tab');
    await fillCommand(timeRow, { address: '/dimmer', args: '{wert}' });
    await timeRow.getByTestId('osc-fade').check();
    await timeRow.getByLabel('Verlauf bis').fill('1');
    await timeRow.getByLabel('Verlauf bis').press('Tab');
    await timeRow.getByLabel('Dauer des Verlaufs in Sekunden').fill('0,3');
    await timeRow.getByLabel('Dauer des Verlaufs in Sekunden').press('Tab');
    await piece.getByTestId('osc-add-line').click();
    const lineRow = piece.getByTestId('osc-command').filter({ has: page.getByTestId('osc-anchor-line') });
    await expect(lineRow.getByTestId('osc-anchor-line')).toHaveValue('z1');
    await fillCommand(lineRow, { address: '/zeile' });
    // Abschnitt: Auswahl mit Zeit
    await piece.getByTestId('osc-add-section').click();
    const sectionRow = piece.getByTestId('osc-command').filter({ has: page.getByTestId('osc-anchor-section') });
    await sectionRow.getByTestId('osc-anchor-section').selectOption({ label: '0:20 · Refrain' });
    await fillCommand(sectionRow, { address: '/refrain' });
    await detail.screenshot({ path: 'test-results/osc-im-stueck.png' });

    // Bereich: nur die Ballade (Nebel an beim Betreten, aus beim Verlassen)
    await items.getByTestId('osc-special-ranges').click();
    const ranges = page.getByTestId('osc-ranges');
    await ranges.getByTestId('osc-add-range').click();
    const range = ranges.getByTestId('osc-range');
    await range.getByTestId('osc-range-from').selectOption({ label: '2. Ballade' });
    await range.getByTestId('osc-range-until').selectOption({ label: '2. Ballade' });
    // ein neuer Bereich bringt je einen leeren Befehl mit
    await fillCommand(range.getByTestId('osc-range-start').getByTestId('osc-command'), { address: '/nebel/an' });
    await fillCommand(range.getByTestId('osc-range-end').getByTestId('osc-command'), { address: '/nebel/aus' });
    await ranges.screenshot({ path: 'test-results/osc-bereiche.png' });

    // gespeichert
    type Saved = { trigger: string; address: string; itemId: string; atSec?: number; refId?: string; untilItemId?: string; phase?: string; fade?: unknown };
    const saved = async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()) as { oscCommands: Saved[] }).oscCommands;
    await expect.poll(async () => (await saved()).filter((c) => c.address).length).toBe(6);
    const list = await saved();
    expect(list.find((c) => c.address === '/lied')).toMatchObject({ itemId: '*', trigger: 'item' });
    expect(list.find((c) => c.address === '/dimmer')).toMatchObject({ itemId: 'a', trigger: 'time', atSec: 0.8, fade: { from: 0, to: 1, sec: 0.3 } });
    expect(list.find((c) => c.address === '/zeile')).toMatchObject({ trigger: 'line', refId: 'z1' });
    expect(list.find((c) => c.address === '/refrain')).toMatchObject({ trigger: 'section', refId: 's2' });
    expect(list.find((c) => c.address === '/nebel/an')).toMatchObject({ trigger: 'range', itemId: 'b', untilItemId: 'b', phase: 'start' });

    // Führen mit „OSC senden“: weiter (Bereich betreten), zurück (verlassen), abspielen (Zeile, Zeitpunkt mit Verlauf)
    const show = await openPerformance(page);
    const perf = show.getByTestId('performance');
    await perf.getByRole('radio', { name: 'Führen' }).click();
    const panel = perf.getByTestId('osc-lead');
    await panel.getByText('OSC senden').click();
    await perf.getByRole('button', { name: 'Eintrag weiter' }).click();
    await expect.poll(() => received).toEqual(['/nebel/an', '/lied 2 Ballade']);
    await perf.getByRole('button', { name: 'Eintrag zurück' }).click();
    await expect.poll(() => received.slice(2)).toEqual(['/nebel/aus', '/lied 1 Eröffnung']);
    await perf.getByRole('button', { name: 'Timecode starten' }).click();
    await expect.poll(() => received.includes('/dimmer f1'), { timeout: 5000 }).toBe(true);
    await perf.getByRole('button', { name: 'Timecode anhalten' }).click();
    const played = received.slice(4);
    expect(played[0]).toBe('/zeile');
    expect(played[1]).toBe('/dimmer f0');
    expect(played.at(-1)).toBe('/dimmer f1');
    expect(played.filter((x) => x.startsWith('/dimmer')).length).toBeGreaterThanOrEqual(4);
    await expect(panel.getByTestId('osc-log')).toContainText('Zeile: Erste Zeile');
    await expect(panel.getByTestId('osc-log')).toContainText('Bereich betreten');
  } finally {
    socket.close();
  }
});
