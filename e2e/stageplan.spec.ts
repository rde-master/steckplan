import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loginAs } from './helpers';

async function center(page: Page, selector: string): Promise<{ x: number; y: number }> {
  return page.evaluate((sel) => {
    const stage = window.__steckplanStagePlan!;
    const node = stage.findOne(sel);
    if (!node) throw new Error(`nicht gefunden: ${sel}`);
    const shape = (node as unknown as { findOne?: (s: string) => { getClientRect(): { x: number; y: number; width: number; height: number } } }).findOne?.('Rect, Ellipse') ?? node;
    const r = shape.getClientRect();
    const b = stage.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 };
  }, selector);
}

async function count(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => window.__steckplanStagePlan?.find(sel).length ?? 0, selector);
}

async function project(request: APIRequestContext, id: string) {
  return (await request.get(`/api/projects/${id}/download`)).json();
}

/** Minimales einseitiges PDF mit einer Linie (für den Grundriss-Import). */
function minimalPdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 4 0 R >>',
  ];
  const stream = '4 w 20 20 m 380 280 l S';
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('Bühnenplan: platzieren, andocken, Höhe, mitbewegen, zeichnen, Ebenen, Hintergrund', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const stand = await post({ kind: 'stand', name: 'Lichtstativ', shape: { form: 'circle', widthMm: 1400, depthMm: 1400, heightMm: 2500 }, maxMountedDevices: 1 });
  const spot = await post({ kind: 'device', name: 'Spot PAR', defaultColor: '#f59e0b', shape: { form: 'rect', widthMm: 400, depthMm: 400 } });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 3,
        id: 'sp-test',
        meta: { name: 'Bühnenplan-Test' },
        layers: [
          { id: 'l1', name: 'Bühne', order: 0 },
          { id: 'l2', name: 'Licht', order: 1 },
        ],
        devices: [{ id: 'spot1', templateId: spot.id, layerId: 'l1', label: 'PAR 1', signalFlow: { position: { x: 40, y: 40 } } }],
      },
    })
  ).json();

  // Signalfluss markiert nicht platzierte Geräte
  await page.goto(`/projekt/${id}`);
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.unplaced-marker').length ?? 0)).toBe(1);

  await page.getByRole('tab', { name: 'Bühnenplan' }).click();
  await expect(page.getByTestId('scale-bar')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Nicht platziert (1)' })).toBeVisible();

  // Stativ aus der Bibliothek in die Mitte setzen
  await page.getByRole('button', { name: 'Hinzufügen: Lichtstativ' }).click();  // mehrere Ebenen → Fenster „Auf welche Ebene?“ (Vorauswahl: aktive Ebene)
  await page.getByRole('dialog', { name: 'Auf welche Ebene?' }).getByRole('button', { name: 'Einfügen' }).click();
  await expect.poll(() => count(page, '.stage-device')).toBe(1);
  const standId = (await project(page.request, id)).devices.find((d: { templateId: string }) => d.templateId === stand.id).id;

  // nicht platziertes Gerät auf das Stativ ziehen → angedockt
  await page.getByRole('tab', { name: 'Nicht platziert (1)' }).click();
  const canvas = page.getByTestId('stageplan-canvas');
  const box = (await canvas.boundingBox())!;
  const standCenter = await center(page, `#stage-device-${standId}`);
  await page.getByTestId('unplaced-list').getByRole('listitem').filter({ hasText: 'PAR 1' }).dragTo(canvas, { targetPosition: { x: standCenter.x - box.x + 10, y: standCenter.y - box.y + 10 } });  // mehrere Ebenen → Fenster „Auf welche Ebene?“ (Vorauswahl: aktive Ebene)
  await page.getByRole('dialog', { name: 'Auf welche Ebene?' }).getByRole('button', { name: 'Einfügen' }).click();
  await expect.poll(async () => (await project(page.request, id)).devices.find((d: { id: string }) => d.id === 'spot1').mountedOnId).toBe(standId);
  await expect(page.getByRole('tab', { name: 'Nicht platziert' })).toBeVisible();
  let data = await project(page.request, id);
  const standPos = data.devices.find((d: { id: string }) => d.id === standId).stagePlan.position;
  expect(data.devices.find((d: { id: string }) => d.id === 'spot1').stagePlan.position).toEqual(standPos);

  // Höhe vom Stativ übernommen; Stativ ausfahren → Gerät folgt
  const props = page.getByRole('complementary', { name: 'Eigenschaften' });
  await expect(props.getByTestId('effective-height')).toContainText('2,50 m');
  await expect(props.getByTestId('effective-height')).toContainText('Lichtstativ 1');
  await expect(props.getByTestId('dock-info')).toContainText('Hängt an „Lichtstativ 1“');
  const standOnly = await center(page, `#stage-device-${standId}`);
  await page.mouse.click(standOnly.x + 40, standOnly.y + 30); // Stativ neben dem Gerät anklicken
  await expect(props.getByRole('heading', { name: 'Lichtstativ 1' })).toBeVisible();
  await props.getByLabel('Höhe dieses Objekts (m)').fill('3,2');
  await expect(props).toContainText('Angehängt: 1 von max. 1 Geräten');
  const spotCenter = await center(page, '#stage-device-spot1');
  await page.mouse.click(spotCenter.x, spotCenter.y);
  await expect(props.getByTestId('effective-height')).toContainText('3,20 m');

  // Stativ verschieben → angehängtes Gerät bewegt sich mit
  const s0 = await center(page, `#stage-device-${standId}`);
  await page.mouse.move(s0.x + 40, s0.y + 30);
  await page.mouse.down();
  await page.mouse.move(s0.x + 140, s0.y + 80, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => {
    const d = await project(page.request, id);
    const st = d.devices.find((x: { id: string }) => x.id === standId).stagePlan.position;
    const sp = d.devices.find((x: { id: string }) => x.id === 'spot1').stagePlan.position;
    return st.x !== standPos.x && Math.abs(st.x - sp.x) < 1 && Math.abs(st.y - sp.y) < 1;
  }).toBe(true);

  // zweites Gerät auf das Stativ (max. 1) → Warnung
  await page.getByRole('tab', { name: 'Bibliothek' }).click();
  const s1 = await center(page, `#stage-device-${standId}`);
  await page.getByRole('complementary', { name: 'Bibliothek' }).getByRole('listitem').filter({ hasText: 'Spot PAR' }).dragTo(canvas, { targetPosition: { x: s1.x - box.x - 10, y: s1.y - box.y - 10 } });  // mehrere Ebenen → Fenster „Auf welche Ebene?“ (Vorauswahl: aktive Ebene)
  await page.getByRole('dialog', { name: 'Auf welche Ebene?' }).getByRole('button', { name: 'Einfügen' }).click();
  const checks = page.getByRole('region', { name: 'Prüfungen' });
  await expect(checks).toContainText('1 Warnung');
  await checks.getByRole('button', { name: /Prüfungen/ }).click();
  await expect(page.getByTestId('checks-list')).toContainText('2 Geräte angehängt, erlaubt sind 1');

  // Wand zeichnen (3 Punkte, Enter) und Maßlinie
  await page.getByRole('button', { name: 'Wand', exact: true }).click();
  await expect(page.getByTestId('tool-hint')).toContainText('Wand');
  await page.mouse.click(box.x + 120, box.y + 120);
  await page.mouse.click(box.x + 420, box.y + 120);
  await page.mouse.click(box.x + 420, box.y + 320);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Maßlinie/ }).click();
  await page.mouse.click(box.x + 120, box.y + 450);
  await page.mouse.click(box.x + 420, box.y + 450);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await project(page.request, id)).shapes.map((s: { kind: string; points: unknown[] }) => `${s.kind}:${s.points.length}`).sort()).toEqual(['dimension:2', 'wall:3']);
  data = await project(page.request, id);
  const wall = data.shapes.find((s: { kind: string }) => s.kind === 'wall');
  expect(wall.points[0].y).toBe(wall.points[1].y); // waagerecht (Raster)
  expect(wall.points.every((p: { x: number }) => p.x % 500 === 0)).toBe(true); // am 0,5-m-Raster

  // Ebene „Bühne“ ausblenden
  await page.getByRole('tab', { name: 'Ebenen' }).click();
  const before = await count(page, '.stage-device');
  await page.getByRole('button', { name: 'Ausblenden: Bühne' }).click();
  await expect.poll(() => count(page, '.stage-device')).toBeLessThan(before);
  await page.getByRole('button', { name: 'Einblenden: Bühne' }).click();
  await expect.poll(() => count(page, '.stage-device')).toBe(before);

  // Hintergrund: Bild importieren und kalibrieren
  await page.getByRole('tab', { name: 'Hintergrund' }).click();
  await page.getByTestId('background-input').setInputFiles({ name: 'grundriss.png', mimeType: 'image/png', buffer: PNG_1x1 });
  await expect(page.getByTestId('background-scale')).toContainText('Noch nicht kalibriert');
  await page.getByRole('button', { name: /Kalibrieren/ }).click();
  await page.mouse.click(box.x + 600, box.y + 500);
  await page.mouse.click(box.x + 800, box.y + 500);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Abstand (m)').fill('5');
  await dialog.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(page.getByTestId('background-scale')).toContainText('Kalibriert');
  data = await project(page.request, id);
  expect(data.background.calibration.realDistanceMm).toBe(5000);

  // PDF-Grundriss (eine Seite) ersetzt das Bild
  await page.getByTestId('background-input').setInputFiles({ name: 'plan.pdf', mimeType: 'application/pdf', buffer: minimalPdf() });
  await expect.poll(async () => (await project(page.request, id)).background?.widthPx ?? 0, { timeout: 15_000 }).toBeGreaterThan(1000);
  expect((await project(page.request, id)).background.image.startsWith('data:image/jpeg')).toBe(true);
  await expect.poll(() => count(page, '.background')).toBe(1);
});
