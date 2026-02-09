# Gosh-Fetch API Reference

This document covers the IPC methods available between the React frontend and the Rust sidecar, along with the Electron-specific IPC methods handled by the main process.

All frontend calls go through `window.electronAPI.invoke(method, params)`, which is defined in the preload script and wraps `ipcRenderer.invoke('rpc-invoke', method, params)`. The convenience wrappers in `src/lib/api.ts` provide typed access to every method.

## RPC Methods (Sidecar)

These methods are forwarded from the Electron main process to the Rust sidecar via JSON-RPC over stdin/stdout. Each must appear in the `ALLOWED_RPC_METHODS` set in `src-electron/main.ts`.

---

### Download Commands

#### add_download

Add an HTTP/HTTPS download. URLs are validated server-side: only `http://`, `https://`, and `magnet:` schemes are accepted, private IPs are blocked, and the maximum URL length is 8192 characters.

```typescript
api.addDownload(url: string, options?: DownloadOptions): Promise<string>
```

Returns the download GID (a unique identifier string).

#### add_urls

Add multiple downloads at once. All URLs are validated.

```typescript
api.addUrls(urls: string[], options?: DownloadOptions): Promise<string[]>
```

Returns an array of GIDs.

#### pause_download

```typescript
api.pauseDownload(gid: string): Promise<void>
```

#### pause_all

```typescript
api.pauseAll(): Promise<void>
```

#### resume_download

```typescript
api.resumeDownload(gid: string): Promise<void>
```

#### resume_all

```typescript
api.resumeAll(): Promise<void>
```

#### remove_download

```typescript
api.removeDownload(gid: string, deleteFiles?: boolean): Promise<void>
```

If `deleteFiles` is true, the downloaded file is deleted from disk.

#### get_download_status

```typescript
api.getDownloadStatus(gid: string): Promise<Download>
```

#### get_all_downloads

```typescript
api.getAllDownloads(): Promise<Download[]>
```

Returns all downloads including active, waiting, paused, and error states.

#### get_active_downloads

```typescript
api.getActiveDownloads(): Promise<Download[]>
```

#### get_global_stats

```typescript
api.getGlobalStats(): Promise<GlobalStats>
```

#### set_speed_limit

```typescript
api.setSpeedLimit(downloadLimit?: number, uploadLimit?: number): Promise<void>
```

Values are in bytes per second. Omit or pass `null` for unlimited.

---

### Torrent Commands

#### add_torrent_file

Add a download from a `.torrent` file. The file path is validated: it must end with `.torrent` and exist on disk.

```typescript
api.addTorrentFile(filePath: string, options?: DownloadOptions): Promise<string>
```

#### add_magnet

```typescript
api.addMagnet(magnetUri: string, options?: DownloadOptions): Promise<string>
```

#### get_torrent_files

Get the file list for a torrent download.

```typescript
api.getTorrentFiles(gid: string): Promise<DownloadFile[]>
```

#### select_torrent_files

Select which files to download from a multi-file torrent.

```typescript
api.selectTorrentFiles(gid: string, fileIndices: number[]): Promise<void>
```

#### parse_torrent_file

Parse a `.torrent` file without adding it as a download. Useful for previewing contents.

```typescript
api.parseTorrentFile(filePath: string): Promise<TorrentInfo>
```

#### parse_magnet_uri

Parse a magnet URI without adding it.

```typescript
api.parseMagnetUri(magnetUri: string): Promise<MagnetInfo>
```

#### get_peers

Get connected peer information for a torrent download.

```typescript
api.getPeers(gid: string): Promise<PeerInfo[]>
```

---

### Settings Commands

#### get_settings

Get the current runtime settings from the engine.

```typescript
api.getSettings(): Promise<Settings>
```

#### update_settings

Update all settings at once.

```typescript
api.updateSettings(settings: Settings): Promise<void>
```

#### apply_settings_to_engine

Apply settings to the running download engine. Call this after saving settings to make them take effect immediately.

```typescript
api.applySettingsToEngine(settings: Settings): Promise<void>
```

#### set_close_to_tray

