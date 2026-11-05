import { expect, test } from '@playwright/test';
import { loginAs, newContextPage } from './helpers';

test('Regie Lichtaufbau: Lichtvorlagen, Raster aus dem Bühnenplan, umsetzen/tauschen, ausblenden, Ziele mit Punkt', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const truss = await post({ kind: 'truss', name: 'Traverse M11c', lengthMm: 6000, shape: { form: 'rect', widthMm: 6000, depthMm: 290, heightMm: 4000 } });
  const mh = await post({ kind: 'device', name: 'Moving Head M11c', shape: { form: 'rect', widthMm: 400, depthMm: 400 }, light: { showInScenes: true, colorMixing: 'cmy', goboWheels: [{ name: 'Rad 1', rotating: true, gobos: ['Sterne', 'Breakup'] }], moving: { panDeg: 540, tiltDeg: 270 } } });
  const par = await post({ kind: 'device', name: 'PAR M11c', shape: { form: 'circle', widthMm: 300, depthMm: 300 }, light: { showInScenes: true, colorMixing: 'rgb' } });
  const amp = await post({ kind: 'device', name: 'Endstufe M11c', shape: { form: 'rect', widthMm: 500, depthMm: 400 } });
  const d = (id: string, t: { id: string }, x: number, y: number, mountedOnId?: string) => ({ id, templateId: t.id, layerId: 'l1', label: id, ...(mountedOnId ? { mountedOnId } : {}), stagePlan: { position: { x, y }, rotationDeg: 0 } });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 8,
        id: 'licht',
        meta: { name: 'Lichtshow' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [
          d('Traverse hinten', truss, 3000, 1000),
          d('Traverse vorne', truss, 3000, 4000),
          d('MH 1', mh, 1000, 1000, 'Traverse hinten'),
          d('MH 2', mh, 5000, 1000, 'Traverse hinten'),
          d('PAR 1', par, 1000, 4000, 'Traverse vorne'),
          d('PAR 2', par, 3000, 4000, 'Traverse vorne'),
          d('PAR 3', par, 5000, 4000, 'Traverse vorne'),
          d('LED 1', par, 3000, 6500),
          d('Amp', amp, 6000, 6500),
        ],
        cables: [],
      },
    })
  ).json();

  await page.goto(`/projekt/${id}?ansicht=regie`);
  await page.getByRole('radio', { name: 'Lichtaufbau' }).click();
  const setup = page.getByTestId('light-setup');
  // nur Lichtgeräte, alle noch ohne Platz
  await expect(setup.getByTestId('light-unplaced').getByTestId('light-chip')).toHaveCount(6);

  await setup.getByRole('button', { name: 'Aus dem Bühnenplan anordnen' }).click();
  await expect(setup.getByLabel('Spalten')).toHaveValue('3');
  await expect(setup.getByLabel('Zeilen', { exact: true })).toHaveValue('3');
  await expect(setup.getByLabel('Bezeichnung Zeile 1')).toHaveValue('Traverse hinten');
  await expect(setup.getByLabel('Bezeichnung Zeile 3')).toHaveValue('Boden');
  const cell = (col: number, row: number) => setup.getByRole('gridcell', { name: `Feld ${col}/${row}`, exact: true });
  await expect(cell(1, 1)).toContainText('MH 1');
  await expect(cell(3, 1)).toContainText('MH 2');
  await expect(cell(2, 2)).toContainText('PAR 2');
  await expect(cell(2, 3)).toContainText('LED 1');
  await expect(setup.getByTestId('light-unplaced')).toContainText('Alle Lichtgeräte haben einen Platz');

  // antippen, Feld antippen → umsetzen; auf ein belegtes Feld → tauschen
  await cell(2, 3).getByTestId('light-chip').click();
  await cell(2, 1).click();
  await expect(cell(2, 1)).toContainText('LED 1');
  await cell(1, 2).getByTestId('light-chip').click(); // PAR 1
  await cell(2, 1).click();
  await expect(cell(2, 1)).toContainText('PAR 1');
  await expect(cell(1, 2)).toContainText('LED 1');
  // ausblenden
  await cell(3, 2).getByTestId('light-chip').click(); // PAR 3
  await setup.getByRole('button', { name: 'Ausblenden' }).click();
  await expect(setup.getByTestId('light-hidden')).toContainText('PAR 3');
  await setup.getByLabel('Bezeichnung Zeile 3').fill('Bühnenboden');

  // Ziel anlegen (wartet direkt auf den Punkt), benennen, auf die Bühne klicken
  await setup.getByRole('button', { name: '+ Ziel' }).click();
  await setup.getByTestId('light-target').getByLabel('Name des Ziels').fill('Sängerin');
  const stage = setup.getByTestId('light-stage');
  await stage.click({ position: { x: 60, y: 60 } });
  await expect(stage.getByTestId('light-target-point')).toHaveCount(1);
  await expect(stage).toContainText('Sängerin');

  // gespeichert
  await expect
    .poll(async () => {
      const p = await (await page.request.get(`/api/projects/${id}/download`)).json();
      return [p.lightGrid.rowLabels[2], p.lightPlacements.find((x: { id: string }) => x.id === 'PAR 3')?.hidden, p.lightTargets[0]?.name, !!p.lightTargets[0]?.stagePoint];
    })
    .toEqual(['Bühnenboden', true, 'Sängerin', true]);

  // Regie-Zugang darf den Lichtaufbau bearbeiten, Lese-Zugang nicht
  const regie = await newContextPage(browser);
  await regie.setViewportSize({ width: 1440, height: 900 });
  await loginAs(regie, 'direction', 'Regina');
  await regie.goto(`/projekt/${id}?ansicht=regie`);
  await regie.getByRole('radio', { name: 'Lichtaufbau' }).click();
  await expect(regie.getByRole('button', { name: 'Aus dem Bühnenplan anordnen' })).toBeVisible();
  const reader = await newContextPage(browser);
  await reader.setViewportSize({ width: 1440, height: 900 });
  await loginAs(reader, 'read', 'Leo');
  await reader.goto(`/projekt/${id}?ansicht=regie`);
  await reader.getByRole('radio', { name: 'Lichtaufbau' }).click();
  await expect(reader.getByTestId('light-setup')).toContainText('MH 1');
  await expect(reader.getByRole('button', { name: 'Aus dem Bühnenplan anordnen' })).toHaveCount(0);
});

