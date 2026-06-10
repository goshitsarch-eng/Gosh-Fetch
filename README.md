# Gosh-Fetch

A cross-platform download manager for Linux, Windows, and macOS. Built with Tauri 2, Svelte 5, and a native Rust download engine.

## Screenshots

![Screenshot 1](screenshots/img11.png)
![Screenshot 2](screenshots/img22.png)
![Screenshot 3](screenshots/img3.png)
![Screenshot 4](screenshots/img4.png)

## Features

Gosh-Fetch handles HTTP/HTTPS and BitTorrent downloads through gosh-dl, a native Rust engine built specifically for this project. It supports magnet links, multi-segment parallel downloads, and runs on all three major desktop platforms with dark and light themes.

There are no accounts, no telemetry, and no cloud features. Everything stays on your machine.

### Download Management

Downloads show real-time progress, speed, ETA, and connection metrics. You can pause, resume, retry, and cancel individual downloads, or use batch operations to act on multiple downloads at once with checkbox selection and select-all.

The queue supports drag-and-drop reordering, which automatically syncs with the priority system (critical, high, normal, low). Advanced per-download options include custom filename, save directory, speed limit, HTTP headers, connection count, checksum verification (SHA-256 and MD5), mirror/failover URLs, and sequential download mode for streaming media.

Completed downloads are available in the History page, where you can open files or their containing folders directly.

### Mirror

The Mirror page handles recursive HTTP directory mirroring: point it at a directory-listing URL and Gosh-Fetch crawls the listing and downloads the whole tree to disk, preserving the directory structure. You can limit crawl depth, filter with include/exclude patterns, and run a dry-run discovery first to preview exactly which files would be fetched before committing. Mirror jobs track per-file progress and can be cancelled or removed like any other download.

### BitTorrent

Full BitTorrent protocol support including torrent files and magnet links, DHT, PEX, and Local Peer Discovery. You get seeder/peer counts, configurable seed ratio, selective file download from multi-file torrents, and auto-updating tracker lists sourced from the community.

### Network and Reliability

- Concurrent downloads: 1-20 (default 5)
- Connections per server: 1-16 (default 8)
- Segments per download: 1-64 (default 8)
- Global and per-download speed limits
- HTTP/SOCKS proxy support
- Connection timeout (default 30s) and read timeout (default 60s)
- Automatic retry with configurable attempts (default 3)
- Custom user agent with browser presets (Chrome, Firefox, Wget, Curl)
- File allocation modes: none, sparse, full

### Desktop Integration

- System tray with live download/upload speed display and a popup showing active downloads (macOS and Windows; on Linux the tray is menu-only, since libappindicator does not deliver click events)
- Minimize to tray on close
- Window size, position, and maximized state persistence
- `.torrent` file association and `magnet:` protocol handler
- Drag and drop URLs, magnet links, or `.torrent` files onto the window
- Desktop notifications on download completion
- Keyboard shortcuts: `Ctrl+N` (add download), `Ctrl+K` (focus search), `Ctrl+,` (settings), `Ctrl+A` (select all)
- First-run onboarding with download path setup and system integration options
- Run at startup option
- Bandwidth scheduling with time-based rules

### Pages

The sidebar navigation provides access to: Downloads (with active/paused filters), Mirror, History, Statistics, Scheduler, and Settings. A disk space widget in the sidebar shows remaining storage. A notification dropdown tracks download events (added, completed, failed).

## Download Engine

