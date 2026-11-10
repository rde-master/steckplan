import { contextBridge, ipcRenderer } from 'electron';

// Für beide Seiten: die Statusseite (Suche, Koppeln, Laden) und das Textfenster der Steuersoftware (/player).
// mediaScheme: Medien aus dem Zwischenspeicher statt vom Server (siehe packages/ui/src/lib/api.ts).
contextBridge.exposeInMainWorld('steckplanPlayer', {
  mediaScheme: 'steckplan-media',
  onState: (callback: (state: unknown) => void) => {
    const listener = (_event: unknown, state: unknown) => callback(state);
    ipcRenderer.on('player:state', listener);
    void ipcRenderer.invoke('player:state').then(callback);
    return () => ipcRenderer.removeListener('player:state', listener);
  },
  /** Netzwerk des Rechners: { connected, addresses: [{ name, address }], wifi? } */
  onNetwork: (callback: (network: unknown) => void) => {
    const listener = (_event: unknown, network: unknown) => callback(network);
    ipcRenderer.on('player:network', listener);
    void ipcRenderer.invoke('player:network').then(callback);
    return () => ipcRenderer.removeListener('player:network', listener);
  },
  choose: (serverId: string) => ipcRenderer.invoke('player:choose', serverId),
  manual: (address: string) => ipcRenderer.invoke('player:manual', address),
  retry: () => ipcRenderer.invoke('player:retry'),
});
