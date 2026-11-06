// Fenster: ein Startfenster + ein Fenster pro geöffnetem Projekt.
import { join } from 'node:path';
import { BrowserWindow, shell } from 'electron';
import { formatAppTitle } from '@steckplan/core';
import { appWindowOptions } from './lyrics-window';

export interface WindowManagerOptions {
  baseUrl: string;
  preload: string;
  show: boolean;
  onProjectClosed(projectId: string): void;
  onFocusChanged(): void;
}

export class WindowManager {
  private startWindow: BrowserWindow | null = null;
  private libraryWindow: BrowserWindow | null = null;
  private readonly projectWindows = new Map<string, BrowserWindow>();
  private readonly windowProjects = new Map<number, string>();

  constructor(private readonly options: WindowManagerOptions) {}

  private create(url: string, size: { width: number; height: number }): BrowserWindow {
    const win = new BrowserWindow({
      ...size,
      minWidth: 640,
      minHeight: 480,
      title: formatAppTitle(),
      show: this.options.show,
      webPreferences: {
        preload: this.options.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const base = this.options.baseUrl;
    // Nur die eigene Oberfläche im Fenster; externe Links im Standardbrowser öffnen.
    win.webContents.setWindowOpenHandler((details) => {
      const own = appWindowOptions(details, base);
      if (own) return { action: 'allow', overrideBrowserWindowOptions: own };
      const target = details.url;
      if (/^https?:\/\//.test(target) && !target.startsWith(base)) void shell.openExternal(target);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, target) => {
      if (!target.startsWith(base)) event.preventDefault();
    });
    // Downloads (z. B. „Herunterladen“) mit Speichern-Dialog
    win.on('focus', () => this.options.onFocusChanged());
    void win.loadURL(url);
    return win;
  }

  /** Startfenster zeigen; `query` nur beim Neuanlegen (z. B. „?verbinden=1“ öffnet den Server-Dialog). */
  showStart(query = ''): BrowserWindow {
    if (this.startWindow && !this.startWindow.isDestroyed()) {
      if (this.startWindow.isMinimized()) this.startWindow.restore();
      this.startWindow.focus();
      return this.startWindow;
    }
    const win = this.create(`${this.options.baseUrl}/${query}`, { width: 900, height: 680 });
    win.on('closed', () => {
      this.startWindow = null;
    });
    this.startWindow = win;
    return win;
  }

  /** Bibliothek in eigenem Fenster (nur eines). */
  showLibrary(): BrowserWindow {
    if (this.libraryWindow && !this.libraryWindow.isDestroyed()) {
      if (this.libraryWindow.isMinimized()) this.libraryWindow.restore();
      this.libraryWindow.focus();
      return this.libraryWindow;
    }
    const win = this.create(`${this.options.baseUrl}/bibliothek`, { width: 1180, height: 820 });
    win.on('closed', () => {
      this.libraryWindow = null;
    });
    this.libraryWindow = win;
    return win;
  }

  get start(): BrowserWindow | null {
    return this.startWindow && !this.startWindow.isDestroyed() ? this.startWindow : null;
  }

  openProject(projectId: string, filePath: string): BrowserWindow {
    const existing = this.projectWindows.get(projectId);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return existing;
    }
    const win = this.create(`${this.options.baseUrl}/projekt/${encodeURIComponent(projectId)}`, { width: 1280, height: 820 });
    if (process.platform === 'darwin') win.setRepresentedFilename(filePath);
    const webContentsId = win.webContents.id;
    this.projectWindows.set(projectId, win);
    this.windowProjects.set(webContentsId, projectId);
    win.on('closed', () => {
      this.projectWindows.delete(projectId);
      this.windowProjects.delete(webContentsId);
      this.options.onProjectClosed(projectId);
      this.options.onFocusChanged();
    });
    // Startfenster schließen, sobald ein Projekt offen ist
    this.start?.close();
    return win;
  }

  focusProject(projectId: string): boolean {
    const win = this.projectWindows.get(projectId);
    if (!win || win.isDestroyed()) return false;
    if (win.isMinimized()) win.restore();
    win.focus();
    return true;
  }

  /** Projekt-id des Fensters (für Menübefehle). */
  projectOf(win: BrowserWindow | null | undefined): string | undefined {
    if (!win || win.isDestroyed()) return undefined;
    return this.windowProjects.get(win.webContents.id);
  }

  get projectCount(): number {
    return this.projectWindows.size;
  }

  all(): BrowserWindow[] {
    return BrowserWindow.getAllWindows();
  }
}

export const preloadPath = (dir: string): string => join(dir, 'preload.cjs');
