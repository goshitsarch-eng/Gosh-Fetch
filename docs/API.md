# Gosh-Fetch API Reference

This document covers the Tauri commands available between the Svelte frontend and the Rust backend, along with the plugin-backed helpers for native OS functionality.

All frontend calls go through `invoke(command, params)` from `@tauri-apps/api/core`. Command names are unchanged from the 2.x RPC methods, and camelCase argument keys are converted to the Rust handlers' snake_case parameters automatically by Tauri. The convenience wrappers in `src/lib/api/commands.ts` provide typed access to every command:

```typescript
import { invoke } from '@tauri-apps/api/core';

const gid = await invoke<string>('add_download', { url, options });
// or, equivalently, via the typed wrapper:
const gid = await api.addDownload(url, options);
```

Events are received with `listen(name, handler)` from `@tauri-apps/api/event` (see [Events](#events)).

## Tauri Commands

These commands are implemented as `#[tauri::command]` functions in `src-tauri/src/api.rs`, which delegate to the handlers in `src-tauri/src/commands/`. Only commands registered in the `invoke_handler` are callable from the webview.

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

Pause all downloads, including queued ones.

```typescript
api.pauseAll(): Promise<BatchResult>
```

Returns a [`BatchResult`](#batchresult) with per-download outcomes (changed in 3.0.0; previously returned nothing).

#### resume_download

```typescript
api.resumeDownload(gid: string): Promise<void>
```

#### resume_all

```typescript
api.resumeAll(): Promise<BatchResult>
```

Returns a [`BatchResult`](#batchresult) with per-download outcomes (changed in 3.0.0; previously returned nothing).

#### cancel_all

Cancel all downloads at once. New in 3.0.0.

```typescript
api.cancelAll(deleteFiles?: boolean): Promise<BatchResult>
```

If `deleteFiles` is true, partially downloaded files are deleted from disk.

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

### Mirror Commands

Recursive HTTP directory mirroring, new in 3.0.0. These commands drive the Mirror page: they crawl an HTTP directory-listing URL and download the tree to disk. Mirror-specific types are described in [Types](#mirroroptions).

#### discover_recursive

Dry-run discovery: crawl the listing and return the manifest of files that *would* be downloaded, without adding anything.

```typescript
api.discoverRecursive(url: string, options?: DownloadOptions, recursive?: MirrorOptions): Promise<MirrorManifest>
```

#### add_recursive

Start a mirror job. Each discovered file becomes a child download tracked under the job.

```typescript
api.addRecursive(url: string, options?: DownloadOptions, recursive?: MirrorOptions): Promise<MirrorJob>
```

Returns the `{ job, status }` pair for the new job.

#### list_recursive_jobs

```typescript
api.listRecursiveJobs(): Promise<MirrorJob[]>
```

#### get_recursive_job

```typescript
api.getRecursiveJob(id: string): Promise<MirrorJob>
```

#### cancel_recursive_job

Cancel a running mirror job.

```typescript
api.cancelRecursiveJob(id: string, deleteFiles?: boolean): Promise<void>
```

#### remove_recursive_job

Remove a mirror job and stop tracking its children.

```typescript
api.removeRecursiveJob(id: string, deleteFiles?: boolean): Promise<void>
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
  "version": "3.0.0",
  "description": "...",
  "license": "AGPL-3.0",
  "repository": "https://github.com/goshitsarch-eng/Gosh-Fetch",
  "engine": {
    "name": "gosh-dl",
    "version": "0.5.0",
    "url": "https://github.com/goshitsarch-eng/gosh-dl",
    "license": "MIT"
  }
}
```

#### get_disk_space

Get total and free disk space for a given path (defaults to the system Downloads directory). New in 3.0.0 (previously an Electron-only IPC method).

```typescript
api.getDiskSpace(path?: string): Promise<{ total: number; free: number }>
```

#### perform_system_action

Perform an OS power action when downloads finish (used by the Scheduler's on-completion setting). New in 3.0.0.

```typescript
api.performSystemAction(action: 'sleep' | 'shutdown' | 'close', forceCloseApps?: boolean): Promise<void>
```

#### read_settings_json

Read and parse a JSON settings file from disk (used by settings import, paired with the `selectFile` dialog helper). New in 3.0.0.

```typescript
api.readSettingsJson(path: string): Promise<any>
```

#### get_pending_open_requests

Drain magnet links and `.torrent` files that the OS handed to the app before the frontend's event listeners were ready (cold start). Called once by the event bridge on startup. New in 3.0.0.

```typescript
api.getPendingOpenRequests(): Promise<Array<
  { kind: 'magnet'; uri: string } | { kind: 'torrentFile'; path: string }
>>
```

---

## Plugin-Backed Helpers

Native OS functionality that the Electron main process used to provide is now backed by official Tauri plugins. The helpers in `src/lib/api/system.ts` wrap them:

#### selectFile / selectDirectory

Open a native file or directory picker dialog (tauri-plugin-dialog).

```typescript
selectFile(filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null>
selectDirectory(): Promise<string | null>
```

#### showNotification

Show a native OS notification, requesting permission if needed (tauri-plugin-notification).

```typescript
showNotification(title: string, body: string): Promise<void>
```

#### setRunAtStartup / getRunAtStartup

Configure whether the app starts at OS login (tauri-plugin-autostart).

```typescript
setRunAtStartup(enabled: boolean): Promise<void>
getRunAtStartup(): Promise<boolean>
```

#### setMagnetHandler / isMagnetHandler

Manage `magnet:` protocol registration (tauri-plugin-deep-link). On macOS this is install-time (Info.plist); runtime register/unregister works on Windows and Linux only.

```typescript
setMagnetHandler(enabled: boolean): Promise<boolean>
isMagnetHandler(): Promise<boolean>
```

#### Auto-update

Updates are handled by tauri-plugin-updater through the updater store (`src/lib/stores/updater.svelte.ts`): `check()` queries GitHub Releases, `downloadAndInstall()` streams progress, and tauri-plugin-process relaunches the app. The old `updaterDownload`/`updaterInstall` IPC methods and `update-*` events are gone.

Note: `getNativeTheme` is also gone -- the frontend follows the OS theme with a `prefers-color-scheme` media query directly.

---

## Events

Events flow from the Rust backend to the webview via Tauri's event system. Subscribe with `listen()` from `@tauri-apps/api/event`; the event names are unchanged from 2.x. All subscriptions live in the event bridge (`src/lib/api/events.ts`):

```typescript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen<GlobalStats>('global-stats', (event) => {
  stats.update(event.payload);
});
```

### Engine Events

| Event | Payload | Description |
|-------|---------|-------------|
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
| `recursive:added` | `MirrorJob` | A mirror job was added (new in 3.0.0) |
| `recursive:updated` | `MirrorJob` | A mirror job's state or progress changed (new in 3.0.0) |
| `recursive:removed` | `{ id }` | A mirror job was removed (new in 3.0.0) |

### Application Events

| Event | Payload | Description |
|-------|---------|-------------|
| `engine-status` | `{ connected: boolean, restarting: boolean }` | Engine connection state changed |
| `navigate` | `string` (path) | Navigate to a route (triggered from tray) |
| `open-add-modal` | `{}` | Open the add download modal (triggered from tray) |
| `open-magnet` | `{ uri: string }` | A magnet link was opened externally |
| `open-torrent-file` | `{ path: string }` | A .torrent file was opened externally |

The 2.x `native-theme-changed` and `update-*` events no longer exist; OS theme changes are observed via a media query, and update progress is reported through tauri-plugin-updater callbacks.

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

### BatchResult

Per-download outcomes for batch operations (`pause_all`, `resume_all`, `cancel_all`).

```typescript
interface BatchResult {
  succeeded: string[];                     // GIDs the operation applied to
  skipped: string[];                       // GIDs in a state the operation does not apply to
  failed: { id: string; error: string }[]; // GIDs that errored, with the reason
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

### MirrorOptions

Crawl configuration for the mirror commands. Field names are snake_case because they mirror gosh-dl's serde output (defined in `src/lib/types/mirror.ts`).

```typescript
interface MirrorOptions {
  max_depth: number;                 // Crawl depth limit, default 16
  same_host_only: boolean;           // Stay on the root URL's host, default true
  allowed_prefix: string | null;     // Restrict to URLs under this prefix
  include_patterns: string[];        // Only download matching files
  exclude_patterns: string[];        // Skip matching files
  preserve_paths: boolean;           // Recreate the directory tree on disk, default true
  overwrite_existing: boolean;       // Overwrite files that already exist, default false
  fail_fast: boolean;                // Abort the job on first failure, default false
  max_discovery_concurrency: number; // Parallel listing fetches, default 4
}
```

### MirrorManifest

The dry-run result from `discover_recursive`.

```typescript
interface MirrorManifest {
  root_url: string;
  entries: MirrorManifestEntry[];
}

interface MirrorManifestEntry {
  url: string;
  relative_path: string;
  size_hint: number | null;          // Size from the listing, if known
}
```

### MirrorJob

The `{ job, status }` pair returned by the mirror commands and carried by the `recursive:*` events.

```typescript
interface MirrorJob {
  job: MirrorTrackedJob;
  status: MirrorJobStatus;
}

interface MirrorTrackedJob {
  id: string;
  root_url: string;
  child_ids: string[];               // GIDs of the per-file child downloads
  created_at: string;
}

interface MirrorJobStatus {
  root_url: string;
  child_ids: string[];
  state: 'empty' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'partial';
  progress: MirrorJobProgress;
}

interface MirrorJobProgress {
  total_children: number;
  queued_children: number;
  active_children: number;
  paused_children: number;
  completed_children: number;
  failed_children: number;
  missing_children: number;
  completed_size: number;
  total_size: number | null;
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
