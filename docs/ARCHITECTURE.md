# Gosh-Fetch Architecture

This document describes how Gosh-Fetch is built, how its parts communicate, and where things live in the codebase.

## Overview

Gosh-Fetch is a Tauri 2 desktop download manager with two layers: a Svelte 5 frontend rendered in the system webview, and a Rust backend that runs in the same process and handles all download operations, data storage, and desktop integration. The gosh-dl download engine is embedded in the backend as a library.

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI | Svelte 5 (runes), svelte-spa-router, TypeScript | User interface |
| Build | Vite 7, Tauri CLI | Frontend bundling, app packaging |
| Desktop | Tauri 2 | Window management, tray, commands/events, auto-update |
| Backend | Rust (Tokio, rusqlite) | Download engine, database, Tauri commands |
| Engine | gosh-dl 0.5.0 (features: `recursive-http`) | HTTP/BitTorrent downloads, directory mirroring |
| Database | SQLite | Settings, download history, tracker metadata |

## How the Layers Communicate

Everything runs in a single process. There is no separate sidecar binary, no JSON-RPC envelope, and no IPC bridge process -- the frontend calls Rust functions directly through Tauri's command system:

```
Svelte (webview)
    |
    |  invoke('method_name', params)
    |  (@tauri-apps/api/core)
    v
Tauri command layer (src-tauri/src/api.rs)
    |
    |  Direct Rust function calls
    v
Command handlers (src-tauri/src/commands/*)
    |
    |  Direct Rust API calls via EngineAdapter
    v
gosh-dl (download engine library)
```

The frontend calls `invoke('method_name', params)`, which Tauri routes to the matching `#[tauri::command]` function in `api.rs`. Command names are identical to the old RPC method names (`add_download`, `pause_all`, `db_get_settings`, etc.), and camelCase argument keys from JavaScript map automatically to snake_case Rust parameters. The typed wrappers in `src/lib/api/commands.ts` provide access to every command.

Events flow in the reverse direction. The backend emits events (download progress, state changes, global stats, mirror job updates) via Tauri's event system, and the frontend subscribes with `listen()` from `@tauri-apps/api/event`. The event names are unchanged from 2.x (`download:added`, `download:completed`, `global-stats`, etc.), plus new `recursive:added/updated/removed` events for mirror jobs.

Native OS functionality that the Electron main process used to provide (dialogs, notifications, autostart, deep links, updater) is now handled by official Tauri plugins, wrapped in `src/lib/api/system.ts`.

## Frontend Architecture

### Routing

The app uses svelte-spa-router with hash routing. Routes are defined in `App.svelte`:

- `/` -- Downloads page (with optional `?filter=active|paused` query parameter)
- `/mirror` -- Recursive HTTP directory mirroring jobs
- `/history` -- Completed download history
- `/statistics` -- Download statistics
- `/settings` -- Configuration
- `/scheduler` -- Bandwidth scheduling rules
- `/tray` -- Tray popup content (rendered chrome-less in the tray popup window)

`About.svelte` exists as a component but is not a routed page.

### State Management

State lives in runes-based store classes under `src/lib/stores/`, each exporting a singleton instance:

**downloads.svelte.ts** holds the download list keyed by `gid`, exposes filtered views (active, paused, completed, error), and wraps the add/pause/resume/remove command calls.

**stats.svelte.ts** tracks global download/upload speeds, active/waiting/stopped counts, and engine connection status. The connection flag drives the disconnection banner in the UI.