```typescript
api.setCloseToTray(value: boolean): Promise<void>
```

#### set_user_agent

```typescript
api.setUserAgent(userAgent: string): Promise<void>
```

#### get_user_agent_presets

Returns an array of `[name, userAgentString]` tuples. Available presets: gosh-dl (default), Chrome (Windows), Chrome (macOS), Firefox (Windows), Firefox (Linux), Wget, Curl.

```typescript
api.getUserAgentPresets(): Promise<[string, string][]>
```

#### get_tracker_list

Fetch the cached tracker list. If the cache is stale, fetches from the remote source.

```typescript
api.getTrackerList(): Promise<string[]>
```

#### update_tracker_list

Force-fetch and update the tracker list from the remote source.

```typescript
api.updateTrackerList(): Promise<string[]>
```

---

### Priority and Scheduling

#### set_priority

Set the download priority for a specific download.

```typescript
api.setPriority(gid: string, priority: string): Promise<void>
```

Priority values: `"low"`, `"normal"`, `"high"`, `"critical"`.

#### get_schedule_rules

```typescript
api.getScheduleRules(): Promise<ScheduleRule[]>
```

#### set_schedule_rules

```typescript
api.setScheduleRules(rules: ScheduleRule[]): Promise<void>
```

---

### Database Commands

These methods read from and write to the SQLite database directly, bypassing the download engine.

#### db_get_completed_history

```typescript
api.dbGetCompletedHistory(): Promise<Download[]>
```

#### db_save_download

```typescript
api.dbSaveDownload(download: Download): Promise<void>
```

#### db_remove_download

```typescript
api.dbRemoveDownload(gid: string): Promise<void>
```

#### db_clear_history

```typescript
api.dbClearHistory(): Promise<void>
```

#### db_get_settings

```typescript
api.dbGetSettings(): Promise<Settings>
```

#### db_save_settings

```typescript
api.dbSaveSettings(settings: Settings): Promise<void>
```

#### db_load_incomplete

Load incomplete downloads from the database for restoration on app startup.

```typescript
api.dbLoadIncomplete(): Promise<Download[]>
```

---

### System Commands

#### get_engine_version

```typescript
api.getEngineVersion(): Promise<{ name: string; version: string; running: boolean }>
```

#### open_download_folder

Open a directory in the system file manager. The path is validated and canonicalized before being passed to the OS.

```typescript
api.openDownloadFolder(path: string): Promise<void>
```

#### open_file_location

Open the containing folder of a file and select it.

```typescript
api.openFileLocation(filePath: string): Promise<void>
```

#### get_default_download_path

```typescript
api.getDefaultDownloadPath(): Promise<string>
```

#### get_app_version

```typescript
api.getAppVersion(): Promise<string>
```

#### get_app_info

```typescript
api.getAppInfo(): Promise<AppInfo>
```

Returns:
```json
{
  "name": "Gosh-Fetch",
  "version": "1.1.1",
  "description": "...",
  "license": "AGPL-3.0",
  "repository": "https://github.com/goshitsarch-eng/Gosh-Fetch",
  "engine": {
    "name": "gosh-dl",
    "version": "0.2.2",
    "url": "https://github.com/goshitsarch-eng/gosh-dl",
    "license": "MIT"
  }
}
```

---

## Electron-Only IPC Methods

These are handled directly by the Electron main process, not forwarded to the sidecar. They are exposed on `window.electronAPI` via the preload script.

#### selectFile

Open a native file picker dialog.

```typescript
window.electronAPI.selectFile(options?: { filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>
```

#### selectDirectory

Open a native directory picker dialog.

```typescript
window.electronAPI.selectDirectory(): Promise<string | null>
```

#### showNotification

Show a native OS notification.

```typescript
window.electronAPI.showNotification(title: string, body: string): Promise<void>
```

#### getNativeTheme

Check whether the OS is using dark mode.

```typescript
window.electronAPI.getNativeTheme(): Promise<boolean>
```

Returns `true` if the OS dark mode is active.

#### getDiskSpace

Get total and free disk space for a given path (defaults to the system Downloads directory).

