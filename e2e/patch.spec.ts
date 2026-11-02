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
  await dialog.getByRole('button', { name: '⇩ PDF' }).click();
  const download = await downloadPromise;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync((await download.path())!)) }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) text += (await (await pdf.getPage(i)).getTextContent()).items.map((x) => ('str' in x ? x.str : '')).join(' ');
  expect(text).toContain('Input-Liste – FOH');
  expect(text).toContain('Lead Vox');
  expect(text).toContain('Output-Liste – FOH');
});
