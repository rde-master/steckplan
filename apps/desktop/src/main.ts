import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import type { FastifyInstance } from 'fastify';
import { formatAppTitle } from '@steckplan/core';
import { createServer } from '@steckplan/server';

const isSmokeTest = process.env.STECKPLAN_SMOKE_TEST === '1';

let server: FastifyInstance | undefined;
let baseUrl = '';

/** Startet den eingebetteten Server – nur auf 127.0.0.1, zufälliger freier Port. */
async function startEmbeddedServer(): Promise<string> {
  server = await createServer({ mode: 'desktop', uiDir: join(__dirname, 'ui') });
  await server.listen({ host: '127.0.0.1', port: 0 });
  const address = server.server.address();
  if (address === null || typeof address === 'string') throw new Error('Serveradresse unbekannt');
  return `http://127.0.0.1:${address.port}`;
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: formatAppTitle(),
    show: !isSmokeTest,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Nur die eigene Oberfläche im Fenster; externe Links im Standardbrowser öffnen.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(baseUrl)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(baseUrl)) event.preventDefault();
  });

  void win.loadURL(baseUrl);
  return win;
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
        `fetch('/api/health').then(r => r.json()).then(h => ({ h, title: document.title, root: !!document.getElementById('root') }))`,
      )) as { h: { name: string; version: string; mode: string }; title: string; root: boolean };
      clearTimeout(timer);
      const ok = result.root && result.h.name === 'Steckplan' && result.h.mode === 'desktop';
      const screenshotPath = process.env.STECKPLAN_SMOKE_SCREENSHOT;
      if (screenshotPath) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // React rendern lassen
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
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      baseUrl = await startEmbeddedServer();
    } catch (error) {
      console.error('Eingebetteter Server konnte nicht starten:', error);
      app.exit(1);
      return;
    }
    const win = createWindow();
    if (isSmokeTest) void runSmokeTest(win);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('will-quit', () => {
    void server?.close();
  });
}
