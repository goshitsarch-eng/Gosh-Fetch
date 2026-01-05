# Gosh-Fetch: Next Steps

## Current Status

The core application is built and compiles successfully:
- Rust backend with aria2 integration via JSON-RPC
- Svelte 5 frontend with Gosh design system
- System tray with speed meter
- SQLite persistence layer

---

## Phase 1: Core Functionality Testing

### 1.1 aria2 Integration Verification
- [ ] Test aria2 sidecar startup and shutdown
- [ ] Verify JSON-RPC communication works correctly
- [ ] Test download lifecycle: add → pause → resume → complete → remove
- [ ] Test concurrent downloads (up to 20)
- [ ] Test multi-threaded HTTP downloads (up to 64 threads)

### 1.2 Protocol Testing
- [ ] HTTP/HTTPS direct downloads
- [ ] FTP downloads
- [ ] Magnet link resolution
- [ ] .torrent file parsing and download
- [ ] BitTorrent selective file download

### 1.3 Feature Testing
- [ ] Speed limiting (upload/download)
- [ ] Custom User-Agent switching
- [ ] Tracker list auto-update from ngosang/trackerslist
- [ ] UPnP/NAT-PMP port mapping (BitTorrent)
- [ ] Download completion notifications

---

## Phase 1.5: aria2 Integration Hardening

### 1.5.1 Normalize aria2's Weird States [DONE]

aria2 reports confusing states that users shouldn't see:
- `active` but stalled (no peers, no progress)
- `waiting` forever (queue stuck)
- `error` with cryptic codes (error code 24, etc.)

**Implemented clean state machine:** (`src-tauri/src/aria2/types.rs`)

```
┌─────────┐     ┌─────────────┐     ┌────────┐     ┌───────────┐
│ queued  │────▶│ downloading │────▶│ paused │────▶│ completed │
└─────────┘     └─────────────┘     └────────┘     └───────────┘
                      │                  ▲
                      ▼                  │
                 ┌─────────┐      ┌──────────┐
                 │  error  │─────▶│ retrying │
                 └─────────┘      └──────────┘
```

**Implementation in `src-tauri/src/aria2/types.rs`:**
```rust
pub enum AppDownloadState {
    Queued,       // Waiting to start
    Downloading,  // Active with progress
    Stalled,      // Active but no progress for 30s+
    Paused,       // User paused
    Completed,    // Successfully finished
    Error(ErrorKind),  // Failed with reason
    Retrying,     // Auto-retry in progress
}

pub enum ErrorKind {
    NetworkError,
    FileError,
    NotFound,
    Timeout,
    Unknown(i32),
}

// Map aria2 states to clean app states
fn normalize_state(aria2_status: &str, speed: u64, stall_time: Duration) -> AppDownloadState {
    match aria2_status {
        "active" if speed == 0 && stall_time > Duration::from_secs(30) => AppDownloadState::Stalled,
        "active" => AppDownloadState::Downloading,
        "waiting" => AppDownloadState::Queued,
        "paused" => AppDownloadState::Paused,
        "complete" => AppDownloadState::Completed,
        "error" => AppDownloadState::Error(ErrorKind::Unknown(0)),
        "removed" => AppDownloadState::Error(ErrorKind::Unknown(-1)),
        _ => AppDownloadState::Queued,
    }
}
```

**Error code translation table:**
| aria2 Code | Meaning | User-Friendly Message |
|------------|---------|----------------------|
| 1 | Unknown error | Download failed |
| 2 | Timeout | Server took too long to respond |
| 3 | Resource not found | File not found (404) |
| 6 | Network problem | Connection failed |
| 7 | Resume not supported | Cannot resume, restarting |
| 13 | File already exists | File exists, skipping |
| 24 | HTTP authorization failed | Login required |

### 1.5.2 Don't Expose Raw aria2 Config [DONE]

**Never let users edit aria2.conf directly.** Instead:

- [x] Generate config programmatically in Rust (`src-tauri/src/aria2/process.rs`)
- [x] Store generated config in app data directory
- [x] Expose only safe toggles in the Settings UI

