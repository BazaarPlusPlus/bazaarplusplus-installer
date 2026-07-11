---
status: truth
topic: architecture
last-verified: 63783504d733039d18aa0278645457fe12064d63
---

# Architecture

## App Shape

- `package.json` defines the desktop app package as `bppinstaller` and exposes the development, build, test, type-check, and Tauri scripts in `package.json:2-21`; its `version` field is the single version source (see version sync below).
- The frontend is built by Vite from `src/`; the Tauri config invokes `npm run dev` for development and `npm run prebuild-check && npm run build` before bundle creation in `src-tauri/tauri.conf.json:6-11`.
- The main desktop shell is Rust/Tauri. It registers native plugins and shared state in `src-tauri/src/lib.rs:18-39`, then registers command handlers and runs the generated Tauri context in `src-tauri/src/lib.rs:72-74`.
- The main window is configured as a 1000 x 720 window with 900 x 640 minimum dimensions in `src-tauri/tauri.conf.json:13-21`.

## Native Runtime

- Tauri startup builds the tray, warms `InstallerContextState`, emits `startup-ready`, and starts the stream service in `src-tauri/src/lib.rs:40-53`.
- Close behavior is service-aware: while the stream runtime reports `running`, the main window close request is prevented and the window is hidden in `src-tauri/src/lib.rs:56-70`.
- The default capability grants updater check/download/install, process restart, `steam://*` opening, and dialog permissions in `src-tauri/capabilities/default.json:6-20`.

## Feature Boundaries

- Install state is produced by Rust detection and serialized through `InstallState`; the contract includes selected paths, game/mod state, macOS compatibility state, action gates, resettable-data and BepInEx-folder status, and warnings in `src-tauri/src/services/install/types.rs:3-19`.
- Install planning and install/reset/uninstall/launch orchestration are owned by `src-tauri/src/services/install/plan.rs` and `src-tauri/src/services/install/mod.rs`; launch goes through the Steam client only (`launch_game_via_steam`), while install gathers facts, plans an ordered prefix or trampoline effect sequence, executes it, and rebuilds state in `src-tauri/src/services/install/mod.rs:36-104`.
- History reads use SQLite read-only connections by default in `src-tauri/src/history/queries.rs:29-35`; the separate write connection is used only where mutation is needed in `src-tauri/src/history/queries.rs:37-43`.
- The stream service is a local Axum HTTP service bound to `127.0.0.1:17654`, creates overlay repositories and settings stores, and exposes overlay/settings URLs in `src-tauri/src/stream/server.rs:16-112`.

## Build And Generated Artifacts

- `npm run check` generates TypeScript bindings and runs `tsc --noEmit`; `npm run test` combines generated bindings, Rust tests, and Vitest in `package.json:13-20`.
- The Tauri command list is authored solely in `with_commands!` in `src-tauri/src/commands/registry.rs:3-58`; `npm run generate:bindings` runs `cargo test export_bindings`, whose `export_bindings_tauri_command_names` test emits the macro-expanded names for `scripts/generate-bindings.mjs` to validate and write into `src/types/generated/tauri-command-names.ts` in `src-tauri/src/commands/registry.rs:64-88` and `scripts/generate-bindings.mjs:103-165`.
- Version sync treats `package.json` as the source, then writes package-lock.json (both root `version` fields), Tauri config, Cargo.toml, and Cargo.lock versions in `scripts/version-sync.mjs:195-206`; `npm run prebuild-check` fails on any misalignment via `collectVersionSnapshot` in `scripts/prebuild-check.mjs:332-333`.
- `npm run prebuild-check` verifies generated bindings, version alignment, platform ZIP payloads, and the macOS trampoline stub when applicable in `scripts/prebuild-check.mjs:329-348`.
- Tauri updater artifacts are enabled in the Tauri bundle config in `src-tauri/tauri.conf.json:27-30`.
