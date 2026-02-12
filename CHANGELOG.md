# Changelog

All notable changes to Gosh-Fetch will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2026-02-12

### Changed
- Bumped app version to `2.0.1` across frontend and Rust package metadata
- Updated version label shown in the main sidebar UI
- Updated API reference example payload to reflect `2.0.1`

## [2.0.0] - 2026-02-08

### Added
- Statistics page with real-time download speed charts and historical data visualization
- Scheduler page with 168-cell weekly grid for bandwidth scheduling
- System tray popup with active download status and quick controls
- Auto-update notification toast and download progress modal
- Torrent file picker with tree-based file selection
- Drag-and-drop queue reordering for downloads
- Reset settings confirmation modal
- Notification dropdown system

### Changed
- Complete UI overhaul across all pages and components
- Redesigned About page with centered hero layout and tech stack cards
- Improved Settings layout with fixed sidebar, modal scroll, and input padding
- Removed default menu bar on Linux and Windows
- Rewrote all project documentation to reflect current architecture

### Fixed
- Duplicate downloads appearing in queue
- White screen on launch
- Dependabot security vulnerabilities
- Settings About tab sidebar alignment
- Modal scroll behavior and input padding overlaps

### Security
- Phase 1 security and stability improvements
- Content Security Policy hardening
- Dependency vulnerability patches

## [1.1.1] - 2026-01-09

### Changed
- Updated gosh-dl engine to latest version
- Updated mainline DHT library to v6.0.1

## [1.0.0] - 2025

### Added

#### Download Features
- HTTP/HTTPS download support with multi-segment transfers
- BitTorrent protocol support (DHT, PEX, Local Peer Discovery)
- Magnet link support with metadata retrieval
- Torrent file parsing and selective file download
- Pause, resume, and cancel downloads
- Batch operations (Pause All, Resume All)
- Download queue management with configurable concurrent downloads
- Per-download speed limiting
- Custom output filename support
- Download history and persistence across sessions

#### BitTorrent
- Configurable seed ratio
- Peer monitoring and statistics
- Auto-update tracker lists from community sources
- DHT, PEX, and LPD toggle settings

#### User Interface
- Light, Dark, and System theme support
- Real-time progress tracking with speed metrics
- System tray integration with minimize-to-tray
- Native notifications on download completion

#### Settings
- Configurable download directory
- Concurrent downloads limit (1-20)
- Connections per server (1-16)
- Global download/upload speed limits
- Custom user agent selection

#### Technical
- Native Rust download engine (gosh-dl) - no external dependencies
- Cross-platform support: Windows, Linux, macOS
- SQLite database for local storage
- No telemetry or data collection
