import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

test('Lichtszenen: grüner Hinweis nach dem Einfügen; Licht-Events mit Notiz – Marker in den Zeitleisten, Countdown in der Vorstellung', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const par = await (await page.request.post('/api/library/templates', { data: { template: { kind: 'device', name: 'PAR LE', light: { showInScenes: true, colorMixing: 'rgb' } } } })).json();
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'licht-events',
        meta: { name: 'Events' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [{ id: 'PAR 1', templateId: par.id, layerId: 'l1', label: 'PAR 1' }],
        lightGrid: { cols: 1, rows: 1 },
        lightPlacements: [{ id: 'PAR 1', col: 0, row: 0 }],
        show: { items: [{ id: 'a', order: 0, kind: 'song', title: 'Feuerlied', durationSec: 60 }, { id: 'b', order: 1, kind: 'announcement', title: 'Begrüßung' }], sections: [] },
        lightScenes: [
          { id: 's1', itemId: 'a', order: 0, name: 'Intro', atSec: 0 },
          { id: 's2', itemId: 'a', order: 1, name: 'Refrain', atSec: 20 },
        ],
        sceneStates: [{ id: 's1:PAR 1', sceneId: 's1', deviceId: 'PAR 1', intensity: 80 }],
      },
    })
  ).json();
  const events = async () => ((await (await page.request.get(`/api/projects/${id}/download`)).json()) as { lightEvents: { itemId: string; atSec: number; note: string }[] }).lightEvents;

  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Lichtszenen' }).click();
  const scenes = page.getByTestId('regie-scenes');
  // auch Ansagen haben Lichtszenen
  await expect(page.getByTestId('scenes-items')).toContainText('Begrüßung');

  // Werte kopieren und in die andere Szene einfügen → grüner Hinweis unten rechts, nach 3 s weg
  await scenes.getByTestId('scene-tab').first().click();
  await scenes.getByTitle(/^Werte kopieren/).click();
  await scenes.getByTestId('scene-tab').nth(1).click();
  await scenes.getByTitle(/hier einfügen/).click();
  const toast = page.getByTestId('toast');
  await expect(toast).toHaveText('✓Szene „Refrain“: Inhalt aus „Intro“ eingefügt');
  await expect(toast).toHaveClass(/bg-emerald-600/);
  const box = (await toast.boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan(1300);
  expect(box.y + box.height).toBeGreaterThan(900);
  await expect(toast).toHaveCount(0, { timeout: 4000 });

  // Event anlegen (an der aktuellen Stelle 0), Notiz und Zeit setzen
  const editor = page.getByTestId('light-events');
  await expect(editor).toContainText('Noch keine Events.');
  await editor.getByTestId('light-event-add').click();
  const row = editor.getByTestId('light-event');
  await expect(row).toHaveCount(1);
  await row.getByLabel('Notiz zum Event').fill('Pyro');
  await row.getByLabel('Notiz zum Event').press('Enter');
  await row.getByLabel('Zeitpunkt').fill('0:08');
  await row.getByLabel('Zeitpunkt').press('Enter');
  await expect.poll(events).toEqual([{ id: expect.any(String), itemId: 'a', atSec: 8, note: 'Pyro' }]);
  // Marker in der Szenen-Zeitleiste; ziehen verschiebt das Event
  const marker = page.getByTestId('scene-timeline').getByTestId('scene-event-marker');
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveAttribute('data-at', '8');
  const track = page.getByTestId('scene-timeline-track');
  const pxPerSec = (await track.boundingBox())!.width / Number(await track.getAttribute('data-span'));
  const m = (await marker.boundingBox())!;
  await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2);
  await page.mouse.down();
  await page.mouse.move(m.x + m.width / 2 + pxPerSec, m.y + m.height / 2, { steps: 3 });
  await page.mouse.move(m.x + m.width / 2 + 2 * pxPerSec, m.y + m.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => (await events())[0]!.atSec).toBeCloseTo(10, 0);
  await row.getByLabel('Zeitpunkt').fill('0:08');
  await row.getByLabel('Zeitpunkt').press('Enter');
  await expect.poll(async () => (await events())[0]!.atSec).toBe(8);

  // Vorstellung (Frei, Licht): Countdown bis zum Event
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  const countdown = perf.getByTestId('light-event-countdown');
  await expect(countdown.getByTestId('light-event-next')).toContainText('Pyro');
  await expect(countdown.getByTestId('light-event-timer').first()).toHaveText('in 8,0 s');
  await show.keyboard.press('Space');
  await expect.poll(async () => countdown.getByTestId('light-event-timer').first().textContent(), { timeout: 4000 }).toMatch(/^in [5-6],\d s$/);
  await show.keyboard.press('Space');

  // Führen: Event als Marker im Zeitstrahl
  await perf.getByRole('radio', { name: 'Führen' }).click();
  const lead = perf.getByTestId('lead-timeline');
  await expect(lead.getByTestId('lead-event')).toHaveCount(1);
  await expect(lead.getByTestId('lead-event')).toContainText('Pyro');
});
