import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { E2E } from '../playwright.config';

// Desktop-App (lokaler Modus). Vorher: pnpm build. Unter Linux mit Xvfb (xvfb-run) ausführen.
const appDir = join(process.cwd(), 'apps/desktop');
const electronPath = createRequire(join(appDir, 'package.json'))('electron') as unknown as string;

// Temporäre Ordner nach den Tests wieder entfernen (/tmp liegt oft im Arbeitsspeicher)
const tempDirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
test.afterAll(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

test('Desktop: Name beim ersten Start, Datei öffnen, Autosave, Sperrdatei', async () => {
  const userData = tempDir('steckplan-userdata-');
  const projectDir = tempDir('steckplan-projekte-');
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
    expect(JSON.parse(readFileSync(file, 'utf8')).schemaVersion).toBe(9);

    // Bibliothek in eigenem Fenster (Knopf im Projektfenster)
    const libraryWindowPromise = app.waitForEvent('window');
    await project.getByRole('button', { name: 'Bibliothek', exact: true }).click();
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
  const userData = tempDir('steckplan-userdata-');
  const projectDir = tempDir('steckplan-projekte-');
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

test('Desktop: mit Server verbinden (Zugangsschlüssel), Projekt hochladen, Widerruf sperrt', async ({ request, baseURL }) => {
  // Schlüssel auf dem Test-Server erzeugen (Bearbeiten-Zugang)
  const login = await request.post('/api/auth/login', { data: { name: 'Admin', password: E2E.editPassword } });
  expect(login.ok()).toBe(true);
  const created = await (await request.post('/api/settings/desktop-keys', { data: { label: 'E2E-Desktop', access: 'edit' } })).json();
  const key: string = created.key;

  const userData = tempDir('steckplan-userdata-');
  const projectDir = tempDir('steckplan-projekte-');
  const file = join(projectDir, 'Hochladen.steckplan');
  writeFileSync(file, JSON.stringify({ schemaVersion: 4, id: 'e2e-upload', meta: { name: 'Vom Desktop hochgeladen' } }));
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ name: 'Ralf Desktop', recentFiles: [] }));

  const env = { ...process.env, STECKPLAN_USER_DATA: userData, STECKPLAN_TEST_PLAINTEXT_KEYS: '1' } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronPath, args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), appDir, file], env });
  try {
    const projectWindow = await app.waitForEvent('window', { predicate: (w) => w.url().includes('/projekt/') });
    await expect(projectWindow.getByRole('tab', { name: 'Signalfluss' })).toBeVisible();

    // Menü „Datei > Mit Server verbinden …“ öffnet das Startfenster mit dem Dialog
    const startPromise = app.waitForEvent('window', { predicate: (w) => !w.url().includes('/projekt/') });
    await app.evaluate(({ Menu }) => {
      const file = Menu.getApplicationMenu()!.items.find((i) => i.label === 'Datei')!;
      file.submenu!.items.find((i) => i.label === 'Mit Server verbinden …')!.click();
    });
    const start = await startPromise;
    const dialog = start.getByRole('dialog', { name: 'Mit Server verbinden' });
    await dialog.getByLabel('Adresse des Servers').fill('http://192.168.1.50:8080');
    await expect(dialog.getByText('ohne Verschlüsselung')).toBeVisible();
    await dialog.getByLabel('Adresse des Servers').fill(baseURL!);
    await expect(dialog.getByText('ohne Verschlüsselung')).toHaveCount(0);

    // falscher Schlüssel wird abgelehnt
    await dialog.getByLabel('Desktop-Zugangsschlüssel').fill('stp_falsch');
    await dialog.getByRole('button', { name: 'Verbinden' }).click();
    await expect(dialog.getByRole('alert')).toContainText('ungültig');

    await dialog.getByLabel('Desktop-Zugangsschlüssel').fill(key);
    await dialog.getByLabel('Bezeichnung (optional)').fill('Test-Server');
    const serverWindowPromise = app.waitForEvent('window', { predicate: (w) => w.url().startsWith(baseURL!) });
    await dialog.getByRole('button', { name: 'Verbinden' }).click();
    const serverWindow = await serverWindowPromise;
    await expect(serverWindow.getByRole('heading', { name: 'Projekte' })).toBeVisible();
    await expect(serverWindow.getByText('Ralf Desktop')).toBeVisible();
    await expect(serverWindow.getByRole('button', { name: 'Abmelden' })).toHaveCount(0);
    await expect(start.getByTestId('servers')).toContainText('Test-Server');

    // Schlüssel liegt nur verschlüsselt in den Einstellungen
    const settingsText = readFileSync(join(userData, 'settings.json'), 'utf8');
    expect(settingsText).not.toContain(key);
    expect(JSON.parse(settingsText).servers[0]).toMatchObject({ label: 'Test-Server', url: baseURL });

    // Lokales Projekt hochladen → öffnet sich im Server-Fenster
    await projectWindow.getByRole('tab', { name: 'Projektdaten' }).click();
    await projectWindow.getByRole('button', { name: 'Auf Server hochladen …' }).click();
    const upload = projectWindow.getByRole('dialog', { name: 'Auf Server hochladen' });
    await expect(upload.getByText('Test-Server')).toBeVisible();
    await upload.getByRole('button', { name: 'Hochladen' }).click();
    await expect(upload.getByText('Hochgeladen und im Server-Fenster geöffnet.')).toBeVisible();
    await expect(serverWindow).toHaveURL(/\/projekt\//);
    await expect(serverWindow.getByRole('heading', { name: 'Vom Desktop hochgeladen' })).toBeVisible();
    const projects = (await (await request.get('/api/projects')).json()).projects as { name: string }[];
    expect(projects.some((p) => p.name === 'Vom Desktop hochgeladen')).toBe(true);

    // Widerruf: Verbindung wird getrennt, Hinweis statt Anmeldeseite
    await request.delete(`/api/settings/desktop-keys/${created.info.id}`);
    await expect(serverWindow.getByText('ungültig oder wurde widerrufen')).toBeVisible({ timeout: 10_000 });
  } finally {
    await app.close();
  }
});

