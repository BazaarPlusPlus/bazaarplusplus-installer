# BazaarPlusPlus Installer

Desktop app for installing and managing the BazaarPlusPlus mod for *The Bazaar*. It detects the Steam install, installs BepInEx plus the mod payload, launches the game through Steam, shows the mod's local run history, serves an OBS overlay, and self-updates.

Built with Tauri 2 (Rust backend) and React 19 + Vite + TypeScript (frontend).

## Development

Requirements:

- Node.js and npm
- Rust via rustup (the toolchain is pinned to 1.97.0 by `rust-toolchain.toml`)

Start the desktop app in development mode:

```bash
./build.sh
```

Or run the underlying commands manually:

```bash
npm install
npm run tauri dev
```

`npm run dev` starts a frontend-only Vite server without the Tauri shell.

Common checks:

```bash
npm run check           # generate bindings + tsc --noEmit
npm run test            # cargo test (src-tauri) + vitest (frontend)
npm run format          # prettier across configured globs
npm run prebuild-check  # validates versioning, bundled resources, Tauri config
```

TypeScript bindings for Tauri commands are generated into `src/types/generated/` by `npm run generate:bindings` (run automatically by `dev`, `build`, `check`, and `test`); never edit them by hand.

## Release build

```bash
./build.sh --prod               # release bundle for the current host platform
./build.sh --prod --clean-deps  # reinstall npm dependencies first
./build.sh --prod --upload      # build, then upload artifacts to Cloudflare R2
./build.sh --upload             # upload previously built artifacts only
```

`--prod` runs version sync and prebuild checks, and requires updater signing secrets (from `signing-secrets/` or environment variables). On macOS it additionally needs a Developer ID Application identity and Apple notarization API credentials, plus the Apple Silicon Rust target:

```bash
rustup target add aarch64-apple-darwin
```

Artifacts land under `src-tauri/target/release/bundle/nsis/` on Windows and `src-tauri/target/aarch64-apple-darwin/release/bundle/` (`app`, `dmg`) on macOS. Platform facts (bundle paths, updater keys, Rust targets) are defined in `scripts/release-platforms.mjs`.

## Structure

- `src/` — React frontend
- `src-tauri/` — Rust backend: native commands, services, packaging
- `scripts/` — build tooling: bindings generation, version sync, prebuild checks, release manifests
- `docs/` — project documentation (see below)

## Documentation

- Start with `CONTEXT.md` — entry map, glossary, and the index of `docs/truth/` topics.
- Architectural decisions live in `docs/adr/`. Doc-layout policy lives in `CLAUDE.md`.
- Platform smoke-test gaps are tracked as GitHub issues labelled `manual-validation`.
