// Projekte im lokalen Modus: neu, öffnen (mit Sperrdatei-Abfrage), speichern unter, schließen.
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { app, dialog, type BrowserWindow } from 'electron';
import { copyAsNewProject, createEmptyProject, FILE_EXTENSION, ProjectFormatError } from '@steckplan/core';
import { LockedError, type LockInfo } from '@steckplan/server';
import type { EmbeddedServer } from './embedded-server';
import type { SettingsStore } from './settings';

const FILTERS = [{ name: 'Steckplan-Projekt', extensions: ['steckplan'] }];

export interface ProjectActionsDeps {
  server: EmbeddedServer;
  settings: SettingsStore;
  openWindow(projectId: string, path: string): void;
  focusWindow(projectId: string): boolean;
  onRecentChanged(): void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

function ensureExtension(path: string): string {
  return path.toLowerCase().endsWith(FILE_EXTENSION) ? path : path + FILE_EXTENSION;
}

export class ProjectActions {
  constructor(private readonly deps: ProjectActionsDeps) {}

  async newProject(parent?: BrowserWindow): Promise<void> {
    const options = {
      title: 'Neues Projekt anlegen',
      buttonLabel: 'Anlegen',
      defaultPath: join(app.getPath('documents'), `Neues Projekt${FILE_EXTENSION}`),
      filters: FILTERS,
      properties: ['createDirectory', 'showOverwriteConfirmation'] as ('createDirectory' | 'showOverwriteConfirmation')[],
    };
    const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return;
    const path = ensureExtension(result.filePath);
    const name = basename(path).slice(0, -FILE_EXTENSION.length);

    const existingId = this.deps.server.store.findByPath(path);
    if (existingId) {
      dialog.showErrorBox('Datei ist bereits geöffnet', `„${basename(path)}“ ist bereits in einem Fenster geöffnet.`);
      this.deps.focusWindow(existingId);
      return;
    }
    const id = await this.deps.server.store.create(path, createEmptyProject({ name }));
    await this.remember(path);
    this.deps.openWindow(id, path);
  }

  async openDialog(parent?: BrowserWindow): Promise<void> {
    const options = {
      title: 'Projekt öffnen',
      filters: FILTERS,
      properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
    };
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (result.canceled) return;
    for (const path of result.filePaths) await this.openPath(path, parent);
  }

  /** Öffnet eine Datei; fragt bei fremder Sperre nach. */
  async openPath(path: string, parent?: BrowserWindow): Promise<void> {
    const existingId = this.deps.server.store.findByPath(path);
    if (existingId && this.deps.focusWindow(existingId)) return;

    if (!existsSync(path)) {
      dialog.showErrorBox('Datei nicht gefunden', `„${path}“ gibt es nicht (mehr).`);
      return;
    }

    try {
      const { id } = await this.deps.server.store.open(path);
      await this.remember(path);
      this.deps.openWindow(id, path);
    } catch (error) {
      if (error instanceof LockedError) {
        await this.handleLocked(path, error.info, error.stale, parent);
      } else if (error instanceof ProjectFormatError) {
        dialog.showErrorBox('Projekt kann nicht geöffnet werden', `${basename(path)}:\n${error.message}`);
      } else {
        dialog.showErrorBox('Projekt kann nicht geöffnet werden', `${basename(path)}:\n${(error as Error).message}`);
      }
    }
  }

