---
status: truth
topic: architecture
last-verified: faefb505c5717c3da3a71fc2361315ad2fb6658a
---

# Architecture

## App Shape

- `package.json` defines the desktop app package as `bppinstaller` and exposes the development, build, test, type-check, and Tauri scripts in `package.json:2-21`; its `version` field is the single version source (see version sync below).
- The frontend is built by Vite from `src/`; the Tauri config invokes `npm run dev` for development and `npm run prebuild-check && npm run build` before bundle creation in `src-tauri/tauri.conf.json:6-11`.
- The main desktop shell is Rust/Tauri. It registers native plugins and shared state in `src-tauri/src/lib.rs:19-40`, then uses the canonical Specta builder's invoke handler and runs the generated Tauri context in `src-tauri/src/lib.rs:73-75`.
- The main window is configured as a 1000 x 720 window with 900 x 640 minimum dimensions in `src-tauri/tauri.conf.json:13-21`.

## Native Runtime

- Tauri startup builds the tray, warms `InstallerContextState`, emits `startup-ready`, and asks `StreamRuntime` to ensure the stream service in `src-tauri/src/lib.rs:44-59`.
- Close behavior is service-aware: while the stream runtime reports `running`, the main window close request is prevented and the window is hidden in `src-tauri/src/lib.rs:60-73`.
- The default capability grants updater check/download/install, process restart, `steam://*` opening, and dialog permissions in `src-tauri/capabilities/default.json:6-20`.

## Feature Boundaries

- Install state is produced by Rust detection and serialized through `InstallState`; the contract includes selected paths, game/mod state, macOS compatibility state, action gates, resettable-data and BepInEx-folder status, and warnings in `src-tauri/src/services/install/types.rs:3-19`.
- The complete install operation owns fact gathering, private planning, ordered production effects, first-error propagation, and a final state refresh in `src-tauri/src/services/install/operation.rs:16-102`; the Tauri command only constructs the request and invokes that operation in `src-tauri/src/commands/install.rs:40-55`. Reset, uninstall, and Steam-only launch remain in the install service facade.
- History reads use SQLite read-only connections by default in `src-tauri/src/history/queries.rs:29-35`; the separate write connection is used only where mutation is needed in `src-tauri/src/history/queries.rs:37-43`.
- `StreamRuntime` is the only stream lifecycle mutation boundary: it serializes ensure/restart/stop/window/maintenance operations and privately owns the task plus captured installation paths in `src-tauri/src/stream/runtime.rs:43-108` and `src-tauri/src/stream/runtime.rs:188-280`. Its private production adapter binds the local Axum service to `127.0.0.1:17654` in `src-tauri/src/stream/server.rs:16-69`.

## Build And Generated Artifacts

- `npm run check` generates TypeScript bindings and runs `tsc --noEmit`; `npm run test` combines generated bindings, Rust tests, and Vitest in `package.json:13-20`.
- The Tauri IPC schema is authored in Rust command signatures and collected once by the Specta builder in `src-tauri/src/commands/registry.rs:3-38`; the same builder supplies the production invoke handler in `src-tauri/src/lib.rs:17-17` and `src-tauri/src/lib.rs:73-73` and exports typed command functions plus DTOs in `src-tauri/src/commands/registry.rs:40-51`.
- `npm run generate:bindings` exports to a temporary directory, validates and normalizes `commands.ts`, and atomically replaces `src/types/generated/` while restoring the previous directory on replacement failure in `scripts/generate-bindings.mjs:20-84` and `scripts/generate-bindings.mjs:86-118`.
- Version sync treats `package.json` as the source, then writes package-lock.json (both root `version` fields), Tauri config, Cargo.toml, and Cargo.lock versions in `scripts/version-sync.mjs:195-206`; `npm run prebuild-check` fails on any misalignment via `collectVersionSnapshot` in `scripts/prebuild-check.mjs:329-331`.
- `npm run prebuild-check` verifies generated bindings, version alignment, platform ZIP payloads, and the macOS trampoline stub when applicable in `scripts/prebuild-check.mjs:326-346`.
- Tauri updater artifacts are enabled in the Tauri bundle config in `src-tauri/tauri.conf.json:27-30`.
- The Rust toolchain is pinned to 1.97.0 (minimal profile with `clippy` and `rustfmt`) via `rust-toolchain.toml:1-4`; rustup selects it automatically for all `cargo`/Tauri builds.
