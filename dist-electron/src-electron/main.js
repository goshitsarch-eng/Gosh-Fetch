"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const electron_updater_1 = require("electron-updater");
const sidecar_1 = require("./sidecar");
let mainWindow = null;
let tray = null;
let trayPopup = null;
let sidecar = null;
let closeToTray = true;
let isQuitting = false;
let lastTrayData = null;
// Single-instance lock
const gotLock = electron_1.app.requestSingleInstanceLock();
if (!gotLock) {
    electron_1.app.quit();
}
electron_1.app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
        if (mainWindow.isMinimized())
            mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
    // On Windows/Linux, protocol URLs and file paths arrive via argv
    const protocolArg = argv.find((a) => a.startsWith('magnet:'));
    if (protocolArg)
        handleProtocolUrl(protocolArg);
    const torrentArg = argv.find((a) => a.endsWith('.torrent'));
    if (torrentArg)
        handleTorrentFile(torrentArg);
});
// Register as handler for magnet: protocol (conditionally, based on user preference)
// Will be set/unset during onboarding and via settings
if (!electron_1.app.isPackaged || electron_1.app.isDefaultProtocolClient('magnet')) {
    electron_1.app.setAsDefaultProtocolClient('magnet');
}
// macOS: handle magnet: links via open-url
electron_1.app.on('open-url', (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
});
// macOS: handle .torrent file opens
electron_1.app.on('open-file', (event, filePath) => {
    event.preventDefault();
    handleTorrentFile(filePath);
});
function handleProtocolUrl(url) {
    if (url.startsWith('magnet:') && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.webContents.send('rpc-event', 'open-magnet', { uri: url });
    }
}
function handleTorrentFile(filePath) {
    if (filePath.endsWith('.torrent') && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.webContents.send('rpc-event', 'open-torrent-file', { path: filePath });
    }
}
// IPC method allowlist — only these methods can be forwarded to the sidecar
const ALLOWED_RPC_METHODS = new Set([
    'add_download',
    'add_urls',
    'pause_download',
    'pause_all',
    'resume_download',
    'resume_all',
    'remove_download',
    'get_download_status',
    'get_all_downloads',
    'get_active_downloads',
    'get_global_stats',
    'set_speed_limit',
    'add_torrent_file',
    'add_magnet',
    'get_torrent_files',
    'select_torrent_files',
    'parse_torrent_file',
    'parse_magnet_uri',
    'get_peers',
    'get_settings',
    'update_settings',
    'set_close_to_tray',
    'set_user_agent',
    'get_tracker_list',
    'update_tracker_list',
    'apply_settings_to_engine',
    'get_user_agent_presets',
    'get_engine_version',
    'open_download_folder',
    'open_file_location',
    'get_default_download_path',
    'get_app_version',
    'get_app_info',
    'db_get_completed_history',
    'db_save_download',
    'db_remove_download',
    'db_clear_history',
    'db_get_settings',
    'db_save_settings',
    'db_load_incomplete',
    'set_priority',
    'get_schedule_rules',
    'set_schedule_rules',
]);
function getSidecarPath() {
    const isDev = !electron_1.app.isPackaged;
    const binaryName = process.platform === 'win32' ? 'gosh-fetch-engine.exe' : 'gosh-fetch-engine';
    if (isDev) {
        // In development, look for the binary in src-rust/target/debug or release
        return path_1.default.join(electron_1.app.getAppPath(), 'src-rust', 'target', 'debug', binaryName);
    }
    // In production, the binary is bundled alongside the app
    return path_1.default.join(process.resourcesPath, 'bin', binaryName);
}
function getTrayIconPath() {
    const isDev = !electron_1.app.isPackaged;
    if (isDev) {
        return path_1.default.join(electron_1.app.getAppPath(), 'src-rust', 'icons', 'tray-icon.png');
    }
    return path_1.default.join(process.resourcesPath, 'icons', 'tray-icon.png');
}
function getTrayPopupHtmlPath() {
    const isDev = !electron_1.app.isPackaged;
    if (isDev) {
        return path_1.default.join(electron_1.app.getAppPath(), 'src-electron', 'tray-popup.html');
    }
    return path_1.default.join(process.resourcesPath, 'tray-popup.html');
}
function getRendererHtmlPath() {
    const candidatePaths = [
        path_1.default.join(electron_1.app.getAppPath(), 'dist', 'index.html'),
        path_1.default.join(process.resourcesPath, 'dist', 'index.html'),
        path_1.default.join(__dirname, '../../dist/index.html'),
    ];
    const resolvedPath = candidatePaths.find((candidatePath) => fs_1.default.existsSync(candidatePath));
    if (resolvedPath) {
        return resolvedPath;
    }
    // Fallback to the canonical packaged path to keep the error message actionable.
    return candidatePaths[0];
}
function getFontsPath() {
    const isDev = !electron_1.app.isPackaged;
    if (isDev) {
        return path_1.default.join(electron_1.app.getAppPath(), 'public', 'fonts');
    }
    return path_1.default.join(process.resourcesPath, 'fonts');
}
function getWindowStateFile() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'window-state.json');
}
function loadWindowState() {
    try {
        return JSON.parse(fs_1.default.readFileSync(getWindowStateFile(), 'utf-8'));
    }
    catch {
        return { width: 1200, height: 800, isMaximized: false };
    }
}
function saveWindowState(win) {
    if (win.isDestroyed())
        return;
    const bounds = win.isMaximized() ? loadWindowState() : win.getBounds();
    const state = {
        ...bounds,
        isMaximized: win.isMaximized(),
    };
    try {
        fs_1.default.writeFileSync(getWindowStateFile(), JSON.stringify(state));
    }
    catch {
        // Ignore write errors
    }
}
// --- Application menu ---
function createAppMenu() {
    if (process.platform === 'darwin') {
        const template = [
            { role: 'appMenu' },
            { role: 'editMenu' },
            { role: 'viewMenu' },
            { role: 'windowMenu' },
        ];
        electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate(template));
    }
    else {
        electron_1.Menu.setApplicationMenu(null);
    }
}
function createWindow() {
    const savedState = loadWindowState();
    mainWindow = new electron_1.BrowserWindow({
        width: savedState.width,
        height: savedState.height,
        x: savedState.x,
        y: savedState.y,
        minWidth: 900,
        minHeight: 600,
        title: 'Gosh-Fetch',
        icon: getTrayIconPath(),
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false,
    });
    if (savedState.isMaximized) {
        mainWindow.maximize();
    }
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    // Save window state on resize/move
    mainWindow.on('resize', () => { if (mainWindow)
        saveWindowState(mainWindow); });
    mainWindow.on('move', () => { if (mainWindow)
        saveWindowState(mainWindow); });
    // Close-to-tray logic
    mainWindow.on('close', (event) => {
        if (mainWindow)
            saveWindowState(mainWindow);
        if (!isQuitting && closeToTray) {
            event.preventDefault();
            mainWindow?.hide();
        }
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    // Load the app
    const isDev = !electron_1.app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    }
    else {
        mainWindow.loadFile(getRendererHtmlPath());
    }
}
function createTrayPopup() {
    trayPopup = new electron_1.BrowserWindow({
        width: 320,
        height: 500,
        frame: false,
        transparent: true,
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        show: false,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'tray-popup-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    trayPopup.loadFile(getTrayPopupHtmlPath());
    trayPopup.on('blur', () => {
        trayPopup?.hide();
    });
    trayPopup.on('closed', () => {
        trayPopup = null;
    });
}
function toggleTrayPopup() {
    if (!trayPopup || trayPopup.isDestroyed()) {
        createTrayPopup();
    }
    if (trayPopup.isVisible()) {
        trayPopup.hide();
        return;
    }
    // Detect panel position from work area vs screen bounds
    const display = electron_1.screen.getPrimaryDisplay();
    const { bounds, workArea } = display;
    const popupBounds = trayPopup.getBounds();
    const hasTopPanel = workArea.y > bounds.y;
    const hasBottomPanel = (workArea.y + workArea.height) < (bounds.y + bounds.height);
    // Position at the right edge, near the panel (where system tray lives)
    const x = workArea.x + workArea.width - popupBounds.width - 8;
    let y;
    if (hasBottomPanel) {
        // Bottom panel: popup appears above the panel
        y = workArea.y + workArea.height - popupBounds.height - 4;
    }
    else if (hasTopPanel) {
        // Top panel (GNOME, etc.): popup appears just below the panel
        y = workArea.y + 4;
    }
    else {
        // No detectable panel: default to top-right
        y = workArea.y + 4;
    }
    trayPopup.setPosition(x, y);
    trayPopup.show();
    // Send current data immediately
    if (lastTrayData && trayPopup && !trayPopup.isDestroyed()) {
        trayPopup.webContents.send('tray-update', lastTrayData);
    }
}
async function pushTrayData(globalStats) {
    try {
        const activeDownloads = sidecar ? await sidecar.invoke('get_active_downloads') : [];
        const trayData = {
            downloadSpeed: globalStats.downloadSpeed || 0,
            uploadSpeed: globalStats.uploadSpeed || 0,
            activeDownloads: (Array.isArray(activeDownloads) ? activeDownloads : []).map((d) => ({
                name: d.name,
                completedSize: d.completedSize || 0,
                totalSize: d.totalSize || 0,
                downloadSpeed: d.downloadSpeed || 0,
            })),
        };
        lastTrayData = trayData;
        if (trayPopup && !trayPopup.isDestroyed() && trayPopup.isVisible()) {
            trayPopup.webContents.send('tray-update', trayData);
        }
    }
    catch {
        // Ignore errors fetching active downloads
    }
}
function createTray() {
    const iconPath = getTrayIconPath();
    const icon = electron_1.nativeImage.createFromPath(iconPath);
    tray = new electron_1.Tray(icon.resize({ width: 22, height: 22 }));
    tray.setToolTip('Gosh-Fetch');
    // Both click and right-click show the popup
    if (process.platform === 'darwin') {
        tray.on('double-click', toggleTrayPopup);
    }
    else {
        tray.on('click', toggleTrayPopup);
        tray.on('right-click', toggleTrayPopup);
    }
}
function setupSidecar() {
    const sidecarPath = getSidecarPath();
    let restartCount = 0;
    const maxRestarts = 3;
    function startSidecar() {
        sidecar = new sidecar_1.SidecarManager();
        console.log('Starting sidecar at:', sidecarPath);
        try {
            sidecar.spawn(sidecarPath);
        }
        catch (err) {
            console.error('Failed to spawn sidecar:', err);
            notifyEngineStatus(false, false);
            return;
        }
        // Forward sidecar events to renderer
        sidecar.onEvent((event, data) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('rpc-event', event, data);
            }
            // Update tray tooltip and popup with speed stats
            if (event === 'global-stats' && tray) {
                const dl = formatSpeed(data.downloadSpeed || 0);
                const ul = formatSpeed(data.uploadSpeed || 0);
                const active = data.numActive || 0;
                tray.setToolTip(`Gosh-Fetch\n↓ ${dl}  ↑ ${ul}\n${active} active`);
                pushTrayData(data);
            }
        });
        sidecar.on('exit', (code) => {
            console.error('Sidecar exited unexpectedly with code:', code);
            if (!isQuitting && restartCount < maxRestarts) {
                restartCount++;
                const delay = Math.pow(2, restartCount - 1) * 1000; // 1s, 2s, 4s
                console.log(`Attempting sidecar restart ${restartCount}/${maxRestarts} in ${delay}ms...`);
                notifyEngineStatus(false, true);
                setTimeout(() => {
                    startSidecar();
                }, delay);
            }
            else if (!isQuitting) {
                console.error('Max sidecar restarts reached, giving up');
                notifyEngineStatus(false, false);
            }
        });
    }
    function notifyEngineStatus(connected, restarting) {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('rpc-event', 'engine-status', { connected, restarting });
        }
    }
    startSidecar();
}
function formatSpeed(bytesPerSec) {
    const KB = 1024;
    const MB = KB * 1024;
    const GB = MB * 1024;
    if (bytesPerSec >= GB)
        return `${(bytesPerSec / GB).toFixed(1)} GB/s`;
    if (bytesPerSec >= MB)
        return `${(bytesPerSec / MB).toFixed(1)} MB/s`;
    if (bytesPerSec >= KB)
        return `${(bytesPerSec / KB).toFixed(1)} KB/s`;
    return `${bytesPerSec} B/s`;
}
function setupIPC() {
    // Forward RPC calls to sidecar
    electron_1.ipcMain.handle('rpc-invoke', async (_event, method, params) => {
        if (!ALLOWED_RPC_METHODS.has(method)) {
            throw new Error(`Unauthorized RPC method: ${method}`);
        }
        if (!sidecar)
            throw new Error('Sidecar not running');
        const result = await sidecar.invoke(method, params);
        // Track close_to_tray setting
        if (method === 'set_close_to_tray' && params?.value !== undefined) {
            closeToTray = params.value;
        }
        return result;
    });
    // File dialog
    electron_1.ipcMain.handle('select-file', async (_event, options) => {
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: options?.filters || [],
        });
        if (result.canceled || result.filePaths.length === 0)
            return null;
        return result.filePaths[0];
    });
    // Directory dialog
    electron_1.ipcMain.handle('select-directory', async () => {
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
        });
        if (result.canceled || result.filePaths.length === 0)
            return null;
        return result.filePaths[0];
    });
    // Notification
    electron_1.ipcMain.handle('show-notification', (_event, title, body) => {
        new electron_1.Notification({ title, body }).show();
    });
    // Disk space
    electron_1.ipcMain.handle('get-disk-space', async (_event, dirPath) => {
        const targetPath = dirPath || electron_1.app.getPath('downloads');
        const { statfs } = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        const stats = await statfs(targetPath);
        return {
            total: Number(stats.blocks) * Number(stats.bsize),
            free: Number(stats.bavail) * Number(stats.bsize),
        };
    });
    // Native theme (dark mode detection)
    electron_1.ipcMain.handle('get-native-theme', () => electron_1.nativeTheme.shouldUseDarkColors);
    // Login item (run at startup)
    electron_1.ipcMain.handle('set-login-item-settings', (_event, openAtLogin) => {
        electron_1.app.setLoginItemSettings({ openAtLogin });
    });
    electron_1.ipcMain.handle('get-login-item-settings', () => {
        return electron_1.app.getLoginItemSettings();
    });
    // Default protocol client
    electron_1.ipcMain.handle('set-default-protocol-client', (_event, protocol) => {
        return electron_1.app.setAsDefaultProtocolClient(protocol);
    });
    electron_1.ipcMain.handle('remove-default-protocol-client', (_event, protocol) => {
        return electron_1.app.removeAsDefaultProtocolClient(protocol);
    });
    electron_1.ipcMain.handle('is-default-protocol-client', (_event, protocol) => {
        return electron_1.app.isDefaultProtocolClient(protocol);
    });
    // Import settings from file
    electron_1.ipcMain.handle('import-settings-file', async () => {
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'JSON Settings', extensions: ['json'] }],
        });
        if (result.canceled || result.filePaths.length === 0)
            return null;
        try {
            const content = fs_1.default.readFileSync(result.filePaths[0], 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    });
    // Auto-updater controls
    electron_1.ipcMain.handle('updater-download', () => electron_updater_1.autoUpdater.downloadUpdate());
    electron_1.ipcMain.handle('updater-install', () => electron_updater_1.autoUpdater.quitAndInstall());
    // Tray popup IPC
    electron_1.ipcMain.handle('get-fonts-path', () => getFontsPath());
    electron_1.ipcMain.on('tray-action', (_event, action) => {
        switch (action) {
            case 'open-app':
                mainWindow?.show();
                mainWindow?.focus();
                trayPopup?.hide();
                break;
            case 'add-url':
                mainWindow?.show();
                mainWindow?.focus();
                mainWindow?.webContents.send('rpc-event', 'navigate', '/');
                setTimeout(() => {
                    mainWindow?.webContents.send('rpc-event', 'open-add-modal', {});
                }, 100);
                trayPopup?.hide();
                break;
            case 'pause-all':
                sidecar?.invoke('pause_all').catch(console.error);
                break;
            case 'resume-all':
                sidecar?.invoke('resume_all').catch(console.error);
                break;
            case 'open-settings':
                mainWindow?.show();
                mainWindow?.focus();
                mainWindow?.webContents.send('rpc-event', 'navigate', '/settings');
                trayPopup?.hide();
                break;
            case 'quit':
                isQuitting = true;
                electron_1.app.quit();
                break;
        }
    });
}
function setupAutoUpdater() {
    electron_updater_1.autoUpdater.autoDownload = false;
    electron_updater_1.autoUpdater.checkForUpdates().catch(() => { });
    electron_updater_1.autoUpdater.on('update-available', (info) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            let releaseNotes = '';
            if (typeof info.releaseNotes === 'string') {
                releaseNotes = info.releaseNotes;
            }
            else if (Array.isArray(info.releaseNotes)) {
                releaseNotes = info.releaseNotes
                    .map((rn) => `## ${rn.version}\n${rn.note ?? ''}`)
                    .join('\n\n');
            }
            mainWindow.webContents.send('rpc-event', 'update-available', {
                version: info.version,
                releaseName: info.releaseName ?? null,
                releaseNotes,
                releaseDate: info.releaseDate,
            });
        }
    });
    electron_updater_1.autoUpdater.on('download-progress', (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('rpc-event', 'update-progress', {
                total: progress.total,
                transferred: progress.transferred,
                percent: progress.percent,
                bytesPerSecond: progress.bytesPerSecond,
            });
        }
    });
    electron_updater_1.autoUpdater.on('update-downloaded', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('rpc-event', 'update-downloaded', {});
        }
    });
}
function setupNativeThemeListener() {
    electron_1.nativeTheme.on('updated', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('rpc-event', 'native-theme-changed', {
                shouldUseDarkColors: electron_1.nativeTheme.shouldUseDarkColors,
            });
        }
    });
}
// App lifecycle
electron_1.app.whenReady().then(() => {
    // Set CSP headers in production (dev needs inline scripts for Vite HMR)
    if (electron_1.app.isPackaged) {
        electron_1.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
            // Skip CSP for tray popup (trusted local file with inline scripts)
            if (details.url.includes('tray-popup')) {
                callback({});
                return;
            }
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [
                        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'",
                    ],
                },
            });
        });
    }
    createAppMenu();
    setupSidecar();
    createWindow();
    createTray();
    setupIPC();
    setupNativeThemeListener();
    setupAutoUpdater();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
        else {
            mainWindow?.show();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // Don't quit on window close, tray is still active
    }
});
electron_1.app.on('before-quit', () => {
    isQuitting = true;
    if (sidecar) {
        sidecar.shutdown();
    }
});
//# sourceMappingURL=main.js.map