  private async handleLocked(path: string, info: LockInfo, stale: boolean, parent?: BrowserWindow): Promise<void> {
    const file = basename(path);
    const buttons = stale ? ['Sperre übernehmen', 'Nur lesen öffnen', 'Abbrechen'] : ['Nur lesen öffnen', 'Abbrechen'];
    const options = {
      type: 'warning' as const,
      title: 'Datei ist gesperrt',
      message: stale
        ? `„${file}“ war zuletzt von ${info.name} auf „${info.host}“ geöffnet.`
        : `„${file}“ wird gerade von ${info.name} auf „${info.host}“ bearbeitet.`,
      detail: stale
        ? `Die Sperre ist veraltet (zuletzt aktualisiert ${formatTime(info.updatedAt)}) – vermutlich wurde Steckplan dort nicht richtig beendet. Übernimm die Sperre nur, wenn die Datei sicher nicht mehr geöffnet ist.`
        : `Seit ${formatTime(info.startedAt)}. Gleichzeitiges Bearbeiten über einen gemeinsamen Ordner ist nicht möglich – nutze dafür die Weboberfläche oder einen Steckplan-Server.`,
      buttons,
      defaultId: stale ? 1 : 0,
      cancelId: buttons.length - 1,
      noLink: true,
    };
    const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
    const choice = buttons[response];
    if (choice === 'Abbrechen' || choice === undefined) return;

    const { id } = await this.deps.server.store.open(path, choice === 'Sperre übernehmen' ? { takeOverLock: true } : { readOnly: true });
    await this.remember(path);
    this.deps.openWindow(id, path);
  }

  async saveNow(projectId: string): Promise<void> {
    await this.deps.server.rooms.peek(projectId)?.flush();
  }

  async saveAs(projectId: string, parent?: BrowserWindow): Promise<void> {
    const room = this.deps.server.rooms.peek(projectId);
    const currentPath = this.deps.server.store.pathOf(projectId);
    if (!room || !currentPath) return;
    const options = {
      title: 'Speichern unter',
      defaultPath: currentPath,
      filters: FILTERS,
      properties: ['createDirectory', 'showOverwriteConfirmation'] as ('createDirectory' | 'showOverwriteConfirmation')[],
    };
    const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return;
    const path = ensureExtension(result.filePath);
    await room.flush();
    try {
      await this.deps.server.store.saveAs(projectId, path, room.currentProject());
    } catch (error) {
      dialog.showErrorBox('Speichern nicht möglich', (error as Error).message);
      return;
    }
    await this.remember(path);
    // War die Datei nur lesend geöffnet, darf jetzt in die Kopie geschrieben werden → neu verbinden lassen
    parent?.webContents.reload();
    parent?.setRepresentedFilename(path);
  }

  /** „Neues Projekt aus diesem“: Kopie ohne Häkchen, sofort mit Speicherort. */
  async copyAsNew(projectId: string, parent?: BrowserWindow): Promise<void> {
    const room = this.deps.server.rooms.peek(projectId);
    const currentPath = this.deps.server.store.pathOf(projectId);
    if (!room || !currentPath) return;
    await room.flush();
    const source = room.currentProject();
    const options = {
      title: 'Neues Projekt aus diesem',
      buttonLabel: 'Anlegen',
      defaultPath: join(dirname(currentPath), `${source.meta.name || 'Projekt'} (Kopie)${FILE_EXTENSION}`),
      filters: FILTERS,
      properties: ['createDirectory', 'showOverwriteConfirmation'] as ('createDirectory' | 'showOverwriteConfirmation')[],
    };
    const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return;
    const path = ensureExtension(result.filePath);
    const copy = copyAsNewProject(source, basename(path).slice(0, -FILE_EXTENSION.length));
    const id = await this.deps.server.store.create(path, copy);
    await this.remember(path);
    this.deps.openWindow(id, path);
  }

  async close(projectId: string): Promise<void> {
    await this.deps.server.rooms.close(projectId, 'Das Projekt wurde am Desktop geschlossen.');
    await this.deps.server.store.close(projectId);
  }

  private async remember(path: string): Promise<void> {
    await this.deps.settings.addRecent(path);
    app.addRecentDocument(path);
    this.deps.onRecentChanged();
  }
}

/** Sucht .steckplan-Dateien in Kommandozeilenargumenten (Doppelklick unter Windows/Linux). */
export function filesFromArgv(argv: string[]): string[] {
  return argv.slice(1).filter((arg) => !arg.startsWith('-') && arg.toLowerCase().endsWith(FILE_EXTENSION) && existsSync(arg));
}
