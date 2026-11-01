import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

// Desktop-App (lokaler Modus). Vorher: pnpm build. Unter Linux mit Xvfb (xvfb-run) ausführen.
const appDir = join(process.cwd(), 'apps/desktop');
const electronPath = createRequire(join(appDir, 'package.json'))('electron') as unknown as string;

test('Desktop: Name beim ersten Start, Datei öffnen, Autosave, Sperrdatei', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'steckplan-userdata-'));
  const projectDir = mkdtempSync(join(tmpdir(), 'steckplan-projekte-'));
  const file = join(projectDir, 'Halle.steckplan');
  writeFileSync(file, JSON.stringify({ schemaVersion: 1, id: 'e2e-projekt', meta: { name: 'Hallenfest' } }));

  const env = { ...process.env, STECKPLAN_USER_DATA: userData } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), appDir, file],
    env,
  });

  try {
    // Erster Start: Name abfragen
    const start = await app.firstWindow();
    await expect(start.getByText('Willkommen bei Steckplan')).toBeVisible();
    const projectWindowPromise = app.waitForEvent('window');
    await start.getByLabel('Dein Name').fill('Ralf Desktop');
    await start.getByRole('button', { name: 'Weiter' }).click();

    // Die per Kommandozeile übergebene Datei öffnet sich in einem eigenen Fenster
    const project = await projectWindowPromise;
    await expect(project.getByLabel('Projektname')).toHaveValue('Hallenfest');
    await expect(project.getByTestId('presence')).toContainText('Ralf Desktop');
    await expect(project.getByLabel('Projektname')).toBeEnabled();

    // Sperrdatei neben der Datei (ohne führenden Punkt)
    expect(existsSync(`${file}.lock`)).toBe(true);
    expect(JSON.parse(readFileSync(`${file}.lock`, 'utf8')).name).toBe('Ralf Desktop');

    // Autosave in die Datei
    await project.getByLabel('Ort / Veranstaltungsstätte').fill('Stadthalle');
    await expect.poll(() => JSON.parse(readFileSync(file, 'utf8')).meta.venue, { timeout: 10_000 }).toBe('Stadthalle');

    // Datei im alten Format 1 wurde beim Speichern auf Format 2 angehoben
    expect(JSON.parse(readFileSync(file, 'utf8')).schemaVersion).toBe(2);

    // Bibliothek in eigenem Fenster (Menü/Startfenster)
    const libraryWindowPromise = app.waitForEvent('window');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.executeJavaScript('window.steckplanDesktop.openLibrary()'));
    const libraryWindow = await libraryWindowPromise;
    await expect(libraryWindow.getByRole('heading', { name: 'Bibliothek' })).toBeVisible();
    await expect(libraryWindow.getByRole('button', { name: /Neu: Gerät/ })).toBeVisible();
    await libraryWindow.close();

    // Zuletzt geöffnet merkt sich die Datei
    const settings = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'));
    expect(settings).toMatchObject({ name: 'Ralf Desktop', recentFiles: [file] });

    // Fenster schließen → Sperre wird entfernt (unter Windows/Linux beendet sich die App dabei)
    await project.close();
    await expect.poll(() => existsSync(`${file}.lock`), { timeout: 10_000 }).toBe(false);
  } finally {
    await app.close();
  }
});