Gosh-Fetch uses [gosh-dl](https://github.com/goshitsarch-eng/gosh-dl), a native Rust download engine built specifically for this project.

| Feature | gosh-dl | External Tools |
|---------|---------|----------------|
| No external binaries | Yes | No |
| Memory safe | Yes (Rust) | Varies |
| Single binary distribution | Yes | No |
| Integrated error handling | Yes | Limited |

gosh-dl provides HTTP/HTTPS segmented downloads with automatic resume, full BitTorrent protocol support with DHT/PEX/LPD, recursive HTTP directory mirroring, async I/O built on Tokio, real-time progress events pushed to the frontend, a priority queue, bandwidth scheduling, mirror/failover management, and checksum verification. As of v3.0.0 the engine is embedded directly in the app process (gosh-dl 0.5.0 from crates.io) rather than shipped as a separate binary.

gosh-dl is licensed under MIT. See the [gosh-dl repository](https://github.com/goshitsarch-eng/gosh-dl) for details.

## Architecture

```
+----------------------------------+
|  Svelte 5 (runes) webview UI     |
|  Vite dev server / built bundle  |
+----------------------------------+
|  Tauri 2 Rust backend            |
|  commands, events, tray, update  |
|  SQLite for settings & history   |
+----------------------------------+
|  gosh-dl (Rust download engine)  |
|  HTTP, BitTorrent, async I/O     |
+----------------------------------+
```

Everything runs in a single process. The Svelte frontend calls Rust functions directly via Tauri commands (`invoke`), and the backend pushes real-time events for download state changes (added, completed, failed, paused, resumed, etc.) via Tauri's event system. The gosh-dl download engine is embedded as a library -- there is no separate sidecar binary or JSON-RPC layer.

For more detail, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Svelte 5 (runes), svelte-spa-router, TypeScript |
| Build | Vite 7, Tauri CLI |
| Desktop | Tauri 2 |
| Backend | Rust (Tokio, rusqlite, serde) |
| Engine | gosh-dl 0.5.0 |
| Icons | Material Symbols Outlined (self-hosted) |
| Drag & Drop | svelte-dnd-action |
| Testing | Vitest, Svelte Testing Library, Rust `#[test]` |

## Installation

### Arch Linux (AUR)

```bash
yay -S gosh-fetch-bin
```

Available as [`gosh-fetch-bin`](https://aur.archlinux.org/packages/gosh-fetch-bin) on the AUR. Installs the prebuilt package with a desktop entry, icons, `.torrent` file association, and `magnet:` URI handler. Note: v3 release artifacts and runtime dependencies differ from v2 (the Tauri build needs `webkit2gtk-4.1`, `gtk3`, and `libappindicator-gtk3`, and the bundle is much smaller), so the PKGBUILD is updated alongside the first v3 release.

### Other Linux / Windows / macOS

Download the latest release from the [Releases](https://github.com/goshitsarch-eng/Gosh-Fetch/releases) page.

| Platform | Formats |
|----------|---------|
| Linux | AppImage, .deb, .rpm |
| macOS | .dmg |
| Windows | NSIS installer |

### Upgrading from 2.x

The 2.x in-app updater (electron-updater) cannot deliver v3, so the jump to 3.0.0 is a one-time manual download from the Releases page. The old 2.x package remains installed until you remove it yourself. Your data is preserved automatically: v3 uses the same app data locations and picks up your existing download history, settings, and engine state in place (gosh-dl migrates its `engine.db` schema automatically on first run). If you want to be cautious, back up `engine.db` from the app data directory before the first v3 launch. From 3.0.0 onward, in-app updates work again via the Tauri updater.

## Building from Source

### Requirements

### All Platforms

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) 1.77+

### Linux

```bash
# Debian/Ubuntu
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

### macOS

- Xcode Command Line Tools

### Windows

- No additional dependencies

## Building

```bash
# Install dependencies
npm install

# Development (frontend + Tauri window, compiles the Rust backend)
npm run tauri dev

# Frontend only
npm run dev                # Vite dev server on port 5173
npm run build              # Build frontend bundle
npm run check              # svelte-check

# Production build (AppImage/deb/rpm on Linux, dmg on macOS, NSIS on Windows)
npm run tauri build

# Run tests
npm test                   # Frontend tests (Vitest)
cd src-tauri && cargo test # Rust tests
```

## Usage

1. **Add Download** -- Click "Add Download" or press `Ctrl+N`. Enter a URL, magnet link, or browse for a `.torrent` file. Expand "Advanced Options" for filename, directory, speed limit, headers, priority, checksum, mirrors, and more.
2. **Monitor** -- Watch real-time speed, progress, ETA, and peer info. Filter by Active, Paused, or view all.
3. **Manage** -- Pause, resume, retry, or remove downloads. Select multiple with checkboxes for batch operations. Drag to reorder priority.
4. **Mirror** -- Recursively mirror an HTTP directory listing to disk, with depth and include/exclude filters and a dry-run preview.
5. **History** -- View completed downloads and open files or folders directly.
6. **Statistics** -- View download statistics and trends.
7. **Scheduler** -- Set up bandwidth scheduling rules based on time of day.

You can also drag URLs, magnet links, or `.torrent` files directly onto the app window.

## Privacy

- No telemetry or analytics
- No data collection
- No network activity unless explicitly initiated by you
- All data stored locally on your device

## Disclaimer

This software is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). It is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability or fitness for a particular purpose. Use at your own risk.

## License

AGPL-3.0 - See [LICENSE](LICENSE)

The gosh-dl download engine is licensed under MIT.

## Roadmap

Planned features for future releases:

- **Browser Extension** -- One-click downloads from your browser
- **RSS Feed Support** -- Automatic downloads from RSS/podcast feeds
- **Download Categories** -- Organize downloads by type with custom save locations
- **Import/Export** -- Backup and restore download history and settings

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.
