import { contextBridge, ipcRenderer } from 'electron';

// Nur ausdrücklich freigegebene Funktionen gelangen in die Oberfläche (contextIsolation).
// Gegenstück: packages/ui/src/lib/desktop.ts
contextBridge.exposeInMainWorld('steckplanDesktop', {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setName: (name: string) => ipcRenderer.invoke('settings:setName', name),
  newProject: () => ipcRenderer.invoke('project:new'),
  openProject: () => ipcRenderer.invoke('project:open'),
  openRecent: (path: string) => ipcRenderer.invoke('project:openRecent', path),
  listRecent: () => ipcRenderer.invoke('recent:list'),
  openLibrary: () => ipcRenderer.invoke('library:open'),
  copyAsNew: (projectId: string) => ipcRenderer.invoke('project:copyAsNew', projectId),
  onRecentChanged: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('recent:changed', listener);
    return () => ipcRenderer.removeListener('recent:changed', listener);
  },
  onMenuCommand: (callback: (command: string) => void) => {
    const listener = (_event: unknown, command: string) => callback(command);
    ipcRenderer.on('menu:command', listener);
    return () => ipcRenderer.removeListener('menu:command', listener);
  },
});
