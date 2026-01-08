# gosh-dl

A fast, safe, and reliable download engine written in Rust.

[![Crates.io](https://img.shields.io/crates/v/gosh-dl.svg)](https://crates.io/crates/gosh-dl)
[![Documentation](https://docs.rs/gosh-dl/badge.svg)](https://docs.rs/gosh-dl)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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

- **Async**: Built on Tokio for efficient concurrent downloads

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

## Building

```bash
# Build
cargo build --release

# Run tests
cargo test

# Generate docs
cargo doc --open
```

See [BUILDING.md](BUILDING.md) for detailed build instructions and architecture documentation.

## License

MIT License - see [LICENSE](LICENSE) for details.
