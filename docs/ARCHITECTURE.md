# Gosh-Fetch Architecture

This document describes the technical architecture of Gosh-Fetch.

## Overview

Gosh-Fetch is a cross-platform download manager built with:
- **Frontend**: Svelte 5 + TypeScript
- **Backend**: Rust + Tauri v2
- **Download Engine**: gosh-dl (native Rust library)
- **Database**: SQLite

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI Framework | Svelte 5 | Reactive component-based frontend |
| Language (Frontend) | TypeScript | Type-safe JavaScript |
| Build Tool | Vite | Fast development and bundling |
| Desktop Framework | Tauri v2 | Native desktop application wrapper |
| Language (Backend) | Rust | Memory-safe systems programming |
| Download Engine | gosh-dl | HTTP/BitTorrent download handling |
| Database | SQLite | Local data persistence |

## Directory Structure

```
Gosh-Fetch/
├── src/                          # Frontend source
│   ├── main.ts                   # Application entry point
│   ├── App.svelte                # Root component
│   ├── app.css                   # Global styles
│   └── lib/
│       ├── components/           # Reusable UI components
│       │   ├── downloads/
│       │   │   ├── AddDownloadModal.svelte
│       │   │   └── DownloadCard.svelte
│       │   └── layout/
│       │       └── Sidebar.svelte
│       ├── pages/                # Page-level components
│       │   ├── Downloads.svelte  # Active downloads view
│       │   ├── Completed.svelte  # Download history
│       │   ├── Settings.svelte   # Configuration
│       │   └── About.svelte      # Application info
│       ├── stores/               # State management
│       │   ├── downloads.svelte.ts
│       │   ├── stats.svelte.ts
│       │   └── theme.svelte.ts
│       ├── types/                # TypeScript definitions
│       │   └── download.ts
│       └── utils/                # Utility functions
│           └── format.ts
│
├── src-tauri/                    # Backend source
│   ├── src/
│   │   ├── main.rs              # Tauri application entry
│   │   ├── lib.rs               # Module exports
│   │   ├── state.rs             # Application state
│   │   ├── types.rs             # Frontend-facing types
│   │   ├── error.rs             # Error handling
│   │   ├── engine_adapter.rs    # gosh-dl integration
│   │   ├── utils.rs             # Utilities (tracker updater)
│   │   ├── commands/            # IPC command handlers
│   │   │   ├── mod.rs
│   │   │   ├── download.rs
│   │   │   ├── torrent.rs
│   │   │   ├── settings.rs
│   │   │   └── system.rs
│   │   ├── db/                  # Database operations
│   │   │   └── mod.rs
│   │   └── tray/                # System tray
│   │       └── mod.rs
│   ├── migrations/              # Database schema
│   │   └── 001_initial.sql
│   ├── Cargo.toml               # Rust dependencies
│   └── tauri.conf.json          # Tauri configuration
│
└── docs/                        # Documentation
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                          Frontend                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   Pages     │ ←→ │   Stores    │ ←→ │  Tauri IPC (invoke) │ │
│  │ (Downloads, │    │ (downloads, │    │                     │ │
│  │  Settings)  │    │  stats)     │    │                     │ │
│  └─────────────┘    └─────────────┘    └──────────┬──────────┘ │
└──────────────────────────────────────────────────┬─────────────┘
                                                   │
                                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                          Backend                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Tauri Commands                           ││
│  │  (download.rs, torrent.rs, settings.rs, system.rs)         ││
│  └─────────────────────────┬───────────────────────────────────┘│
│                            │                                    │
│           ┌────────────────┼────────────────┐                  │
│           ▼                ▼                ▼                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐        │
│  │ AppState    │  │  Database   │  │  EngineAdapter  │        │
│  │ (state.rs)  │  │  (db/)      │  │                 │        │
│  └─────────────┘  └──────┬──────┘  └────────┬────────┘        │
│                          │                   │                  │
└──────────────────────────┼───────────────────┼──────────────────┘
                           │                   │
                           ▼                   ▼
                    ┌────────────┐      ┌─────────────┐
                    │   SQLite   │      │   gosh-dl   │
                    │  Database  │      │   Engine    │
                    └────────────┘      └─────────────┘
```

