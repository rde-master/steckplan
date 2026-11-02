import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { loginAs } from './helpers';

async function project(request: APIRequestContext, id: string) {
  return (await request.get(`/api/projects/${id}/download`)).json();
}

test('Ton-Patch: Input-/Output-Liste aus dem Signalfluss, Angaben bearbeiten, PDF', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Tontechnik');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const audio = (id: string, label: string, direction: 'in' | 'out') => ({ id, label, connector: 'XLR 3 M9', direction, signal: 'Audio' });
  const mic = await post({ kind: 'device', name: 'Kondensator M9', phantomPower: true, ports: [audio('out', 'Out', 'out')] });
  const iem = await post({ kind: 'device', name: 'In-Ear M9', usedByPerson: true, ports: [audio('in', 'In', 'in')] });
  const desk = await post({ kind: 'device', name: 'Mischpult M9', mixer: true, ports: [audio('i1', 'In 1', 'in'), audio('i2', 'In 2', 'in'), audio('o1', 'Mix 1', 'out')] });
  const snake = await post({
    kind: 'cableType',
    name: 'Multicore M9',
    endALabel: 'Bühne',
    endBLabel: 'FOH',
    channels: [
      { id: 's1', label: 'Send 1', connectorA: 'XLR', connectorB: 'XLR', direction: 'aToB', signal: 'Audio' },
      { id: 'r1', label: 'Return 1', connectorA: 'XLR', connectorB: 'XLR', direction: 'bToA', signal: 'Audio' },
    ],
  });
  const d = (id: string, t: { id: string }, x: number, extra: object = {}) => ({ id, templateId: t.id, layerId: 'l1', label: id, signalFlow: { position: { x, y: 60 } }, ...extra });
  const c = (id: string, from: [string, string], to: [string, string]) => ({ id, direct: true, from: { deviceId: from[0], portId: from[1] }, to: { deviceId: to[0], portId: to[1] }, waypoints: [] });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 4,
        id: 'm9',
        meta: { name: 'Ton-Patch' },
        layers: [{ id: 'l1', name: 'Ton', order: 0 }],
        people: [{ id: 'anna', lastName: 'Muster', firstName: 'Anna', kind: 'Sängerin' }],
        devices: [d('Gesang 1', mic, 20), d('Snake', snake, 300), d('FOH', desk, 600), d('IEM 1', iem, 20, { personId: 'anna', signalFlow: { position: { x: 20, y: 300 } } })],
        cables: [c('a', ['Gesang 1', 'out'], ['Snake', 's1:a']), c('b', ['Snake', 's1:b'], ['FOH', 'i1']), c('r', ['FOH', 'o1'], ['Snake', 'r1:b']), c('s', ['Snake', 'r1:a'], ['IEM 1', 'in'])],
      },
    })
  ).json();

  await page.goto(`/projekt/${id}?ansicht=listen`);
  await page.getByRole('tab', { name: 'Ton-Patch' }).click();
  const inputs = page.getByTestId('patch-inputs');
  const first = inputs.getByTestId('patch-row').first();
  await expect(first).toContainText('Gesang 1');
  await expect(first).toContainText('Snake · Send 1 (Bühne)');
  await expect(first.getByLabel('48 V In 1')).toBeChecked();
  await expect(inputs.getByTestId('patch-row').nth(1)).toContainText('offen');

  // Kanalname und Bemerkung ändern → im Projekt gespeichert
  await first.getByLabel('Name In 1').fill('Lead Vox');
  await first.getByLabel('Bemerkung In 1').fill('Pop-Schutz');
  await expect.poll(async () => (await project(page.request, id)).patch).toEqual([{ id: 'FOH:i1', name: 'Lead Vox', notes: 'Pop-Schutz' }]);

  // Outputs mit Person
  await page.getByRole('radio', { name: 'Outputs' }).click();
  await expect(page.getByTestId('patch-outputs').getByTestId('patch-row').first()).toContainText('Anna Muster');

  // PDF
  await page.getByRole('button', { name: 'Exportieren' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Dokument').selectOption({ label: 'Input-/Output-Liste' });
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'PDF', exact: true }).click();
  const download = await downloadPromise;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync((await download.path())!)) }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) text += (await (await pdf.getPage(i)).getTextContent()).items.map((x) => ('str' in x ? x.str : '')).join(' ');
  expect(text).toContain('Input-Liste – FOH');
  expect(text).toContain('Lead Vox');
  expect(text).toContain('Output-Liste – FOH');
});

