import dgram from 'node:dgram';
import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

const OSC_PORT = 18_767;
/** nachgebautes grandMA3: empfängt die Abfrage und antwortet wie SendOSC an den OSC-Empfang von Steckplan */
const DESK_PORT = 18_769;

function pad(s: string): Buffer {
  const b = Buffer.from(`${s}\0`, 'utf8');
  return Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
}
function reply(sequence: number, cue: string, name: string): Buffer {
  const seq = Buffer.alloc(4);
  seq.writeInt32BE(sequence);
  return Buffer.concat([pad('/steckplan/ma3'), pad(',iss'), seq, pad(cue), pad(name)]);
}
/** Adresse und erstes Text-Argument einer OSC-Nachricht */
function firstString(buf: Buffer): { address: string; text: string } {
  const read = (offset: number) => {
    const end = buf.indexOf(0, offset);
    return { value: buf.toString('utf8', offset, end), next: (end + 4) & ~3 };
  };
  const address = read(0);
  const tags = read(address.next);
  return { address: address.value, text: read(tags.next).value };
}

test('grandMA3: Sequenz je Lichtszene, beim Führen fragt der Server den laufenden Cue ab (Szenenwechsel und Knopf)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  await page.goto('/einstellungen');
  const oscSettings = page.getByTestId('osc-settings');
  await oscSettings.getByLabel('OSC empfangen').check();
  await oscSettings.getByLabel('UDP-Port').fill(String(OSC_PORT));
  await oscSettings.getByRole('button', { name: 'Speichern' }).click();
  await expect(oscSettings.getByTestId('osc-status')).toContainText(`Empfängt auf Port ${OSC_PORT}`);

  // ein Lichtgerät, damit es die Lichtszenen-Bearbeitung gibt
  const par = await (await page.request.post('/api/library/templates', { data: { template: { kind: 'device', name: 'PAR MA3', light: { showInScenes: true, colorMixing: 'rgb' } } } })).json();
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'ma3',
        meta: { name: 'MA3' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [{ id: 'PAR 1', templateId: par.id, layerId: 'l1', label: 'PAR 1' }],
        cables: [],
        lightGrid: { cols: 4, rows: 1 },
        lightPlacements: [{ id: 'PAR 1', col: 0, row: 0 }],
        show: { items: [{ id: 'a', order: 0, kind: 'play', title: 'Stück', number: 1, durationSec: 60 }], sections: [] },
        lightScenes: [
          { id: 's1', itemId: 'a', order: 0, name: 'Auftritt', ma3Sequence: 103 },
          { id: 's2', itemId: 'a', order: 1, name: 'Abgang' },
        ],
      },
    })
  ).json();

  const received: { address: string; text: string }[] = [];
  const desk = dgram.createSocket('udp4');
  desk.on('message', (msg) => {
    const message = firstString(msg);
    received.push(message);
    const sequence = Number(/'Sequence (\d+)'/.exec(message.text)?.[1]);
    // Sequenz 103 läuft in Cue 4 „Refrain“, 999 gibt es am Pult nicht
    desk.send(sequence === 103 ? reply(103, '4', 'Refrain') : reply(sequence, '?', '-'), OSC_PORT, '127.0.0.1');
  });
  await new Promise<void>((resolve) => desk.bind(DESK_PORT, '127.0.0.1', resolve));
  try {
    await page.goto(`/projekt/${id}?ansicht=regie`);
    // Sequenz an der zweiten Szene eintragen
    await page.getByRole('radio', { name: 'Lichtszenen' }).click();
    await page.getByTestId('scenes-items').getByRole('button', { name: /Stück/ }).click();
    const scenes = page.getByTestId('scenes-detail').getByTestId('regie-scenes');
    await scenes.getByTestId('scene-tab').filter({ hasText: 'Abgang' }).click();
    await scenes.getByLabel('grandMA3-Sequenz').fill('999');
    await expect.poll(async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()) as { lightScenes: { id: string; ma3Sequence?: number }[] }).lightScenes.find((s) => s.id === 's2')?.ma3Sequence).toBe(999);

    // Einstellungen: Abfrage an, Pult = nachgebautes MA3; Beispiel-Befehl wird gezeigt
    await page.getByRole('button', { name: 'Regie-Einstellungen' }).click();
    const settings = page.getByTestId('ma3-settings');
    await expect(settings.getByTestId('ma3-example')).toContainText("Lua \"local q=string.char(34) local ok,o=pcall(ObjectList,'Sequence 1')");
    await settings.getByTestId('ma3-host').fill('127.0.0.1');
    await settings.getByTestId('ma3-host').press('Enter');
    await settings.getByTestId('ma3-port').fill(String(DESK_PORT));
    await settings.getByTestId('ma3-port').press('Enter');
    await settings.getByLabel('Abfragen', { exact: true }).check();
    await page.getByRole('button', { name: 'Fertig' }).click();

    // Führen: erste Szene (Sequenz 103) wird gleich abgefragt
    const show = await openPerformance(page);
    const perf = show.getByTestId('performance');
    await perf.getByRole('radio', { name: 'Führen' }).click();
    const panel = perf.getByTestId('ma3-cue');
    await expect(panel.getByTestId('ma3-cue-sequence')).toHaveText('Seq 103');
    await expect(panel.getByTestId('ma3-cue-current')).toHaveText(/Cue 4\s*Refrain/);
    expect(received[0]!.address).toBe('/cmd');
    expect(received[0]!.text).toMatch(/^Lua ".*'Sequence 103'.*SendOSC 1 .*"$/);

    // nächste Szene (Sequenz 999): das Pult kennt sie nicht
    await perf.getByRole('button', { name: 'Szene weiter' }).click();
    await expect(panel.getByTestId('ma3-cue-sequence')).toHaveText('Seq 999');
    await expect(panel.getByTestId('ma3-cue-status')).toHaveText('Sequenz gibt es am Pult nicht');

    // Knopf fragt erneut
    const count = received.length;
    await panel.getByTestId('ma3-query').click();
    await expect.poll(() => received.length).toBe(count + 1);
    await expect(panel.getByTestId('ma3-cue-state')).toHaveAttribute('data-status', 'noSequence');
    await panel.screenshot({ path: 'test-results/ma3-cue.png' });
    await show.close();
  } finally {
    desk.close();
    // wieder aus (Port frei für andere Läufe)
    await page.request.put('/api/settings/osc', { data: { enabled: false } });
  }
});
