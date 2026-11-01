import { contextBridge } from 'electron';

// Nur ausdrücklich freigegebene Funktionen gelangen in die Oberfläche (contextIsolation).
contextBridge.exposeInMainWorld('steckplanDesktop', {
  platform: process.platform,
});
