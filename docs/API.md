# Gosh-Fetch API Reference

This document describes the Tauri IPC commands available for frontend-backend communication.

## Table of Contents

- [Download Commands](#download-commands)
- [Torrent Commands](#torrent-commands)
- [Settings Commands](#settings-commands)
- [System Commands](#system-commands)
- [Types](#types)

---

## Download Commands

### add_download

Add an HTTP/HTTPS download.

```typescript
invoke('add_download', { url: string, options?: DownloadOptions }): Promise<string>
```

**Parameters:**
- `url` - The URL to download
- `options` - Optional download configuration

**Returns:** Download GID (unique identifier)

---

### add_urls

Add multiple downloads at once.

```typescript
invoke('add_urls', { urls: string[], options?: DownloadOptions }): Promise<string[]>
```

**Parameters:**
- `urls` - Array of URLs to download
- `options` - Optional download configuration (applied to all)

**Returns:** Array of download GIDs

---

### pause_download

Pause a specific download.

```typescript
invoke('pause_download', { gid: string }): Promise<void>
```

---

### pause_all

Pause all active downloads.

```typescript
invoke('pause_all'): Promise<void>
```

---

### resume_download

Resume a paused download.

```typescript
invoke('resume_download', { gid: string }): Promise<void>
```

---

### resume_all

Resume all paused downloads.

```typescript
invoke('resume_all'): Promise<void>
```

---

### remove_download

Remove a download from the engine.

```typescript
invoke('remove_download', { gid: string, deleteFiles: boolean }): Promise<void>
```

**Parameters:**
- `gid` - Download identifier
- `deleteFiles` - If true, delete downloaded files from disk

---

### get_download_status

Get status of a specific download.

```typescript
invoke('get_download_status', { gid: string }): Promise<Download>
```

---

### get_all_downloads

Get all downloads (active and stopped).

```typescript
invoke('get_all_downloads'): Promise<Download[]>
```

---

### get_active_downloads

Get only active downloads.

```typescript
invoke('get_active_downloads'): Promise<Download[]>
```

---

### get_global_stats

Get global download statistics.

```typescript
invoke('get_global_stats'): Promise<GlobalStat>
```

---

### set_speed_limit

Set global speed limits.

```typescript
invoke('set_speed_limit', { downloadLimit?: number, uploadLimit?: number }): Promise<void>
```

**Parameters:**
- `downloadLimit` - Download speed limit in bytes/sec (null = unlimited)
- `uploadLimit` - Upload speed limit in bytes/sec (null = unlimited)

---

## Torrent Commands

### add_torrent_file

Add a download from a .torrent file.

```typescript
invoke('add_torrent_file', { filePath: string, options?: DownloadOptions }): Promise<string>
```

**Parameters:**
- `filePath` - Absolute path to the .torrent file
- `options` - Optional download configuration

**Returns:** Download GID

---

### add_magnet

Add a download from a magnet link.

```typescript
invoke('add_magnet', { magnetUri: string, options?: DownloadOptions }): Promise<string>
```

**Parameters:**
- `magnetUri` - Magnet URI (starts with `magnet:?`)
- `options` - Optional download configuration

**Returns:** Download GID

---

### get_torrent_files

Get file list for a torrent download.

```typescript
invoke('get_torrent_files', { gid: string }): Promise<DownloadFile[]>
```

---

### parse_torrent_file

Parse a .torrent file without adding it.

```typescript
invoke('parse_torrent_file', { filePath: string }): Promise<TorrentInfo>
```

**Returns:** Torrent metadata including file list, total size, info hash

---

### parse_magnet_uri

Parse a magnet URI without adding it.

```typescript
invoke('parse_magnet_uri', { magnetUri: string }): Promise<MagnetInfo>
```

**Returns:** Magnet metadata including name, info hash, trackers

---

### get_peers

Get peer information for a torrent download.

```typescript
invoke('get_peers', { gid: string }): Promise<PeerInfo[]>
```

**Returns:** Array of connected peers with IP, port, client, speeds

---

## Settings Commands

### get_settings

Get current settings (defaults).

```typescript
invoke('get_settings'): Promise<Settings>
```

> **Note:** Settings are stored in SQLite and managed by the frontend via `@tauri-apps/plugin-sql`.

---

### apply_settings_to_engine

Apply settings to the download engine.

```typescript
invoke('apply_settings_to_engine', { settings: Settings }): Promise<void>
```

Call this after changing settings in the database to apply them to the running engine.

---

### set_close_to_tray

Set whether closing the window minimizes to tray.

```typescript
invoke('set_close_to_tray', { value: boolean }): void
```

---

### set_user_agent

Set the HTTP user agent.

```typescript
invoke('set_user_agent', { userAgent: string }): Promise<void>
```

---

### get_user_agent_presets

Get available user agent presets.

```typescript
invoke('get_user_agent_presets'): (string, string)[]
```

**Returns:** Array of `[name, userAgent]` tuples:
- gosh-dl (default)
- Chrome (Windows)
- Chrome (macOS)
- Firefox (Windows)
- Firefox (Linux)
- Wget
- Curl

---

### get_tracker_list

Fetch tracker list from online source.

```typescript
invoke('get_tracker_list'): Promise<string[]>
```

---

### update_tracker_list

Fetch and update tracker list.

```typescript
invoke('update_tracker_list'): Promise<string[]>
```

---

## System Commands

### get_engine_version

Get download engine information.

```typescript
invoke('get_engine_version'): Promise<{ name: string, version: string, running: boolean }>
```

---

### restart_engine

Restart the download engine.

```typescript
invoke('restart_engine'): Promise<void>
```

---

### show_window

Show and focus the main window.

```typescript
invoke('show_window'): void
```

---

### hide_window

Hide the main window (minimize to tray).

```typescript
invoke('hide_window'): void
```

---

### quit_app

Exit the application.

```typescript
invoke('quit_app'): void
```

---

### open_download_folder

Open a folder in the system file manager.

```typescript
invoke('open_download_folder', { path: string }): void
```

---

### open_file_location

Open the containing folder of a file and select it.

```typescript
invoke('open_file_location', { filePath: string }): void
```

---

### get_default_download_path

Get the system's default download directory.

```typescript
invoke('get_default_download_path'): string
```

---

### get_app_version

Get application version.

```typescript
invoke('get_app_version'): string
```

---

### get_app_info

Get detailed application information.

```typescript
invoke('get_app_info'): AppInfo
```

**Returns:**
```json
{
  "name": "Gosh-Fetch",
  "version": "1.1.1",
  "description": "...",
  "license": "AGPL-3.0",
  "repository": "https://github.com/goshitsarch-eng/Gosh-Fetch",
  "engine": {
    "name": "gosh-dl",
    "version": "0.1.0",
    "url": "https://github.com/goshitsarch-eng/gosh-dl",
    "license": "MIT"
  }
}
```

---

## Types

### DownloadOptions

Configuration options when adding a download.

```typescript
interface DownloadOptions {
  dir?: string;                    // Save directory
  out?: string;                    // Output filename
  maxConnectionPerServer?: string; // Connections per server
  userAgent?: string;              // HTTP user agent
  referer?: string;                // HTTP referer header
  header?: string[];               // Custom headers ["Key: Value"]
  selectFile?: string;             // Torrent file indices "1,2,3"
  seedRatio?: string;              // Seed ratio for torrents
  maxDownloadLimit?: string;       // Download speed limit
  maxUploadLimit?: string;         // Upload speed limit
}
```

### Download

Download status information.

```typescript
interface Download {
  id: number;                      // Database ID
  gid: string;                     // Engine GID
  name: string;                    // Display name
  url?: string;                    // Source URL
  magnetUri?: string;              // Magnet link
  infoHash?: string;               // BitTorrent info hash
  downloadType: 'http' | 'torrent' | 'magnet';
  status: 'active' | 'waiting' | 'paused' | 'complete' | 'error' | 'removed';
  totalSize: number;               // Total bytes
  completedSize: number;           // Downloaded bytes
  downloadSpeed: number;           // Current download speed (bytes/sec)
  uploadSpeed: number;             // Current upload speed (bytes/sec)
  savePath: string;                // Save directory
  createdAt: string;               // ISO 8601 timestamp
  completedAt?: string;            // ISO 8601 timestamp
  errorMessage?: string;           // Error description
  connections: number;             // Active connections
  seeders: number;                 // Connected seeders (torrents)
  selectedFiles?: number[];        // Selected file indices (torrents)
}
```

### GlobalStat

Global download statistics.

```typescript
interface GlobalStat {
  downloadSpeed: string;           // Total download speed
  uploadSpeed: string;             // Total upload speed
  numActive: string;               // Active download count
  numWaiting: string;              // Queued download count
  numStopped: string;              // Stopped download count
  numStoppedTotal: string;         // Total stopped count
}
```

### TorrentInfo

Parsed torrent file information.

```typescript
interface TorrentInfo {
  name: string;                    // Torrent name
  infoHash: string;                // Info hash (hex)
  totalSize: number;               // Total size in bytes
  files: TorrentFile[];            // File list
  comment?: string;                // Torrent comment
  creationDate?: number;           // Unix timestamp
  announceList: string[];          // Tracker URLs
}

interface TorrentFile {
  index: number;                   // File index
  path: string;                    // File path
  length: number;                  // File size in bytes
}
```

### MagnetInfo

Parsed magnet link information.

```typescript
interface MagnetInfo {
  name?: string;                   // Display name
  infoHash: string;                // Info hash (hex)
  trackers: string[];              // Tracker URLs
}
```

### Settings

Application settings.

```typescript
interface Settings {
  downloadPath: string;            // Default save directory
  maxConcurrentDownloads: number;  // Max simultaneous downloads (1-20)
  maxConnectionsPerServer: number; // Connections per host (1-16)
  splitCount: number;              // Segments per download
  downloadSpeedLimit: number;      // Global download limit (0=unlimited)
  uploadSpeedLimit: number;        // Global upload limit (0=unlimited)
  userAgent: string;               // HTTP user agent
  enableNotifications: boolean;    // Show completion notifications
  closeToTray: boolean;            // Minimize to tray on close
  theme: string;                   // 'light' | 'dark' | 'system'
  btEnableDht: boolean;            // BitTorrent DHT
  btEnablePex: boolean;            // BitTorrent Peer Exchange
  btEnableLpd: boolean;            // Local Peer Discovery
  btMaxPeers: number;              // Max peers per torrent
  btSeedRatio: number;             // Seed ratio before stopping
  autoUpdateTrackers: boolean;     // Auto-fetch tracker lists
  deleteFilesOnRemove: boolean;    // Delete files when removing download
}
```