```typescript
window.electronAPI.getDiskSpace(path?: string): Promise<{ total: number; free: number }>
```

#### setLoginItemSettings / getLoginItemSettings

Configure whether the app starts at OS login.

```typescript
window.electronAPI.setLoginItemSettings(openAtLogin: boolean): Promise<void>
window.electronAPI.getLoginItemSettings(): Promise<{ openAtLogin: boolean }>
```

#### setDefaultProtocolClient / removeDefaultProtocolClient / isDefaultProtocolClient

Manage protocol handler registration (e.g., `magnet:` links).

```typescript
window.electronAPI.setDefaultProtocolClient(protocol: string): Promise<boolean>
window.electronAPI.removeDefaultProtocolClient(protocol: string): Promise<boolean>
window.electronAPI.isDefaultProtocolClient(protocol: string): Promise<boolean>
```

#### importSettingsFile

Open a file dialog for a JSON settings file and return its parsed contents.

```typescript
window.electronAPI.importSettingsFile(): Promise<any | null>
```

#### updaterDownload / updaterInstall

Control the auto-update process.

```typescript
window.electronAPI.updaterDownload(): Promise<void>
window.electronAPI.updaterInstall(): Promise<void>
```

---

## Events

Events flow from the sidecar and Electron main process to the renderer via `window.electronAPI.onEvent(callback)`. The callback receives `(eventName: string, data: any)`.

### Sidecar Events

| Event | Data | Description |
|-------|------|-------------|
| `global-stats` | `GlobalStats` | Emitted every second with speed/count stats |
| `download:added` | `{ gid, name, ... }` | A new download was added |
| `download:started` | `{ gid, ... }` | Download started actively transferring |
| `download:progress` | `{ gid, completedSize, totalSize, speed, ... }` | Progress update |
| `download:state-changed` | `{ gid, state, ... }` | Generic state change |
| `download:completed` | `{ gid, name, ... }` | Download finished successfully |
| `download:failed` | `{ gid, name, error, ... }` | Download encountered an error |
| `download:removed` | `{ gid, ... }` | Download was removed |
| `download:paused` | `{ gid, ... }` | Download was paused |
| `download:resumed` | `{ gid, ... }` | Download was resumed |

### Electron Events

| Event | Data | Description |
|-------|------|-------------|
| `engine-status` | `{ connected: boolean, restarting: boolean }` | Engine connection state changed |
| `native-theme-changed` | `{ shouldUseDarkColors: boolean }` | OS dark mode toggled |
| `navigate` | `string` (path) | Navigate to a route (triggered from tray) |
| `open-add-modal` | `{}` | Open the add download modal (triggered from tray) |
| `open-magnet` | `{ uri: string }` | A magnet link was opened externally |
| `open-torrent-file` | `{ path: string }` | A .torrent file was opened externally |
| `update-available` | `{ version, releaseName, releaseNotes, releaseDate }` | An update is available |
| `update-progress` | `{ total, transferred, percent, bytesPerSecond }` | Update download progress |
| `update-downloaded` | `{}` | Update has been downloaded and is ready to install |

---

## Types

### DownloadOptions

Configuration options when adding a download. All fields are optional.

```typescript
interface DownloadOptions {
  dir?: string;                    // Save directory
  out?: string;                    // Output filename
  split?: string;                  // Number of segments
  maxConnectionPerServer?: string; // Connections per server
  userAgent?: string;              // HTTP user agent
  referer?: string;                // HTTP referer header
  header?: string[];               // Custom headers ["Key: Value"]
  selectFile?: string;             // Torrent file indices "1,2,3"
  btTracker?: string;              // Additional tracker URL
  seedRatio?: string;              // Seed ratio for torrents
  maxDownloadLimit?: string;       // Download speed limit (bytes/sec)
  maxUploadLimit?: string;         // Upload speed limit (bytes/sec)
  priority?: string;               // "low" | "normal" | "high" | "critical"
  checksum?: string;               // "sha256:hex..." or "md5:hex..."
  mirrors?: string[];              // Mirror/failover URLs
  sequential?: boolean;            // Sequential download mode
}
```

