# gosh-dl

A fast, safe, and reliable download engine written in Rust. Built as a modern, embeddable alternative to aria2.

[![Crates.io](https://img.shields.io/crates/v/gosh-dl.svg)](https://crates.io/crates/gosh-dl)
[![Documentation](https://docs.rs/gosh-dl/badge.svg)](https://docs.rs/gosh-dl)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why gosh-dl?

We built gosh-dl because integrating aria2 into applications comes with significant pain points:

### The Problem with aria2

[aria2](https://aria2.github.io/) is an excellent standalone download utility, but using it as an embedded download engine in applications is painful:

| Challenge | aria2 | gosh-dl |
|-----------|-------|---------|
| **Integration** | Spawns external process, requires JSON-RPC over HTTP/WebSocket | Native library, direct function calls |
| **Deployment** | Must bundle 5+ platform-specific binaries (Linux, macOS, Windows x ARM/x64) | Single Rust crate, compiles for any target |
| **Binary Size** | ~8MB per platform binary | Compiles into your app, no extra binaries |
| **Process Management** | Must handle process lifecycle, crashes, zombies | No processes to manage |
| **IPC Overhead** | JSON serialization + HTTP roundtrip for every call | Zero-cost async function calls |
| **Error Handling** | Parse JSON error responses, handle connection failures | Native Rust `Result<T, E>` types |
| **Type Safety** | Stringly-typed JSON API | Fully typed Rust API with compile-time checks |
| **Memory Safety** | C++ codebase | Rust with no unsafe in core paths |

### Real-World Pain We Solved

When building [Gosh-Fetch](https://github.com/goshitsarch-eng/Gosh-Fetch), we experienced these aria2 issues firsthand:

1. **Build Complexity**: Our CI/CD had to download and bundle aria2 binaries for 6 different platform/architecture combinations
2. **Startup Latency**: Spawning aria2 and waiting for RPC to be ready added 500ms+ to app startup
3. **Crash Recovery**: When aria2 crashed, we lost download state and had to implement complex recovery logic
4. **Resource Usage**: Running a separate process meant duplicate memory usage and context switching overhead
5. **Cross-Platform Bugs**: aria2 behaved differently across platforms, requiring platform-specific workarounds

### gosh-dl Advantages

```
Your App                          Your App + aria2
┌─────────────────────┐           ┌─────────────────────┐
│                     │           │                     │
│   Your Rust Code    │           │   Your Rust Code    │
│         │           │           │         │           │
│         ▼           │           │         ▼           │
│   ┌───────────┐     │           │   JSON-RPC Client   │
│   │  gosh-dl  │     │           │         │           │
│   │ (library) │     │           └─────────┼───────────┘
│   └───────────┘     │                     │ HTTP/WS
│                     │                     ▼
└─────────────────────┘           ┌─────────────────────┐
                                  │   aria2c process    │
 Single process                   │   (external bin)    │
 ~2MB additional code             └─────────────────────┘
 Direct function calls
 Shared memory                     Two processes
                                   ~8MB aria2 binary
                                   IPC serialization
                                   Separate memory space
```

## Features

- **HTTP/HTTPS Downloads**
  - Multi-connection segmented downloads (up to 16 parallel connections)
  - Automatic resume support with ETag/Last-Modified validation
  - Connection pooling with rate limiting
  - Custom headers (User-Agent, Referer, etc.)

- **BitTorrent**
  - Full protocol support (BEP 3)
  - Magnet URI parsing
  - DHT for trackerless downloads (BEP 5)
  - Peer Exchange (BEP 11)
  - Local Peer Discovery (BEP 14)
  - UDP tracker support (BEP 15)

- **Reliability**
  - SQLite-based state persistence with WAL mode
  - Automatic retry with exponential backoff
  - Crash recovery and resume

- **Cross-platform**: Linux, macOS, and Windows

- **Memory-safe**: Written in Rust with no unsafe code in core paths

- **Async-native**: Built on Tokio for efficient concurrent downloads

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
gosh-dl = "0.1"
tokio = { version = "1", features = ["full"] }
```

## Quick Start

```rust
use gosh_dl::{DownloadEngine, EngineConfig, DownloadOptions};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create engine with default config
    let config = EngineConfig::default();
    let engine = DownloadEngine::new(config).await?;

    // Add a download
    let id = engine.add_http(
        "https://example.com/file.zip",
        DownloadOptions::default(),
    ).await?;

    // Subscribe to events
    let mut events = engine.subscribe();
    while let Ok(event) = events.recv().await {
        println!("Event: {:?}", event);
    }

    Ok(())
}
```

## Configuration

```rust
use gosh_dl::{EngineConfig, HttpConfig};
use std::path::PathBuf;

let config = EngineConfig {
    download_dir: PathBuf::from("/downloads"),
    max_concurrent_downloads: 5,
    max_connections_per_download: 16,
    min_segment_size: 1024 * 1024, // 1 MB
    global_download_limit: Some(10 * 1024 * 1024), // 10 MB/s
    user_agent: "MyApp/1.0".to_string(),
    enable_dht: true,
    enable_pex: true,
    enable_lpd: true,
    ..Default::default()
};
```

## API Overview

### Download Management

```rust
// Add downloads
let http_id = engine.add_http(url, options).await?;
let torrent_id = engine.add_torrent(&torrent_bytes, options).await?;
let magnet_id = engine.add_magnet(magnet_uri, options).await?;

// Control
engine.pause(id).await?;
engine.resume(id).await?;
engine.cancel(id, delete_files).await?;

// Status
let status = engine.status(id);
let all = engine.list();
let active = engine.active();
let stats = engine.global_stats();
```

### Events

```rust
use gosh_dl::DownloadEvent;

let mut events = engine.subscribe();
while let Ok(event) = events.recv().await {
    match event {
        DownloadEvent::Added { id } => println!("Added: {}", id),
        DownloadEvent::Progress { id, progress } => {
            println!("{}: {:.1}%", id, progress.percentage());
        }
        DownloadEvent::Completed { id } => println!("Done: {}", id),
        DownloadEvent::Failed { id, error, .. } => {
            eprintln!("Failed {}: {}", id, error);
        }
        _ => {}
    }
}
```

## Migrating from aria2

If you're currently using aria2 via JSON-RPC, gosh-dl provides a familiar API:

| aria2 RPC | gosh-dl |
|-----------|---------|
| `aria2.addUri(urls)` | `engine.add_http(url, opts)` |
| `aria2.addTorrent(torrent)` | `engine.add_torrent(bytes, opts)` |
| `aria2.pause(gid)` | `engine.pause(id)` |
| `aria2.unpause(gid)` | `engine.resume(id)` |
| `aria2.remove(gid)` | `engine.cancel(id, false)` |
| `aria2.tellStatus(gid)` | `engine.status(id)` |
| `aria2.tellActive()` | `engine.active()` |
| `aria2.getGlobalStat()` | `engine.global_stats()` |

## Building

```bash
# Build
cargo build --release

# Run tests (98 total: 79 unit + 18 integration + 1 doc test)
cargo test

# Generate docs
cargo doc --open
```

See [technical_spec.md](technical_spec.md) for detailed build instructions and architecture documentation.

## Contributing

Contributions are welcome! Please see [technical_spec.md](technical_spec.md) for development setup and guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Inspired by the excellent work of the [aria2](https://aria2.github.io/) project
- Built with [Tokio](https://tokio.rs/) for async runtime
- Uses [mainline](https://crates.io/crates/mainline) for DHT support
