# Gosh-Fetch

A cross-platform download manager for Linux, Windows, and macOS. Built with Electron, React, and a native Rust download engine.

## Philosophy

Gosh apps are built with a Linux-first mindset: simplicity, transparency, and user control.

We also provide Windows and macOS builds not as a compromise, but as an on-ramp. Many people are curious about Linux but still live on other platforms day-to-day. If these tools help someone get comfortable and eventually make the jump, we're happy to meet them where they are.

## Screenshots

![Screenshot 1](screenshots/img1.png)
![Screenshot 2](screenshots/img2.png)

## Features

- HTTP/HTTPS and BitTorrent downloads with a native Rust engine
- Magnet link support with metadata retrieval
- Multi-segment downloads for faster speeds
- Cross-platform: Linux, Windows, macOS
- Dark and light themes with system theme detection
- System tray with live speed display
- Auto-updates via GitHub Releases
- No telemetry, accounts, or cloud features

### Download Management

- Real-time progress, speed, ETA, and connection metrics
- Pause, resume, retry, and cancel individual downloads
- Batch operations: pause all, resume all, select multiple and act
- Drag-and-drop queue reordering with automatic priority sync
- Download history with completed file access
- Per-download advanced options: custom filename, save directory, speed limit, headers, connection count
- Priority levels: critical, high, normal, low
- Checksum verification (SHA-256, MD5)
- Mirror/failover URLs for redundancy
- Sequential download mode for streaming media

### BitTorrent

- Torrent file and magnet link support
- DHT, PEX, and Local Peer Discovery
- Seeder/peer count and client info
- Configurable seed ratio
- Auto-updating tracker lists from community sources
- Selective file download from multi-file torrents

### Network & Reliability

- Configurable concurrent downloads (1-20)
- Connections per server (1-16)
- Segments per download (1-64)
- Global and per-download speed limits
- HTTP/SOCKS proxy support
- Connection and read timeout configuration
- Automatic retry with configurable attempts
- Custom user agent with browser presets
- File allocation modes: none, sparse, full

### Desktop Integration

- System tray with live download/upload speeds
- Minimize to tray on close
- Window size and position persistence
- `.torrent` file association
- `magnet:` protocol handler
- Drag and drop URLs and `.torrent` files onto the window
- Desktop notifications on download completion
- Keyboard shortcuts: `Ctrl+N` (add download), `Ctrl+,` (settings), `Ctrl+A` (select all)
- First-run onboarding with download path setup

## Download Engine

Gosh-Fetch uses [gosh-dl](https://github.com/goshitsarch-eng/gosh-dl), a native Rust download engine built specifically for this project.

| Feature | gosh-dl | External Tools |
|---------|---------|----------------|
| No external binaries | Yes | No |
| Memory safe | Yes (Rust) | Varies |
| Single binary distribution | Yes | No |
| Integrated error handling | Yes | Limited |

### gosh-dl Capabilities

- **HTTP/HTTPS**: Segmented downloads with automatic resume
- **BitTorrent**: Full protocol support with DHT, PEX, LPD
- **Async I/O**: Built on Tokio for efficient concurrent downloads
- **Progress Events**: Real-time status pushed to the frontend

gosh-dl is licensed under MIT. See the [gosh-dl repository](https://github.com/goshitsarch-eng/gosh-dl) for details.

## Architecture

```
┌─────────────────────────────────┐
│  React + Redux Toolkit (UI)     │
│  Vite dev server / built bundle │
├─────────────────────────────────┤
│  Electron Main Process          │
│  IPC bridge, tray, auto-update  │
├─────────────────────────────────┤
│  gosh-fetch-engine (Rust)       │
│  JSON-RPC over stdin/stdout     │
│  SQLite for settings & history  │
├─────────────────────────────────┤
│  gosh-dl (Rust download engine) │
│  HTTP, BitTorrent, async I/O    │
└─────────────────────────────────┘
```

The Rust sidecar (`gosh-fetch-engine`) runs as a child process. Electron communicates with it via JSON-RPC over stdin/stdout. The frontend receives real-time push events for download state changes, with a 5-second heartbeat poll as fallback.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Redux Toolkit, React Router, TypeScript |
| Build | Vite 6, electron-builder |
| Desktop | Electron 33 |
| Backend | Rust, Tokio, SQLite (rusqlite) |
| Engine | gosh-dl 0.2.2 |
| Icons | Lucide React |
| Drag & Drop | dnd-kit |
| Testing | Vitest, React Testing Library, Rust `#[test]` |

## Requirements

### All Platforms

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) 1.77+

### Linux

No additional system dependencies required beyond Node.js and Rust.

### macOS

- Xcode Command Line Tools

### Windows

- No additional dependencies

## Building

```bash
# Install dependencies
npm install

# Build the Rust engine
cargo build --release --manifest-path src-rust/Cargo.toml

# Development (frontend + Electron)
npm run dev                # Vite dev server on port 5173
npm run build:electron     # Compile Electron main process
npx electron .             # Launch the app

# Or use the combined dev command
npm run electron:dev

# Production build
npm run electron:build

# Run tests
npm test                   # Frontend tests (Vitest)
cargo test --manifest-path src-rust/Cargo.toml  # Rust tests
```

### Build Outputs

| Platform | Formats |
|----------|---------|
| Linux | AppImage, .deb, .rpm |
| macOS | .dmg |
| Windows | NSIS installer, portable |

## Usage

1. **Add Download** - Click "Add Download" or press `Ctrl+N`. Enter a URL, magnet link, or browse for a `.torrent` file. Expand "Advanced Options" for filename, directory, speed limit, headers, priority, and checksum.
2. **Monitor** - Watch real-time speed, progress, ETA, and peer info. Filter by Active, Paused, Error, or Completed.
3. **Manage** - Pause, resume, retry, or remove downloads. Select multiple with checkboxes for batch operations. Drag to reorder priority.
4. **History** - View completed downloads and open files or folders directly.

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

- **Browser Extension** - One-click downloads from your browser
- **RSS Feed Support** - Automatic downloads from RSS/podcast feeds
- **Download Categories** - Organize downloads by type with custom save locations
- **Import/Export** - Backup and restore download history and settings

## Contributing

Contributions welcome. Please open an issue first for major changes.
