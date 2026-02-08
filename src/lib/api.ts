import type { Download, DownloadOptions, GlobalStats, TorrentInfo, MagnetInfo } from './types/download';

interface Settings {
  download_path: string;
  max_concurrent_downloads: number;
  max_connections_per_server: number;
  split_count: number;
  download_speed_limit: number;
  upload_speed_limit: number;
  user_agent: string;
  enable_notifications: boolean;
  close_to_tray: boolean;
  theme: string;
  bt_enable_dht: boolean;
  bt_enable_pex: boolean;
  bt_enable_lpd: boolean;
  bt_max_peers: number;
  bt_seed_ratio: number;
  auto_update_trackers: boolean;
  delete_files_on_remove: boolean;
}

function invoke<T = any>(method: string, params?: any): Promise<T> {
  return window.electronAPI.invoke(method, params);
}

export const api = {
  // Download commands
  addDownload: (url: string, options?: DownloadOptions) =>
    invoke<string>('add_download', { url, options }),
  addUrls: (urls: string[], options?: DownloadOptions) =>
    invoke<string[]>('add_urls', { urls, options }),
  pauseDownload: (gid: string) =>
    invoke<void>('pause_download', { gid }),
  pauseAll: () =>
    invoke<void>('pause_all'),
  resumeDownload: (gid: string) =>
    invoke<void>('resume_download', { gid }),
  resumeAll: () =>
    invoke<void>('resume_all'),
  removeDownload: (gid: string, deleteFiles: boolean = false) =>
    invoke<void>('remove_download', { gid, deleteFiles }),
  getDownloadStatus: (gid: string) =>
    invoke<Download>('get_download_status', { gid }),
  getAllDownloads: () =>
    invoke<Download[]>('get_all_downloads'),
  getActiveDownloads: () =>
    invoke<Download[]>('get_active_downloads'),
  getGlobalStats: () =>
    invoke<GlobalStats>('get_global_stats'),
  setSpeedLimit: (downloadLimit?: number, uploadLimit?: number) =>
    invoke<void>('set_speed_limit', { downloadLimit, uploadLimit }),

  // Torrent commands
  addTorrentFile: (filePath: string, options?: DownloadOptions) =>
    invoke<string>('add_torrent_file', { filePath, options }),
  addMagnet: (magnetUri: string, options?: DownloadOptions) =>
    invoke<string>('add_magnet', { magnetUri, options }),
  getTorrentFiles: (gid: string) =>
    invoke<any[]>('get_torrent_files', { gid }),
  selectTorrentFiles: (gid: string, fileIndices: number[]) =>
    invoke<void>('select_torrent_files', { gid, fileIndices }),
  parseTorrentFile: (filePath: string) =>
    invoke<TorrentInfo>('parse_torrent_file', { filePath }),
  parseMagnetUri: (magnetUri: string) =>
    invoke<MagnetInfo>('parse_magnet_uri', { magnetUri }),
  getPeers: (gid: string) =>
    invoke<any[]>('get_peers', { gid }),

  // Settings commands
  getSettings: () =>
    invoke<Settings>('get_settings'),
  updateSettings: (settings: Settings) =>
    invoke<void>('update_settings', { settings }),
  setCloseToTray: (value: boolean) =>
    invoke<void>('set_close_to_tray', { value }),
  setUserAgent: (userAgent: string) =>
    invoke<void>('set_user_agent', { userAgent }),
  getTrackerList: () =>
    invoke<string[]>('get_tracker_list'),
  updateTrackerList: () =>
    invoke<string[]>('update_tracker_list'),
  applySettingsToEngine: (settings: Settings) =>
    invoke<void>('apply_settings_to_engine', { settings }),
  getUserAgentPresets: () =>
    invoke<[string, string][]>('get_user_agent_presets'),

  // System commands
  getEngineVersion: () =>
    invoke<{ name: string; version: string; running: boolean }>('get_engine_version'),
  openDownloadFolder: (path: string) =>
    invoke<void>('open_download_folder', { path }),
  openFileLocation: (filePath: string) =>
    invoke<void>('open_file_location', { filePath }),
  getDefaultDownloadPath: () =>
    invoke<string>('get_default_download_path'),
  getAppVersion: () =>
    invoke<string>('get_app_version'),
  getAppInfo: () =>
    invoke<any>('get_app_info'),

  // Database commands
  dbGetCompletedHistory: () =>
    invoke<Download[]>('db_get_completed_history'),
  dbSaveDownload: (download: Download) =>
    invoke<void>('db_save_download', { download }),
  dbRemoveDownload: (gid: string) =>
    invoke<void>('db_remove_download', { gid }),
  dbClearHistory: () =>
    invoke<void>('db_clear_history'),
  dbGetSettings: () =>
    invoke<Settings>('db_get_settings'),
  dbSaveSettings: (settings: Settings) =>
    invoke<void>('db_save_settings', { settings }),
  dbLoadIncomplete: () =>
    invoke<Download[]>('db_load_incomplete'),
};

export type { Settings };