**theme.svelte.ts** supports three modes: `dark`, `light`, and `system`. System mode follows the OS via a `prefers-color-scheme` media query (replacing Electron's `native-theme-changed` event). The active theme is applied by setting a `data-theme` attribute on the document element, which CSS variables respond to.

**notifications.svelte.ts** accumulates in-app notifications for download events (added, completed, failed), shown in the notification dropdown.

**updater.svelte.ts** tracks auto-update state via tauri-plugin-updater: whether an update is available, download progress, and whether it is ready to install.

**mirror.svelte.ts** holds recursive mirroring jobs, updated by the `recursive:*` events.

**ui.svelte.ts** holds cross-cutting UI state such as the add-download modal.

### Event Handling

`src/lib/api/events.ts` is the event bridge. `App.svelte` calls `startEventBridge()` once on mount, which registers all `listen()` subscriptions and wires them into the stores. Download lifecycle events (`download:added`, `download:completed`, `download:failed`, `download:paused`, `download:resumed`, `download:state-changed`, `download:removed`) trigger a debounced refresh of the download list. The `global-stats` event updates the stats store every second, and `recursive:*` events upsert or remove mirror jobs.

On startup, the bridge also calls `get_pending_open_requests` to drain any magnet links or `.torrent` files that the OS handed to the app before the listeners were wired (cold start).

### Styling

All styles use a CSS custom property (variable) design system defined in `src/App.css`. There is no Tailwind or CSS-in-JS. The design tokens cover colors, spacing, typography scales, border radii, and transitions. Theme switching works by redefining these variables under `[data-theme="light"]` and `[data-theme="dark"]` selectors.

Icons are Google Material Symbols Outlined, loaded as a self-hosted woff2 font file from `public/fonts/`. This avoids external network requests.

## Backend Architecture

The Rust backend lives in `src-tauri/` and is compiled into the app binary. It replaces both the old Electron main process and the `gosh-fetch-engine` sidecar.

### Startup

`lib.rs` builds the Tauri app: it registers plugins (single-instance first, then log, dialog, notification, opener, deep-link, window-state, updater, process, autostart), and in the setup hook initializes `AppState` (`state.rs`), which creates the SQLite database (loading saved settings or using defaults for a fresh install), configures and starts the gosh-dl `DownloadEngine`, and wraps it in an `EngineAdapter` for type conversion. It also creates the tray icon and spawns the event forwarder and stats emitter.

### Command Layer

`api.rs` contains thin `#[tauri::command]` wrappers -- one per command, with the same names, parameters, and return shapes as the old RPC methods. Tauri generates the dispatch automatically from the `invoke_handler` registration, so there is no hand-maintained allowlist; the registered command set *is* the allowlist.

The wrappers delegate to handler functions organized by domain:

- `commands/download.rs` -- Add, pause, resume, remove downloads; batch operations; get status/list
- `commands/torrent.rs` -- Torrent file and magnet link operations, peer info
- `commands/settings.rs` -- Settings management, engine configuration, tracker lists, user agent presets
- `commands/database.rs` -- Direct database queries (completed history, settings persistence)
- `commands/system.rs` -- App info, file/folder opening, default paths, disk space, system actions
- `commands/recursive.rs` -- Recursive HTTP directory mirroring (discover, add, list, cancel, remove jobs)

Batch operations (`pause_all`, `resume_all`, `cancel_all`) use gosh-dl's engine-level batch API and return a `BatchResult` with per-download outcomes (`succeeded`, `skipped`, `failed`) instead of failing or succeeding as a whole. `pause()` also covers queued downloads.

### Events

`events.rs` runs two background tasks: an event forwarder that reads gosh-dl engine events from a broadcast channel and emits them as Tauri events to the webview, and a stats emitter that queries `get_global_stats()` every second and emits `global-stats`.

### Security

The backend validates all inputs (`validation.rs`):

- **URL validation**: Only `http://`, `https://`, and `magnet:` schemes are accepted. Private/loopback IPs (127.x, 10.x, 172.16-31.x, 192.168.x, link-local, ::1, fc00::/7) are blocked. Maximum URL length is 8192 characters.
- **Torrent path validation**: Files must have a `.torrent` extension and exist on disk.
- **Path sanitization**: `open_download_folder` and `open_file_location` canonicalize paths, verify existence, and reject URL schemes before passing to the OS file manager.

Tauri's capability system (`src-tauri/capabilities/`) scopes which plugin APIs the webview may call.

### Engine Adapter

`engine_adapter.rs` bridges the gap between gosh-dl's internal types and the JSON-serializable types the frontend expects. It converts download statuses, options, peer info, and file lists. It also handles GID (download identifier) parsing, supporting both UUID and legacy formats.

### Database

The SQLite database (`gosh-fetch.db` in the app data directory, identifier `com.gosh.fetch`) stores the same tables as 2.x -- the schema (`migrations/001_initial.sql`) is unchanged, so existing databases are picked up in place:

**downloads** -- Download metadata and history. Stores the GID, name, URL/magnet URI, type (http/torrent/magnet), status, sizes, speeds, paths, timestamps, and selected files. Indexed on status, created_at, and gid.

**settings** -- Key-value configuration. All settings have defaults seeded by `001_initial.sql`. Notable defaults: download path `~/Downloads`, max concurrent downloads 5, connections per server 8, split count 8, dark theme, notifications enabled, close to tray enabled, sparse file allocation, 30s connect timeout, 60s read timeout.

**trackers** -- BitTorrent tracker URLs with enabled/working status.

**tracker_meta** -- Single-row table tracking when the tracker list was last updated and the source URL.

**schema_version** -- Migration version tracking for future schema upgrades.

Database operations use `tokio::task::spawn_blocking` to run SQLite I/O on Tokio's blocking thread pool, and settings saves are wrapped in transactions for atomicity.

gosh-dl maintains its own separate database (`engine.db`) for internal engine state like download segments and recovery data. The two databases serve different purposes and this separation is intentional. gosh-dl migrates the `engine.db` schema (v2 to v4) automatically on first run after upgrading from 2.x.

## Desktop Integration

Features previously handled by the Electron main process are now split between Tauri itself and official plugins:

**System tray** (`tray.rs`) -- A Tauri `TrayIcon` with live speed display. On macOS and Windows, clicking the tray opens a popup window showing active downloads (the `/tray` route). On Linux, the tray is menu-only -- libappindicator delivers no click events, so the popup cannot be triggered. This is a known platform limitation.

**Single instance** -- tauri-plugin-single-instance ensures only one instance runs. A second launch (e.g., from a magnet link) focuses the existing window and forwards the URL or torrent path as an open request.

**Protocol and file handling** -- tauri-plugin-deep-link registers the `magnet:` handler; `.torrent` association is declared via the bundle's `fileAssociations`. Requests that arrive before the frontend is ready are queued in `AppState` and drained via `get_pending_open_requests`.

**Window state** -- tauri-plugin-window-state persists size, position, and maximized state between sessions.

**Auto-update** -- tauri-plugin-updater checks GitHub Releases (`latest.json`, signed artifacts) on startup but does not auto-download. tauri-plugin-process handles relaunch after install.

**Other plugins** -- dialog (file/directory pickers), notification (completion notices), autostart (run at login), opener (open files/folders), log.

## Build and Packaging

The frontend is built with Vite into `dist/`. `npm run tauri build` compiles the Rust backend, embeds the frontend, and bundles platform packages: AppImage/deb/rpm for Linux, DMG for macOS, and an NSIS installer for Windows. `npm run tauri dev` runs the Vite dev server and a debug build of the app together.

CI workflows in `.github/workflows/` cover both halves: `ci.yml` runs frontend and Rust tests on PRs and main, and `release.yml` uses tauri-action across a matrix (ubuntu-24.04 x64, ubuntu-24.04-arm, macos-14 universal, windows-latest) to build signed artifacts and draft a GitHub Release on `v*` tags. Release signing requires the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets.
