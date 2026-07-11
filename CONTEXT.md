---
status: truth
topic: context
last-verified: 4366cda394fe304066b55564c3c44d1f917a2273
---

# BazaarPlusPlus Installer Context

Desktop installer for the BazaarPlusPlus mod for *The Bazaar*: it detects the Steam install, installs BepInEx plus the mod payload, launches the game through Steam, reads the mod's local run history, serves an OBS overlay, and self-updates.

Current behavior truth lives under `docs/truth/` (topic-sliced, code-cited, hash-stamped). Architectural decisions live in `docs/adr/`. This file is the entry map and vocabulary.

## System Map

- The app is a Tauri 2 desktop app with a React/Vite frontend and Rust backend. The package entry declares the app version and scripts in `package.json:2-21`; the Tauri app config sets the product name, frontend dev URL, build hooks, window size, and updater endpoint in `src-tauri/tauri.conf.json:3-35`.
- The native runtime registers single-instance, window-state, updater, process, dialog, opener, tray, installer context, and stream runtime state in `src-tauri/src/lib.rs:18-39`.
- Startup warms installer context on a blocking task and emits `startup-ready`; the stream HTTP service starts on setup in `src-tauri/src/lib.rs:40-53`.
- When the stream service is running, closing the main window hides it instead of quitting so OBS can keep using the local HTTP overlay in `src-tauri/src/lib.rs:56-70`.

## Glossary

- **BepInEx** — the Unity plugin-loader framework the installer ships into the game directory; its bootstrap files plus the `BepInEx/` tree are what "mod installed" means to detection (`src-tauri/src/services/detect/game.rs:3-21`).
- **Payload** — the exact BPP-owned file set, defined by `BPP_PRIVATE_RELATIVE_PATHS` and `BPP_BUNDLED_DEPENDENCY_RELATIVE_PATHS` in `src-tauri/src/services/bepinex/payload.rs:10-35`. Install pre-clean and uninstall only ever touch payload-owned files.
- **Prefix mode** — the default launch mode: BepInEx loads via Steam launch options (doorstop). One of the two `LaunchMode` variants in `src-tauri/src/services/launch_mode.rs:20-46`.
- **Trampoline mode** — macOS launch mode (forced on macOS 27+): the real Unity executable is renamed to `.orig` and a build-time stub is swapped in (`src-tauri/src/services/bepinex/trampoline.rs:362-445`).
- **Launch-mode marker** — the `.bpp-launch-mode` file next to the game directory persisting the chosen mode (`src-tauri/src/services/bepinex/trampoline.rs:23-71`).
- **InstallState** — the frontend/backend contract for the install page: paths, game/mod state, compat state, action gates, warnings (`src-tauri/src/services/install/types.rs:3-19`).
- **Reset (local data)** — the only flow that deletes the mod's `BazaarPlusPlusV4/` data directory; explicit, confirmed, and refused while the game runs (`src-tauri/src/services/bepinex/mod.rs:18-69`). Uninstall never touches it.
- **History** — the installer's read-only view of the mod-owned SQLite database (`src-tauri/src/history/queries.rs:29-35`); the database is created and written by the mod.
- **Stream service / overlay** — the local Axum HTTP service on `127.0.0.1:17654` serving the OBS overlay and settings pages (`src-tauri/src/stream/server.rs:16-17`).
- **Storage cleanup** — preset-driven deletion of old screenshots and run data with upload-safety and referenced-file protections (`src-tauri/src/history/cleanup.rs`).
- **Generated bindings** — `src/types/generated/**`, emitted by `npm run generate:bindings` from the Rust command registry; never hand-edited (`src-tauri/src/commands/registry.rs:3-58`).

## Current Topics

- [Architecture](docs/truth/architecture.md): repo layout, runtime boundaries, build/versioning, and generated bindings.
- [Frontend](docs/truth/frontend.md): shell, native-feel rules, modals, current product surfaces, and verified UI behavior.
- [Install And Reset](docs/truth/install-reset.md): install state contract, BepInEx install/uninstall, and reset-local-data behavior.
- [Launch Modes](docs/truth/launch-modes.md): Steam launch and macOS prefix/trampoline mode.
- [History And Stream](docs/truth/history-stream.md): local history reads, screenshots, stream server, overlay routes, and CORS scope.
- [Updater And Release](docs/truth/updater-release.md): in-app updater, release scripts, version sync, and R2 manifest flow.
- [Verification](docs/truth/verification.md): code-backed verification commands and when they apply.

## Doc Layout

- `docs/truth/` is the only current-behavior location. Re-verify archive claims against code before reuse.
- `docs/adr/` records architectural choices and rejected alternatives. Records are immutable unless a new decision supersedes them.
- `docs/plans/` contains active future work only. A plan is not a claim that behavior has shipped.
- `docs/archive/` is frozen historical context; it may explain why, but it can be stale by design.
- `docs/INDEX.md` is the manifest with per-file status and last-verified hashes.