**Safe settings to expose:**
```rust
pub struct UserSettings {
    // Connection
    pub max_concurrent_downloads: u8,      // 1-20
    pub max_connections_per_server: u8,    // 1-16
    pub split_count: u8,                   // 1-64
    pub download_speed_limit: u64,         // bytes/sec, 0 = unlimited
    pub upload_speed_limit: u64,

    // Behavior
    pub user_agent: String,                // From preset list only
    pub enable_dht: bool,
    pub enable_pex: bool,
    pub seed_ratio: f32,                   // 0.0-10.0

    // Paths
    pub download_directory: PathBuf,
}

// These are NEVER exposed to users:
// --rpc-secret, --rpc-listen-port, --enable-rpc, --conf-path
// --log, --log-level, --disk-cache, --file-allocation
```

### 1.5.3 RPC Security [DONE]

Even "localhost only" can be poked by malicious websites or local processes.

**Security checklist:**
- [x] Bind to `127.0.0.1` only (`--rpc-listen-all=false`)
- [x] Generate random per-install RPC secret
- [x] Store secret in app config directory (not in code)
- [x] Validate port is available before spawning (`src-tauri/src/aria2/process.rs`)
- [x] Never accept port from user input without validation

**Current implementation (verify in `src-tauri/src/state.rs`):**
```rust
fn generate_secret() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: [u8; 16] = rng.gen();
    hex::encode(bytes)  // 32-char hex string
}
```

**Port validation before spawn:**
```rust
fn is_port_available(port: u16) -> bool {
    std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
}

async fn find_available_port(start: u16) -> u16 {
    for port in start..start+100 {
        if is_port_available(port) {
            return port;
        }
    }
    panic!("No available ports");
}
```

### 1.5.4 Operational Details for Native Feel [DONE]

**App data directory structure:**
```
~/.config/gosh-fetch/           # Linux
~/Library/Application Support/gosh-fetch/  # macOS
%APPDATA%/gosh-fetch/           # Windows
├── aria2.conf                  # Generated config
├── aria2.session               # Persisted downloads
├── gosh-fetch.db               # SQLite database
├── rpc.secret                  # RPC token (chmod 600)
└── logs/
    └── aria2.log
```

**Implementation tasks:**
- [x] Write aria2 session file to app data dir
- [x] Set download dir explicitly per job (not global)
- [x] Use `--stop-with-process=<PID>` on Linux/macOS for auto-cleanup (`src-tauri/src/aria2/process.rs`)
- [x] Handle "aria2 already running" by checking port before spawn
- [x] Graceful shutdown: save session before killing aria2 (`src-tauri/src/aria2/supervisor.rs`)

**Stop-with-process implementation:**
```rust
#[cfg(unix)]
fn get_aria2_args(&self) -> Vec<String> {
    let mut args = self.base_args();
    args.push(format!("--stop-with-process={}", std::process::id()));
    args
}
```

### 1.5.5 Rust aria2 Supervisor [DONE]

Built a robust process manager (`src-tauri/src/aria2/supervisor.rs`):

```rust
pub struct Aria2Supervisor {
    process: Option<Child>,
    client: Option<Aria2Client>,
    config: Aria2Config,
    restart_count: u32,
    last_health_check: Instant,
}

impl Aria2Supervisor {
    /// Start aria2 and establish RPC connection
    pub async fn start(&mut self) -> Result<()>;

    /// Graceful shutdown with session save
    pub async fn stop(&mut self) -> Result<()>;

    /// Check if aria2 is responsive, restart if dead
    pub async fn health_check(&mut self) -> Result<()>;

    /// Auto-restart on crash (max 3 attempts)
    pub async fn ensure_running(&mut self) -> Result<()>;
}
```

**Health check loop:**
```rust
async fn health_check_loop(supervisor: Arc<Mutex<Aria2Supervisor>>) {
    loop {
        tokio::time::sleep(Duration::from_secs(5)).await;

        let mut sup = supervisor.lock().await;
        if let Err(e) = sup.health_check().await {
            log::warn!("aria2 health check failed: {}", e);
            if sup.restart_count < 3 {
                log::info!("Attempting restart...");
                let _ = sup.start().await;
                sup.restart_count += 1;
            } else {
                log::error!("aria2 failed to restart after 3 attempts");
                // Emit error event to frontend
            }
        } else {
            sup.restart_count = 0;  // Reset on successful check
        }
    }
}
```

