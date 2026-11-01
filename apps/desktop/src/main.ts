import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { normalizeName, SESSION_COOKIE } from '@steckplan/server';
import { startEmbeddedServer, type EmbeddedServer } from './embedded-server';
import { buildMenu } from './menu';
import { filesFromArgv, ProjectActions } from './projects';
import { SettingsStore } from './settings';
import { preloadPath, WindowManager } from './windows';

const isSmokeTest = process.env.STECKPLAN_SMOKE_TEST === '1';
const isDev = !app.isPackaged;

// Für Tests: eigener App-Datenordner
if (process.env.STECKPLAN_USER_DATA) app.setPath('userData', process.env.STECKPLAN_USER_DATA);

/** Dateien, die vor dem Start (macOS „open-file“) oder vor Eingabe des Namens geöffnet werden sollen */
const pendingFiles: string[] = [];
let ready = false;
let quitting = false;
let cleanedUp = false;

let server: EmbeddedServer;
let settings: SettingsStore;
let windows: WindowManager;
let projects: ProjectActions;

function refreshMenu(): void {
  buildMenu({
    isDev,
    newProject: () => void projects.newProject(BrowserWindow.getFocusedWindow() ?? undefined),
    openProject: () => void projects.openDialog(BrowserWindow.getFocusedWindow() ?? undefined),
    openRecent: (path) => void openFile(path),
    save: () => {
      const id = windows.projectOf(BrowserWindow.getFocusedWindow());
      if (id) void projects.saveNow(id);
    },
    saveAs: () => {
      const win = BrowserWindow.getFocusedWindow();
      const id = windows.projectOf(win);
      if (id && win) void projects.saveAs(id, win);
    },
    showVersions: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu:command', 'versions'),
    showStart: () => windows.showStart(),
    isProjectWindow: (win) => windows.projectOf(win) !== undefined,
    recent: () => settings.recent(),
  });
}

function broadcastRecentChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('recent:changed');
  refreshMenu();
}

async function openFile(path: string): Promise<void> {
  if (!ready || !settings.name) {
    pendingFiles.push(path);
    if (ready) windows.showStart();
    return;
  }
  await projects.openPath(path, BrowserWindow.getFocusedWindow() ?? undefined);
}

async function openPendingFiles(): Promise<void> {
  for (const path of pendingFiles.splice(0)) await projects.openPath(path);
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => ({ name: settings.name }));
  ipcMain.handle('settings:setName', async (_event, input: unknown) => {
    const name = normalizeName(input);
    if (!name) throw new Error('Bitte einen Namen (1–40 Zeichen) eingeben.');
    await settings.setName(name);
    server.store.setUserName(name);
    server.sessions.rename(server.localToken, name);
    setImmediate(() => void openPendingFiles());
    return { name };
  });
  ipcMain.handle('project:new', (event) => projects.newProject(BrowserWindow.fromWebContents(event.sender) ?? undefined));
  ipcMain.handle('project:open', (event) => projects.openDialog(BrowserWindow.fromWebContents(event.sender) ?? undefined));
  ipcMain.handle('project:openRecent', (_event, path: unknown) => {
    if (typeof path !== 'string' || !settings.recent().some((r) => r.path === path)) return;
    return openFile(path);
  });
  ipcMain.handle('recent:list', () => settings.recent());
}

async function runSmokeTest(win: BrowserWindow): Promise<void> {
  const timer = setTimeout(() => {
    console.error('Smoke-Test: Zeitüberschreitung');
    app.exit(1);
  }, 30_000);
  win.webContents.once('did-fail-load', (_e, code, description) => {
    console.error(`Smoke-Test: UI konnte nicht geladen werden (${code} ${description})`);
    app.exit(1);
  });
  win.webContents.once('did-finish-load', async () => {
    try {
      const result = (await win.webContents.executeJavaScript(
        `Promise.all([fetch('/api/health').then(r => r.json()), fetch('/api/auth/session').then(r => r.json())])
          .then(([h, s]) => ({ h, s, title: document.title, root: !!document.getElementById('root') }))`,
      )) as { h: { name: string; mode: string }; s: { access?: string }; title: string; root: boolean };
      clearTimeout(timer);
      const ok = result.root && result.h.name === 'Steckplan' && result.h.mode === 'desktop' && result.s.access === 'local';
      const screenshotPath = process.env.STECKPLAN_SMOKE_SCREENSHOT;
      if (screenshotPath) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        writeFileSync(screenshotPath, (await win.webContents.capturePage()).toPNG());
      }
      console.log(`Smoke-Test: ${ok ? 'OK' : 'FEHLER'} – ${JSON.stringify(result)}`);
      app.exit(ok ? 0 : 1);
    } catch (error) {
      console.error('Smoke-Test:', error);
      app.exit(1);
    }
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  pendingFiles.push(...filesFromArgv(process.argv));

  app.on('second-instance', (_event, argv) => {
    const files = filesFromArgv(argv);
    if (files.length) for (const file of files) void openFile(file);
    else if (windows.projectCount === 0) windows.showStart();
    else BrowserWindow.getAllWindows()[0]?.focus();
  });

  // macOS: Doppelklick auf .steckplan (kann vor „ready“ kommen)
  app.on('open-file', (event, path) => {
    event.preventDefault();
    void openFile(path);
  });

  app.whenReady().then(async () => {
    settings = new SettingsStore(app.getPath('userData'));
    await settings.load();

    try {
      server = await startEmbeddedServer({ userDataDir: app.getPath('userData'), uiDir: join(__dirname, 'ui'), userName: settings.name });
    } catch (error) {
      dialog.showErrorBox('Steckplan kann nicht starten', `Der eingebettete Server konnte nicht starten:\n${(error as Error).message}`);
      app.exit(1);
      return;
    }

    // Lokale Sitzung (volle Rechte) für alle Fenster der Desktop-App
    await session.defaultSession.cookies.set({
      url: server.baseUrl,
      name: SESSION_COOKIE,
      value: server.localToken,
      httpOnly: true,
      sameSite: 'strict',
    });

    windows = new WindowManager({
      baseUrl: server.baseUrl,
      preload: preloadPath(__dirname),
      show: !isSmokeTest,
      onProjectClosed: (projectId) => {
        void projects.close(projectId).then(() => {
          if (windows.projectCount === 0 && !quitting && process.platform !== 'darwin') windows.showStart();
        });
      },
      onFocusChanged: () => refreshMenu(),
    });
    projects = new ProjectActions({
      server,
      settings,
      openWindow: (id, path) => windows.openProject(id, path),
      focusWindow: (id) => windows.focusProject(id),
      onRecentChanged: broadcastRecentChanged,
    });

    registerIpc();
    refreshMenu();
    ready = true;

    if (isSmokeTest) {
      void runSmokeTest(windows.showStart());
      return;
    }
    if (pendingFiles.length && settings.name) await openPendingFiles();
    if (windows.projectCount === 0) windows.showStart();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) windows.showStart();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // Beim Beenden: alle Projekte speichern und Sperrdateien entfernen
  app.on('before-quit', (event) => {
    if (cleanedUp || !server) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void (async () => {
      try {
        await server.rooms.closeAll('Steckplan wird beendet.');
        await server.store.closeAll();
        await server.app.close();
      } finally {
        cleanedUp = true;
        app.quit();
      }
    })();
  });
}
