import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (method: string, params?: any): Promise<any> => {
    return ipcRenderer.invoke('rpc-invoke', method, params);
  },

  onEvent: (callback: (event: string, data: any) => void): (() => void) => {
    const handler = (_event: any, eventName: string, data: any) => {
      callback(eventName, data);
    };
    ipcRenderer.on('rpc-event', handler);
    return () => {
      ipcRenderer.removeListener('rpc-event', handler);
    };
  },

  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel);
  },

  selectFile: (options?: { filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null> => {
    return ipcRenderer.invoke('select-file', options);
  },

  selectDirectory: (): Promise<string | null> => {
    return ipcRenderer.invoke('select-directory');
  },

  showNotification: (title: string, body: string): Promise<void> => {
    return ipcRenderer.invoke('show-notification', title, body);
  },

  getNativeTheme: (): Promise<boolean> => {
    return ipcRenderer.invoke('get-native-theme');
  },

  updaterDownload: (): Promise<void> => {
    return ipcRenderer.invoke('updater-download');
  },

  updaterInstall: (): Promise<void> => {
    return ipcRenderer.invoke('updater-install');
  },

  platform: process.platform,
});
