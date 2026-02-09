"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('trayAPI', {
    onUpdate: (callback) => {
        electron_1.ipcRenderer.on('tray-update', (_e, data) => callback(data));
    },
    send: (action) => {
        electron_1.ipcRenderer.send('tray-action', action);
    },
    getFontsPath: () => {
        return electron_1.ipcRenderer.invoke('get-fonts-path');
    },
});
//# sourceMappingURL=tray-popup-preload.js.map