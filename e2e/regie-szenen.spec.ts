import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

function wav(seconds: number): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(rate * seconds * 2);
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

test('Regie Lichtszenen: Werte je Gerät, „wie vorige“, Auslöser, Marken im Player, mitgehen beim Abspielen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const mh = await post({
    kind: 'device',
    name: 'Moving Head M11d',
    light: { showInScenes: true, colorMixing: 'none', colorWheels: [{ name: 'Farbrad', colors: [{ name: 'Rot', hex: '#ff0000' }, { name: 'Blau', hex: '#0000ff' }] }], goboWheels: [{ name: 'Rad 1', rotating: true, gobos: ['Sterne', 'Breakup'] }], moving: { panDeg: 540, tiltDeg: 270 } },
  });
  const par = await post({ kind: 'device', name: 'PAR M11d', light: { showInScenes: true, colorMixing: 'rgb' } });
  const dev = (id: string, t: { id: string }) => ({ id, templateId: t.id, layerId: 'l1', label: id });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'szenen',
        meta: { name: 'Szenenprobe' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [dev('MH 1', mh), dev('MH 2', mh), dev('PAR 1', par)],
        cables: [],
        lightGrid: { cols: 3, rows: 1, rowLabels: ['Traverse'] },
        lightPlacements: [
          { id: 'MH 1', col: 0, row: 0 },
          { id: 'MH 2', col: 2, row: 0 },
          { id: 'PAR 1', col: 1, row: 0 },
        ],
        lightTargets: [{ id: 't1', order: 0, name: 'Sängerin', color: '#e11d48' }],
        show: {
          items: [{ id: 'song', order: 0, kind: 'song', title: 'Ballade' }],
          sections: [{ id: 's1', itemId: 'song', order: 0, kind: 'verse', label: 'Strophe 1', lines: [{ id: 'z1', text: 'Erste Zeile', atSec: 0.5 }, { id: 'z2', text: 'Zweite Zeile', atSec: 2.5 }] }],
        },
      },
    })
  ).json();

  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Ablauf' }).click();
  const detail = page.getByTestId('regie-detail');
  await detail.locator('input[type=file]').setInputFiles({ name: 'Ballade.wav', mimeType: 'audio/wav', buffer: wav(5) });
  await expect(detail.getByTestId('regie-player')).toBeVisible();

  const scenes = detail.getByTestId('regie-scenes');
  await scenes.getByRole('button', { name: '+ Szene' }).click();
  const fixture = (name: string) => scenes.getByTestId('scene-fixture').and(scenes.locator(`[data-device="${name}"]`));
  await expect(fixture('MH 1')).toContainText('–');
  await fixture('MH 1').click();
  await fixture('MH 2').click();
  const panel = scenes.getByTestId('fixture-panel');
  await panel.getByLabel('Helligkeit (%)').fill('80');
  await panel.getByRole('button', { name: 'Farbe Rot' }).click();
  await panel.getByLabel('Gobo', { exact: true }).selectOption({ label: 'Rad 1: Sterne' });
  await panel.getByLabel('Drehung').selectOption('cw');
  await panel.getByLabel('Ziel').selectOption({ label: 'Sängerin' });
  await panel.getByLabel('Bewegung').selectOption({ label: 'Kreis' });
  await panel.getByLabel('Tempo').selectOption({ label: 'langsam' });
  for (const name of ['MH 1', 'MH 2']) {
    await expect(fixture(name)).toContainText('80 % · Rot');
    await expect(fixture(name)).toContainText('◎ Sterne');
    await expect(fixture(name)).toContainText('→ Sängerin');
  }
  await expect(fixture('PAR 1')).toContainText('–');
  await scenes.getByLabel('Name der Szene').fill('Intro');
  await scenes.getByLabel('Zeitpunkt').fill('0:00');
  await scenes.getByLabel('Zeitpunkt').press('Enter');

  // zweite Szene übernimmt die Werte („wie vorige“), MH 1 aus, Auslöser an Textzeile 2
  await scenes.getByRole('button', { name: '+ Szene' }).click();
  await expect(scenes.getByTestId('scene-tab')).toHaveCount(2);
  await expect(fixture('MH 2')).toContainText('80 %');
  await scenes.getByRole('button', { name: 'Keine', exact: true }).click();
  await fixture('MH 1').click();
  await panel.getByRole('button', { name: 'Aus', exact: true }).click();
  await expect(fixture('MH 1')).toContainText('aus');
  await scenes.getByLabel('bei Textzeile').selectOption({ label: 'Strophe 1: Zweite Zeile' });
  // unterschiedliche Werte bei Mehrfachauswahl
  await fixture('MH 2').click();
  await expect(panel).toContainText('unterschiedlich');

  // Marken im Player, mitgehen beim Abspielen
  await expect(detail.getByTestId('scene-marker')).toHaveCount(2);
  await scenes.getByTestId('scene-tab').first().click();
  await expect(scenes.getByTestId('scene-tab').first()).toHaveAttribute('aria-selected', 'true');
  await detail.getByRole('button', { name: 'Abspielen' }).click();
  await expect(scenes.getByTestId('scene-tab').nth(1)).toHaveAttribute('aria-selected', 'true', { timeout: 6000 });

  // gespeichert
  await expect
    .poll(async () => {
      const p = await (await page.request.get(`/api/projects/${id}/download`)).json();
      const second = p.lightScenes.find((s: { order: number }) => s.order === 1);
      const mh1 = p.sceneStates.find((s: { sceneId: string; deviceId: string }) => s.sceneId === second?.id && s.deviceId === 'MH 1');
      return [p.lightScenes.length, second?.lineId, mh1?.dimmer, mh1?.gobo?.name, mh1?.effect?.speed];
    })
    .toEqual([2, 'z2', 0, 'Sterne', 'slow']);
});
