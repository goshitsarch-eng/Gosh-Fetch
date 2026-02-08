# Gosh-Fetch Comprehensive Improvement Plan

> Compiled from 9 specialist reviews: UX, Graphic Design, Technical Architecture, Devil's Advocate, Cross-Platform, Rust, Networking, Electron, and Engine Analysis.
> Date: 2026-02-08

---

## Table of Contents

1. [Phase 1: Security & Stability (Critical)](#phase-1-security--stability)
2. [Phase 2: Platform Parity](#phase-2-platform-parity)
3. [Phase 3: Feature Exposure](#phase-3-feature-exposure)
4. [Phase 4: Visual Polish & UX](#phase-4-visual-polish--ux)
5. [Phase 5: Quality & Testing](#phase-5-quality--testing)
6. [Detailed Findings by Specialist](#detailed-findings-by-specialist)
7. [Quick Wins](#quick-wins)

---

## Phase 1: Security & Stability --- COMPLETED

### 1.1 Add Content Security Policy (CSP) --- DONE
- **File**: `index.html`
- **Severity**: CRITICAL
- **Found by**: Electron Specialist, Devil's Advocate
- **Details**: Zero CSP meta tags or headers configured anywhere.
- **Resolution**: Added `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'">` to `index.html`.

### 1.2 Add IPC Method Allowlisting --- DONE
- **File**: `src-electron/main.ts`
- **Severity**: HIGH
- **Found by**: Electron Specialist, Devil's Advocate
- **Details**: `ipcMain.handle('rpc-invoke', ...)` forwarded any method string to the sidecar without validation.
- **Resolution**: Added `ALLOWED_RPC_METHODS` set with all 39 valid methods. Unauthorized methods throw immediately before reaching the sidecar.

### 1.3 URL Validation on Download Addition --- DONE
- **File**: `src-rust/src/rpc_server.rs`
- **Severity**: HIGH
- **Found by**: Devil's Advocate
- **Details**: `add_download` accepted any string as a URL with no validation.
- **Resolution**: Added `validate_download_url()` enforcing http/https/magnet schemes only, blocking private/loopback IPs (127.x, 10.x, 172.16-31.x, 192.168.x, link-local, ::1, fc00::/7), max URL length 8192 chars. Applied to `add_download`, `add_urls`.

### 1.4 Sanitize Paths in open_download_folder / open_file_location --- DONE
- **File**: `src-rust/src/commands/system.rs`
- **Severity**: HIGH
- **Found by**: Devil's Advocate
- **Details**: Took arbitrary string from frontend and passed to `xdg-open`/`open`/`explorer`.
- **Resolution**: Added `validate_path()` that canonicalizes paths, verifies existence on disk, and rejects URL schemes. Applied to both `open_download_folder` and `open_file_location`.

### 1.5 Restrict Arbitrary File Read via Torrent Parsing --- DONE
- **File**: `src-rust/src/rpc_server.rs`
- **Severity**: MEDIUM
- **Found by**: Devil's Advocate
- **Details**: `add_torrent_file` and `parse_torrent_file` read arbitrary files.
- **Resolution**: Added `validate_torrent_path()` requiring `.torrent` extension and verifying file exists. Applied to `add_torrent_file` and `parse_torrent_file` handlers.

### 1.6 Fix Blocking stdin RPC Loop (Async) --- DONE
- **File**: `src-rust/src/rpc_server.rs`
- **Severity**: CRITICAL
- **Found by**: Rust Specialist, Architect, Engine Specialist, Devil's Advocate
- **Details**: Main RPC loop used synchronous `stdin.lock()` blocking a Tokio worker thread.
- **Resolution**: Replaced with `tokio::io::BufReader::new(tokio::io::stdin()).lines()` async reader. Each request spawned as independent async task for concurrent processing.

### 1.7 Unify stdout Writes Through a Channel --- DONE
- **File**: `src-rust/src/rpc_server.rs`
- **Severity**: MEDIUM
- **Found by**: Rust Specialist, Architect, Devil's Advocate
- **Details**: Three independent code paths acquired `io::stdout().lock()` independently.
- **Resolution**: Created `mpsc::unbounded_channel` for stdout; single dedicated writer task. Event forwarder, stats emitter, and RPC responses all send through the channel.

### 1.8 Fix Sidecar Crash Recovery --- DONE
- **File**: `src-electron/main.ts`
- **Severity**: CRITICAL
- **Found by**: Electron Specialist, Architect, Devil's Advocate
- **Details**: Sidecar crash only logged to console, app became non-functional.
- **Resolution**: Auto-restart up to 3 times with exponential backoff (1s, 2s, 4s). Renderer notified via `engine-status` event with `{ connected, restarting }` payload.

### 1.9 Fix Sidecar Shutdown Race Condition --- DONE
- **File**: `src-electron/sidecar.ts`
- **Severity**: CRITICAL
- **Found by**: Electron Specialist, Cross-Platform, Devil's Advocate
- **Details**: `this.process = null` set before exit handler, SIGKILL fallback never fired.
- **Resolution**: `this.process = null` moved into exit handler. On Windows, SIGTERM skipped (relies on stdin EOF + SIGKILL timeout). On Linux/macOS, SIGTERM sent after 500ms delay.

### 1.10 Add Single-Instance Lock --- DONE
- **File**: `src-electron/main.ts`
- **Severity**: CRITICAL
- **Found by**: Electron Specialist
- **Details**: No `app.requestSingleInstanceLock()` called.
- **Resolution**: Added lock at top of file. Quits if lock not obtained. Focuses existing window on `second-instance` event.

### 1.11 Fix Settings Lifecycle (Backend) --- DONE
- **File**: `src-rust/src/state.rs`
- **Severity**: HIGH
- **Found by**: Rust Specialist, Architect, Devil's Advocate
- **Details**: `state.rs` created `Settings::default()` instead of loading from DB.
- **Resolution**: Changed to `db.get_settings().unwrap_or_default()` so saved settings load on startup. (Frontend hardcoded BT settings in Settings.tsx is a Phase 4 issue.)

### 1.12 Fix std::sync::Mutex Blocking Tokio --- DONE
- **File**: `src-rust/src/db/mod.rs`
- **Severity**: HIGH
- **Found by**: Rust Specialist
- **Details**: Blocking `std::sync::Mutex` held during SQLite I/O on Tokio runtime threads.
- **Resolution**: Added `with_conn()` helper using `tokio::task::spawn_blocking`. All public DB methods now have async variants (`get_settings_async`, `save_settings_async`, etc.) that run on blocking threads. All callers in `commands/database.rs` and `commands/settings.rs` updated.

### 1.13 Add Database Transactions for Settings Save --- DONE
- **File**: `src-rust/src/db/mod.rs`
- **Severity**: MEDIUM
- **Found by**: Rust Specialist
- **Details**: 17 separate INSERT statements without a transaction.
- **Resolution**: Wrapped in `conn.unchecked_transaction()` + `tx.commit()` for atomicity.

### Additional fixes applied during Phase 1:
- Fixed `include_str!` migration SQL path (`../migrations/` -> `../../migrations/`)
- Updated `rusqlite` from 0.31 to 0.32 to resolve `libsqlite3-sys` link conflict with `gosh-dl`
- Added `url = "2"` crate dependency for URL parsing
- Added `skipLibCheck` to `tsconfig.node.json` to resolve `@types/node` vs `electron.d.ts` type conflict

---

## Phase 2: Platform Parity --- COMPLETED

### 2.1 Fix Windows Sidecar Bundling --- DONE
- **File**: `electron-builder.yml:14-17`
- **Severity**: CRITICAL
- **Found by**: Cross-Platform
- **Details**: `extraResources` references `src-rust/target/release/gosh-fetch-engine` (no `.exe`). Windows builds will ship without the engine binary because the file doesn't match.
- **Fix**: Use platform-conditional extraResources or a glob pattern:
  ```yaml
  extraResources:
    - from: src-rust/target/release/gosh-fetch-engine${env.EXECUTABLE_SUFFIX}
      to: bin/gosh-fetch-engine${env.EXECUTABLE_SUFFIX}
  ```
  Or use separate platform entries.

### 2.2 Add macOS Application Menu --- DONE
- **File**: `src-electron/main.ts` (missing)
- **Severity**: CRITICAL
- **Found by**: Cross-Platform
- **Details**: No `Menu.setApplicationMenu()` call. macOS apps require a menu bar. Without one, Cmd+Q, Cmd+C, Cmd+V, Cmd+A do not work. This is a severe usability issue.
- **Fix**: Create a proper application menu:
  ```typescript
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { label: 'Help', submenu: [{ label: 'About', click: () => { /* show about */ } }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  ```

### 2.3 Add macOS Intel (x86_64) Builds --- DONE
- **File**: `.github/workflows/build-macos.yml:37`
- **Severity**: CRITICAL
- **Found by**: Cross-Platform
- **Details**: Only targets `aarch64-apple-darwin`. Intel Mac users are completely excluded. Should produce a universal binary or separate x64/arm64 builds.
- **Fix**: Add a build matrix:
  ```yaml
  strategy:
    matrix:
      target: [aarch64-apple-darwin, x86_64-apple-darwin]
  ```
  Or build universal binary with `lipo`.

### 2.4 Fix Windows Graceful Shutdown --- DONE
- **File**: `src-electron/sidecar.ts:154`
- **Severity**: HIGH
- **Found by**: Cross-Platform
- **Details**: `this.process.kill('SIGTERM')` on Windows translates to `TerminateProcess()` — an ungraceful kill. The Rust binary's stdin is closed first (line 140) which should trigger graceful exit, but SIGTERM immediately after may kill it before cleanup.
- **Fix**: On Windows, rely solely on stdin EOF for graceful shutdown. Only send SIGTERM after a timeout if the process hasn't exited.

### 2.5 Fix Data Directory Fallback --- DONE
- **File**: `src-rust/src/main.rs:9-11`
- **Severity**: HIGH
- **Found by**: Cross-Platform
- **Details**: Fallback path `.local/share` is Linux-specific. On Windows this path makes no sense.
- **Fix**: Use a platform-aware fallback or just unwrap with a clear error if `dirs::data_dir()` returns `None`.

### 2.6 Fix Download Path Windows Tilde --- DONE
- **File**: `src-rust/migrations/001_initial.sql:52`
- **File**: `src-rust/src/db/mod.rs:39`
- **Severity**: HIGH
- **Found by**: Cross-Platform
- **Details**: `~/Downloads` stored as literal string in DB seed and as fallback. The `~` tilde is never expanded on Windows, which would create a literal `~` directory.
- **Fix**: Always use `dirs::download_dir()` and handle the `None` case with a platform-appropriate fallback.

### 2.7 Add Windows Filename Validation --- DONE
- **File**: `src-rust/src/engine_adapter.rs` (missing)
- **Severity**: HIGH
- **Found by**: Cross-Platform, Devil's Advocate
- **Details**: No validation for Windows reserved filenames (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) or illegal characters (`< > : " / \ | ? *`). Downloads with these names will fail on Windows.
- **Fix**: Add a filename sanitization function that replaces illegal characters and reserved names.

### 2.8 Code Signing Setup --- DONE
- **File**: `electron-builder.yml`, CI workflows
- **Severity**: HIGH
- **Found by**: Cross-Platform, Electron Specialist
- **Details**: No code signing configured for any platform. macOS Gatekeeper blocks unsigned apps. Windows SmartScreen warns. macOS CI already names the artifact `macos-dmg-unsigned`.
- **Fix**: Set up code signing certificates for macOS (notarization) and Windows (EV certificate). Add `afterSign` hook in electron-builder config.

### 2.9 Add Auto-Update Mechanism --- DONE
- **File**: `package.json` (missing dependency)
- **File**: `electron-builder.yml` (missing `publish` field)
- **Severity**: MEDIUM
- **Found by**: Electron Specialist, Cross-Platform
- **Details**: No `electron-updater` dependency, no `autoUpdater` configuration, no `publish` config. Users must manually download new versions.
- **Fix**: `npm install electron-updater`. Add `publish` to `electron-builder.yml`:
  ```yaml
  publish:
    provider: github
    owner: goshitsarch-eng
    repo: Gosh-Fetch
  ```
  Add auto-update check in `main.ts`.

### 2.10 Register Protocol Handlers --- DONE
- **File**: `src-electron/main.ts` (missing)
- **File**: `electron-builder.yml` (missing `protocols` section)
- **Severity**: MEDIUM
- **Found by**: Electron Specialist
- **Details**: No `app.setAsDefaultProtocolClient()` for `magnet:` URIs. No `.torrent` file association. No `protocols` section in electron-builder config.
- **Fix**: Add protocol handler registration:
  ```typescript
  app.setAsDefaultProtocolClient('magnet');
  ```
  Add to `electron-builder.yml`:
  ```yaml
  fileAssociations:
    - ext: torrent
      name: BitTorrent File
      mimeType: application/x-bittorrent
  protocols:
    - name: Magnet Link
      schemes: [magnet]
  ```

### 2.11 Add OS Dark Mode Detection --- DONE
- **File**: `src-electron/main.ts` (missing)
- **Severity**: MEDIUM
- **Found by**: Cross-Platform
- **Details**: Theme is stored as user preference but there's no integration with `nativeTheme.shouldUseDarkColors`. App ignores OS dark/light mode setting.
- **Fix**: Add `nativeTheme` listener and default to system preference on first run.

### 2.12 Fix Tray Click on macOS --- DONE
- **File**: `src-electron/main.ts:142`
- **Severity**: LOW
- **Found by**: Cross-Platform
- **Details**: `tray.on('click')` works on Windows/Linux but is not fired on macOS. macOS only supports right-click context menus on tray icons.
- **Fix**: Use `tray.on('double-click')` on macOS, or rely solely on the context menu.

### 2.13 Remove Tauri Dependencies from Linux CI --- DONE
- **File**: `.github/workflows/build-linux.yml:40-46`
- **Severity**: LOW
- **Found by**: Cross-Platform
- **Details**: CI installs `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev` — all Tauri dependencies, not needed for Electron.
- **Fix**: Remove these packages from the CI install step.

### 2.14 Add Window State Persistence --- DONE
- **File**: `src-electron/main.ts:48-62`
- **Severity**: MEDIUM
- **Found by**: Electron Specialist, Designer
- **Details**: Window position, size, and maximized state not saved between sessions.
- **Fix**: Use `electron-window-state` package or manually persist bounds.

### 2.15 Fix Copyright Year --- DONE
- **File**: `electron-builder.yml:3`
- **Severity**: LOW
- **Found by**: Cross-Platform
- **Details**: Says "Copyright (C) 2024" but it's 2026.
- **Fix**: Update to 2026.

---

## Phase 3: Feature Exposure --- COMPLETED

### 3.1 Update gosh-dl Dependency --- DONE
- **File**: `src-rust/Cargo.toml:15`
- **Severity**: HIGH
- **Found by**: Engine Specialist, Networking Specialist
- **Details**: Pinned at v0.1.3 (commit `35bd1297`) but latest is v0.2.2. Missing 9 versions of fixes and features. No version pin in Cargo.toml (just `{ git = "..." }`).
- **Fix**: Update to latest and pin to a specific tag:
  ```toml
  gosh-dl = { git = "https://github.com/goshitsarch-eng/gosh-dl", tag = "v0.2.2" }
  ```

### 3.2 Expose Download Priority Queue --- DONE
- **Found by**: Engine Specialist
- **Details**: gosh-dl has `DownloadPriority: Critical/High/Normal/Low` with a full priority queue. Gosh-Fetch never sets priorities — all downloads use default Normal.
- **Fix**: Add `priority` parameter to `add_download` RPC method and `DownloadOptions`. Add priority selector in AddDownloadModal UI.

### 3.3 Expose Proxy Support --- DONE
- **Found by**: Networking Specialist, Engine Specialist
- **Details**: gosh-dl supports HTTP, HTTPS, and SOCKS5 proxies. No proxy configuration anywhere in Gosh-Fetch settings or engine config.
- **Fix**: Add to Settings: proxy type (none/system/http/socks5), proxy host, proxy port, proxy auth credentials. Pass through to `gosh-dl`'s `HttpConfig`.

### 3.4 Expose Checksum Verification --- DONE
- **Found by**: Engine Specialist
- **Details**: gosh-dl supports MD5/SHA256 checksum verification after download. No RPC method to set expected checksums or trigger verification.
- **Fix**: Add `checksum` field to `DownloadOptions` (format: `sha256:abc123...`). Add verification status display in DownloadCard.

### 3.5 Expose Bandwidth Scheduling --- DONE
- **Found by**: Engine Specialist
- **Details**: gosh-dl has `BandwidthScheduler` with `ScheduleRule` for time-based bandwidth rules. Gosh-Fetch only exposes simple on/off speed limits.
- **Fix**: Add a schedule configuration UI in Settings with time-of-day rules.

### 3.6 Expose Mirror/Failover Support --- DONE
- **Found by**: Engine Specialist
- **Details**: gosh-dl has `MirrorManager` for multiple mirror URLs per download with automatic failover. Gosh-Fetch only passes a single URL.
- **Fix**: Add multi-URL input in AddDownloadModal. Pass as mirror list to engine.

### 3.7 Wire split_count to Engine --- DONE
- **File**: `src-rust/src/settings.rs:43-75`
- **File**: `src-rust/src/db/mod.rs:43`
- **Severity**: HIGH
- **Found by**: Networking Specialist
- **Details**: `split_count` is stored in settings (default 16) but NEVER passed to the engine in `apply_settings_to_engine`. Users can change this setting but it has no effect.
- **Fix**: Add `split_count` to the engine config application in `settings.rs`.

### 3.8 Remove or Implement FTP Support --- DONE
- **File**: `src-rust/src/engine_adapter.rs:58`
- **File**: `src-rust/src/db/mod.rs:260-271`
- **Severity**: HIGH
- **Found by**: Networking Specialist
- **Details**: `DownloadType` enum includes `Ftp` and URL detection recognizes `ftp://` and `sftp://`, but `add_download` routes ALL URLs to `engine.add_http()`. FTP is a label-only fake feature.
- **Fix**: Either implement actual FTP support or remove `Ftp` from the type enum and URL detection to avoid misleading users.

### 3.9 Expose Download Options in AddDownloadModal --- DONE
- **File**: `src/components/downloads/AddDownloadModal.tsx`
- **File**: `src/lib/types/download.ts:98-111`
- **Severity**: HIGH
- **Found by**: UX Specialist
- **Details**: The `DownloadOptions` type supports `dir`, `out`, `split`, `maxConnectionPerServer`, `header`, `selectFile`, etc. The API layer (`api.ts:29-31, 55-58`) fully supports these options. But the AddDownloadModal passes NO options. Users cannot choose save location, rename files, set per-download speed limits, select torrent files, or add custom headers.
- **Fix**: Add collapsible "Advanced Options" section in AddDownloadModal with:
  - Save location picker (use existing `selectDirectory` preload API)
  - Output filename field
  - Speed limit per download
  - Custom headers
  - Connection count per download
  - For torrents: file selection tree

### 3.10 Add Retry Mechanism for Failed Downloads --- DONE
- **File**: `src/components/downloads/DownloadCard.tsx:101-112`
- **Severity**: HIGH
- **Found by**: UX Specialist
- **Details**: Error downloads show in the filter but DownloadCard only shows pause/resume/open-folder/delete actions. No "retry" button for error state.
- **Fix**: Add a retry button that calls `resume_download` or re-adds the download URL. Display `ErrorKind` information (network_error, timeout, auth_required from `download.ts:7-15`).

### 3.11 Expose Sequential Download Mode --- DONE
- **Found by**: Engine Specialist
- **Details**: gosh-dl supports sequential download for streaming media. Not exposed in Gosh-Fetch.
- **Fix**: Add toggle in download options for sequential mode.

### 3.12 Expose File Allocation Modes --- DONE
- **Found by**: Engine Specialist
- **Details**: gosh-dl supports `AllocationMode: None/Sparse/Full`. Never configured.
- **Fix**: Add to advanced settings.

### 3.13 Add Timeout/Retry Configuration --- DONE
- **Found by**: Networking Specialist
- **Details**: No connect timeout, read timeout, retry count, or backoff strategy is configurable.
- **Fix**: Add to Settings: connect timeout (default 30s), read timeout (default 60s), max retries (default 3), retry delay mode (exponential backoff).

### 3.14 Update User-Agent Presets --- DONE
- **File**: `src-rust/src/commands/settings.rs:77-87`
- **Severity**: MEDIUM
- **Found by**: Networking Specialist
- **Details**: Chrome 120 and Firefox 121 presets are from late 2023 — now outdated, could trigger bot detection.
- **Fix**: Update to current browser versions (Chrome 133+, Firefox 135+).

### 3.15 Reduce Default Connections Per Server --- DONE
- **File**: `src-rust/src/db/mod.rs:42`
- **Severity**: MEDIUM
- **Found by**: Networking Specialist
- **Details**: Default 16 connections per server is too aggressive — many servers will rate-limit or block.
- **Fix**: Reduce default to 4-8. Keep 16 as a user-configurable maximum.

### 3.16 Add Batch/Multi-URL Download Support --- DONE
- **File**: `src/lib/api.ts:31-32`
- **Severity**: MEDIUM
- **Found by**: UX Specialist
- **Details**: The API has `addUrls` for multiple URLs but the UI only supports one URL at a time. No textarea for pasting multiple URLs.
- **Fix**: Add a multi-URL textarea mode in AddDownloadModal.

### 3.17 Add Multi-Select Batch Operations --- DONE
- **Severity**: MEDIUM
- **Found by**: UX Specialist
- **Details**: No way to select multiple downloads for batch pause/resume/delete.
- **Fix**: Add checkboxes on download cards, select-all, and batch action toolbar.

### 3.18 Add Download Queue Reordering --- DONE
- **Severity**: MEDIUM
- **Found by**: UX Specialist
- **Details**: Downloads displayed in order received. No drag-and-drop reordering.
- **Fix**: Add drag-and-drop or up/down buttons. Wire to priority system from 3.2.

### 3.19 Fix Torrent File Selection Post-Add --- DONE
- **File**: `src-rust/src/commands/torrent.rs:48-56`
- **Severity**: LOW
- **Found by**: Engine Specialist
- **Details**: `select_torrent_files` is a stub that always returns an error. Users cannot change file selection after starting a torrent.
- **Fix**: Implement using gosh-dl's API if supported, or remove the stub.

---

## Phase 4: Visual Polish & UX

### 4.1 Replace Unicode/Emoji Icons with Lucide React
- **File**: `src/components/layout/Sidebar.tsx:12-15`
- **File**: `src/components/downloads/DownloadCard.tsx:25-34, 101-112`
- **File**: `src/components/downloads/AddDownloadModal.tsx:68`
- **Severity**: CRITICAL
- **Found by**: Designer, UX Specialist
- **Details**: ALL icons are Unicode characters (`\u2193`, `\u2713`, `\u2699`, `\u2139`) and emoji (`\uD83E\uDDF2`, `\uD83D\uDD17`, `\u23F8`, `\u25B6`). These render differently per OS, can't be styled with CSS, and look unprofessional. The "logo" is just `\u2B07`.
- **Fix**: `npm install lucide-react`. Replace every Unicode/emoji icon:
  - Sidebar: `Download`, `Check`, `Settings`, `Info`
  - DownloadCard types: `Magnet`, `FolderClosed`, `Link`
  - Actions: `Pause`, `Play`, `FolderOpen`, `Trash2`, `X`
  - Theme: `Sun`, `Moon`
  - Estimated: ~30 icon replacements across ~6 files

### 4.2 Create Brand Identity & Logo
- **Files**: Missing `favicon.png`, missing `tray-icon.png`, missing app icons
- **Severity**: CRITICAL
- **Found by**: Designer
- **Details**: The "logo" is a Unicode emoji. `favicon.png` (referenced in `index.html:7`) and `tray-icon.png` (referenced in `main.ts:43`) don't exist in the repo. No app icons for installers.
- **Fix**:
  - Design an SVG logo mark (e.g., stylized down-arrow in a rounded rectangle)
  - Generate all required sizes: favicon (16x16, 32x32), tray (22x22 for macOS, 16x16 for Windows), app icon (256x256, 512x512), macOS .icns
  - Place in `/public/` and `/build/` as needed
  - Choose a distinct brand accent color separate from semantic green

### 4.3 Add Animations & Transitions
- **File**: `src/App.css:51-52` (only `--transition-fast: 100ms` and `--transition-normal: 200ms` defined)
- **Severity**: HIGH
- **Found by**: Designer
- **Details**: Almost zero animations:
  - No modal enter/exit animation (appears/disappears instantly)
  - No page transitions between routes
  - No list animations (cards appear/disappear without fade)
  - No theme transition (instant flip between dark/light)
  - No micro-interactions (no button press scale, no checkbox animation)
  - No loading skeletons
- **Fix**:
  - Modal: `@keyframes slideInUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`
  - Theme: `transition: background-color 0.3s ease, color 0.3s ease` on body
  - Buttons: `transform: scale(0.98)` on `:active`
  - Progress bars: Add shimmer animation for active downloads
  - Cards: Staggered `fadeIn` on mount
  - Consider `framer-motion` for more complex animations

### 4.4 Accessibility Overhaul
- **Severity**: CRITICAL
- **Found by**: UX Specialist
- **Details**: Zero accessibility support:
  - No ARIA attributes on any interactive elements (modals lack `role="dialog"`, filter buttons lack `role="tablist"`, badges lack `aria-label`)
  - No focus trapping in modals (`AddDownloadModal.tsx:64`, `DownloadCard.tsx:116`)
  - Close buttons use Unicode `\u2715` with no `aria-label`
  - Color alone conveys download status (no shape/icon differentiation)
  - Range inputs in Settings have no `aria-valuemin/max/now/text`
  - No skip-to-content link
  - No `focus-visible` outlines
- **Fix**:
  - Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby` to modals
  - Implement focus trap (use `focus-trap-react` or custom)
  - Add `aria-label` to all icon-only buttons
  - Add `role="tablist"` and `role="tab"` with `aria-selected` to filter buttons and modal tabs
  - Add `focus-visible` styles: `outline: 2px solid var(--color-info); outline-offset: 2px`
  - Add status icons alongside colors for colorblind users

### 4.5 Replace confirm() with Styled Modal
- **File**: `src/pages/Completed.tsx:23`
- **Severity**: HIGH
- **Found by**: UX Specialist
- **Details**: Uses browser native `confirm()` dialog for clear history — jarring in Electron, cannot be styled.
- **Fix**: Replace with the existing modal pattern used elsewhere.

### 4.6 Add Connection Status Indicator
- **File**: `src/store/statsSlice.ts:11,19,38,42`
- **Severity**: HIGH
- **Found by**: UX Specialist
- **Details**: Redux tracks `isConnected` state and has a `setDisconnected` action, but this is NEVER used in the UI. If the sidecar crashes, users see no indication.
- **Fix**: Add a persistent banner/indicator that shows when the engine is disconnected. Wire `setDisconnected` to the sidecar exit event.

### 4.7 Show App-Level Error States
- **File**: `src/store/downloadSlice.ts:9-10,139-148`
- **File**: `src/pages/Downloads.tsx`
- **Severity**: HIGH
- **Found by**: UX Specialist
- **Details**: `downloadSlice` tracks `error` and `isLoading` state, but Downloads.tsx never reads `selectError` or `selectIsLoading`. No loading spinner, no error banner, no retry.
- **Fix**: Read these selectors in Downloads page. Show loading spinner on initial load, error banner with retry on failure.

### 4.8 Add Settings Unsaved-Changes Detection
- **File**: `src/pages/Settings.tsx`
- **Severity**: HIGH
- **Found by**: UX Specialist
- **Details**: Users can modify settings, navigate away, and lose all changes without warning. No dirty-state tracking.
- **Fix**: Track dirty state via `useState`. Show "unsaved changes" prompt on navigation. Consider auto-save.

### 4.9 Fix Typography Scale
- **File**: `src/App.css`
- **Severity**: MEDIUM
- **Found by**: Designer
- **Details**: 7 different hardcoded font sizes scattered across files. Section headings (`h2`) are 14px — smaller than body text (14px).
- **Fix**: Add token scale:
  ```css
  --text-xs: 0.6875rem;  /* 11px */
  --text-sm: 0.75rem;    /* 12px */
  --text-base: 0.875rem; /* 14px */
  --text-lg: 1rem;       /* 16px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.5rem;    /* 24px */
  ```
  Use consistently everywhere.

### 4.10 Style Range Inputs
- **File**: `src/pages/Settings.tsx:140-156`
- **Severity**: MEDIUM
- **Found by**: Designer, UX Specialist
- **Details**: Range sliders use browser defaults — look wildly different per platform, clash with dark theme. Speed limit slider goes 0-100MB in 1MB steps, making fine control impossible.
- **Fix**: Custom CSS for `::-webkit-slider-thumb`, `::-webkit-slider-track`, `::-moz-range-thumb`. Add numeric input alternative or logarithmic scale for speed limits.

### 4.11 Fix Download Card Hover State
- **File**: `src/components/downloads/DownloadCard.css:12-14`
- **Severity**: LOW
- **Found by**: Designer, UX Specialist
- **Details**: Hover sets `border-color: var(--border-primary)` which is the SAME as default. No visual feedback on hover.
- **Fix**: Change to `var(--border-secondary)` or add subtle background lightening/elevation.

### 4.12 Add Max-Width to Main Content
- **File**: `src/App.css:458-469`
- **Severity**: MEDIUM
- **Found by**: Designer
- **Details**: No max-width constraint on main content. On wide monitors, cards stretch uncomfortably wide.
- **Fix**: Add `max-width: 960px; margin: 0 auto;` to `.main-content` or `.page`.

### 4.13 Consider Merging Downloads and Completed Pages
- **File**: `src/pages/Downloads.tsx:39`, `src/pages/Completed.tsx`
- **Severity**: MEDIUM
- **Found by**: UX Specialist
- **Details**: Downloads page filters OUT completed downloads. Users must jump between two pages. Most download managers use a single list with filters.
- **Fix**: Merge into one page with a "Completed" filter/tab alongside Active/Queued/Paused/Error.

### 4.14 Add Theme to Settings Page
- **File**: `src/pages/Settings.tsx`
- **Severity**: LOW
- **Found by**: UX Specialist
- **Details**: Theme toggle is only in sidebar footer. Settings page doesn't include theme selection despite having a `theme` field.
- **Fix**: Add appearance section in Settings with theme toggle and OS sync option.

### 4.15 Improve Empty States
- **File**: `src/pages/Downloads.tsx:76-80`
- **Severity**: LOW
- **Found by**: Designer
- **Details**: Empty state is a 48px emoji at 0.5 opacity with "No downloads" text. Underwhelming first impression.
- **Fix**: Design a more engaging empty state with illustration, copy, and prominent "Add Download" CTA.

### 4.16 Add Keyboard Shortcuts
- **Severity**: MEDIUM
- **Found by**: Devil's Advocate, Designer
- **Details**: No keyboard shortcuts for common actions.
- **Fix**: Add shortcuts: `Ctrl+N` (add download), `Ctrl+,` (settings), `Ctrl+Q` (quit), `Ctrl+A` (select all), `Escape` (close modal). Register via Electron `globalShortcut` or `accelerator` in menu.

### 4.17 Add Drag-and-Drop Support
- **Severity**: MEDIUM
- **Found by**: Devil's Advocate
- **Details**: Cannot drag a URL or torrent file onto the window.
- **Fix**: Add drop zone handler on the main window.

### 4.18 Switch to HashRouter
- **File**: `src/main.tsx:14`
- **Severity**: MEDIUM
- **Found by**: Designer
- **Details**: `BrowserRouter` works in dev but may cause issues in production Electron where file protocol doesn't support browser-style routing.
- **Fix**: Replace `BrowserRouter` with `HashRouter`.

### 4.19 Add Onboarding Flow
- **Severity**: LOW
- **Found by**: UX Specialist
- **Details**: No welcome screen, no explanation of features, no prompt to configure download location on first run.
- **Fix**: Simple first-run dialog: welcome, set download directory, optional system integration (protocol handler registration).

---

## Phase 5: Quality & Testing

### 5.1 Normalize Redux State
- **File**: `src/store/downloadSlice.ts:7`
- **Severity**: HIGH
- **Found by**: Architect
- **Details**: Downloads stored as flat `Download[]` array. Every poll replaces the entire array, causing new references and full re-renders.
- **Fix**: Use RTK's `createEntityAdapter` for normalized storage keyed by `gid`. Enables O(1) lookups and targeted updates.

### 5.2 Switch from Polling to Push Events
- **File**: `src/pages/Downloads.tsx:35`
- **File**: `src/App.tsx:24-31`
- **Severity**: HIGH
- **Found by**: Architect, Devil's Advocate
- **Details**: Frontend polls every 1 second AND receives real-time push events, but the push events are completely ignored for download state. The entire event system is wasted.
- **Fix**: Use push events for real-time download state updates. Reduce polling to a 5-10 second fallback heartbeat. Only save to DB on state transitions (complete, error) not continuously.

### 5.3 Add React.memo to DownloadCard
- **File**: `src/components/downloads/DownloadCard.tsx`
- **Severity**: MEDIUM
- **Found by**: Devil's Advocate, Architect
- **Details**: Every DownloadCard re-renders every second because the array reference changes on each poll.
- **Fix**: Wrap `DownloadCard` in `React.memo` with custom comparator. Use `useMemo` for filtered downloads.

### 5.4 Add Frontend Test Infrastructure
- **File**: `package.json` (missing test script)
- **Severity**: HIGH
- **Found by**: All specialists
- **Details**: Zero frontend tests. No test runner configured. No test script in package.json.
- **Fix**: `npm install -D vitest @testing-library/react @testing-library/jest-dom`. Add `"test": "vitest"` to package.json scripts.

### 5.5 Add Rust Tests
- **File**: `src-rust/` (only 1 test: `engine_adapter.rs:342-353`)
- **Severity**: HIGH
- **Found by**: All specialists
- **Details**: One unit test (`test_parse_speed`). Missing tests for: `row_to_download`, `convert_options`, `convert_status`, `parse_gid`, all DB operations, `DownloadState::from`, `download_type_from_url`, RPC parsing, settings round-trip.
- **Fix**: Add tests using `#[cfg(test)]` modules. DB operations can test with `:memory:` SQLite. RPC can test by mocking stdin/stdout.

### 5.6 Add CI Test Jobs
- **File**: `.github/workflows/build-*.yml`
- **Severity**: MEDIUM
- **Found by**: All specialists
- **Details**: None of the CI workflows run `cargo test`, `npm test`, or any automated testing.
- **Fix**: Add test steps before build steps in all workflow files.

### 5.7 Add Database Migration Versioning
- **File**: `src-rust/src/db/mod.rs:73-78`
- **Severity**: MEDIUM
- **Found by**: Rust Specialist, Devil's Advocate
- **Details**: `run_migrations` executes SQL with no version tracking. Adding new migrations requires `IF NOT EXISTS` everywhere. No way to detect current schema version.
- **Fix**: Add a `schema_version` table. Check version before running migrations.

### 5.8 Fix Column Access by Name
- **File**: `src-rust/src/db/mod.rs:227-258`
- **Severity**: MEDIUM
- **Found by**: Rust Specialist
- **Details**: Uses positional `row.get(0)`, `row.get(1)` etc. If schema changes or columns reorder, all indexes break silently.
- **Fix**: Use named access: `row.get::<_, String>("column_name")`.

### 5.9 Fix String-Typed Numeric Fields
- **File**: `src-rust/src/types.rs:44-53`
- **Severity**: LOW
- **Found by**: Rust Specialist, Architect, Engine Specialist
- **Details**: `GlobalStat` uses `String` for numeric fields. Forces string->number parsing every second in `rpc_server.rs:37-41`.
- **Fix**: Change fields to proper numeric types (`u64`, `u32`).

### 5.10 Remove Duplicate Utility Functions
- **File**: `src/lib/types/download.ts:48-96`
- **File**: `src/lib/utils/format.ts:76-108`
- **Severity**: LOW
- **Found by**: UX Specialist
- **Details**: `getStatusColor` and `getStatusText` exist in BOTH files with different implementations. `download.ts` returns Tailwind classes, `format.ts` returns CSS variables. The `download.ts` versions are dead code.
- **Fix**: Remove the `download.ts` versions.

### 5.11 Remove Unused Cargo Dependencies
- **File**: `src-rust/Cargo.toml`
- **Severity**: LOW
- **Found by**: Rust Specialist
- **Details**: `base64`, `rand`, and `urlencoding` appear unused in the source. `reqwest` `json` feature is unnecessary (only `.text()` is called).
- **Fix**: Remove unused deps. Change reqwest features to just `rustls-tls`.

### 5.12 Fix Stale Tauri References
- **File**: `src-rust/src/types.rs:3-4`
- **File**: `src-rust/src/engine_adapter.rs:3-5`
- **File**: `.gitignore` (still has Tauri/Svelte entries)
- **Severity**: LOW
- **Found by**: Rust Specialist, Engine Specialist, Networking Specialist
- **Details**: Doc comments reference "Tauri backend" and "Tauri command interface". .gitignore has `src-tauri/` entries and `.svelte-kit/`.
- **Fix**: Update comments. Clean up .gitignore.

### 5.13 Fix TrackerUpdater Caching
- **File**: `src-rust/src/commands/settings.rs:31-41`
- **Severity**: MEDIUM
- **Found by**: Rust Specialist, Devil's Advocate, Architect
- **Details**: New `TrackerUpdater` created on every call. `last_update` and `trackers` fields never persist. `needs_update()` is dead code.
- **Fix**: Store `TrackerUpdater` in `AppState`. Call `needs_update()` before fetching.

### 5.14 Fix panic = "abort" Risk
- **File**: `src-rust/Cargo.toml:33`
- **Severity**: MEDIUM
- **Found by**: Devil's Advocate
- **Details**: `panic = "abort"` in release means any `unwrap()` or `panic!()` instantly kills the process with no cleanup, no error to user. Combined with no auto-restart, one bad unwrap kills the backend permanently.
- **Fix**: Consider removing `panic = "abort"` or audit all potential panic sites.

### 5.15 Fix Event Listener Leak
- **File**: `src-electron/preload.ts:8-12`
- **Severity**: LOW
- **Found by**: Electron Specialist
- **Details**: `onEvent` registers a new `ipcRenderer.on` listener each time. Only `removeAllListeners` is available. React re-mounts create duplicate listeners.
- **Fix**: Return a cleanup function from `onEvent` that removes the specific listener.

### 5.16 Consolidate Duplicate Database Layers
- **Found by**: Engine Specialist
- **Details**: gosh-dl has its own SQLite storage for download state/segments/recovery. Gosh-Fetch maintains a SEPARATE SQLite database for the same downloads. Data duplication and potential inconsistency.
- **Fix**: Consider using gosh-dl's built-in storage and only storing Gosh-Fetch-specific metadata (UI preferences, categories) separately.

---

## Quick Wins (< 30 minutes each)

| # | Task | File | Impact |
|---|------|------|--------|
| 1 | Fix download card hover state | `DownloadCard.css:13` | Visual polish |
| 2 | Switch `BrowserRouter` to `HashRouter` | `src/main.tsx:14` | Production stability |
| 3 | Add `max-width` to main content | `App.css:460` | Wide-screen usability |
| 4 | Remove stale Tauri doc comments | `types.rs:3`, `engine_adapter.rs:3` | Code cleanliness |
| 5 | Remove unused Cargo deps | `Cargo.toml` | Build speed |
| 6 | Add modal fade-in animation | `App.css:386` | Visual polish |
| 7 | Fix copyright year | `electron-builder.yml:3` | Correctness |
| 8 | Remove Tauri deps from Linux CI | `build-linux.yml:41-46` | CI speed |
| 9 | Clean up .gitignore | `.gitignore` | Hygiene |
| 10 | Remove duplicate getStatusColor/Text | `download.ts:48-96` | Dead code removal |
| 11 | Fix reqwest features (drop json) | `Cargo.toml:24` | Build optimization |
| 12 | Auto-dismiss settings save message | `Settings.tsx:185` | UX polish |
| 13 | Add `focus-visible` outlines globally | `App.css` | Accessibility |

---

## Appendix: Specialist Grades

| Area | Grade | Specialist |
|------|-------|-----------|
| Design Token System | B+ | Designer |
| Color Palette | A- | Designer |
| Typography | C+ | Designer |
| Spacing & Layout | B | Designer |
| Iconography | D | Designer |
| Visual Hierarchy | B- | Designer |
| Component Polish | B | Designer |
| Animations | D+ | Designer |
| Brand Identity | D | Designer |
| Desktop Conventions | C+ | Designer |
| Rust Code Quality | Good | Rust Specialist |
| Rust Error Handling | Good | Rust Specialist |
| Rust Async Patterns | Mostly Good (1 critical) | Rust Specialist |
| Rust Memory/Perf | Adequate | Rust Specialist |
| Rust Safety | Good (no unsafe) | Rust Specialist |
| Rust Database | Functional (several issues) | Rust Specialist |
| Rust JSON-RPC | Partial compliance | Rust Specialist |
| Rust Testing | Minimal (1 test) | Rust Specialist |
| Networking Bandwidth Control | Well-implemented | Networking |
| Networking Resume Support | Opaque (delegated to gosh-dl) | Networking |
| Networking Proxy | Non-existent | Networking |
| Networking Timeouts | Non-existent | Networking |
| Engine Feature Utilization | ~60% of gosh-dl features exposed | Engine |

---

*This document is for internal development use. Generated from a 9-specialist review team analysis.*