### Download

```typescript
interface Download {
  id: number;                      // Database ID
  gid: string;                     // Engine GID (unique identifier)
  name: string;                    // Display name
  url: string | null;              // Source URL (HTTP downloads)
  magnetUri: string | null;        // Magnet link (torrents)
  infoHash: string | null;         // BitTorrent info hash
  downloadType: 'http' | 'torrent' | 'magnet';
  status: 'active' | 'waiting' | 'paused' | 'complete' | 'error' | 'removed';
  appState?: AppDownloadState;     // Rich state info (retrying, stalled, etc.)
  totalSize: number;               // Total bytes
  completedSize: number;           // Downloaded bytes
  downloadSpeed: number;           // Bytes per second
  uploadSpeed: number;             // Bytes per second
  savePath: string;                // Save directory
  createdAt: string;               // ISO 8601 timestamp
  completedAt: string | null;      // ISO 8601 timestamp
  errorMessage: string | null;     // Error description
  connections: number;             // Active connections
  seeders: number;                 // Connected seeders (torrents)
  selectedFiles: number[] | null;  // Selected file indices (torrents)
}

interface AppDownloadState {
  state: 'queued' | 'downloading' | 'stalled' | 'paused' | 'completed' | 'error' | 'retrying';
  kind?: ErrorKind;
  message?: string;
  attempt?: number;
  maxAttempts?: number;
}

type ErrorKind = 'network_error' | 'file_error' | 'not_found' | 'timeout'
              | 'auth_required' | 'already_exists' | 'resume_not_supported' | 'unknown';
```

### GlobalStats

```typescript
interface GlobalStats {
  downloadSpeed: number;           // Total download speed (bytes/sec)
  uploadSpeed: number;             // Total upload speed (bytes/sec)
  numActive: number;               // Active download count
  numWaiting: number;              // Queued download count
  numStopped: number;              // Stopped download count
}
```

Note: The Rust backend also includes `numStoppedTotal` (total stopped count across all time), but the frontend type does not currently use it.

### TorrentInfo

```typescript
interface TorrentInfo {
  name: string;
  infoHash: string;
  totalSize: number;
  files: TorrentFile[];
  comment: string | null;
  creationDate: number | null;     // Unix timestamp
  announceList: string[];          // Tracker URLs
}

interface TorrentFile {
  index: number;
  path: string;
  length: number;                  // File size in bytes
  selected: boolean;
}
```

### MagnetInfo

```typescript
interface MagnetInfo {
  name: string | null;
  infoHash: string;
  trackers: string[];
}
```

### Settings

The settings object uses snake_case keys (matching the database column naming convention).

```typescript
interface Settings {
  download_path: string;            // Default save directory
  max_concurrent_downloads: number; // 1-20, default 5
  max_connections_per_server: number; // 1-16, default 8
  split_count: number;              // Segments per download, default 8
  download_speed_limit: number;     // Global download limit, 0 = unlimited
  upload_speed_limit: number;       // Global upload limit, 0 = unlimited
  user_agent: string;               // HTTP user agent
  enable_notifications: boolean;    // Show completion notifications
  close_to_tray: boolean;          // Minimize to tray on close
  theme: string;                    // 'dark' | 'light' | 'system'
  bt_enable_dht: boolean;          // BitTorrent DHT
  bt_enable_pex: boolean;          // BitTorrent Peer Exchange
  bt_enable_lpd: boolean;          // Local Peer Discovery
  bt_max_peers: number;            // Max peers per torrent, default 55
  bt_seed_ratio: number;           // Seed ratio, default 1.0
  auto_update_trackers: boolean;   // Auto-fetch tracker lists
  delete_files_on_remove: boolean; // Delete files when removing download
  proxy_url: string;               // HTTP/SOCKS proxy URL (empty = none)
  connect_timeout: number;         // Connection timeout in seconds, default 30
  read_timeout: number;            // Read timeout in seconds, default 60
  max_retries: number;             // Max retry attempts, default 3
  allocation_mode: string;         // 'none' | 'sparse' | 'full', default 'sparse'
}
```
