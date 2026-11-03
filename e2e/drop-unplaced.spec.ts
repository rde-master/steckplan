import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('Bühnenplan: Einfügen fragt nach der Ebene; auf dem Podest liegt das Gerät darüber', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Drop-Dirk');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const podest = await post({ kind: 'stageElement', name: 'Podest Drop', shape: { form: 'rect', widthMm: 6000, depthMm: 4000, heightMm: 400 } });
  const micT = await post({ kind: 'device', name: 'Mikro Drop', ports: [] });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 8,
        id: 'drop',
        meta: { name: 'Drop' },
        layers: [
          { id: 'l1', name: 'Bühne', order: 0, visible: true, locked: false },
          { id: 'l2', name: 'Podeste', order: 1, visible: true, locked: false },
          { id: 'l3', name: 'Archiv', order: 2, visible: true, locked: true },
        ],
        devices: [
          { id: 'm', templateId: micT.id, layerId: 'l2', label: 'Mikro 1', signalFlow: { position: { x: 40, y: 40 } } },
          { id: 'm2', templateId: micT.id, layerId: 'l1', label: 'Mikro 2', signalFlow: { position: { x: 40, y: 140 } } },
          { id: 'p', templateId: podest.id, layerId: 'l2', label: 'Podest', stagePlan: { position: { x: 5000, y: 3000 }, rotationDeg: 0 } },
        ],
        cables: [],
      },
    })
  ).json();
  const project = async () => (await page.request.get(`/api/projects/${id}/download`)).json();
  await page.goto(`/projekt/${id}`);
  await page.getByRole('tab', { name: 'Bühnenplan' }).click();
  await page.getByRole('tab', { name: /^Nicht platziert/ }).click();
  const canvas = page.locator('[data-canvas-theme]').first();
  const box = (await canvas.boundingBox())!;

  // auf das Podest ziehen → Fenster „Auf welche Ebene?“ (gesperrte Ebene nicht wählbar), „Bühne“ wählen
  await page.getByTestId('unplaced-list').getByRole('listitem').filter({ hasText: 'Mikro 1' }).dragTo(canvas, { targetPosition: { x: box.width / 2, y: box.height / 2 } });
  const dialog = page.getByRole('dialog', { name: 'Auf welche Ebene?' });
  await expect(dialog.getByRole('radio', { name: 'Archiv' })).toBeDisabled();
  await dialog.getByRole('radio', { name: 'Bühne' }).check();
  await dialog.getByRole('button', { name: 'Einfügen' }).click();
  await expect.poll(async () => (await project()).devices.find((d: { id: string }) => d.id === 'm').layerId).toBe('l1');
  expect((await project()).devices.find((d: { id: string }) => d.id === 'm').stagePlan.standsOnId).toBe('p');
  // steht auf dem Podest (höhere Ebene) und wird trotzdem darüber gezeichnet
  await expect
    .poll(() => page.evaluate(() => window.__steckplanStagePlan!.find('.stage-device').sort((a, b) => a.zIndex() - b.zIndex()).map((n) => n.id())))
    .toEqual(['stage-device-p', 'stage-device-m']);

  // ＋: Vorauswahl ist die zuletzt gewählte Ebene; Abbrechen fügt nichts ein
  await page.getByRole('button', { name: 'Platzieren: Mikro 2' }).click();
  await expect(dialog.getByRole('radio', { name: 'Bühne' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  expect((await project()).devices.find((d: { id: string }) => d.id === 'm2').stagePlan).toBeUndefined();
  await page.getByRole('button', { name: 'Platzieren: Mikro 2' }).click();
  await dialog.getByRole('radio', { name: 'Podeste' }).check();
  await dialog.getByRole('button', { name: 'Einfügen' }).click();
  await expect.poll(async () => (await project()).devices.find((d: { id: string }) => d.id === 'm2').layerId).toBe('l2');
});
