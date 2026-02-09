# Contributing to Gosh-Fetch

Thanks for wanting to contribute. This guide covers setting up the project for development and the conventions we follow.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) 1.77+
- Platform-specific dependencies (see [README.md](README.md#requirements))

### Getting Started

Fork and clone the repository, then install everything:

```bash
git clone https://github.com/YOUR_USERNAME/Gosh-Fetch.git
cd Gosh-Fetch
npm install
```

Build the Rust engine in debug mode:

```bash
cargo build --manifest-path src-rust/Cargo.toml
```

Start the app in development mode:

```bash
npm run electron:dev
```

This runs `tsc` to compile the Electron main process, starts Vite on port 5173, waits for it to be ready, then launches Electron pointed at localhost. You can also run the pieces separately if you prefer -- `npm run dev` starts just the Vite dev server.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build frontend for production (tsc + vite build) |
| `npm run build:electron` | Compile Electron TypeScript (main process) |
| `npm run electron:dev` | Full development environment (Vite + Electron) |
| `npm run electron:build` | Production build (frontend + Electron + electron-builder) |
| `npm test` | Run frontend tests (Vitest) |
| `npm run test:watch` | Run frontend tests in watch mode |

### Rust Commands

```bash
# Run Rust tests
cargo test --manifest-path src-rust/Cargo.toml

# Run Clippy linter
cargo clippy --manifest-path src-rust/Cargo.toml

# Format Rust code
cargo fmt --manifest-path src-rust/Cargo.toml
```

### Type Checking

The project has two separate TypeScript configurations. The renderer (React app) uses `tsconfig.json` and the Electron main process uses `tsconfig.node.json`:

```bash
npx tsc --noEmit                        # Type check the renderer
npx tsc -p tsconfig.node.json --noEmit  # Type check Electron main process
```

## Project Structure

```
Gosh-Fetch/
├── src/                          # Frontend (React 19 + TypeScript)
│   ├── App.tsx                   # Root component, routing, event handling
│   ├── App.css                   # Global design system (CSS variables)
│   ├── main.tsx                  # Entry point (HashRouter)
│   ├── pages/
│   │   ├── Downloads.tsx         # Active downloads with filtering
│   │   ├── History.tsx           # Completed download history
│   │   ├── Settings.tsx          # All configuration options
│   │   ├── Statistics.tsx        # Download statistics
│   │   ├── Scheduler.tsx         # Bandwidth scheduling rules
│   │   └── About.tsx             # Application info (not routed)
│   ├── components/
│   │   ├── downloads/
│   │   │   ├── AddDownloadModal.tsx
│   │   │   ├── DownloadCard.tsx
│   │   │   ├── CompactDownloadRow.tsx
│   │   │   ├── SortableDownloadCard.tsx
│   │   │   └── TorrentFilePicker.tsx
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── StatusBar.tsx
│   │   │   └── NotificationDropdown.tsx
│   │   ├── settings/             # Settings sub-components
│   │   ├── updater/              # Auto-update toast and modal
│   │   └── Onboarding.tsx        # First-run onboarding flow
│   ├── store/                    # Redux Toolkit slices
│   │   ├── store.ts              # Store configuration
│   │   ├── downloadSlice.ts      # Downloads (createEntityAdapter)
│   │   ├── statsSlice.ts         # Global stats + connection status
│   │   ├── themeSlice.ts         # Theme (dark/light/system)
│   │   ├── notificationSlice.ts  # In-app notifications
│   │   ├── updaterSlice.ts       # Auto-update state
│   │   └── orderSlice.ts         # Download queue ordering
│   └── lib/
│       ├── api.ts                # IPC bridge to Rust sidecar
│       ├── types/
│       │   ├── download.ts       # Download, DownloadOptions, etc.
│       │   └── electron.d.ts     # Window.electronAPI declarations
│       └── utils/
│           └── format.ts         # Formatting utilities
│
├── src-electron/                 # Electron main process
│   ├── main.ts                   # App lifecycle, IPC, tray, menu, auto-update
│   ├── preload.ts                # Context bridge (electronAPI)
│   ├── sidecar.ts                # Rust sidecar process management
│   ├── tray-popup.html           # Tray popup window
│   └── tray-popup-preload.ts     # Tray popup preload script
│
├── src-rust/                     # Rust sidecar engine
│   ├── src/
│   │   ├── main.rs               # Entry point, initializes state and RPC server
│   │   ├── lib.rs                # Module exports
│   │   ├── rpc_server.rs         # JSON-RPC server (stdin/stdout)
│   │   ├── state.rs              # AppState (engine, DB, adapter, settings)
│   │   ├── types.rs              # Frontend-facing types (Download, GlobalStat, etc.)
│   │   ├── engine_adapter.rs     # gosh-dl integration and type conversion
│   │   ├── error.rs              # Error types with JSON-RPC error codes
│   │   ├── utils.rs              # TrackerUpdater
│   │   ├── db/
│   │   │   └── mod.rs            # SQLite database operations
│   │   └── commands/             # RPC command handlers
│   │       ├── mod.rs
│   │       ├── download.rs       # Add, pause, resume, remove downloads
│   │       ├── torrent.rs        # Torrent/magnet operations
│   │       ├── settings.rs       # Configuration and engine settings
│   │       ├── database.rs       # Database queries (history, settings)
│   │       └── system.rs         # App info, file ops, window control
│   └── migrations/
│       └── 001_initial.sql       # Database schema
│
├── public/fonts/                 # Self-hosted fonts (Space Grotesk, Material Symbols)
├── docs/                         # Documentation
├── electron-builder.yml          # electron-builder configuration
└── package.json
```

## Code Style

### TypeScript / React

The frontend uses React 19 with TypeScript. State management is handled by Redux Toolkit using `createSlice` and `createEntityAdapter`. Routing uses React Router with `HashRouter`.

Styling is done through CSS variables defined in `src/App.css` -- the project does not use Tailwind or CSS-in-JS. Icons are primarily Material Symbols Outlined, loaded as a self-hosted woff2 font. Some legacy components still use lucide-react icons.

Follow the existing patterns: functional components, hooks, and the established file organization. If you are adding a new page, add its route in `App.tsx` and a nav entry in `Sidebar.tsx`.

### Rust

The Rust code uses async/await with Tokio throughout. Database operations use `tokio::task::spawn_blocking` to avoid blocking the runtime. Run `cargo fmt` and `cargo clippy` before committing.

The JSON-RPC interface in `rpc_server.rs` dispatches to command handlers in `commands/`. If you add a new RPC method, you also need to add it to the `ALLOWED_RPC_METHODS` set in `src-electron/main.ts` and expose it through `src/lib/api.ts`.

## Adding a New RPC Method

The IPC chain has three links. All three must be updated for a new method to work:

1. **Rust handler** -- Add the method match arm in `src-rust/src/rpc_server.rs` and implement the handler in the appropriate `commands/` module.
2. **Electron allowlist** -- Add the method name to `ALLOWED_RPC_METHODS` in `src-electron/main.ts`.
3. **Frontend API** -- Add a wrapper function in `src/lib/api.ts`.

## Pull Request Process

1. Create a branch from `main`:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes and test them.

3. Ensure everything passes:
```bash
npm test
npx tsc --noEmit
cargo test --manifest-path src-rust/Cargo.toml
cargo clippy --manifest-path src-rust/Cargo.toml
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

When reporting an issue, include your operating system and version, steps to reproduce the problem, what you expected versus what actually happened, and any error messages or logs. Electron logs can be found via `--enable-logging` or in the DevTools console (`Ctrl+Shift+I`).

## License

By contributing to Gosh-Fetch, you agree that your contributions will be licensed under the AGPL-3.0 license.
