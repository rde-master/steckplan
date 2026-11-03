import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('Signalfluss: Strom in den Kästen – Summe je Verteiler/Mehrfachsteckdose, Strom je Abgang, Leistung je Gerät; ein-/ausblendbar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Strom-Stefan');
  const post = async (template: object) => (await page.request.post('/api/library/templates', { data: { template } })).json();
  const p = (id: string, label: string, direction: string, extra: object = {}) => ({ id, label, connector: 'Schuko S', direction, signal: 'Strom', isPower: true, ...extra });
  const verteiler = await post({ kind: 'device', name: 'Verteiler Strom', ports: [p('in', 'Zuleitung', 'in', { fuseA: 16, phase: 'L1' }), p('a1', 'A1', 'out', { fuseA: 16, phase: 'L1' })] });
  const leiste = await post({ kind: 'device', name: 'Mehrfachsteckdose Strom', ports: [p('in', 'Netz', 'in'), p('s1', 'S1', 'out'), p('s2', 'S2', 'out')] });
  const spot = await post({ kind: 'device', name: 'Spot Strom', powerW: 1150, ports: [p('in', 'Netz', 'in')] });
  const d = (id: string, t: { id: string }, x: number, y = 60) => ({ id, templateId: t.id, layerId: 'l1', label: id, signalFlow: { position: { x, y } } });
  const c = (id: string, from: [string, string], to: [string, string]) => ({ id, from: { deviceId: from[0], portId: from[1] }, to: { deviceId: to[0], portId: to[1] }, waypoints: [] });
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 8,
        id: 'stromfluss',
        meta: { name: 'Strom' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        devices: [d('HV', verteiler, 20), d('Leiste', leiste, 320), d('Spot 1', spot, 640, 20), d('Spot 2', spot, 640, 200)],
        cables: [c('a', ['HV', 'a1'], ['Leiste', 'in']), c('b', ['Leiste', 's1'], ['Spot 1', 'in']), c('c', ['Leiste', 's2'], ['Spot 2', 'in'])],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}`);
  const texts = (name: string) => page.evaluate((n) => window.__steckplanStage?.find(`.${n}`).map((t) => (t as unknown as { text(): string }).text()) ?? [], name);
  // 2 × 1150 W = 2300 W = 10 A an 16 A → 63 %; Leiste ohne Absicherung; je Spot 1,15 kW
  await expect.poll(async () => (await texts('power-label')).sort()).toEqual(['⚡ 1,15 kW', '⚡ 1,15 kW', '⚡ 10,0 A · 2,3 kW', '⚡ 10,0 A · 2,3 kW · 63 %']);
  const labels = await page.evaluate(() => window.__steckplanStage!.find('Text').map((t) => (t as unknown as { text(): string }).text()));
  expect(labels).toContain('A1 · 10,0 A (63 %)');
  expect(labels).toContain('S1 · 5,0 A');

  // ausblenden
  await page.getByRole('group', { name: 'In Kästen' }).getByLabel('Strom').uncheck();
  await expect.poll(async () => (await texts('power-label')).length).toBe(0);
  const plain = await page.evaluate(() => window.__steckplanStage!.find('Text').map((t) => (t as unknown as { text(): string }).text()));
  expect(plain).toContain('A1');
});
