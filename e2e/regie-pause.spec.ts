import { expect, test } from '@playwright/test';
import { loginAs, openPerformance } from './helpers';

// Führen: Pause im Textfenster (Titel und Restzeit, auf allen Geräten), weicher Wechsel zurück zum Text; Textschatten
test('Führen: Pause mit Restzeit im Textfenster, verlängern, beenden; Textschatten abschaltbar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'textfenster-pause',
        meta: { name: 'Pause' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [{ id: 'song', order: 0, kind: 'song', title: 'Lied', durationSec: 30 }],
          sections: [{ id: 's1', itemId: 'song', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'a1', text: 'Erste Zeile', atSec: 0 }] }],
        },
      },
    })
  ).json();

  await page.goto(`/projekt/${id}?ansicht=regie`);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Textfenster', exact: true }).click();
  const lyrics = await popupPromise;
  const show = await openPerformance(page);
  const perf = show.getByTestId('performance');
  await perf.getByRole('radio', { name: 'Führen' }).click();
  await expect(lyrics.getByTestId('lyrics-active-line')).toContainText('Erste Zeile');
  // Schatten hinter dem Text (Standard)
  await expect(lyrics.getByTestId('lyrics-text-layer')).toHaveCSS('text-shadow', /rgba\(0, 0, 0/);

  // Pause: Titel und Minuten einstellen, zeigen
  const pause = perf.getByTestId('pause-control');
  await pause.getByTestId('pause-title').fill('Kaffeepause');
  await pause.getByTestId('pause-minutes').fill('15');
  await pause.getByTestId('pause-start').click();
  await expect(perf.getByTestId('performance-pause')).toBeVisible();
  await expect(pause.getByTestId('pause-left')).toHaveText(/^1[45]:\d\d$/);
  await expect(lyrics.getByTestId('lyrics-pause-title')).toHaveText('Kaffeepause');
  await expect(lyrics.getByTestId('lyrics-pause-left')).toHaveText(/^Es geht weiter in 1[45]:\d\d$/);
  await expect(lyrics.getByTestId('lyrics-active-line')).toHaveCount(0);
  // auch auf einem anderen Gerät (über den Server, Restzeit weitergerechnet)
  const other = await page.context().newPage();
  await other.goto(`/projekt/${id}/text`);
  await expect(other.getByTestId('lyrics-pause-left')).toHaveText(/^Es geht weiter in 1[45]:\d\d$/);
  await lyrics.screenshot({ path: 'test-results/textfenster-pause.png' });

  // verlängern: 5 Minuten mehr
  await pause.getByTestId('pause-extend').click();
  await expect(pause.getByTestId('pause-left')).toHaveText(/^(19|20):\d\d$/);
  await expect(other.getByTestId('lyrics-pause-left')).toHaveText(/^Es geht weiter in (19|20):\d\d$/);

  // beenden: der Text kommt (weich) zurück
  await pause.getByTestId('pause-stop').click();
  await expect(lyrics.getByTestId('lyrics-active-line')).toContainText('Erste Zeile');
  await expect(lyrics.getByTestId('lyrics-pause')).toHaveCount(0);
  await expect(other.getByTestId('lyrics-active-line')).toContainText('Erste Zeile');
  await expect(perf.getByTestId('performance-pause')).toHaveCount(0);
  // Merken: Titel und Minuten
  await expect(pause.getByTestId('pause-title')).toHaveValue('Kaffeepause');

  // ohne Zeit (0 Minuten): nur der Titel
  await pause.getByTestId('pause-minutes').fill('0');
  await pause.getByTestId('pause-start').click();
  await expect(lyrics.getByTestId('lyrics-pause-title')).toHaveText('Kaffeepause');
  await expect(lyrics.getByTestId('lyrics-pause-left')).toHaveCount(0);
  await expect(pause.getByTestId('pause-left')).toHaveText('ohne Zeit');
  await pause.getByTestId('pause-stop').click();

  // Textschatten abschalten (Regie-Einstellungen)
  await page.getByRole('button', { name: 'Regie-Einstellungen' }).click();
  await page.getByTestId('lyrics-settings').getByLabel('Schatten hinter dem Text').uncheck();
  await expect(lyrics.getByTestId('lyrics-text-layer')).toHaveCSS('text-shadow', 'none');
  // Player ohne Führen: Einstellung vorhanden
  await page.getByTestId('lyrics-idle').getByLabel('Schwarz').check();
  const saved = await (await page.request.get(`/api/projects/${id}/download`)).json();
  expect(saved.showSettings).toMatchObject({ lyricsShadow: false, lyricsIdle: 'black' });
});
