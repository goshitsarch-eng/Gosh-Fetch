import { invoke } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';
import type { Download, DownloadOptions } from '../types/download';

let downloads = $state<Download[]>([]);
let completedHistory = $state<Download[]>([]);
let isLoading = $state(false);
let error = $state<string | null>(null);

// Track GIDs we've already saved to avoid duplicates
const savedGids = new Set<string>();

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
  // Combine engine completed downloads with history from database
  const engineCompleted = downloads.filter(d => d.status === 'complete');
  const engineGids = new Set(engineCompleted.map(d => d.gid));

  // Add history items that aren't in engine's list
  const historyOnly = completedHistory.filter(d => !engineGids.has(d.gid));

  return [...engineCompleted, ...historyOnly];
}

export function getPausedDownloads() {
  return downloads.filter(d => d.status === 'paused');
}

export function getErrorDownloads() {
  return downloads.filter(d => d.status === 'error');
}

interface DownloadRow {
  id: number;
  gid: string;
  name: string;
  url: string | null;
  magnet_uri: string | null;
  info_hash: string | null;
  download_type: string;
  status: string;
  total_size: number;
  completed_size: number;
  download_speed: number;
  upload_speed: number;
  save_path: string;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  selected_files: string | null;
}

function rowToDownload(row: DownloadRow): Download {
  return {
    id: row.id,
    gid: row.gid,
    name: row.name,
    url: row.url,
    magnetUri: row.magnet_uri,
    infoHash: row.info_hash,
    downloadType: row.download_type as any,
    status: row.status as any,
    totalSize: row.total_size,
    completedSize: row.completed_size,
    downloadSpeed: row.download_speed,
    uploadSpeed: row.upload_speed,
    savePath: row.save_path,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
    connections: 0,
    seeders: 0,
    selectedFiles: row.selected_files ? JSON.parse(row.selected_files) : null,
  };
}

async function loadCompletedHistory() {
  try {
    const db = await Database.load('sqlite:gosh-fetch.db');
    const rows = await db.select<DownloadRow[]>(
      'SELECT * FROM downloads WHERE status = ? ORDER BY completed_at DESC LIMIT 100',
      ['complete']
    );
    completedHistory = rows.map(rowToDownload);
    // Track saved GIDs
    for (const d of completedHistory) {
      savedGids.add(d.gid);
    }
  } catch (e) {
    console.error('Failed to load completed history:', e);
  }
}

async function saveCompletedDownload(download: Download) {
  if (savedGids.has(download.gid)) return;

  try {
    const db = await Database.load('sqlite:gosh-fetch.db');
    await db.execute(
      `INSERT OR REPLACE INTO downloads
       (gid, name, url, magnet_uri, info_hash, download_type, status, total_size, completed_size,
        download_speed, upload_speed, save_path, created_at, completed_at, error_message, selected_files)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`,
      [
        download.gid,
        download.name,
        download.url,
        download.magnetUri,
        download.infoHash,
        download.downloadType,
        download.status,
        download.totalSize,
        download.completedSize,
        download.downloadSpeed,
        download.uploadSpeed,
        download.savePath,
        download.createdAt,
        download.errorMessage,
        download.selectedFiles ? JSON.stringify(download.selectedFiles) : null,
      ]
    );
    savedGids.add(download.gid);
  } catch (e) {
    console.error('Failed to save completed download:', e);
  }
}

export async function refreshDownloads() {
  isLoading = true;
  error = null;
  try {
    const engineDownloads = await invoke<Download[]>('get_all_downloads');

    // Save any newly completed downloads to database
    for (const d of engineDownloads) {
      if (d.status === 'complete' && !savedGids.has(d.gid)) {
        await saveCompletedDownload(d);
      }
    }

    downloads = engineDownloads;
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

export async function removeFromHistory(gid: string): Promise<void> {
  try {
    const db = await Database.load('sqlite:gosh-fetch.db');
    await db.execute('DELETE FROM downloads WHERE gid = ?', [gid]);
    savedGids.delete(gid);
    completedHistory = completedHistory.filter(d => d.gid !== gid);
  } catch (e) {
    console.error('Failed to remove from history:', e);
  }
}

export async function clearHistory(): Promise<void> {
  try {
    const db = await Database.load('sqlite:gosh-fetch.db');
    await db.execute('DELETE FROM downloads WHERE status = ?', ['complete']);
    savedGids.clear();
    completedHistory = [];
  } catch (e) {
    console.error('Failed to clear history:', e);
  }
}

// Start polling for download updates
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let historyLoaded = false;

export async function startPolling() {
  if (pollingInterval) return;

  // Load completed history from database on first start
  if (!historyLoaded) {
    await loadCompletedHistory();
    historyLoaded = true;
  }

  pollingInterval = setInterval(refreshDownloads, 1000);
  refreshDownloads();
}

export function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}
