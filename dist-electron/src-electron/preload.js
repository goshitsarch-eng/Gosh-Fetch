"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (method, params) => {
        return electron_1.ipcRenderer.invoke('rpc-invoke', method, params);
    },
    onEvent: (callback) => {
        const handler = (_event, eventName, data) => {
            callback(eventName, data);
        };
        electron_1.ipcRenderer.on('rpc-event', handler);
        return () => {
            electron_1.ipcRenderer.removeListener('rpc-event', handler);
        };
    },
    removeAllListeners: (channel) => {
        electron_1.ipcRenderer.removeAllListeners(channel);
    },
    selectFile: (options) => {
        return electron_1.ipcRenderer.invoke('select-file', options);
    },
    selectDirectory: () => {
        return electron_1.ipcRenderer.invoke('select-directory');
    },
    showNotification: (title, body) => {
        return electron_1.ipcRenderer.invoke('show-notification', title, body);
    },
    getNativeTheme: () => {
        return electron_1.ipcRenderer.invoke('get-native-theme');
    },
    getDiskSpace: (path) => {
        return electron_1.ipcRenderer.invoke('get-disk-space', path);
    },
    setLoginItemSettings: (openAtLogin) => {
        return electron_1.ipcRenderer.invoke('set-login-item-settings', openAtLogin);
    },
    getLoginItemSettings: () => {
        return electron_1.ipcRenderer.invoke('get-login-item-settings');
    },
    setDefaultProtocolClient: (protocol) => {
        return electron_1.ipcRenderer.invoke('set-default-protocol-client', protocol);
    },
    removeDefaultProtocolClient: (protocol) => {
        return electron_1.ipcRenderer.invoke('remove-default-protocol-client', protocol);
    },
    isDefaultProtocolClient: (protocol) => {
        return electron_1.ipcRenderer.invoke('is-default-protocol-client', protocol);
    },
    importSettingsFile: () => {
        return electron_1.ipcRenderer.invoke('import-settings-file');
    },
    updaterDownload: () => {
        return electron_1.ipcRenderer.invoke('updater-download');
    },
    updaterInstall: () => {
        return electron_1.ipcRenderer.invoke('updater-install');
    },
    platform: process.platform,
});
//# sourceMappingURL=preload.js.map