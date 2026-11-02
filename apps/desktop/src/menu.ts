// Anwendungsmenü (deutsch).
import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import type { RecentFile } from './settings';

export interface MenuActions {
  newProject(): void;
  openProject(): void;
  openRecent(path: string): void;
  save(): void;
  saveAs(): void;
  showVersions(): void;
  exportDocument(): void;
  showStart(): void;
  showLibrary(): void;
  showWebAccess(): void;
  connectServer(): void;
  uploadToServer(): void;
  copyAsNew(): void;
  isProjectWindow(win: BrowserWindow | null): boolean;
  recent(): RecentFile[];
  isDev: boolean;
}

export function buildMenu(actions: MenuActions): void {
  const isMac = process.platform === 'darwin';
  const projectFocused = actions.isProjectWindow(BrowserWindow.getFocusedWindow());
  const recent = actions.recent();

  const fileMenu: MenuItemConstructorOptions = {
    label: 'Datei',
    submenu: [
      { label: 'Neues Projekt …', accelerator: 'CmdOrCtrl+N', click: () => actions.newProject() },
      { label: 'Öffnen …', accelerator: 'CmdOrCtrl+O', click: () => actions.openProject() },
      {
        label: 'Zuletzt geöffnet',
        submenu: recent.length
          ? recent.map((file) => ({ label: file.name, sublabel: file.path, enabled: file.exists, click: () => actions.openRecent(file.path) }))
          : [{ label: 'Keine', enabled: false }],
      },
      { type: 'separator' },
      { label: 'Speichern', accelerator: 'CmdOrCtrl+S', enabled: projectFocused, click: () => actions.save() },
      { label: 'Speichern unter …', accelerator: 'Shift+CmdOrCtrl+S', enabled: projectFocused, click: () => actions.saveAs() },
      { label: 'Versionen …', enabled: projectFocused, click: () => actions.showVersions() },
      { label: 'Exportieren (PDF/CSV) …', accelerator: 'CmdOrCtrl+E', enabled: projectFocused, click: () => actions.exportDocument() },
      { label: 'Neues Projekt aus diesem …', enabled: projectFocused, click: () => actions.copyAsNew() },
      { type: 'separator' },
      { label: 'Bibliothek …', accelerator: 'Shift+CmdOrCtrl+B', click: () => actions.showLibrary() },
      { label: 'Mit Server verbinden …', click: () => actions.connectServer() },
      { label: 'Auf Server hochladen …', enabled: projectFocused, click: () => actions.uploadToServer() },
      { label: 'Weboberfläche (QR & Handy) …', click: () => actions.showWebAccess() },
      { label: 'Startfenster', click: () => actions.showStart() },
      ...(isMac ? [] : ([{ type: 'separator' }, { label: 'Einstellungen …', click: () => actions.showStart() }] as MenuItemConstructorOptions[])),
      { type: 'separator' },
      isMac ? { label: 'Fenster schließen', role: 'close' } : { label: 'Beenden', role: 'quit' },
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { label: 'Über Steckplan', role: 'about' },
              { type: 'separator' },
              { label: 'Einstellungen …', accelerator: 'Cmd+,', click: () => actions.showStart() },
              { type: 'separator' },
              { label: 'Steckplan ausblenden', role: 'hide' },
              { label: 'Andere ausblenden', role: 'hideOthers' },
              { label: 'Alle einblenden', role: 'unhide' },
              { type: 'separator' },
              { label: 'Steckplan beenden', role: 'quit' },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    fileMenu,
    {
      label: 'Bearbeiten',
      submenu: [
        { label: 'Rückgängig', role: 'undo' },
        { label: 'Wiederholen', role: 'redo' },
        { type: 'separator' },
        { label: 'Ausschneiden', role: 'cut' },
        { label: 'Kopieren', role: 'copy' },
        { label: 'Einsetzen', role: 'paste' },
        { label: 'Alles auswählen', role: 'selectAll' },
      ],
    },
    {
      label: 'Ansicht',
      submenu: [
        { label: 'Neu laden', role: 'reload' },
        ...(actions.isDev ? ([{ label: 'Entwicklerwerkzeuge', role: 'toggleDevTools' }] as MenuItemConstructorOptions[]) : []),
        { type: 'separator' },
        { label: 'Originalgröße', role: 'resetZoom' },
        { label: 'Vergrößern', role: 'zoomIn' },
        { label: 'Verkleinern', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Vollbild', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Fenster',
      submenu: [
        { label: 'Minimieren', role: 'minimize' },
        { label: 'Zoomen', role: 'zoom' },
        ...(isMac ? ([{ type: 'separator' }, { label: 'Alle nach vorne bringen', role: 'front' }] as MenuItemConstructorOptions[]) : []),
      ],
    },
    {
      label: 'Hilfe',
      submenu: [
        ...(isMac ? [] : ([{ label: 'Über Steckplan', role: 'about' }] as MenuItemConstructorOptions[])),
        {
          label: 'Steckplan auf GitHub',
          click: () => void import('electron').then(({ shell }) => shell.openExternal('https://github.com/rde-master/steckplan')),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
