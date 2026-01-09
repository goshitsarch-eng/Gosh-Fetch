# Contributing to Gosh-Fetch

Thank you for your interest in contributing to Gosh-Fetch! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) 1.77+
- Platform-specific dependencies (see README.md)

### Getting Started

1. Fork and clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/Gosh-Fetch.git
cd Gosh-Fetch
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run tauri dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite development server |
| `npm run build` | Build frontend for production |
| `npm run check` | Run Svelte type checking |
| `npm run tauri dev` | Run full Tauri development environment |
| `npm run tauri build` | Create production build |

### Rust Commands

```bash
# Run Rust tests
cargo test --manifest-path src-tauri/Cargo.toml

# Run Clippy linter
cargo clippy --manifest-path src-tauri/Cargo.toml

# Format Rust code
cargo fmt --manifest-path src-tauri/Cargo.toml
```

## Project Structure

```
Gosh-Fetch/
├── src/                    # Frontend (Svelte 5 + TypeScript)
│   ├── App.svelte         # Root component
│   └── lib/
│       ├── components/    # Reusable UI components
│       ├── pages/         # Page views
│       ├── stores/        # State management
│       ├── types/         # TypeScript definitions
│       └── utils/         # Utility functions
│
└── src-tauri/             # Backend (Rust + Tauri v2)
    ├── src/
    │   ├── commands/      # IPC command handlers
    │   ├── db/            # Database operations
    │   └── tray/          # System tray
    └── migrations/        # Database schema
```

## Code Style

### TypeScript/Svelte
- Use TypeScript for all new code
- Follow existing code patterns
- Use Svelte 5 runes (`$state`, `$derived`, etc.)

### Rust
- Run `cargo fmt` before committing
- Run `cargo clippy` and address warnings
- Add documentation comments for public APIs

## Pull Request Process

1. Create a new branch for your feature or fix:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes and test thoroughly

3. Ensure code passes checks:
```bash
npm run check
cargo clippy --manifest-path src-tauri/Cargo.toml
```

4. Commit with a descriptive message:
```bash
git commit -m "Add: brief description of changes"
```

5. Push and create a pull request

### Commit Message Guidelines

Use prefixes to categorize commits:
- `Add:` New features
- `Fix:` Bug fixes
- `Update:` Enhancements to existing features
- `Refactor:` Code restructuring
- `Docs:` Documentation changes
- `Chore:` Maintenance tasks

## Reporting Issues

When reporting issues, please include:
- Operating system and version
- Steps to reproduce the issue
- Expected vs actual behavior
- Error messages or logs if applicable

## License

By contributing to Gosh-Fetch, you agree that your contributions will be licensed under the AGPL-3.0 license.
