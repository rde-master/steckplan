import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loginAs, newContextPage } from './helpers';

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
  return (await request.get(`/api/projects/${id}/download`)).json();
}

test('DMX: Auto-Adressierung entlang der Kette, Überlappung, Patchliste; Netzwerk: IP, WLAN-QR, Lese-Zugang ohne Passwort', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const dmxPorts = [
    { id: 'in', label: 'DMX In', connector: 'XLR 5 M6', direction: 'in', signal: 'DMX' },
    { id: 'thru', label: 'DMX Thru', connector: 'XLR 5 M6', direction: 'out', signal: 'DMX' },
  ];
  const spot = await post({ kind: 'device', name: 'Spot M6', ports: dmxPorts, dmxModes: [{ name: '16 Kanal', channels: 16 }, { name: '8 Kanal', channels: 8 }] });
  const desk = await post({ kind: 'device', name: 'Lichtpult M6', ports: [{ id: 'a', label: 'DMX A', connector: 'XLR 5 M6', direction: 'out', signal: 'DMX' }] });
  const node = await post({ kind: 'device', name: 'Node M6', ports: [{ id: 'eth', label: 'Netz', connector: 'etherCON', direction: 'bi', signal: 'Ethernet', isNetwork: true }] });
  const d = (id: string, t: { id: string }, x: number) => ({ id, templateId: t.id, layerId: 'l1', label: id, signalFlow: { position: { x, y: 60 } } });
  const c = (id: string, from: string, fp: string, to: string) => ({ id, direct: true, from: { deviceId: from, portId: fp }, to: { deviceId: to, portId: 'in' }, waypoints: [] });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 3,
        id: 'm6',
        meta: { name: 'DMX & Netzwerk' },
        layers: [{ id: 'l1', name: 'Licht', order: 0 }],
        devices: [d('Pult', desk, 20), d('Spot A', spot, 260), d('Spot B', spot, 500), d('Spot C', spot, 740), { ...d('Node 1', node, 980), signalFlow: { position: { x: 980, y: 260 } } }],
        cables: [c('k1', 'Pult', 'a', 'Spot A'), c('k2', 'Spot A', 'thru', 'Spot B'), c('k3', 'Spot B', 'thru', 'Spot C')],
      },
    })
  ).json();

  await page.goto(`/projekt/${id}`);
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.device').length ?? 0)).toBe(5);
  await page.getByRole('button', { name: 'Einpassen' }).click();
  await page.waitForTimeout(300); // Zeichenfläche neu zeichnen lassen

  // Auto-Adressierung ab Spot A entlang der DMX-Kette
  await clickDevice(page, 'Spot A');
  const props = page.getByRole('complementary', { name: 'Eigenschaften' });
  await props.getByRole('button', { name: /Ab hier automatisch adressieren/ }).click();
  await expect(props.getByText('3 Geräte adressiert.')).toBeVisible();
  await expect.poll(async () => (await project(page.request, id)).devices.filter((x: { dmx?: unknown }) => x.dmx).length).toBe(3);
  const dmx = Object.fromEntries((await project(page.request, id)).devices.filter((x: { dmx?: unknown }) => x.dmx).map((x: { id: string; dmx: { universe: number; address: number } }) => [x.id, `${x.dmx.universe}.${x.dmx.address}`]));
  expect(dmx).toEqual({ 'Spot A': '1.1', 'Spot B': '1.17', 'Spot C': '1.33' });
  await expect(props.getByTestId('dmx-range')).toHaveText('1.001 – 1.016');

  // DMX an den Geräten anzeigen
  await page.getByRole('group', { name: 'Filter' }).getByLabel('DMX').check();
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.dmx-label').length ?? 0)).toBe(3);

  // Überlappung erzeugen → Prüfung und Patchliste
  await clickDevice(page, 'Spot C');
  await props.getByLabel('Startadresse').fill('20');
  const checks = page.getByRole('region', { name: 'Prüfungen' });
  await expect(checks).toContainText('Fehler');
  await checks.getByRole('button', { name: /Prüfungen/ }).click();
  await expect(page.getByTestId('checks-list')).toContainText('DMX-Überlappung in Universum 1');
  await page.getByRole('tab', { name: 'Listen' }).click();
  await page.getByRole('tab', { name: 'DMX-Patch' }).click();
  await expect(page.getByTestId('dmx-patch').locator('tbody tr')).toHaveCount(3);
  await expect(page.getByTestId('dmx-patch').locator('tr.bg-red-50')).toHaveCount(2);

  // Netzwerk: Subnetz anlegen, nächste freie IP übernehmen
  await page.getByRole('tab', { name: 'Netzwerk' }).first().click();
  await page.getByRole('button', { name: /＋ Subnetz/ }).click();
  const subnet = page.getByTestId('subnet');
  await subnet.getByLabel('Name').fill('Lichtnetz');
  await subnet.getByLabel(/^Netz/).fill('10.0.0.0/24');
  await subnet.getByLabel('Gateway').fill('10.0.0.1');
  await page.getByLabel('Subnetz Node 1').selectOption({ label: 'Lichtnetz' });
  await page.getByRole('button', { name: 'nächste freie: Node 1' }).click();
  await expect(page.getByLabel('IP-Adresse Node 1')).toHaveValue('10.0.0.2');

  // WLAN mit Passwort und QR-Code
  await page.getByRole('button', { name: /＋ WLAN-Netz/ }).click();
  const wifi = page.getByTestId('wifi');
  await wifi.getByLabel('SSID', { exact: true }).fill('Crew-Netz');
  await wifi.getByLabel('Passwort Crew-Netz').fill('ge;heim');
  await wifi.getByLabel('Passwort Crew-Netz').blur();
  await expect.poll(async () => (await (await page.request.get(`/api/projects/${id}/secrets`)).json()).wifiPasswords[0]?.password).toBe('ge;heim');
  await expect.poll(() => wifi.getByTestId('wifi-qr').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // Lese-Zugang: SSID und QR-Code, aber kein Passwort
  const anna = await newContextPage(browser);
  await loginAs(anna, 'read', 'Anna');
  await anna.goto(`/projekt/${id}?ansicht=netzwerk`);
  const annaWifi = anna.getByTestId('wifi');
  await expect(annaWifi.getByLabel('SSID', { exact: true })).toHaveValue('Crew-Netz');
  await expect(annaWifi.getByRole('textbox', { name: /Passwort/ })).toHaveCount(0);
  await expect(annaWifi).toContainText('nur mit dem Bearbeiten-Zugang sichtbar');
  await expect.poll(() => annaWifi.getByTestId('wifi-qr').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect((await anna.request.get(`/api/projects/${id}/secrets`)).status()).toBe(403);
  const annaDownload = await (await anna.request.get(`/api/projects/${id}/download`)).text();
  expect(annaDownload).not.toContain('ge;heim');

  // Netzwerkliste
  await page.getByRole('tab', { name: 'Listen' }).click();
  await page.getByRole('tab', { name: 'Netzwerk' }).last().click();
  await expect(page.getByTestId('network-list')).toContainText('10.0.0.2');
  await expect(page.getByTestId('network-list')).toContainText('Lichtnetz');
});