test('Bibliothek: Lichtfähigkeiten einer Gerätevorlage', async ({ page }) => {
  await loginAs(page, 'edit', 'Ralf');
  await page.goto('/bibliothek?bereich=device');
  await page.getByRole('button', { name: /Neu: Gerät/ }).click();
  await page.getByLabel('Name', { exact: true }).fill('Wash M11c');
  await page.getByLabel('Breite (m)').fill('0,4');
  await page.getByLabel('Tiefe (m)').fill('0,4');
  const light = page.getByRole('region', { name: 'Licht' });
  await light.getByLabel('In Lichtszenen anzeigen').check();
  await light.getByLabel('Farbmischung').selectOption({ label: 'RGBW' });
  await light.getByRole('button', { name: 'Farbrad' }).click();
  await light.getByRole('button', { name: 'Farbe', exact: true }).click();
  await light.getByLabel('Farbe 1').fill('Tiefblau');
  await light.getByRole('button', { name: 'Gobo-Rad' }).click();
  await light.getByLabel('Gobos').fill('Sterne, Wolken');
  await light.getByLabel('Gobos').blur();
  await light.getByLabel('Prisma (Facetten)').fill('3');
  await light.getByLabel('Beweglich (Moving Head/Scanner)').check();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Gespeichert.')).toBeVisible();
  const library = await (await page.request.get('/api/library')).json();
  const wash = library.templates.find((t: { name: string }) => t.name === 'Wash M11c');
  expect(wash.light).toMatchObject({
    showInScenes: true,
    colorMixing: 'rgbw',
    colorWheels: [{ colors: [{ name: 'Tiefblau' }] }],
    goboWheels: [{ name: 'Gobo-Rad 1', gobos: ['Sterne', 'Wolken'] }],
    prism: { facets: 3 },
    moving: { panDeg: 540, tiltDeg: 270 },
  });
});
