import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// E2E-Tests gegen den gebauten eigenständigen Server (vorher: pnpm build).
const port = 18_765;
// Einmal je Lauf (die Konfiguration wird auch in jedem Test-Prozess geladen); nach dem Lauf entfernt (e2e/teardown.ts)
const dataDir = (process.env.STECKPLAN_E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'steckplan-e2e-')));

export const E2E = {
  editPassword: 'e2e-bearbeiten',
  readPassword: 'e2e-lesen',
  directionPassword: 'e2e-regie',
};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  globalTeardown: './e2e/teardown.ts',
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-browser', use: { ...devices['Desktop Chrome'] }, testIgnore: [/mobile\.spec\.ts/, /electron\.spec\.ts/] },
    { name: 'handy', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
    { name: 'electron', testMatch: /electron\.spec\.ts/ },
  ],
  webServer: {
    command: 'node packages/server/dist/standalone.cjs',
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    env: {
      PORT: String(port),
      HOST: '127.0.0.1',
      STECKPLAN_DATA_DIR: dataDir,
      STECKPLAN_UI_DIR: join(process.cwd(), 'packages/ui/dist'),
      STECKPLAN_EDIT_PASSWORD: E2E.editPassword,
      STECKPLAN_READ_PASSWORD: E2E.readPassword,
      STECKPLAN_DIRECTION_PASSWORD: E2E.directionPassword,
    },
  },
});
