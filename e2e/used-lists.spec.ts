import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('Listen „Im Plan“ in Bühnenplan und Signalfluss: Suche, Kategorie, Person, Gegenstelle, Ebene/Seite, Klick wählt aus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Liste-Lena');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const cat = await (await page.request.post('/api/library/master/categories', { data: { name: 'Ton Liste' } })).json();
  const mic = await post({ kind: 'device', name: 'Mikro Liste', usedByPerson: true, categoryId: cat.id, ports: [{ id: 'out', label: 'Out', connector: 'XLR L', direction: 'out', signal: 'Audio' }] });
  const desk = await post({ kind: 'device', name: 'Pult Liste', ports: [{ id: 'i1', label: 'In 1', connector: 'XLR L', direction: 'in', signal: 'Audio' }] });
  const place = (x: number) => ({ position: { x, y: 1000 }, rotationDeg: 0 });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 8,
        id: 'liste',
        meta: { name: 'Liste' },
        layers: [
          { id: 'l1', name: 'Bühne', order: 0, visible: true, locked: false },
          { id: 'l2', name: 'Ton', order: 1, visible: true, locked: false },
        ],
        flowPages: [
          { id: 'p1', name: 'Ton', order: 0 },
          { id: 'p2', name: 'FOH', order: 1 },
        ],
        people: [{ id: 'anna', lastName: 'Muster', firstName: 'Anna' }],
        devices: [
          { id: 'v', templateId: mic.id, layerId: 'l2', label: 'Vox', personId: 'anna', stagePlan: place(1000), signalFlow: { position: { x: 40, y: 40 }, pageId: 'p1' } },
          { id: 'f', templateId: desk.id, layerId: 'l1', label: 'FOH-Pult', signalFlow: { position: { x: 40, y: 40 }, pageId: 'p2' } },
        ],
        cables: [{ id: 'k', from: { deviceId: 'v', portId: 'out' }, to: { deviceId: 'f', portId: 'i1' }, waypoints: [] }],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}`);

  // Signalfluss: Reiter „Im Plan“ – beide Geräte (alle Seiten), mit Seite, Person, Gegenstelle
  await page.getByRole('tab', { name: 'Im Plan' }).click();
  const flow = page.getByTestId('flow-used-list');
  const pult = flow.getByRole('listitem').filter({ has: page.getByText('FOH-Pult', { exact: true }) });
  await expect(pult).toContainText('Seite: FOH');
  await expect(pult.getByTestId('flow-used-links')).toHaveText('← Vox · Out');
  await expect(flow.getByTestId(`flow-used-group-${cat.id}`)).toContainText('Vox');
  await expect(flow.getByTestId('flow-used-person')).toHaveText('Anna Muster');
  // Klick springt auf die andere Seite und wählt aus
  await page.getByRole('button', { name: 'Im Plan zeigen: FOH-Pult' }).click();
  await expect(page.getByRole('tablist', { name: 'Seiten' }).getByRole('tab', { name: /^FOH/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('complementary', { name: 'Eigenschaften' }).getByLabel('Kennung')).toHaveValue('FOH-Pult');
  // Suche
  await page.getByRole('searchbox', { name: 'Suchen …' }).fill('anna');
  await expect(flow.getByRole('listitem')).toHaveCount(1);

  // Bühnenplan: „Im Plan“ – nur Platziertes, mit Ebene; Klick wählt aus
  await page.getByRole('tab', { name: 'Bühnenplan' }).click();
  await page.getByRole('tab', { name: 'Im Plan' }).click();
  const placed = page.getByTestId('placed-list');
  await expect(placed.getByRole('listitem')).toHaveCount(1);
  await expect(placed.getByRole('listitem')).toContainText('Ebene: Ton');
  await expect(placed.getByTestId('placed-links')).toHaveText('→ FOH-Pult · In 1');
  await page.getByRole('button', { name: 'Im Plan zeigen: Vox' }).click();
  await expect(page.getByRole('complementary', { name: 'Eigenschaften' }).getByLabel('Kennung')).toHaveValue('Vox');
});
