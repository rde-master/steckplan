import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import type { PlayersOverview } from '@steckplan/core';
import { E2E } from '../playwright.config';
import { loginAs, openPerformance, uploadMediaFile } from './helpers';

// Steckplan Player (eigene App): sucht die Steuersoftware (hier: den E2E-Server per UDP), koppelt sich per Code,
// lädt Texte und Medien und zeigt „Bereit“ bzw. das Textfenster, sobald jemand führt. Vorher: pnpm build.
const appDir = join(process.cwd(), 'apps/player');
const electronPath = createRequire(join(appDir, 'package.json'))('electron') as unknown as string;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('Player: sucht die Steuersoftware, Code im Führen-Bildschirm zulassen, lädt Medien, „Bereit“, Textfenster beim Führen, neu synchronisieren', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'edit', 'Ralf');
  const { id } = await (
    await page.request.post('/api/projects/upload', {
      data: {
        schemaVersion: 9,
        id: 'player-e2e',
        meta: { name: 'Player-Konzert' },
        layers: [{ id: 'l1', name: 'Bühne', order: 0 }],
        show: {
          items: [{ id: 'song', order: 0, kind: 'song', title: 'Eröffnung', durationSec: 60 }],
          sections: [{ id: 's1', itemId: 'song', order: 0, kind: 'verse', label: 'Strophe', lines: [{ id: 'l1', text: 'Willkommen im Saal', atSec: 0 }] }],
        },
        showSettings: { lyricsBackground: { mediaId: 'bild', dim: 0.3 } },
        media: [{ id: 'bild', name: 'Buehne.png', mime: 'image/png', sizeBytes: png.length, sha256: '', addedAt: '', addedBy: '' }],
      },
    })
  ).json();
  await uploadMediaFile(page, id, 'bild', png);
  const players = async () => (await (await page.request.get('/api/players')).json()) as PlayersOverview;

  const userData = mkdtempSync(join(tmpdir(), 'steckplan-player-'));
  const env = { ...process.env, STECKPLAN_PLAYER_USER_DATA: userData, STECKPLAN_DISCOVERY_PORT: String(E2E.discoveryPort), STECKPLAN_PLAYER_WINDOWED: '1', STECKPLAN_PLAYER_NAME: 'Beamer Saal' } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronPath, args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), appDir], env });
  try {
    const win = await app.firstWindow();
    // Suche → gefunden → Kopplung mit Code
    const status = win.getByTestId('player-status');
    await expect(status).toHaveAttribute('data-screen', /searching|connecting|pairing/);
    const code = win.getByTestId('pairing-code');
    await expect(code).toHaveText(/^\d{4}$/, { timeout: 20_000 });
    await expect(win.getByTestId('player-logo').locator('img')).toHaveJSProperty('naturalWidth', 256);
    await win.screenshot({ path: 'test-results/player-koppeln.png' });

    // Führen-Bildschirm: Anfrage mit demselben Code zulassen
    await page.goto(`/projekt/${id}?ansicht=regie`);
    const show = await openPerformance(page);
    const perf = show.getByTestId('performance');
    await perf.getByRole('radio', { name: 'Führen' }).click();
    const panel = perf.getByTestId('players-panel');
    const request = panel.getByTestId('player-pairing');
    await expect(request).toContainText('Beamer Saal möchte sich verbinden');
    await expect(request.getByTestId('player-pairing-code')).toHaveText((await code.textContent())!);
    await panel.getByRole('button', { name: 'Zulassen' }).click();

    // Player lädt Texte und Medien, zeigt dann „Bereit“ (bzw. gleich das Textfenster, weil hier geführt wird)
    await win.waitForURL(/\/player$/, { timeout: 30_000 });
    const row = panel.getByTestId('player-row').filter({ hasText: 'Beamer Saal' });
    await expect(row).toHaveAttribute('data-phase', 'ready', { timeout: 15_000 });
    await expect(row.getByTestId('player-state')).toContainText('bereit');
    const me = (await players()).players.find((p) => p.name === 'Beamer Saal')!;
    expect(me.report?.mediaDone).toBe(me.report?.mediaTotal);
    expect(me.report?.mediaTotal).toBeGreaterThanOrEqual(1);

    // geführt wird in diesem Projekt: Textfenster mit Bild aus dem Zwischenspeicher
    await expect(win.getByTestId('lyrics-active-line')).toContainText('Willkommen im Saal', { timeout: 15_000 });
    const background = win.getByTestId('lyrics-background');
    await expect(background).toHaveAttribute('data-media', 'bild');
    await expect(background).toHaveAttribute('style', /steckplan-media:\/\/media\//);
    // aus dem Zwischenspeicher, auch in Teilen (Videos spulen)
    const fetched = await win.evaluate(async (projectId) => {
      const full = await fetch(`steckplan-media://media/${projectId}/bild`);
      const part = await fetch(`steckplan-media://media/${projectId}/bild`, { headers: { range: 'bytes=0-3' } });
      return { status: full.status, type: full.headers.get('content-type'), size: (await full.arrayBuffer()).byteLength, part: part.status, partSize: (await part.arrayBuffer()).byteLength };
    }, id);
    expect(fetched).toEqual({ status: 200, type: 'image/png', size: png.length, part: 206, partSize: 4 });
    await panel.screenshot({ path: 'test-results/player-fuehren.png' });

    // niemand führt → „Bereit“
    await perf.getByRole('radio', { name: 'Frei' }).click();
    await expect(win.getByTestId('player-ready')).toBeVisible({ timeout: 10_000 });
    await expect(win.getByTestId('player-ready')).toContainText('Bereit');
    await expect(win.getByTestId('player-ready').getByTestId('player-logo')).toHaveJSProperty('naturalWidth', 256);
    await win.screenshot({ path: 'test-results/player-bereit.png' });

    // neu synchronisieren aus dem Führen-Bildschirm
    await perf.getByRole('radio', { name: 'Führen' }).click();
    const syncedBefore = me.report?.syncedAt;
    await row.getByTestId('player-resync').click();
    await expect.poll(async () => (await players()).players.find((p) => p.name === 'Beamer Saal')?.report?.syncedAt, { timeout: 20_000 }).not.toBe(syncedBefore);
    await win.waitForURL(/\/player$/, { timeout: 20_000 });
    await expect(row).toHaveAttribute('data-phase', 'ready');
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true, maxRetries: 3 });
  }
});
