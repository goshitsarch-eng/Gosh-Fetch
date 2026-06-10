# Contributing to Gosh-Fetch

Thanks for wanting to contribute. This guide covers setting up the project for development and the conventions we follow.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) 1.77+
- On Linux, the Tauri system dependencies: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf` (Debian/Ubuntu package names; see [README.md](README.md#requirements))

### Getting Started

Fork and clone the repository, then install everything:

```bash
git clone https://github.com/YOUR_USERNAME/Gosh-Fetch.git
cd Gosh-Fetch
npm install
```

Start the app in development mode:

```bash
npm run tauri dev
```

This starts Vite on port 5173, compiles the Rust backend in debug mode (the first build takes a while), and opens the app window pointed at the dev server. Frontend changes hot-reload; Rust changes trigger a rebuild and restart. You can also run `npm run dev` for just the Vite dev server, though most features need the Tauri backend.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server only |
| `npm run build` | Build frontend bundle for production |
| `npm run check` | Type-check the frontend (svelte-check) |
| `npm run tauri dev` | Full development environment (Vite + Tauri window) |
| `npm run tauri build` | Production build (frontend + Rust + platform bundles) |
| `npm test` | Run frontend tests (Vitest) |
| `npm run test:watch` | Run frontend tests in watch mode |

### Rust Commands

```bash
# Run Rust tests
cargo test --manifest-path src-tauri/Cargo.toml

# Run Clippy linter
cargo clippy --manifest-path src-tauri/Cargo.toml

