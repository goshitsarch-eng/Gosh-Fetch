# Gosh-Fetch Architecture

This document describes how Gosh-Fetch is built, how its parts communicate, and where things live in the codebase.

## Overview

Gosh-Fetch is a desktop download manager with three layers: a React frontend rendered by Electron, an Electron main process that manages the application lifecycle and IPC, and a Rust sidecar binary that handles all download operations and data storage.

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI | React 19, Redux Toolkit, TypeScript | User interface |
| Build | Vite 6 | Frontend bundling |
| Desktop | Electron 35 | Window management, tray, IPC, auto-update |
| Sidecar | Rust (Tokio, rusqlite) | Download engine, database, JSON-RPC server |
| Engine | gosh-dl 0.2.2 | HTTP/BitTorrent downloads |
| Database | SQLite | Settings, download history, tracker metadata |

## How the Layers Communicate

The frontend never talks to the Rust sidecar directly. All communication flows through Electron's IPC:

```
React (renderer process)
    |
    |  window.electronAPI.invoke(method, params)
    |  (ipcRenderer.invoke -> ipcMain.handle)
    v
Electron Main Process
    |
    |  JSON-RPC over stdin/stdout
    |  (SidecarManager writes JSON lines to child process stdin,
    |   reads JSON line responses from stdout)
    v
gosh-fetch-engine (Rust sidecar)
    |
    |  Direct Rust API calls
    v
gosh-dl (download engine library)
```

The frontend calls `window.electronAPI.invoke('method_name', params)` which goes through `ipcRenderer.invoke('rpc-invoke', ...)` in the preload script. The main process receives this via `ipcMain.handle('rpc-invoke', ...)`, checks the method against an allowlist of 42 permitted methods, then forwards it as a JSON-RPC request to the sidecar's stdin. The sidecar processes the request and writes a JSON-RPC response to stdout.

Events flow in the reverse direction. The sidecar emits events (download progress, state changes, global stats) as JSON lines on stdout. The Electron main process reads these and forwards them to the renderer via `mainWindow.webContents.send('rpc-event', eventName, data)`. The renderer listens with `window.electronAPI.onEvent(callback)`.

Some IPC methods are handled directly by the Electron main process without involving the sidecar. These include native dialogs (`select-file`, `select-directory`), OS integration (`get-native-theme`, `set-login-item-settings`, `get-disk-space`), notifications, and the auto-updater.

## Frontend Architecture

### Routing

