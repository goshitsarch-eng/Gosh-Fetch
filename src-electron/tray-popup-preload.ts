import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('trayAPI', {
  onUpdate: (callback: (data: any) => void): void => {
    ipcRenderer.on('tray-update', (_e, data) => callback(data));
  },

  send: (action: string): void => {
    ipcRenderer.send('tray-action', action);
  },

  getFontsPath: (): Promise<string> => {
    return ipcRenderer.invoke('get-fonts-path');
  },
});