test('Ton-Patch: Netzwerk-Kanäle – Quelle über digitale Stagebox einem Pult-Kanal zuordnen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Digital-Ton');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const audio = (id: string, label: string, direction: 'in' | 'out') => ({ id, label, connector: 'XLR NK', direction, signal: 'Audio' });
  const net = { id: 'net', label: 'Dante', connector: 'RJ45 NK', direction: 'bi', signal: 'Dante', isNetwork: true };
  const mic = await post({ kind: 'device', name: 'Mikro NK', phantomPower: true, ports: [audio('out', 'Out', 'out')] });
  const stage = await post({ kind: 'device', name: 'Digitale Stagebox NK', ports: [audio('i1', 'In 1', 'in'), audio('i2', 'In 2', 'in'), net] });
  const desk = await post({ kind: 'device', name: 'Digitalpult NK', mixer: true, networkChannels: 16, ports: [net] });
  const d = (id: string, t: { id: string }, x: number, y = 60) => ({ id, templateId: t.id, layerId: 'l1', label: id, signalFlow: { position: { x, y } } });
  const c = (id: string, from: [string, string], to: [string, string]) => ({ id, from: { deviceId: from[0], portId: from[1] }, to: { deviceId: to[0], portId: to[1] }, waypoints: [] });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 5,
        id: 'netzkanal',
        meta: { name: 'Netzwerk-Kanäle' },
        layers: [{ id: 'l1', name: 'Ton', order: 0 }],
        devices: [d('Vox', mic, 20), d('Lose', mic, 20, 300), d('SB', stage, 320), d('DFOH', desk, 650)],
        cables: [c('a', ['Vox', 'out'], ['SB', 'i1']), c('n', ['SB', 'net'], ['DFOH', 'net'])],
      },
    })
  ).json();

  await page.goto(`/projekt/${id}`);
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.device').length ?? 0)).toBe(4);
  const click = async (label: string) => {
    const pt = await page.evaluate((l) => {
      const stage = window.__steckplanStage!;
      const r = stage.findOne(`#device-${l}`)!.getClientRect();
      const b = stage.container().getBoundingClientRect();
      return { x: b.left + r.x + r.width / 2, y: b.top + r.y + 10 };
    }, label);
    await page.mouse.click(pt.x, pt.y);
  };
  const props = page.getByRole('complementary', { name: 'Eigenschaften' });

  // ohne Kette (nicht an der Stagebox) keine Zuordnung möglich
  await click('Lose');
  await expect(props.getByTestId('mixer-channel-section')).toHaveCount(0);

  // Vox → SB In 1 → Netzwerkkabel → DFOH: Kanal 3 zuordnen
  await click('Vox');
  await props.getByRole('combobox', { name: 'Pult-Kanal (Netzwerk)' }).selectOption({ label: 'DFOH Kanal 3' });
  const labelTexts = () => page.evaluate(() => window.__steckplanStage!.find('Text').map((t) => (t as unknown as { text(): string }).text()));
  await expect.poll(async () => (await labelTexts()).some((t) => t.includes('In 1 → DFOH 3'))).toBe(true);

  // Anzeige ausblenden
  await page.getByRole('group', { name: 'In Kästen' }).getByLabel('Kanäle').uncheck();
  await expect.poll(async () => (await labelTexts()).some((t) => t.includes('→ DFOH 3'))).toBe(false);
  await page.getByRole('group', { name: 'In Kästen' }).getByLabel('Kanäle').check();

  // Input-Liste: Netzwerk-Kanal 3 mit Quelle und Stagebox
  await page.getByRole('tab', { name: 'Listen' }).click();
  await page.getByRole('tab', { name: 'Ton-Patch' }).click();
  const network = page.getByTestId('patch-network');
  await expect(network).toContainText('Netzwerk-Kanäle (1/16)');
  const row3 = network.getByTestId('patch-row').nth(2);
  await expect(row3).toContainText('Vox');
  await expect(row3).toContainText('SB · In 1 (Netzwerk)');
  await expect(row3.getByLabel('48 V Netz 3')).toBeChecked();
});

