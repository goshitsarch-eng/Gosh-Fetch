import { invoke } from '@tauri-apps/api/core';
import type { Download, DownloadOptions } from '../types/download';

let downloads = $state<Download[]>([]);
let isLoading = $state(false);
let error = $state<string | null>(null);

export function getDownloads() {
  return downloads;
}

export function getIsLoading() {
  return isLoading;
}

export function getError() {
  return error;
}

export function getActiveDownloads() {
  return downloads.filter(d => d.status === 'active' || d.status === 'waiting');
}

export function getCompletedDownloads() {
  return downloads.filter(d => d.status === 'complete');
}

export function getPausedDownloads() {
  return downloads.filter(d => d.status === 'paused');
}

export function getErrorDownloads() {
  return downloads.filter(d => d.status === 'error');
}

export async function refreshDownloads() {
  isLoading = true;
  error = null;
  try {
    downloads = await invoke<Download[]>('get_all_downloads');
  } catch (e) {
    error = e as string;
  } finally {
    isLoading = false;
  }
}

export async function addDownload(url: string, options?: DownloadOptions): Promise<string> {
  const gid = await invoke<string>('add_download', { url, options });
  await refreshDownloads();
  return gid;
}

export async function addUrls(urls: string[], options?: DownloadOptions): Promise<string[]> {
  const gids = await invoke<string[]>('add_urls', { urls, options });
  await refreshDownloads();
  return gids;
}

export async function addTorrentFile(filePath: string, options?: DownloadOptions): Promise<string> {
  const gid = await invoke<string>('add_torrent_file', { filePath, options });
  await refreshDownloads();
  return gid;
}

export async function addMagnet(magnetUri: string, options?: DownloadOptions): Promise<string> {
  const gid = await invoke<string>('add_magnet', { magnetUri, options });
  await refreshDownloads();
  return gid;
}

export async function pauseDownload(gid: string): Promise<void> {
  await invoke('pause_download', { gid });
  await refreshDownloads();
}

export async function pauseAll(): Promise<void> {
  await invoke('pause_all');
  await refreshDownloads();
}

export async function resumeDownload(gid: string): Promise<void> {
  await invoke('resume_download', { gid });
  await refreshDownloads();
}

export async function resumeAll(): Promise<void> {
  await invoke('resume_all');
  await refreshDownloads();
}

export async function removeDownload(gid: string, deleteFiles: boolean = false): Promise<void> {
  await invoke('remove_download', { gid, deleteFiles });
  await refreshDownloads();
}

export async function setSpeedLimit(downloadLimit?: number, uploadLimit?: number): Promise<void> {
  await invoke('set_speed_limit', { downloadLimit, uploadLimit });
}

// Start polling for download updates
let pollingInterval: ReturnType<typeof setInterval> | null = null;

export function startPolling() {
  if (pollingInterval) return;
  pollingInterval = setInterval(refreshDownloads, 1000);
  refreshDownloads();
}

export function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}