# Format Rust code
cargo fmt --manifest-path src-tauri/Cargo.toml
```

### Type Checking

The frontend uses a single TypeScript configuration (`tsconfig.json`), checked through svelte-check so `.svelte` files are covered too:

```bash
npm run check
```

## Project Structure

```
Gosh-Fetch/
├── src/                          # Frontend (Svelte 5 + TypeScript)
│   ├── App.svelte                # Root component, route table, event bridge startup
│   ├── App.css                   # Global design system (CSS variables)
│   ├── main.ts                   # Entry point
│   ├── routes/                   # Routed pages (svelte-spa-router, hash routing)
│   │   ├── Downloads.svelte      # Active downloads with filtering
│   │   ├── Mirror.svelte         # Recursive HTTP directory mirroring
│   │   ├── History.svelte        # Completed download history
│   │   ├── Settings.svelte       # All configuration options
│   │   ├── Statistics.svelte     # Download statistics
│   │   ├── Scheduler.svelte      # Bandwidth scheduling rules
│   │   ├── TrayPopup.svelte      # Tray popup window content (/tray)
│   │   └── About.svelte          # Application info (not routed)
│   └── lib/
│       ├── api/
│       │   ├── commands.ts       # Typed invoke() wrappers for every Tauri command
│       │   ├── system.ts         # Plugin-backed OS helpers (dialogs, autostart, ...)
│       │   └── events.ts         # Event bridge: listen() subscriptions -> stores
│       ├── stores/               # Runes store classes (singleton instances)
│       │   ├── downloads.svelte.ts
│       │   ├── stats.svelte.ts
│       │   ├── theme.svelte.ts
│       │   ├── notifications.svelte.ts
│       │   ├── updater.svelte.ts
│       │   ├── mirror.svelte.ts
│       │   └── ui.svelte.ts
│       ├── components/
│       │   ├── downloads/        # AddDownloadModal, DownloadCard, TorrentFilePicker, ...
│       │   ├── layout/           # Sidebar, StatusBar, NotificationDropdown
│       │   ├── mirror/           # Mirror page components
│       │   ├── settings/         # Settings sub-components
│       │   ├── updater/          # Auto-update toast and modal
│       │   └── Onboarding.svelte # First-run onboarding flow
│       ├── types/                # Download, Settings, Mirror types
│       └── utils/                # Formatting utilities
│
├── src-tauri/                    # Rust backend (Tauri 2)
│   ├── src/
│   │   ├── main.rs               # Binary entry point
│   │   ├── lib.rs                # Tauri Builder, plugins, setup, invoke_handler
│   │   ├── api.rs                # #[tauri::command] wrappers (one per command)
│   │   ├── state.rs              # AppState (engine, DB, adapter, settings)
│   │   ├── events.rs             # Engine event forwarder + global-stats emitter
│   │   ├── tray.rs               # Tray icon and popup window
│   │   ├── types.rs              # Frontend-facing types (Download, GlobalStat, etc.)
│   │   ├── engine_adapter.rs     # gosh-dl integration and type conversion
│   │   ├── validation.rs         # URL/path input validation
│   │   ├── error.rs              # Error types
│   │   ├── utils.rs              # TrackerUpdater
│   │   ├── db/                   # SQLite database operations
│   │   └── commands/             # Command business logic
│   │       ├── download.rs       # Add, pause, resume, remove, batch operations
│   │       ├── torrent.rs        # Torrent/magnet operations
│   │       ├── recursive.rs      # Recursive HTTP mirroring jobs
│   │       ├── settings.rs       # Configuration and engine settings
│   │       ├── database.rs       # Database queries (history, settings)
│   │       └── system.rs         # App info, file ops, disk space, system actions
│   ├── migrations/
│   │   └── 001_initial.sql       # Database schema
│   ├── capabilities/             # Tauri permission scopes for the webview
│   └── tauri.conf.json           # App config, bundling, updater
│
├── public/fonts/                 # Self-hosted fonts (Space Grotesk, Material Symbols)
├── docs/                         # Documentation
└── package.json
```

## Code Style

### TypeScript / Svelte

The frontend uses Svelte 5 with runes (`$state`, `$derived`, `$effect`) and TypeScript. Shared state lives in store classes under `src/lib/stores/` (`*.svelte.ts` files exporting singleton instances) rather than component state. Routing uses svelte-spa-router with hash routing.

Styling is done through CSS variables defined in `src/App.css` -- the project does not use Tailwind or CSS-in-JS. Icons are Material Symbols Outlined, loaded as a self-hosted woff2 font.

Follow the existing patterns: runes, store classes, and one `.css` file next to each `.svelte` file. If you are adding a new page, add its route in `App.svelte` and a nav entry in `Sidebar.svelte`.

### Rust

The Rust code uses async/await with Tokio throughout. Database operations use `tokio::task::spawn_blocking` to avoid blocking the runtime. Run `cargo fmt` and `cargo clippy` before committing.

`api.rs` holds thin `#[tauri::command]` wrappers; the actual logic lives in the `commands/` modules. Keep the wrappers thin and put business logic in the handlers.

## Adding a New Command

The chain has three links. All three must be updated for a new command to work:

1. **Rust handler** -- Implement the logic in the appropriate `src-tauri/src/commands/` module.
2. **Command wrapper** -- Add a `#[tauri::command]` wrapper in `src-tauri/src/api.rs` and register it in the `tauri::generate_handler![...]` list in `src-tauri/src/lib.rs`.
3. **Frontend API** -- Add a typed wrapper in `src/lib/api/commands.ts`. Note that camelCase argument keys map automatically to the Rust function's snake_case parameters.

## Pull Request Process

1. Create a branch from `main`:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes and test them.

3. Ensure everything passes:
```bash
npm test
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml
```

4. Commit with a descriptive message:
```bash
git commit -m "Add: brief description of changes"
```

5. Push and open a pull request.

### Commit Message Prefixes

- `Add:` New features
- `Fix:` Bug fixes
- `Update:` Enhancements to existing features
- `Refactor:` Code restructuring
- `Docs:` Documentation changes
- `Chore:` Maintenance tasks

## Reporting Issues

When reporting an issue, include your operating system and version, steps to reproduce the problem, what you expected versus what actually happened, and any error messages or logs. Backend logs go through tauri-plugin-log; frontend errors show up in the webview DevTools console (`Ctrl+Shift+I` in dev builds).

## License

By contributing to Gosh-Fetch, you agree that your contributions will be licensed under the AGPL-3.0 license.
