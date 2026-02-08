import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Notification,
  Tray,
  Menu,
  nativeImage,
} from 'electron';
import path from 'path';
import { SidecarManager } from './sidecar';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let sidecar: SidecarManager | null = null;
let closeToTray = true;
let isQuitting = false;

// Single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

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
]);

function getSidecarPath(): string {
  const isDev = !app.isPackaged;
  const binaryName =
    process.platform === 'win32' ? 'gosh-fetch-engine.exe' : 'gosh-fetch-engine';

  if (isDev) {
    // In development, look for the binary in src-rust/target/debug or release
    return path.join(
      app.getAppPath(),
      'src-rust',
      'target',
      'debug',
      binaryName
    );
  }

  // In production, the binary is bundled alongside the app
  return path.join(process.resourcesPath, 'bin', binaryName);
}

function getTrayIconPath(): string {
  const isDev = !app.isPackaged;
  if (isDev) {
    return path.join(app.getAppPath(), 'src-rust', 'icons', 'tray-icon.png');
  }
  return path.join(process.resourcesPath, 'icons', 'tray-icon.png');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Gosh-Fetch',
    icon: getTrayIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Close-to-tray logic
  mainWindow.on('close', (event) => {
    if (!isQuitting && closeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load the app
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function createTray(): void {
  const iconPath = getTrayIconPath();
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 22, height: 22 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide Window',
      click: () => {
        if (mainWindow?.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow?.show();
          mainWindow?.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Pause All',
      click: () => {
        sidecar?.invoke('pause_all').catch(console.error);
      },
    },
    {
      label: 'Resume All',
      click: () => {
        sidecar?.invoke('resume_all').catch(console.error);
      },
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send('rpc-event', 'navigate', '/settings');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('Gosh-Fetch');

  // Left-click toggles window
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

function setupSidecar(): void {
  const sidecarPath = getSidecarPath();
  let restartCount = 0;
  const maxRestarts = 3;

  function startSidecar(): void {
    sidecar = new SidecarManager();
    console.log('Starting sidecar at:', sidecarPath);

    try {
      sidecar.spawn(sidecarPath);
    } catch (err) {
      console.error('Failed to spawn sidecar:', err);
      notifyEngineStatus(false, false);
      return;
    }

    // Forward sidecar events to renderer
    sidecar.onEvent((event: string, data: any) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('rpc-event', event, data);
      }

      // Update tray tooltip with speed stats
      if (event === 'global-stats' && tray) {
        const dl = formatSpeed(data.downloadSpeed || 0);
        const ul = formatSpeed(data.uploadSpeed || 0);
        const active = data.numActive || 0;
        tray.setToolTip(`Gosh-Fetch\n↓ ${dl}  ↑ ${ul}\n${active} active`);
      }
    });

    sidecar.on('exit', (code: number) => {
      console.error('Sidecar exited unexpectedly with code:', code);
      if (!isQuitting && restartCount < maxRestarts) {
        restartCount++;
        const delay = Math.pow(2, restartCount - 1) * 1000; // 1s, 2s, 4s
        console.log(`Attempting sidecar restart ${restartCount}/${maxRestarts} in ${delay}ms...`);
        notifyEngineStatus(false, true);
        setTimeout(() => {
          startSidecar();
        }, delay);
      } else if (!isQuitting) {
        console.error('Max sidecar restarts reached, giving up');
        notifyEngineStatus(false, false);
      }
    });
  }

  function notifyEngineStatus(connected: boolean, restarting: boolean): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('rpc-event', 'engine-status', { connected, restarting });
    }
  }

  startSidecar();
}

function formatSpeed(bytesPerSec: number): string {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;

  if (bytesPerSec >= GB) return `${(bytesPerSec / GB).toFixed(1)} GB/s`;
  if (bytesPerSec >= MB) return `${(bytesPerSec / MB).toFixed(1)} MB/s`;
  if (bytesPerSec >= KB) return `${(bytesPerSec / KB).toFixed(1)} KB/s`;
  return `${bytesPerSec} B/s`;
}

function setupIPC(): void {
  // Forward RPC calls to sidecar
  ipcMain.handle('rpc-invoke', async (_event, method: string, params?: any) => {
    if (!ALLOWED_RPC_METHODS.has(method)) {
      throw new Error(`Unauthorized RPC method: ${method}`);
    }
    if (!sidecar) throw new Error('Sidecar not running');

    const result = await sidecar.invoke(method, params);

    // Track close_to_tray setting
    if (method === 'set_close_to_tray' && params?.value !== undefined) {
      closeToTray = params.value;
    }

    return result;
  });

  // File dialog
  ipcMain.handle('select-file', async (_event, options?: any) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: options?.filters || [],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Directory dialog
  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Notification
  ipcMain.handle('show-notification', (_event, title: string, body: string) => {
    new Notification({ title, body }).show();
  });
}

// App lifecycle
app.whenReady().then(() => {
  setupSidecar();
  createWindow();
  createTray();
  setupIPC();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit on window close, tray is still active
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (sidecar) {
    sidecar.shutdown();
  }
});
