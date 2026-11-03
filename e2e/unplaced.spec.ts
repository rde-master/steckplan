import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('Bühnenplan: „Nicht platziert“ mit Suche, Kategorien, Person, Besitzer und Gegenstelle; Reiter bleibt nach Neuladen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Platz-Paula');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const cat = await (await page.request.post('/api/library/master/categories', { data: { name: 'Funk Platz' } })).json();
  const owner = await (await page.request.post('/api/library/master/owners', { data: { name: 'Verleih Platz' } })).json();
  const iem = await post({ kind: 'device', name: 'In-Ear Platz', usedByPerson: true, categoryId: cat.id, ports: [{ id: 'in', label: 'In', connector: 'XLR P', direction: 'in', signal: 'Audio' }] });
  const desk = await post({ kind: 'device', name: 'Pult Platz', ports: [{ id: 'aux1', label: 'Aux 1', connector: 'XLR P', direction: 'out', signal: 'Audio' }] });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 8,
        id: 'platz',
        meta: { name: 'Platz' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        people: [{ id: 'anna', lastName: 'Muster', firstName: 'Anna' }],
        devices: [
          { id: 'a', templateId: iem.id, layerId: 'l1', label: 'IEM Anna', personId: 'anna', ownerId: owner.id },
          { id: 'b', templateId: iem.id, layerId: 'l1', label: 'IEM frei' },
          { id: 'p', templateId: desk.id, layerId: 'l1', label: 'FOH' },
        ],
        cables: [{ id: 'k', from: { deviceId: 'p', portId: 'aux1' }, to: { deviceId: 'a', portId: 'in' }, waypoints: [] }],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}`);
  await page.getByRole('tab', { name: 'Bühnenplan' }).click();
  await page.getByRole('tab', { name: /^Nicht platziert/ }).click();
  const list = page.getByTestId('unplaced-list');

  // nach Kategorien: „Funk Platz“ (2) und „ohne Kategorie“ (Pult)
  await expect(list.getByTestId(`unplaced-group-${cat.id}`).locator('summary')).toContainText('Funk Platz (2)');
  await expect(list.getByTestId('unplaced-group-none')).toContainText('FOH');

  // Person, Besitzer, Gegenstelle
  const item = (label: string) => list.getByRole('listitem').filter({ has: page.getByText(label, { exact: true }) });
  const anna = item('IEM Anna');
  await expect(anna.getByTestId('unplaced-person')).toHaveText('Anna Muster');
  await expect(anna.getByTestId('unplaced-owner')).toHaveText('Verleih Platz');
  await expect(anna.getByTestId('unplaced-links')).toHaveText('← FOH · Aux 1');
  await expect(item('FOH').getByTestId('unplaced-links')).toHaveText('→ IEM Anna · In');
  const free = list.getByRole('listitem').filter({ hasText: 'IEM frei' });
  await expect(free.getByTestId('unplaced-person')).toHaveCount(0);
  await expect(free.getByTestId('unplaced-links')).toHaveCount(0);

  // Suche (auch nach Person)
  await page.getByRole('searchbox', { name: 'Suchen …' }).fill('muster');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list.getByRole('listitem')).toContainText('IEM Anna');
  await page.getByRole('searchbox', { name: 'Suchen …' }).fill('xyz');
  await expect(page.getByText('Nichts gefunden.')).toBeVisible();

  // Neuladen: Reiter „Nicht platziert“ bleibt gewählt
  await page.reload();
  await page.getByRole('tab', { name: 'Bühnenplan' }).click();
  await expect(page.getByRole('tab', { name: /^Nicht platziert/ })).toHaveAttribute('aria-selected', 'true');
});

test('Bühnenplan: Texte ein-/ausblenden (Kennung, Person, Meter, Kabelname), direkt gesteckt gestrichelt', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Texte-Tim');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const xlr = (id: string, label: string, direction: string) => ({ id, label, connector: 'XLR T', direction, signal: 'Audio' });
  const mic = await post({ kind: 'device', name: 'Mikro Texte', usedByPerson: true, shape: { form: 'rect', widthMm: 300, depthMm: 300, heightMm: 1500 }, ports: [xlr('out', 'Out', 'out')] });
  const box = await post({ kind: 'device', name: 'Box Texte', shape: { form: 'rect', widthMm: 600, depthMm: 400 }, ports: [xlr('i1', 'In 1', 'in'), xlr('i2', 'In 2', 'in')] });
  const cable = await post({ kind: 'cableType', name: 'XLR Texte 10 m', connectorA: 'XLR T', connectorB: 'XLR T', signal: 'Audio', lengthMm: 10000 });
  const place = (x: number, y: number) => ({ position: { x, y }, rotationDeg: 0 });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 8,
        id: 'texte',
        meta: { name: 'Texte' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        people: [{ id: 'tom', lastName: 'Ton', firstName: 'Tom' }],
        devices: [
          { id: 'm', templateId: mic.id, layerId: 'l1', label: 'Vox', personId: 'tom', stagePlan: { ...place(1000, 1000), heightMm: 1500 } },
          { id: 'm2', templateId: mic.id, layerId: 'l1', label: 'Vox 2', stagePlan: place(1000, 3000) },
          { id: 'b', templateId: box.id, layerId: 'l1', label: 'Stagebox', stagePlan: place(5000, 1000) },
        ],
        cables: [
          { id: 'k', templateId: cable.id, from: { deviceId: 'm', portId: 'out' }, to: { deviceId: 'b', portId: 'i1' }, waypoints: [] },
          { id: 'd', direct: true, from: { deviceId: 'm2', portId: 'out' }, to: { deviceId: 'b', portId: 'i2' }, waypoints: [] },
        ],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}`);
  await page.getByRole('tab', { name: 'Bühnenplan' }).click();
  const texts = (name: string) => page.evaluate((n) => window.__steckplanStagePlan?.find(`.${n}`).map((t) => (t as unknown as { text(): string }).text()) ?? [], name);
  await expect.poll(async () => (await texts('stage-label')).length).toBe(3);
  await expect.poll(async () => (await texts('stage-label')).find((t) => t.startsWith('Vox\n'))).toBe('Vox\n👤 Tom Ton\n1,50 m');

  // direkt gesteckt: gestrichelt; Kabel mit Typ: durchgezogen
  const dash = (cid: string) => page.evaluate((c) => (window.__steckplanStagePlan!.findOne(`#stage-cable-${c}`) as unknown as { dash(): number[] | undefined }).dash() ?? null, cid);
  expect(await dash('k')).toBeNull();
  expect((await dash('d'))?.length).toBe(2);

  // Meter an jedem Kabel (Vorgabe an), Kabelname zuschalten
  const group = page.getByRole('group', { name: 'Texte' });
  await expect.poll(async () => (await texts('cable-text')).length).toBe(1);
  await group.getByLabel('Kabelname').check();
  await expect.poll(async () => (await texts('cable-text'))[0]).toMatch(/^XLR Texte 10 m · /);

  // Kennung, Person, Meter aus
  await group.getByLabel('Kennung').uncheck();
  await group.getByLabel('Person').uncheck();
  await group.getByLabel('Meter').uncheck();
  await expect.poll(async () => (await texts('stage-label')).filter(Boolean)).toEqual([]);
  await expect.poll(async () => await texts('cable-text')).toEqual(['XLR Texte 10 m']);

  // bleibt nach Neuladen
  await page.reload();
  await page.getByRole('tab', { name: 'Bühnenplan' }).click();
  await expect(page.getByRole('group', { name: 'Texte' }).getByLabel('Kennung')).not.toBeChecked();
  await expect(page.getByRole('group', { name: 'Texte' }).getByLabel('Kabelname')).toBeChecked();
});