test('Desktop: Projekt mit Medien (.steckplan.zip) öffnen – fragt den Speicherort, legt Projekt und Medien-Ordner ab', async () => {
  const userData = tempDir('steckplan-userdata-');
  const dir = tempDir('steckplan-projekte-');
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ name: 'Ralf Desktop', recentFiles: [] }));
  // ZIP wie aus „Mit Medien herunterladen“: Projektdatei oben, Dateien unter medien/<Kennung>
  const project = {
    schemaVersion: 9,
    id: 'zip-projekt',
    meta: { name: 'Open Air mit Medien' },
    media: [{ id: 'audio-1', name: 'Song.wav', mime: 'audio/wav', sizeBytes: 4, sha256: '', addedAt: '', addedBy: '' }],
    show: { items: [{ id: 'lied', order: 0, kind: 'song', title: 'Song', media: [{ mediaId: 'audio-1', label: 'Song', isDefault: true }] }], sections: [] },
  };
  const zipPath = join(dir, 'Open Air.steckplan.zip');
  writeFileSync(zipPath, zipSync({ 'Open Air.steckplan': strToU8(JSON.stringify(project)), 'medien/audio-1': new Uint8Array([1, 2, 3, 4]) }));
  const target = join(dir, 'ziel', 'Open Air.steckplan');
  mkdirSync(join(dir, 'ziel'));

  const env = { ...process.env, STECKPLAN_USER_DATA: userData } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronPath, args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), appDir], env });
  try {
    const start = await app.firstWindow();
    // Dialoge vorbelegen: „Öffnen“ wählt die ZIP, „Speichern“ den Zielort
    await app.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [paths.zip] })) as never;
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: paths.target })) as never;
    }, { zip: zipPath, target });
    const projectWindowPromise = app.waitForEvent('window');
    await start.getByRole('button', { name: 'Projekt öffnen …' }).click();
    const win = await projectWindowPromise;
    await win.getByRole('tab', { name: 'Projektdaten' }).click();
    await expect(win.getByLabel('Projektname')).toHaveValue('Open Air mit Medien');
    expect(existsSync(target)).toBe(true);
    expect([...readFileSync(join(dir, 'ziel', 'Open Air.medien', 'audio-1'))]).toEqual([1, 2, 3, 4]);
    // die Datei ist über die Oberfläche erreichbar (Medien-Ordner gehört zum Projekt)
    const status = await win.evaluate(async () => {
      const id = location.pathname.split('/').pop()!;
      return (await fetch(`/api/projects/${id}/media/audio-1`)).status;
    });
    expect(status).toBe(200);
  } finally {
    await app.close();
  }
});
