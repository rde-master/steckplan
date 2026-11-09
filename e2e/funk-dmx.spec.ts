import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loginAs } from './helpers';

async function clickDevice(page: Page, label: string) {
  const pt = await page.evaluate((l) => {
    const stage = window.__steckplanStage!;
    const g = stage.find('.device').find((n) => (n as unknown as { findOne: (s: string) => { text(): string } }).findOne('Text').text() === l)!;
    const r = g.getClientRect();
    const b = stage.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + 12 };
  }, label);
  await page.mouse.click(pt.x, pt.y);
}

async function project(request: APIRequestContext, id: string) {
  return (await request.get(`/api/projects/${id}/download`)).json() as Promise<{ devices: { id: string; dmx?: { universe: number; address: number; modeName: string }; wirelessDmx?: { universe?: number; fromId?: string } }[] }>;
}

test('DMX per Funk: Vorlage sendet/empfängt, Sender-Universum, Empfänger wählt Sender, gepunktete Linie, Prüfung; Patch per Ziehen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const dmxIn = { id: 'in', label: 'DMX In', connector: 'XLR 5 F', direction: 'in', signal: 'DMX' };
  const desk = await post({ kind: 'device', name: 'Pult F', ports: [{ id: 'a', label: 'DMX A', connector: 'XLR 5 F', direction: 'out', signal: 'DMX' }] });
  const tx = await post({ kind: 'device', name: 'Funk-Sender F', ports: [dmxIn], wirelessDmx: { send: true } });
  const akku = await post({ kind: 'device', name: 'Akku-Spot F', ports: [dmxIn], dmxModes: [{ name: '8 Kanal', channels: 8 }], wirelessDmx: { receive: true } });
  const par = await post({ kind: 'device', name: 'PAR F', ports: [dmxIn], dmxModes: [{ name: '4 Kanal', channels: 4 }] });
  const d = (id: string, t: { id: string }, x: number, y = 60) => ({ id, templateId: t.id, layerId: 'l1', label: id, signalFlow: { position: { x, y } } });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'funk',
        meta: { name: 'Funk-DMX' },
        layers: [{ id: 'l1', name: 'Licht', order: 0 }],
        devices: [d('Pult', desk, 20), d('Sender', tx, 300), { ...d('Akku 1', akku, 700, 260), dmx: { modeName: '8 Kanal', universe: 1, address: 1 } }, d('PAR 1', par, 700, 60), d('PAR 2', par, 950, 60)],
        cables: [{ id: 'k1', direct: true, from: { deviceId: 'Pult', portId: 'a' }, to: { deviceId: 'Sender', portId: 'in' }, waypoints: [] }],
      },
    })
  ).json();

  // Bibliothek: die Vorlage zeigt „DMX per Funk“
  await page.goto('/bibliothek?bereich=device');
  await page.getByText('Funk-Sender F').first().click();
  const wirelessBox = page.getByTestId('template-wireless-dmx');
  await expect(wirelessBox.getByLabel('Sendet DMX per Funk (ein Universum)')).toBeChecked();
  await expect(wirelessBox.getByLabel(/Empfängt DMX per Funk/)).not.toBeChecked();

  // Signalfluss: Sender sendet Universum 2, Akku-Spot empfängt vom Sender
  await page.goto(`/projekt/${id}`);
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.device').length ?? 0)).toBe(5);
  await page.getByRole('button', { name: 'Einpassen' }).click();
  await page.waitForTimeout(300);
  await clickDevice(page, 'Sender');
  const props = page.getByRole('complementary', { name: 'Eigenschaften' });
  await props.getByTestId('wireless-universe').fill('2');
  await expect.poll(async () => (await project(page.request, id)).devices.find((x) => x.id === 'Sender')!.wirelessDmx).toEqual({ universe: 2 });
  await clickDevice(page, 'Akku 1');
  await props.getByTestId('wireless-from').selectOption({ label: 'Sender – Universum 2' });
  await expect.poll(async () => (await project(page.request, id)).devices.find((x) => x.id === 'Akku 1')!.wirelessDmx).toEqual({ fromId: 'Sender' });
  // gepunktete Linie Sender → Empfänger mit Universum
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.wireless').length ?? 0)).toBe(1);
  const label = await page.evaluate(() => (window.__steckplanStage!.findOne('.wireless') as unknown as { findOne: (s: string) => { text(): string } }).findOne('Text').text());
  expect(label).toContain('U2');
  await page.screenshot({ path: 'test-results/funk-signalfluss.png' });
  // DMX-Eingang des Akku-Spots: rotes X, kein Kabel möglich
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.port-wireless').length ?? 0)).toBe(1);
  const port = await page.evaluate(() => {
    const stage = window.__steckplanStage!;
    const node = stage.find('.port').find((n) => n.getAttr('deviceId') === 'Akku 1' && n.getAttr('portId') === 'in')!;
    const r = node.getClientRect();
    const b = stage.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 };
  });
  await page.mouse.move(port.x, port.y);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByText('bekommt DMX per Funk – am DMX-Eingang kann kein Kabel')).toBeVisible();
  // ohne Sender wieder frei
  await clickDevice(page, 'Akku 1');
  await props.getByTestId('wireless-from').selectOption('');
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.port-wireless').length ?? 0)).toBe(0);
  await props.getByTestId('wireless-from').selectOption({ label: 'Sender – Universum 2' });
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.port-wireless').length ?? 0)).toBe(1);
  // beim Sender: Liste der Empfänger
  await clickDevice(page, 'Sender');
  await expect(props.getByTestId('wireless-dmx')).toContainText('Empfänger: Akku 1');
  // Prüfung: Akku 1 ist in Universum 1 gepatcht, empfängt aber Universum 2
  await expect.poll(async () => page.evaluate(() => document.body.innerText)).toContain('empfängt per Funk aber Universum 2');

  // DMX-Patch, Universum: nicht gepatchte Geräte oben, per Ziehen patchen und verschieben (hohes Fenster: Ziehen ohne Scrollen)
  await page.setViewportSize({ width: 1440, height: 1800 });
  await page.getByRole('tab', { name: 'Listen' }).click();
  await page.getByRole('tab', { name: 'DMX-Patch' }).click();
  await page.getByRole('radio', { name: 'Universum' }).click();
  const unpatched = page.getByTestId('dmx-unaddressed');
  await expect(unpatched.getByTestId('dmx-unpatched')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/funk-patch.png', fullPage: true });
  const universe1 = page.getByTestId('dmx-universe').first();
  // PAR 1 auf Kanal 33 (Anfang der zweiten Rasterzeile)
  await unpatched.locator('[data-device="PAR 1"]').dragTo(universe1.locator('[data-testid=dmx-row][data-start="33"]'), { targetPosition: { x: 3, y: 5 } });
  await expect.poll(async () => (await project(page.request, id)).devices.find((x) => x.id === 'PAR 1')!.dmx).toEqual({ modeName: '4 Kanal', universe: 1, address: 33 });
  await expect(unpatched.getByTestId('dmx-unpatched')).toHaveCount(1);
  // Akku 1 in ein neues Universum 2 verschieben (passend zum Funk)
  const akkuSegment = universe1.locator('[data-device="Akku 1"]').first();
  const dropNew = page.getByTestId('dmx-new-universe');
  await akkuSegment.dragTo(dropNew);
  await expect.poll(async () => (await project(page.request, id)).devices.find((x) => x.id === 'Akku 1')!.dmx).toEqual({ modeName: '8 Kanal', universe: 2, address: 1 });
  await expect(page.getByTestId('dmx-universe')).toHaveCount(2);
  // innerhalb des Universums verschieben: PAR 1 an den Anfang
  await page.getByTestId('dmx-universe').first().locator('[data-device="PAR 1"]').dragTo(page.getByTestId('dmx-universe').first().locator('[data-testid=dmx-row][data-start="1"]'), { targetPosition: { x: 3, y: 5 } });
  await expect.poll(async () => (await project(page.request, id)).devices.find((x) => x.id === 'PAR 1')!.dmx?.address).toBe(1);
  // mit echten Mausbewegungen (wie von Hand): PAR 1 innerhalb des Universums auf Kanal 65 schieben
  {
    const u = page.getByTestId('dmx-universe').first();
    const seg = (await u.locator('[data-device="PAR 1"]').first().boundingBox())!;
    const row = (await u.locator('[data-testid=dmx-row][data-start="65"]').boundingBox())!;
    await page.mouse.move(seg.x + 4, seg.y + seg.height / 2);
    await page.mouse.down();
    await page.mouse.move(seg.x + 20, seg.y + 20, { steps: 5 });
    await page.mouse.move(row.x + 3, row.y + row.height / 2, { steps: 10 });
    await expect(u.getByTestId('dmx-drop-preview')).toBeVisible();
    await page.mouse.up();
    await expect.poll(async () => (await project(page.request, id)).devices.find((x) => x.id === 'PAR 1')!.dmx?.address).toBe(65);
  }
  // Adresse auch per Eingabe im Detail ändern (nach dem Ablegen ist PAR 1 ausgewählt)
  await expect(page.getByTestId('dmx-detail')).toContainText('PAR 1');
  await page.getByTestId('dmx-detail-address').fill('101');
  await page.getByTestId('dmx-detail-address').press('Enter');
  await expect.poll(async () => (await project(page.request, id)).devices.find((x) => x.id === 'PAR 1')!.dmx?.address).toBe(101);
  await page.getByTestId('dmx-detail-universe').fill('2');
  await page.getByTestId('dmx-detail-universe').press('Enter');
  await expect.poll(async () => (await project(page.request, id)).devices.find((x) => x.id === 'PAR 1')!.dmx).toEqual({ modeName: '4 Kanal', universe: 2, address: 101 });

  // zurückziehen nimmt das Gerät aus dem Patch
  await page.locator('[data-testid=dmx-universe] [data-device="PAR 1"]').first().dragTo(page.getByTestId('dmx-unaddressed'));
  await expect.poll(async () => (await project(page.request, id)).devices.find((x) => x.id === 'PAR 1')!.dmx).toBeUndefined();
});
