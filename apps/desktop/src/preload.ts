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
  servers: {
    list: () => ipcRenderer.invoke('servers:list'),
    add: (input: { label: string; url: string; key: string }) => ipcRenderer.invoke('servers:add', input),
    remove: (id: string) => ipcRenderer.invoke('servers:remove', id),
    open: (id: string) => ipcRenderer.invoke('servers:open', id),
    onChanged: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('servers:changed', listener);
      return () => ipcRenderer.removeListener('servers:changed', listener);
    },
  },
  uploadToServer: (projectId: string, serverId: string) => ipcRenderer.invoke('project:uploadToServer', projectId, serverId),
  webAccess: {
    status: () => ipcRenderer.invoke('web:status'),
    start: (address: string) => ipcRenderer.invoke('web:start', address),
    stop: () => ipcRenderer.invoke('web:stop'),
    setPasswords: (passwords: { edit: string; read: string; direction?: string }) => ipcRenderer.invoke('web:setPasswords', passwords),
    setPort: (port: number) => ipcRenderer.invoke('web:setPort', port),
    disconnect: (sessionId: string) => ipcRenderer.invoke('web:disconnect', sessionId),
  },
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
