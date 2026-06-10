// Typed wrappers for the Tauri backend commands. Command and argument names
// match the Rust #[tauri::command] layer (JS camelCase args are converted to
// Rust snake_case automatically by Tauri).
import { invoke } from '@tauri-apps/api/core';
import type {
  Download,
  DownloadOptions,
  GlobalStats,
  TorrentInfo,
  MagnetInfo,
} from '../types/download';
import type { Settings } from '../types/settings';
import type { MirrorJob, MirrorManifest, MirrorOptions } from '../types/mirror';

export interface BatchResult {
  succeeded: string[];
  skipped: string[];
  failed: { id: string; error: string }[];
}

export const api = {
  // Download commands
  addDownload: (url: string, options?: DownloadOptions) =>
    invoke<string>('add_download', { url, options }),
  addUrls: (urls: string[], options?: DownloadOptions) =>
    invoke<string[]>('add_urls', { urls, options }),
  pauseDownload: (gid: string) => invoke<void>('pause_download', { gid }),
  pauseAll: () => invoke<BatchResult>('pause_all'),
  resumeDownload: (gid: string) => invoke<void>('resume_download', { gid }),
  resumeAll: () => invoke<BatchResult>('resume_all'),
  cancelAll: (deleteFiles: boolean = false) =>
    invoke<BatchResult>('cancel_all', { deleteFiles }),
  removeDownload: (gid: string, deleteFiles: boolean = false) =>
    invoke<void>('remove_download', { gid, deleteFiles }),
  getDownloadStatus: (gid: string) => invoke<Download>('get_download_status', { gid }),
  getAllDownloads: () => invoke<Download[]>('get_all_downloads'),
  getActiveDownloads: () => invoke<Download[]>('get_active_downloads'),
  getGlobalStats: () => invoke<GlobalStats>('get_global_stats'),
  setSpeedLimit: (downloadLimit?: number, uploadLimit?: number) =>
    invoke<void>('set_speed_limit', { downloadLimit, uploadLimit }),

  // Torrent commands
  addTorrentFile: (filePath: string, options?: DownloadOptions) =>
    invoke<string>('add_torrent_file', { filePath, options }),
  addMagnet: (magnetUri: string, options?: DownloadOptions) =>
    invoke<string>('add_magnet', { magnetUri, options }),
  getTorrentFiles: (gid: string) => invoke<any[]>('get_torrent_files', { gid }),
  selectTorrentFiles: (gid: string, fileIndices: number[]) =>
    invoke<void>('select_torrent_files', { gid, fileIndices }),
  parseTorrentFile: (filePath: string) =>
    invoke<TorrentInfo>('parse_torrent_file', { filePath }),
  parseMagnetUri: (magnetUri: string) =>
    invoke<MagnetInfo>('parse_magnet_uri', { magnetUri }),
  getPeers: (gid: string) => invoke<any[]>('get_peers', { gid }),

  // Recursive mirroring commands
  discoverRecursive: (url: string, options?: DownloadOptions, recursive?: MirrorOptions) =>
    invoke<MirrorManifest>('discover_recursive', { url, options, recursive }),
  addRecursive: (url: string, options?: DownloadOptions, recursive?: MirrorOptions) =>
    invoke<MirrorJob>('add_recursive', { url, options, recursive }),
  listRecursiveJobs: () => invoke<MirrorJob[]>('list_recursive_jobs'),
  getRecursiveJob: (id: string) => invoke<MirrorJob>('get_recursive_job', { id }),
  cancelRecursiveJob: (id: string, deleteFiles: boolean = false) =>
    invoke<void>('cancel_recursive_job', { id, deleteFiles }),
  removeRecursiveJob: (id: string, deleteFiles: boolean = false) =>
    invoke<void>('remove_recursive_job', { id, deleteFiles }),

  // Settings commands
  getSettings: () => invoke<Settings>('get_settings'),
  updateSettings: (settings: Settings) => invoke<void>('update_settings', { settings }),
  setCloseToTray: (value: boolean) => invoke<void>('set_close_to_tray', { value }),
  setUserAgent: (userAgent: string) => invoke<void>('set_user_agent', { userAgent }),
  getTrackerList: () => invoke<string[]>('get_tracker_list'),
  updateTrackerList: () => invoke<string[]>('update_tracker_list'),
  applySettingsToEngine: (settings: Settings) =>
    invoke<void>('apply_settings_to_engine', { settings }),
  getUserAgentPresets: () => invoke<[string, string][]>('get_user_agent_presets'),

  // Priority and scheduling
  setPriority: (gid: string, priority: string) =>
    invoke<void>('set_priority', { gid, priority }),
  getScheduleRules: () => invoke<any[]>('get_schedule_rules'),
  setScheduleRules: (rules: any[]) => invoke<void>('set_schedule_rules', { rules }),

  // System commands
  getEngineVersion: () =>
    invoke<{ name: string; version: string; running: boolean }>('get_engine_version'),
  openDownloadFolder: (path: string) => invoke<void>('open_download_folder', { path }),
  openFileLocation: (filePath: string) => invoke<void>('open_file_location', { filePath }),
  getDefaultDownloadPath: () => invoke<string>('get_default_download_path'),
  getAppVersion: () => invoke<string>('get_app_version'),
  getAppInfo: () => invoke<any>('get_app_info'),
  getDiskSpace: (path?: string) =>
    invoke<{ total: number; free: number }>('get_disk_space', { path }),
  performSystemAction: (action: 'sleep' | 'shutdown' | 'close', forceCloseApps: boolean = false) =>
    invoke<void>('perform_system_action', { action, forceCloseApps }),
  readSettingsJson: (path: string) => invoke<any>('read_settings_json', { path }),
  getPendingOpenRequests: () =>
    invoke<({ kind: 'magnet'; uri: string } | { kind: 'torrentFile'; path: string })[]>(
      'get_pending_open_requests'
    ),

  // Database commands
  dbGetCompletedHistory: () => invoke<Download[]>('db_get_completed_history'),
  dbSaveDownload: (download: Download) => invoke<void>('db_save_download', { download }),
  dbRemoveDownload: (gid: string) => invoke<void>('db_remove_download', { gid }),
  dbClearHistory: () => invoke<void>('db_clear_history'),
  dbGetSettings: () => invoke<Settings>('db_get_settings'),
  dbSaveSettings: (settings: Settings) => invoke<void>('db_save_settings', { settings }),
  dbLoadIncomplete: () => invoke<Download[]>('db_load_incomplete'),
};

export type { Settings };
