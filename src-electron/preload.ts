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

  getDiskSpace: (path?: string): Promise<{ total: number; free: number }> => {
    return ipcRenderer.invoke('get-disk-space', path);
  },

  setLoginItemSettings: (openAtLogin: boolean): Promise<void> => {
    return ipcRenderer.invoke('set-login-item-settings', openAtLogin);
  },

  getLoginItemSettings: (): Promise<{ openAtLogin: boolean }> => {
    return ipcRenderer.invoke('get-login-item-settings');
  },

  setDefaultProtocolClient: (protocol: string): Promise<boolean> => {
    return ipcRenderer.invoke('set-default-protocol-client', protocol);
  },

  removeDefaultProtocolClient: (protocol: string): Promise<boolean> => {
    return ipcRenderer.invoke('remove-default-protocol-client', protocol);
  },

  isDefaultProtocolClient: (protocol: string): Promise<boolean> => {
    return ipcRenderer.invoke('is-default-protocol-client', protocol);
  },

  importSettingsFile: (): Promise<any | null> => {
    return ipcRenderer.invoke('import-settings-file');
  },

  updaterDownload: (): Promise<void> => {
    return ipcRenderer.invoke('updater-download');
  },

  updaterInstall: (): Promise<void> => {
    return ipcRenderer.invoke('updater-install');
  },

  platform: process.platform,
});
