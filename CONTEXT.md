---
status: truth
topic: context
last-verified: 4091a2a7b6490795c7ef509bbb1e717e85de98dd
---

# BazaarPlusPlus Installer Context

Desktop installer for the BazaarPlusPlus mod for *The Bazaar*: it detects the Steam install, installs BepInEx plus the mod payload, launches the game through Steam, reads the mod's local run history, serves an OBS overlay, and self-updates.

Current behavior truth lives under `docs/truth/` (topic-sliced, code-cited, hash-stamped). Architectural decisions live in `docs/adr/`. This file is the entry map and vocabulary.

## System Map

- The app is a Tauri 2 desktop app with a React/Vite frontend and Rust backend. The package entry declares the app version and scripts in `package.json:2-21`; the Tauri app config sets the product name, frontend dev URL, build hooks, window size, and updater endpoint in `src-tauri/tauri.conf.json:3-35`.
- The native runtime registers single-instance, window-state, updater, process, dialog, opener, tray, selected-installation, installer-context, and stream-runtime state in `src-tauri/src/lib.rs:19-43`.
- Startup warms installer context on a blocking task and emits `startup-ready`; setup asks the stream runtime to ensure the HTTP service in `src-tauri/src/lib.rs:44-59`.
- When the stream service is running, closing the main window hides it instead of quitting so OBS can keep using the local HTTP overlay in `src-tauri/src/lib.rs:60-73`.

## Glossary

- **BepInEx** — the Unity plugin-loader framework the installer ships into the game directory; its bootstrap files plus the `BepInEx/` tree are what "mod installed" means to detection (`src-tauri/src/services/detect/game.rs:3-21`).
- **Payload** — the exact BPP-owned file set, defined by `BPP_PRIVATE_RELATIVE_PATHS` and `BPP_BUNDLED_DEPENDENCY_RELATIVE_PATHS` in `src-tauri/src/services/bepinex/payload.rs:10-35`. Install pre-clean and uninstall only ever touch payload-owned files.
- **Prefix mode** — the default launch mode: BepInEx loads via Steam launch options (doorstop). One of the two `LaunchMode` variants in `src-tauri/src/services/launch_mode.rs:20-46`.
- **Trampoline mode** — macOS launch mode (forced on macOS 27+): the real Unity executable is renamed to `.orig` and a build-time stub is swapped in (`src-tauri/src/services/bepinex/trampoline.rs:362-445`).
- **Launch-mode marker** — the `.bpp-launch-mode` file next to the game directory persisting the chosen mode (`src-tauri/src/services/bepinex/trampoline.rs:23-71`).
- **InstallState** — the frontend/backend contract for the install page: paths, game/mod state, compat state, action gates, warnings (`src-tauri/src/services/install/types.rs:3-19`).
- **Selected game installation** — the one session-scoped The Bazaar installation shared by Install, History, and Stream. Valid explicit paths update it; resolution then uses explicit, selected, startup-detected, and fallback priority. It is held only in managed memory and is recreated empty on app restart (`src-tauri/src/services/selected_game_installation.rs:14-115`, `src-tauri/src/lib.rs:37-40`).
- **Reset (local data)** — the only flow that deletes the mod's `BazaarPlusPlusV4/` data directory; explicit, confirmed, refused while the game runs, and performed under exclusive stream-runtime maintenance (`src-tauri/src/services/bepinex/mod.rs:20-62`, `src-tauri/src/stream/runtime.rs:100-108`). Uninstall never touches it.
- **History** — the facade around the Selected game installation's mod-owned SQLite database, including reads, detail, reveal, video deletion, and storage cleanup (`src-tauri/src/services/history.rs:45-213`); the database is created and primarily written by the mod.
- **Stream runtime / overlay** — the single serialized owner of the local Axum service lifecycle, window selection, and exclusive maintenance; the production service remains on `127.0.0.1:17654` and serves the OBS overlay and settings pages (`src-tauri/src/stream/runtime.rs:43-108`, `src-tauri/src/stream/server.rs:16-69`).
- **Stream workflow** — the framework-neutral frontend owner of Stream page initialization, polling, intents, error priority, and its single derived snapshot. Browser/Tauri concerns enter through injected ports, and React only attaches lifecycle and subscription (`src/features/stream/streamWorkflow.ts:94-120`, `src/features/stream/useStreamPage.ts:21-61`).
- **Storage cleanup** — preset-driven deletion of old screenshots and run data with upload-safety and referenced-file protections; its IPC is the two scope-tagged preview/execute operations (`src-tauri/src/commands/history.rs:60-78`, `src-tauri/src/services/history.rs:24-43`).
- **Generated bindings** — `src/types/generated/commands.ts`, emitted by `npm run generate:bindings` from the same Specta builder that registers the Tauri invoke handler; never hand-edited (`src-tauri/src/commands/registry.rs:3-50`, `scripts/generate-bindings.mjs:86-118`).

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