The app uses React Router with `HashRouter` (important for Electron's `file://` protocol in production). Routes are defined in `App.tsx`:

- `/` -- Downloads page (with optional `?filter=active|paused` query parameter)
- `/history` -- Completed download history
- `/statistics` -- Download statistics
- `/settings` -- Configuration
- `/scheduler` -- Bandwidth scheduling rules

`About.tsx` exists as a component but is not a routed page.

### State Management

Redux Toolkit manages all application state through six slices:

**downloadSlice** uses `createEntityAdapter` keyed by download `gid` for normalized storage. This means individual downloads can be updated without replacing the entire list, and selectors like `selectAll`, `selectById` work efficiently. The slice provides selectors for filtering by status (active, paused, completed, error).

**statsSlice** tracks global download/upload speeds, active/waiting/stopped counts, and engine connection status. The `isConnected` flag drives the disconnection banner in the UI.

**themeSlice** supports three modes: `dark`, `light`, and `system`. System mode listens for OS theme changes via `native-theme-changed` events from Electron. The active theme is applied by setting a `data-theme` attribute on the document element, which CSS variables respond to.

**notificationSlice** accumulates in-app notifications for download events (added, completed, failed), shown in the `NotificationDropdown` component.

**updaterSlice** tracks auto-update state: whether an update is available, download progress, and whether it has finished downloading.

**orderSlice** manages the drag-and-drop ordering of download cards, syncing with the engine's priority system.

### Event Handling

`App.tsx` sets up a single event listener via `window.electronAPI.onEvent()` that handles all sidecar events. Download lifecycle events (`download:added`, `download:completed`, `download:failed`, `download:paused`, `download:resumed`, `download:state-changed`, `download:removed`) trigger a `fetchDownloads()` dispatch to refresh the download list. The `global-stats` event updates the stats slice every second.

As a fallback, the Downloads page also polls every 5 seconds. But the primary mechanism is push-based -- the sidecar emits events through gosh-dl's event subscription system, and they propagate through stdout to the renderer in near real-time.

### Styling

All styles use a CSS custom property (variable) design system defined in `src/App.css`. There is no Tailwind or CSS-in-JS. The design tokens cover colors, spacing, typography scales, border radii, and transitions. Theme switching works by redefining these variables under `[data-theme="light"]` and `[data-theme="dark"]` selectors.

Icons are primarily Google Material Symbols Outlined, loaded as a self-hosted woff2 font file from `public/fonts/`. This avoids external network requests and complies with the production Content Security Policy (`font-src 'self'`). Some legacy components still use lucide-react.

## Sidecar Architecture

The Rust sidecar (`gosh-fetch-engine`) is a standalone binary that communicates exclusively via JSON-RPC over stdin/stdout. It never opens network ports or creates its own windows.

### Startup

On startup (`main.rs`), the sidecar initializes `AppState`, which creates the SQLite database (loading saved settings or using defaults for a fresh install), configures and starts the gosh-dl `DownloadEngine`, wraps it in an `EngineAdapter` for type conversion, and then enters the RPC server loop.

### RPC Server

`rpc_server.rs` is the heart of the sidecar. It sets up three concurrent tasks:

1. A **stdout writer** task that serializes all outbound data through a single `mpsc` channel, preventing write contention between the event forwarder, stats emitter, and RPC response handlers.
2. An **event forwarder** that reads gosh-dl engine events from a broadcast channel and sends them to stdout.
3. A **stats emitter** that queries `get_global_stats()` every second and sends the result to stdout.

The main loop reads JSON-RPC requests from async stdin (using `tokio::io::BufReader`), parses them, and spawns each request handler as an independent Tokio task for concurrent processing. Responses are sent back through the shared stdout channel.

### Command Handlers

RPC methods are dispatched in `rpc_server.rs` to handler functions organized by domain:

- `commands/download.rs` -- Add, pause, resume, remove downloads; get status/list
- `commands/torrent.rs` -- Torrent file and magnet link operations, peer info
- `commands/settings.rs` -- Settings management, engine configuration, tracker lists, user agent presets
- `commands/database.rs` -- Direct database queries (completed history, settings persistence)
- `commands/system.rs` -- App info, file/folder opening, default paths

### Security

The sidecar validates all inputs:

- **URL validation**: Only `http://`, `https://`, and `magnet:` schemes are accepted. Private/loopback IPs (127.x, 10.x, 172.16-31.x, 192.168.x, link-local, ::1, fc00::/7) are blocked. Maximum URL length is 8192 characters.
- **Torrent path validation**: Files must have a `.torrent` extension and exist on disk.
- **Path sanitization**: `open_download_folder` and `open_file_location` canonicalize paths, verify existence, and reject URL schemes before passing to the OS file manager.

On the Electron side, `ALLOWED_RPC_METHODS` in `main.ts` acts as a second layer of defense -- any method not in the set is rejected before it reaches the sidecar.

### Engine Adapter

`engine_adapter.rs` bridges the gap between gosh-dl's internal types and the JSON-serializable types the frontend expects. It converts download statuses, options, peer info, and file lists. It also handles GID (download identifier) parsing, supporting both UUID and legacy formats.

### Database

The SQLite database (`gosh-fetch.db` in the user data directory) stores four tables:

**downloads** -- Download metadata and history. Stores the GID, name, URL/magnet URI, type (http/torrent/magnet), status, sizes, speeds, paths, timestamps, and selected files. Indexed on status, created_at, and gid.

**settings** -- Key-value configuration. All settings have defaults seeded by `001_initial.sql`. Notable defaults: download path `~/Downloads`, max concurrent downloads 5, connections per server 8, split count 8, dark theme, notifications enabled, close to tray enabled, sparse file allocation, 30s connect timeout, 60s read timeout, 3 retries.

**trackers** -- BitTorrent tracker URLs with enabled/working status.

**tracker_meta** -- Single-row table tracking when the tracker list was last updated and the source URL.

**schema_version** -- Migration version tracking for future schema upgrades.

Database operations use `tokio::task::spawn_blocking` to run SQLite I/O on Tokio's blocking thread pool, and settings saves are wrapped in transactions for atomicity.

Note that gosh-dl maintains its own separate database (`engine.db`) for internal engine state like download segments and recovery data. The two databases serve different purposes and this separation is intentional.

## Electron Main Process

The main process (`src-electron/main.ts`) handles:

**Sidecar management** -- Spawns the Rust binary as a child process via `SidecarManager`. If the sidecar crashes, it auto-restarts up to 3 times with exponential backoff (1s, 2s, 4s). The renderer is notified of engine status via `engine-status` events.

**Window management** -- Creates the main `BrowserWindow` with context isolation and no node integration. Window position, size, and maximized state persist between sessions via a JSON file in the user data directory.

**System tray** -- Creates a tray icon with a popup window showing live download stats. On Linux/Windows, a single click toggles the popup. On macOS, double-click is used instead (single click is reserved for the context menu on macOS).

**IPC bridge** -- `ipcMain.handle('rpc-invoke', ...)` validates methods against the allowlist and forwards them to the sidecar. Additional IPC handlers provide native OS functionality: file/directory dialogs, notifications, disk space queries, native theme detection, login item settings, protocol client management, settings import, and auto-updater controls.

**Application menu** -- macOS gets a standard application menu with app, edit, view, and window menus (required for Cmd+Q, Cmd+C/V/X to work). Linux and Windows have no menu bar.

**Auto-update** -- Uses `electron-updater` with GitHub Releases as the provider. Checks for updates on startup but does not auto-download. Update availability, download progress, and completion are forwarded to the renderer as events.

**Single instance** -- `app.requestSingleInstanceLock()` ensures only one instance runs. If a second instance is launched (e.g., by clicking a magnet link), the existing window is focused and the protocol URL or torrent file path is forwarded.

**Protocol handling** -- Registers as the handler for `magnet:` URIs. On macOS, `open-url` and `open-file` events handle protocol URLs and `.torrent` file associations. On Windows/Linux, these arrive via `argv` on the `second-instance` event.

**Content Security Policy** -- In production, response headers enforce `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'`. The tray popup is exempted since it is a trusted local file with inline scripts.

## Build and Packaging

The frontend is built with Vite into `dist/`. The Electron main process TypeScript is compiled into `dist-electron/`. The Rust sidecar is compiled separately with `cargo build` into `src-rust/target/`. For production builds, `electron-builder` packages everything together using the configuration in `electron-builder.yml`.

The sidecar binary, tray icon, tray popup HTML, and fonts are bundled as `extraResources`. Output formats are AppImage/deb/rpm for Linux, DMG for macOS, and NSIS installer plus portable for Windows.

CI workflows in `.github/workflows/` build for all three platforms and run both Rust and frontend tests before building.
