import { expect, test } from '@playwright/test';
import { loginAs, newContextPage, openPerformance } from './helpers';

test('Vorstellung: Regie führt, Lesen folgt; Tasten; eigenes Bedienen verlässt das Folgen; Regie-PDFs', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const mh = await (await page.request.post('/api/library/templates', { data: { template: { kind: 'device', name: 'MH M11e', light: { showInScenes: true, colorMixing: 'rgb' } } } })).json();
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'vorstellung',
        meta: { name: 'Premiere' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [{ id: 'mh1', templateId: mh.id, layerId: 'l1', label: 'MH 1' }],
        cables: [],
        lightGrid: { cols: 2, rows: 1, rowLabels: [] },
        lightPlacements: [{ id: 'mh1', col: 0, row: 0 }],
        show: {
          items: [
            { id: 'a', order: 0, kind: 'song', title: 'Opener', durationSec: 200 },
            { id: 'b', order: 1, kind: 'play', title: 'Die Begegnung', roles: [{ id: 'r1', name: 'Hamlet' }] },
          ],
          sections: [
            { id: 's1', itemId: 'a', order: 0, kind: 'verse', label: 'Strophe 1', lines: [{ id: 'l1', text: 'Es war einmal' }] },
            { id: 's2', itemId: 'b', order: 0, kind: 'scene', label: 'Szene 1', lines: [{ id: 'p1', text: 'Sein oder nicht sein', roleId: 'r1' }] },
          ],
        },
        lightScenes: [
          { id: 'x1', itemId: 'a', order: 0, name: 'Intro' },
          { id: 'x2', itemId: 'a', order: 1, name: 'Strophe' },
          { id: 'x3', itemId: 'b', order: 0, name: 'Auftritt' },
        ],
        sceneStates: [{ id: 'x2:mh1', sceneId: 'x2', deviceId: 'mh1', dimmer: 100, color: { hex: '#0000ff', name: 'Blau' } }],
      },
    })
  ).json();

  // Regie führt
  const regie = await newContextPage(browser);
  await regie.setViewportSize({ width: 1280, height: 800 });
  await loginAs(regie, 'direction', 'Regina');
  await regie.goto(`/projekt/${id}?ansicht=regie`);
  const regieShow = await openPerformance(regie);
  const r = regieShow.getByTestId('performance');
  await expect(r.getByTestId('performance-title')).toHaveText('Opener');
  await expect(r.getByTestId('performance-scene')).toHaveText('1. Intro');
  await r.getByRole('radio', { name: 'Führen' }).click();
  await expect(r.getByTestId('performance-lead')).toHaveText('Du führst');

  // Lesen folgt (beim Öffnen automatisch)
  const reader = await newContextPage(browser);
  await reader.setViewportSize({ width: 1280, height: 800 });
  await loginAs(reader, 'read', 'Leo');
  await reader.goto(`/projekt/${id}?ansicht=regie`);
  const readerShow = await openPerformance(reader);
  const l = readerShow.getByTestId('performance');
  await expect(l.getByRole('radio', { name: 'Folgen' })).toHaveAttribute('aria-checked', 'true');
  await expect(l.getByRole('radio', { name: 'Führen' })).toHaveCount(0);
  await expect(l.getByTestId('performance-lead')).toHaveText('Regina führt');

  // Regie: Taste → nächste Szene, Knopf → nächster Eintrag
  await regieShow.keyboard.press('ArrowRight');
  await expect(r.getByTestId('performance-scene')).toHaveText('2. Strophe');
  await expect(l.getByTestId('performance-scene')).toHaveText('2. Strophe');
  await expect(l.getByTestId('scene-fixture')).toContainText('100 % · Blau');
  await r.getByRole('button', { name: 'Eintrag weiter' }).click();
  await expect(l.getByTestId('performance-title')).toHaveText('Die Begegnung');
  await expect(l.getByTestId('performance-text')).toContainText('Hamlet:');
  await expect(l.getByTestId('performance-position')).toHaveText('2 / 2');

  // Lesen bedient selbst → verlässt das Folgen an der aktuellen Stelle
  await l.getByRole('button', { name: 'Szene zurück' }).click();
  await expect(l.getByRole('radio', { name: 'Frei' })).toHaveAttribute('aria-checked', 'true');
  await expect(l.getByTestId('performance-scene')).toHaveText('2. Strophe');
  await expect(r.getByTestId('performance-title')).toHaveText('Die Begegnung');

  // Regie schließt die Vorstellung (Tab) → niemand führt
  await r.getByRole('button', { name: 'Vorstellung beenden' }).click();
  await expect.poll(() => regieShow.isClosed()).toBe(true);
  await expect(l.getByTestId('performance-lead')).toHaveText('Niemand führt');

  // Regie-PDFs im Export
  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('button', { name: 'Exportieren' }).click();
  const dialog = page.getByRole('dialog', { name: 'Exportieren' });
  for (const [label, file] of [
    ['Ablaufplan', 'Premiere - Ablaufplan.pdf'],
    ['Lichtszenen', 'Premiere - Lichtszenen.pdf'],
    ['Textbuch', 'Premiere - Textbuch.pdf'],
  ] as const) {
    await dialog.getByLabel('Dokument').selectOption({ label });
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'PDF', exact: true }).click();
    expect((await download).suggestedFilename()).toBe(file);
    await page.getByRole('button', { name: 'Exportieren' }).click();
  }
});