**JSON-RPC client wrapper (typed, clean):**
```rust
impl Aria2Client {
    // All methods return typed responses, not raw JSON
    pub async fn add_uri(&self, urls: Vec<String>, opts: DownloadOptions) -> Result<Gid>;
    pub async fn add_torrent(&self, torrent: &[u8], opts: DownloadOptions) -> Result<Gid>;
    pub async fn pause(&self, gid: &Gid) -> Result<()>;
    pub async fn resume(&self, gid: &Gid) -> Result<()>;
    pub async fn remove(&self, gid: &Gid, force: bool) -> Result<()>;
    pub async fn get_status(&self, gid: &Gid) -> Result<DownloadStatus>;
    pub async fn get_global_stats(&self) -> Result<GlobalStats>;

    // Batch operations for efficiency
    pub async fn get_all_statuses(&self) -> Result<Vec<DownloadStatus>> {
        let (active, waiting, stopped) = tokio::join!(
            self.tell_active(),
            self.tell_waiting(0, 100),
            self.tell_stopped(0, 100),
        );
        // Merge and return
    }
}

// Type-safe GID wrapper
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Gid(String);

impl Gid {
    pub fn new(s: String) -> Result<Self> {
        if s.len() == 16 && s.chars().all(|c| c.is_ascii_hexdigit()) {
            Ok(Self(s))
        } else {
            Err(Error::InvalidGid(s))
        }
    }
}
```

---

## Phase 2: UI/UX Polish

### 2.1 Icons and Branding
- [ ] Design proper app icon (SVG source, export to PNG/ICO/ICNS)
- [ ] Create tray icons for light/dark system themes
- [ ] Add favicon for the webview
- [ ] Design logo for sidebar header

### 2.2 UI Improvements
- [ ] Add loading states and skeleton screens
- [ ] Implement drag-and-drop for .torrent files
- [ ] Add keyboard shortcuts (Ctrl+N for new download, etc.)
- [ ] Implement search/filter in download list
- [ ] Add download category/tag support
- [ ] Improve progress bar animations

### 2.3 Accessibility
- [ ] Fix Svelte a11y warnings (label associations, ARIA roles)
- [ ] Ensure keyboard navigation works throughout
- [ ] Test with screen readers
- [ ] Add focus indicators

### 2.4 Notifications
- [ ] Implement native OS notifications on download complete
- [ ] Add optional sound effects
- [ ] Badge count on dock/taskbar icon

---

## Phase 3: Platform-Specific Work

### 3.1 Linux
- [ ] Test on major distros (Ubuntu, Fedora, Arch)
- [ ] Create AppImage build
- [ ] Create .deb package
- [ ] Create Flatpak manifest
- [ ] Verify system tray works on GNOME/KDE/XFCE

### 3.2 macOS
- [ ] Build and test on Intel Mac
- [ ] Build and test on Apple Silicon
- [ ] Code signing and notarization
- [ ] DMG installer with background image
- [ ] Menu bar integration

### 3.3 Windows
- [ ] Build and test on Windows 10/11
- [ ] MSI/NSIS installer
- [ ] Code signing
- [ ] Windows Defender exclusion guidance
- [ ] Startup on login option

---

## Phase 4: aria2 Binary Bundling

### 4.1 Binary Acquisition
```bash
# Download static builds for each platform
# Linux x86_64
curl -L "https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-linux-gnu-64bit-build1.tar.bz2"

# Windows x86_64
curl -L "https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip"

# macOS - build from source or use Homebrew
brew install aria2 --build-from-source
```

### 4.2 Binary Placement
```
src-tauri/binaries/
├── aria2c-x86_64-unknown-linux-gnu
├── aria2c-aarch64-unknown-linux-gnu
├── aria2c-x86_64-pc-windows-msvc.exe
├── aria2c-x86_64-apple-darwin
└── aria2c-aarch64-apple-darwin
```

### 4.3 Tauri Sidecar Configuration
Already configured in `tauri.conf.json`:
```json
{
  "bundle": {
    "externalBin": ["binaries/aria2c"]
  }
}
```