test('Ton-Patch: Netzwerk-Kanal über Multicore → Stagebox 1 → Stagebox 2 → Pult', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Kette-Ton');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const net = (id: string) => ({ id, label: id === 'n1' ? 'Dante' : id === 'n2' ? 'Dante 2' : 'Netz', connector: 'RJ45 K', direction: 'bi', signal: 'Dante', isNetwork: true });
  const mic = await post({ kind: 'device', name: 'Mikro K', ports: [{ id: 'out', label: 'Out', connector: 'XLR K', direction: 'out', signal: 'Audio' }] });
  const snake = await post({
    kind: 'cableType',
    name: 'Multicore K',
    endALabel: 'Bühne',
    endBLabel: 'FOH',
    channels: [{ id: 's1', label: 'Send 1', connectorA: 'XLR K', connectorB: 'XLR K', direction: 'aToB', signal: 'Audio' }],
  });
  const sb1 = await post({ kind: 'device', name: 'Stagebox 1 K', ports: [{ id: 'i1', label: 'In 1', connector: 'XLR K', direction: 'in', signal: 'Audio' }, net('n1')] });
  const sb2 = await post({ kind: 'device', name: 'Stagebox 2 K', ports: [net('n1'), net('n2')] });
  const desk = await post({ kind: 'device', name: 'Pult K', mixer: true, networkChannels: 24, ports: [net('n')] });
  const d = (id: string, t: { id: string }, x: number) => ({ id, templateId: t.id, layerId: 'l1', label: id, signalFlow: { position: { x, y: 60 } } });
  const c = (id: string, from: [string, string], to: [string, string]) => ({ id, from: { deviceId: from[0], portId: from[1] }, to: { deviceId: to[0], portId: to[1] }, waypoints: [] });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 5,
        id: 'kette',
        meta: { name: 'Kette' },
        layers: [{ id: 'l1', name: 'Ton', order: 0 }],
        devices: [d('Mikrofon', mic, 20), d('MC', snake, 250), d('SB1', sb1, 500), d('SB2', sb2, 750), d('Pult', desk, 1000)],
        cables: [c('a', ['Mikrofon', 'out'], ['MC', 's1:a']), c('b', ['MC', 's1:b'], ['SB1', 'i1']), c('n1', ['SB1', 'n1'], ['SB2', 'n1']), c('n2', ['SB2', 'n2'], ['Pult', 'n'])],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}`);
  await expect.poll(() => page.evaluate(() => window.__steckplanStage?.find('.device').length ?? 0)).toBe(5);
  const pt = await page.evaluate(() => {
    const stage = window.__steckplanStage!;
    const r = stage.findOne('#device-Mikrofon')!.getClientRect();
    const b = stage.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + 10 };
  });
  await page.mouse.click(pt.x, pt.y);
  const props = page.getByRole('complementary', { name: 'Eigenschaften' });
  await props.getByRole('combobox', { name: 'Pult-Kanal (Netzwerk)' }).selectOption({ label: 'Pult Kanal 7' });
  await expect
    .poll(() => page.evaluate(() => window.__steckplanStage!.find('Text').some((t) => (t as unknown as { text(): string }).text().includes('In 1 → Pult 7'))))
    .toBe(true);
  await page.getByRole('tab', { name: 'Listen' }).click();
  await page.getByRole('tab', { name: 'Ton-Patch' }).click();
  const row = page.getByTestId('patch-network').getByTestId('patch-row').nth(6);
  await expect(row).toContainText('Mikrofon');
  await expect(row).toContainText('MC · Send 1 (FOH) → SB1 · In 1 (Netzwerk) → SB2');
});