## Key Components

### Frontend

#### Stores (State Management)
- **downloads.svelte.ts**: Manages download list, provides CRUD operations, handles polling
- **stats.svelte.ts**: Global download statistics (speed, active count)
- **theme.svelte.ts**: Theme management (light/dark/system)

#### Pages
- **Downloads.svelte**: Active downloads with filtering (all/active/paused/error)
- **Completed.svelte**: Download history from database
- **Settings.svelte**: All configuration options
- **About.svelte**: Application information

### Backend

#### AppState (state.rs)
Holds application-wide state:
- Download engine instance
- Engine adapter
- Database reference
- Runtime settings (close-to-tray)

#### EngineAdapter (engine_adapter.rs)
Bridges gosh-dl with Tauri commands:
- Converts between engine types and frontend types
- Provides unified API for download operations
- Handles GID parsing (UUID and legacy formats)

#### Commands
IPC handlers organized by domain:
- **download.rs**: Add, pause, resume, remove downloads
- **torrent.rs**: Torrent/magnet specific operations
- **settings.rs**: Configuration management
- **system.rs**: App info, file operations, window control

## Database Schema

### downloads
Stores download history and state for persistence.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| gid | TEXT | Unique download identifier |
| name | TEXT | Display name |
| url | TEXT | Source URL (HTTP downloads) |
| magnet_uri | TEXT | Magnet link (torrents) |
| info_hash | TEXT | BitTorrent info hash |
| download_type | TEXT | http/torrent/magnet |
| status | TEXT | waiting/active/paused/complete/error |
| total_size | INTEGER | Total bytes |
| completed_size | INTEGER | Downloaded bytes |
| save_path | TEXT | Destination directory |
| created_at | DATETIME | Creation timestamp |
| completed_at | DATETIME | Completion timestamp |
| selected_files | TEXT | JSON array of selected file indices |

### settings
Key-value store for configuration.

| Key | Default | Description |
|-----|---------|-------------|
| download_path | ~/Downloads | Default save directory |
| max_concurrent_downloads | 5 | Simultaneous downloads (1-20) |
| max_connections_per_server | 16 | Connections per host (1-16) |
| split_count | 16 | Segments per download |
| download_speed_limit | 0 | Global download limit (0=unlimited) |
| upload_speed_limit | 0 | Global upload limit (0=unlimited) |
| user_agent | gosh-dl/0.1.0 | HTTP user agent |
| theme | dark | UI theme (light/dark/system) |
| bt_enable_dht | true | BitTorrent DHT |
| bt_enable_pex | true | BitTorrent Peer Exchange |
| bt_enable_lpd | true | Local Peer Discovery |
| bt_seed_ratio | 1.0 | Seed ratio before stop |
| auto_update_trackers | true | Auto-fetch tracker lists |

### trackers
BitTorrent tracker URLs.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| url | TEXT | Tracker URL |
| enabled | INTEGER | Is tracker enabled |
| is_working | INTEGER | Last known status |

### tracker_meta
Metadata for tracker list updates.

| Column | Type | Description |
|--------|------|-------------|
| last_updated | DATETIME | Last fetch time |
| source_url | TEXT | Tracker list source |

## Download Engine (gosh-dl)

gosh-dl is a native Rust download engine providing:

- **HTTP/HTTPS**: Multi-segment parallel downloads
- **BitTorrent**: Full protocol with DHT, PEX, LPD
- **Magnet Links**: Metadata retrieval and download

Key features:
- Async I/O with Tokio
- Event-based progress updates
- Memory-safe Rust implementation
- No external binary dependencies

## Event System

The application uses Tauri's event system for real-time updates:

1. Backend emits events when download state changes
2. Frontend listens and updates stores
3. UI reactively updates via Svelte's reactivity

## Security Considerations

- All data stored locally (no cloud)
- No telemetry or analytics
- SQLite database in app data directory
- Settings stored per-user
