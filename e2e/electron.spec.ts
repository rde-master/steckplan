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
    await expect(project.getByRole('tab', { name: 'Signalfluss' })).toHaveAttribute('aria-selected', 'true');
    await project.getByRole('tab', { name: 'Projektdaten' }).click();
    await expect(project.getByLabel('Projektname')).toHaveValue('Hallenfest');
    await expect(project.getByTestId('presence')).toContainText('Ralf Desktop');
    await expect(project.getByLabel('Projektname')).toBeEnabled();

    // Sperrdatei neben der Datei (ohne führenden Punkt)
    expect(existsSync(`${file}.lock`)).toBe(true);
    expect(JSON.parse(readFileSync(`${file}.lock`, 'utf8')).name).toBe('Ralf Desktop');

    // Autosave in die Datei
    await project.getByLabel('Ort / Veranstaltungsstätte').fill('Stadthalle');
    await expect.poll(() => JSON.parse(readFileSync(file, 'utf8')).meta.venue, { timeout: 10_000 }).toBe('Stadthalle');

    // Datei im alten Format 1 wurde beim Speichern auf das aktuelle Format angehoben
    expect(JSON.parse(readFileSync(file, 'utf8')).schemaVersion).toBe(4);

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

test('Desktop: Weboberfläche per QR starten, im Browser lesend anmelden, trennen', async ({ browser }) => {
  const userData = mkdtempSync(join(tmpdir(), 'steckplan-userdata-'));
  const projectDir = mkdtempSync(join(tmpdir(), 'steckplan-projekte-'));
  const file = join(projectDir, 'Open-Air.steckplan');
  writeFileSync(file, JSON.stringify({ schemaVersion: 3, id: 'e2e-web', meta: { name: 'Open Air' } }));
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ name: 'Ralf Pult', recentFiles: [] }));

  const env = { ...process.env, STECKPLAN_USER_DATA: userData } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), appDir, file],
    env,
  });
  const phone = await browser.newContext();

  try {
    const projectWindow = await app.waitForEvent('window', { predicate: (w) => w.url().includes('/projekt/') });
    await projectWindow.getByRole('button', { name: 'Handy (QR)' }).click();
    const dialog = projectWindow.getByRole('dialog', { name: 'Weboberfläche (QR & Handy)' });
    await expect(dialog.getByText('Bitte zuerst ein Bearbeiten- und ein Lese-Passwort festlegen.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Weboberfläche starten' })).toBeDisabled();

    // gleiche Passwörter werden abgelehnt
    await dialog.getByLabel('Bearbeiten-Passwort').fill('pult-geheim');
    await dialog.getByLabel('Lese-Passwort').fill('pult-geheim');
    await dialog.getByRole('button', { name: 'Passwörter speichern' }).click();
    await expect(dialog.getByRole('alert')).toContainText('unterscheiden');
    await dialog.getByLabel('Lese-Passwort').fill('nur-lesen');
    await dialog.getByRole('button', { name: 'Passwörter speichern' }).click();
    await expect(dialog.getByText('Passwörter sind festgelegt.')).toBeVisible();

    // nur der Hash landet in den Einstellungen
    const settingsText = readFileSync(join(userData, 'settings.json'), 'utf8');
    expect(settingsText).not.toContain('pult-geheim');
    expect(settingsText).not.toContain('nur-lesen');
    expect(JSON.parse(settingsText).webAccess.port).toBe(8080);

    // Port ändern, Adresse „nur dieser Rechner“ (im CI gibt es evtl. kein LAN), starten
    await dialog.getByLabel('Port').fill('18890');
    await dialog.getByRole('button', { name: 'Übernehmen' }).click();
    await dialog.getByRole('combobox').selectOption('127.0.0.1');
    await dialog.getByRole('button', { name: 'Weboberfläche starten' }).click();
    const urlLink = dialog.getByTestId('web-url');
    await expect(urlLink).toHaveText(/^http:\/\/127\.0\.0\.1:188\d\d\/$/);
    await expect(dialog.getByRole('img', { name: 'QR-Code mit der Adresse der Weboberfläche' })).toBeVisible();
    const url = (await urlLink.textContent())!;

    // Handy: anmelden mit Lese-Passwort, nur das geöffnete Projekt, schreibgeschützt
    const page = await phone.newPage();
    await page.goto(url);
    await expect(page).toHaveURL(/\/anmelden/);
    await page.getByLabel('Dein Name').fill('Handy Anna');
    await page.getByLabel('Passwort', { exact: true }).fill('nur-lesen');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await page.getByRole('link', { name: /Open Air/ }).click();
    await expect(page.getByText('Nur lesen').first()).toBeVisible();

    // Desktop sieht die Person und trennt sie
    await expect(dialog.getByRole('listitem').filter({ hasText: 'Handy Anna' })).toContainText('Open Air');
    await dialog.getByRole('listitem').filter({ hasText: 'Handy Anna' }).getByRole('button', { name: 'Trennen' }).click();
    await expect(page).toHaveURL(/\/anmelden/, { timeout: 10_000 });

    // Beenden → Adresse nicht mehr erreichbar
    await dialog.getByRole('button', { name: 'Beenden' }).click();
    await expect(dialog.getByRole('button', { name: 'Weboberfläche starten' })).toBeVisible();
    await expect.poll(() => fetch(`${url}api/health`).then(() => 'erreichbar', () => 'aus')).toBe('aus');
  } finally {
    await phone.close();
    await app.close();
  }
});
