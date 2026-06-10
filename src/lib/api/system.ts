// OS-level helpers backed by Tauri plugins (the non-invoke half of the old
// window.electronAPI surface).
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from '@tauri-apps/plugin-autostart';
import { register as registerScheme, unregister as unregisterScheme, isRegistered as isSchemeRegistered } from '@tauri-apps/plugin-deep-link';
import { exit } from '@tauri-apps/plugin-process';
import { platform } from '@tauri-apps/plugin-os';
import { api } from './commands';

export interface FileFilter {
  name: string;
  extensions: string[];
}

export async function selectFile(filters?: FileFilter[]): Promise<string | null> {
  const result = await openDialog({ multiple: false, directory: false, filters });
  return typeof result === 'string' ? result : null;
}

export async function selectDirectory(): Promise<string | null> {
  const result = await openDialog({ multiple: false, directory: true });
  return typeof result === 'string' ? result : null;
}

export async function showNotification(title: string, body: string): Promise<void> {
  let granted = await isPermissionGranted();
  if (!granted) {
    granted = (await requestPermission()) === 'granted';
  }
  if (granted) {
    sendNotification({ title, body });
  }
}

export async function setRunAtStartup(enabled: boolean): Promise<void> {
  if (enabled) {
    await enableAutostart();
  } else {
    await disableAutostart();
  }
}

export async function getRunAtStartup(): Promise<boolean> {
  try {
    return await isAutostartEnabled();
  } catch {
    return false;
  }
}

/**
 * magnet: protocol registration. On macOS this is install-time (Info.plist);
 * runtime register/unregister works on Windows and Linux only.
 */
export async function setMagnetHandler(enabled: boolean): Promise<boolean> {
  try {
    if (enabled) {
      await registerScheme('magnet');
    } else {
      await unregisterScheme('magnet');
    }
    return true;
  } catch {
    return false;
  }
}

export async function isMagnetHandler(): Promise<boolean> {
  try {
    return await isSchemeRegistered('magnet');
  } catch {
    return false;
  }
}

/** Run an on-completion action: close the app, sleep, or shut down. */
export async function performSystemAction(
  action: 'nothing' | 'close' | 'sleep' | 'shutdown',
  forceCloseApps: boolean
): Promise<boolean> {
  if (action === 'nothing') return false;
  if (action === 'close') {
    await exit(0);
    return true;
  }
  await api.performSystemAction(action, forceCloseApps);
  return true;
}

export function getPlatform(): string {
  try {
    return platform();
  } catch {
    return 'unknown';
  }
}