---

## Phase 5: CI/CD Pipeline

### 5.1 GitHub Actions Workflow
Create `.github/workflows/release.yml`:
- Build on push to `main` or tag
- Matrix build: Linux, macOS (Intel + ARM), Windows
- Upload artifacts
- Create GitHub Release on tag

### 5.2 Build Script
```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: ubuntu-22.04
            target: x86_64-unknown-linux-gnu
          - os: macos-latest
            target: x86_64-apple-darwin
          - os: macos-latest
            target: aarch64-apple-darwin
          - os: windows-latest
            target: x86_64-pc-windows-msvc

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: npm install
      - run: npm run tauri build
      - uses: actions/upload-artifact@v4
```

---

## Phase 6: Documentation

### 6.1 User Documentation
- [ ] README with features and screenshots
- [ ] Installation guide per platform
- [ ] FAQ (firewall settings, slow downloads, etc.)
- [ ] Keyboard shortcuts reference

### 6.2 Developer Documentation
- [ ] Architecture overview
- [ ] Build instructions
- [ ] Contributing guide
- [ ] Code style guide

---

## Phase 7: Advanced Features (Future)

### 7.1 Browser Integration
- [ ] Browser extension for one-click downloads
- [ ] Clipboard monitoring for URLs

### 7.2 Scheduling
- [ ] Download scheduler (start at specific times)
- [ ] Bandwidth scheduling (full speed at night)

### 7.3 Advanced BitTorrent
- [ ] RSS feed subscription
- [ ] Sequential download for video streaming
- [ ] Peer blocklist support

### 7.4 Integrations
- [ ] yt-dlp integration for video sites
- [ ] Gallery-dl for image sites
- [ ] Metalink support

---

## Quick Start Commands

```bash
# Development
npm install
npm run tauri dev

# Build for current platform
npm run tauri build

# Run tests
cargo test --manifest-path src-tauri/Cargo.toml

# Lint
cargo clippy --manifest-path src-tauri/Cargo.toml
npm run check
```

---

## File Checklist

### Must Have Before Release
- [ ] `src-tauri/icons/` - Proper app icons (32, 128, 256, ico, icns)
- [ ] `src-tauri/binaries/` - aria2 binaries for all platforms
- [ ] `README.md` - Updated with screenshots and install instructions
- [ ] `LICENSE` - Already present (AGPL-3.0)
- [ ] `.github/workflows/release.yml` - CI/CD pipeline

### Nice to Have
- [ ] `CHANGELOG.md`
- [ ] `CONTRIBUTING.md`
- [ ] `docs/` - Extended documentation
- [ ] `scripts/` - Build helper scripts

---

## Priority Order

1. **Test aria2 integration** - Ensure downloads actually work
2. **Implement state normalization** - Clean state machine over aria2's weird states
3. **Add aria2 supervisor** - Health checks, auto-restart, graceful shutdown
4. **RPC security hardening** - Port validation, secret storage
5. **Fix any runtime bugs** - Stabilize core functionality
6. **Bundle aria2 binaries** - Required for distribution
7. **Create proper icons** - Visual polish
8. **Set up CI/CD** - Automated builds
9. **Write README** - User-facing documentation
10. **First release** - Tag v1.0.0

---

## Implementation Notes

### Why These Details Matter

**State normalization**: Users don't care that aria2 says "active" - they care if their download is progressing. A stalled download should show "Stalled", not "Downloading at 0 B/s".

**Config safety**: Power users will ask for "advanced settings". Resist. Every exposed option is a support ticket waiting to happen. Generate safe configs programmatically.

**RPC security**: Localhost isn't safe. Browser exploits, malicious npm packages, and other local processes can all hit `127.0.0.1:6800`. The random secret + port validation makes this much harder to exploit.

**Supervisor pattern**: aria2 will crash. Disks fill up, networks drop, torrents have bad peers. A proper supervisor catches crashes, saves state, and restarts cleanly - users should never see "aria2 has stopped working".

**Native feel**: The difference between "download manager" and "aria2 GUI" is in details like session persistence, per-job directories, and auto-cleanup. These make it feel like a real app, not a wrapper.
