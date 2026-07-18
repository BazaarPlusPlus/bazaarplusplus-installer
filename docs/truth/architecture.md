---
status: truth
topic: architecture
last-verified: 594eba30b566a42ca8846f152e5a1c1ed17149d4
---

# Architecture

## App Shape

- `package.json` defines the desktop app package as `bppinstaller` and exposes the development, build, test, type-check, and Tauri scripts in `package.json:2-21`; its `version` field is the single version source (see version sync below).
- The frontend is built by Vite from `src/`; the Tauri config invokes `npm run dev` for development and `npm run prebuild-check && npm run build` before bundle creation in `src-tauri/tauri.conf.json:6-11`.
- The main desktop shell is Rust/Tauri. It registers native plugins and shared state in `src-tauri/src/lib.rs:20-44`, then uses the canonical Specta builder's invoke handler and runs the generated Tauri context in `src-tauri/src/lib.rs:77-79`.
- The main window is configured as a 1000 x 720 window with 900 x 640 minimum dimensions in `src-tauri/tauri.conf.json:13-21`.

## Native Runtime

- Tauri startup builds the tray, warms `InstallerContextState`, emits `startup-ready`, and asks `StreamRuntime` to ensure the stream service in `src-tauri/src/lib.rs:45-60`.
- Close behavior is service-aware: while the stream runtime reports `running`, the main window close request is prevented and the window is hidden in `src-tauri/src/lib.rs:61-75`.
- The default capability grants updater check/download/install, process restart, `steam://*` opening, and dialog permissions in `src-tauri/capabilities/default.json:6-20`.

## Feature Boundaries

- Install state is produced by Rust detection and serialized through `InstallState`; the contract includes selected paths, game/mod state, macOS compatibility state, action gates, resettable-data and BepInEx-folder status, and warnings in `src-tauri/src/services/install/types.rs:3-19`.
- The complete install operation owns payload and launch-mode fact gathering, private planning, ordered production effects, first-error propagation, and a final state refresh in `src-tauri/src/services/install/operation.rs:16-125`; the Tauri command only constructs the request and invokes that operation in `src-tauri/src/commands/install.rs:40-55`. Reset, uninstall, and Steam-only launch remain in the install service facade.
- The History facade resolves Selected game installation and privately owns storage derivation, reads, reveals, deletes, and cleanup dispatch in `src-tauri/src/services/history.rs:46-231`; commands expose ids plus domain cleanup scope/preset without raw paths or cutoffs in `src-tauri/src/commands/history.rs:7-79`. Reads use SQLite read-only connections by default, while mutation uses separate write connections in `src-tauri/src/history/queries.rs:29-54`.
- `list_history_runs` is the first command whose failure type is `SemanticProblem`; the shared Rust DTO fixes code/parameter/diagnostic shape, and the History facade maps unavailable selection and read failures before the command boundary in `src-tauri/src/problem.rs:3-35`, `src-tauri/src/services/history.rs:72-90`, and `src-tauri/src/commands/history.rs:7-14`.
- History internals default to private modules; only cleanup algorithms and mapper/screenshots test seams are crate-visible, and the facade receives a narrowed repository surface in `src-tauri/src/history/mod.rs:1-13`.
- `StreamRuntime` is the only stream lifecycle mutation boundary: it serializes ensure/restart/stop/window/maintenance operations and privately owns the task plus captured installation paths in `src-tauri/src/stream/runtime.rs:43-108` and `src-tauri/src/stream/runtime.rs:188-280`. Its private production adapter binds the local Axum service to `127.0.0.1:17654` in `src-tauri/src/stream/server.rs:16-69`.
- The frontend Stream workflow depends inward on semantic command, scheduler, clipboard, and opener ports in `src/features/stream/streamWorkflow.ts:24-50` and `src/features/stream/streamWorkflow.ts:114-120`; the React hook provides those outer adapters and only subscribes, starts, and disposes the workflow in `src/features/stream/useStreamPage.ts:21-61`.

## Build And Generated Artifacts

- `npm run check` generates TypeScript bindings and runs `tsc --noEmit`; `npm run test` combines generated bindings, Rust tests, and Vitest in `package.json:13-20`.
- The Tauri IPC schema is authored in Rust command signatures and collected once by the Specta builder in `src-tauri/src/commands/registry.rs:3-36`; the same builder supplies the production invoke handler in `src-tauri/src/lib.rs:18-18` and `src-tauri/src/lib.rs:77-77` and exports typed command functions plus DTOs in `src-tauri/src/commands/registry.rs:38-49`.
- Specta is the only direct TypeScript binding stack: the three packages are pinned in `src-tauri/Cargo.toml:39-41`, with no `ts-rs` dependency or fallback generator.
- `npm run generate:bindings` exports to a temporary directory, validates and normalizes `commands.ts`, and atomically replaces `src/types/generated/`; replacement restores a captured backup and never removes the prior target when the backup rename itself fails in `scripts/generate-bindings.mjs:20-89` and `scripts/generate-bindings.mjs:91-123`.
- Version sync treats `package.json` as the source, then writes package-lock.json (both root `version` fields), Tauri config, Cargo.toml, and Cargo.lock versions in `scripts/version-sync.mjs:195-206`; `npm run prebuild-check` fails on any misalignment via `collectVersionSnapshot` in `scripts/prebuild-check.mjs:329-331`.
- `npm run prebuild-check` verifies generated bindings, version alignment, platform ZIP payloads, and the macOS trampoline stub when applicable in `scripts/prebuild-check.mjs:326-346`.
- Tauri updater artifacts are enabled in the Tauri bundle config in `src-tauri/tauri.conf.json:27-30`.
- The Rust toolchain is pinned to 1.97.0 (minimal profile with `clippy` and `rustfmt`) via `rust-toolchain.toml:1-4`; rustup selects it automatically for all `cargo`/Tauri builds.
