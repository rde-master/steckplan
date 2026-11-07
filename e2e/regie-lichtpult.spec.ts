import { expect, test } from '@playwright/test';
import { loginAs, newContextPage, openPerformance } from './helpers';

test('Lichtpult-Cue als Text (OSC /steckplan/cue bzw. HTTP): letzter Cue und die letzten zehn – Führen, Folgen (Licht) und OSC-Seite', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'lichtpult',
        meta: { name: 'Lichtpult' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: { items: [{ id: 'a', order: 0, kind: 'song', title: 'Lied', durationSec: 60 }], sections: [] },
        lightScenes: [{ id: 's1', itemId: 'a', order: 0, name: 'Hell' }],
      },
    })
  ).json();
  await page.goto(`/projekt/${id}?ansicht=regie`);
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  await perf.getByRole('radio', { name: 'Führen' }).click();
  const lead = perf.getByTestId('lead-view');
  await expect(lead.getByTestId('desk-cues')).toContainText('Noch kein Cue');

  // Folgen (Lesen): im Bereich Licht
  const reader = await newContextPage(browser);
  await reader.setViewportSize({ width: 1440, height: 900 });
  await loginAs(reader, 'read', 'Leo');
  await reader.goto(`/projekt/${id}?ansicht=regie`);
  const follow = await openPerformance(reader);
  const l = follow.getByTestId('performance');
  await expect(l.getByRole('radio', { name: 'Folgen' })).toHaveAttribute('aria-checked', 'true');
  await l.getByRole('tab', { name: 'Licht' }).click();

  // Cues senden (wie per OSC)
  for (const text of ['Cue 1 Intro', 'Cue 2 Strophe', 'Cue 3 Refrain']) await page.request.post('/api/desk-cues', { data: { text } });
  await expect(lead.getByTestId('desk-cue-last')).toHaveText('Cue 3 Refrain');
  await expect(lead.getByTestId('desk-cue-history')).toContainText('Cue 2 Strophe');
  await expect(lead.getByTestId('desk-cue-history')).toContainText('Cue 1 Intro');
  await expect(l.getByTestId('desk-cue-last')).toHaveText('Cue 3 Refrain');
  await expect(l.getByTestId('desk-cue-history').locator('li')).toHaveCount(2);
  // höchstens zehn
  for (let i = 4; i <= 13; i++) await page.request.post('/api/desk-cues', { data: { text: `Cue ${i}` } });
  await expect(l.getByTestId('desk-cue-last')).toHaveText('Cue 13');
  await expect(l.getByTestId('desk-cue-history').locator('li')).toHaveCount(9);
  await reader.context().close();

  // OSC-Seite: Befehl, Beispiel und Historie
  await page.goto('/osc');
  const section = page.getByTestId('osc-desk-cue');
  await expect(section).toContainText('/steckplan/cue');
  await expect(section).toContainText('SendOSC 1 "/steckplan/cue,s,Cue 12 Intro"');
  await expect(section.getByTestId('osc-desk-history').locator('li').first()).toContainText('Cue 13');
  await section.getByLabel('Cue-Text').fill('Probe');
  await section.getByRole('button', { name: 'Ausprobieren: /steckplan/cue' }).click();
  await expect(section.getByTestId('osc-desk-history').locator('li').first()).toContainText('Probe');
  await expect(lead.getByTestId('desk-cue-last')).toHaveText('Probe');
});
