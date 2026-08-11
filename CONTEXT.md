---
status: truth
topic: context
last-verified: e2c5cf500dc5def6a838e071b431e8fab446ae97
---

# BazaarPlusPlus Installer Context

Desktop installer for the BazaarPlusPlus mod for *The Bazaar*: it detects the Steam install, installs BepInEx plus the mod payload, launches the game through Steam, reads the mod's local run history, serves an OBS overlay, and self-updates.

This file is the entry map and vocabulary. Doc-layout policy lives in `CLAUDE.md`.

## System Map

Tauri 2 desktop app: React/Vite frontend, Rust backend. One native runtime owns window, tray, updater, and stream-service state, plus main-window restoration across tray activation, a second instance, and macOS Dock reopen. Startup warms installer context and the stream service together so install detection never races a cold start. See `docs/truth/architecture.md` for the cited detail.

## Glossary

- **BepInEx** — the Unity plugin-loader framework the installer ships into the game directory; its bootstrap files plus the `BepInEx/` tree are what "mod installed" means to detection (`is_bepinex_installed` in `src-tauri/src/services/detect/game.rs`).
- **Payload** — the exact BPP-owned file set, defined by `BPP_PRIVATE_RELATIVE_PATHS` and `BPP_BUNDLED_DEPENDENCY_RELATIVE_PATHS` in `src-tauri/src/services/bepinex/payload.rs`. Install pre-clean only ever removes payload-owned files; uninstall always removes private BPP files and, when BPP is the last installed mod, also the shared BepInEx bootstrap, trampoline, and launch-mode state (`uninstall_bpp` in `src-tauri/src/services/bepinex/mod.rs`). See `docs/truth/install-reset.md`.
- **Prefix mode** — the default launch mode: BepInEx loads via Steam launch options (doorstop). One of the two `LaunchMode` variants in `src-tauri/src/services/launch_mode.rs`.
- **Trampoline mode** — macOS launch mode (forced on macOS 27+): the real Unity executable is renamed to `.orig` and a build-time stub is swapped in by `install_trampoline` in `src-tauri/src/services/bepinex/trampoline.rs`.
- **Launch-mode marker** — the `.bpp-launch-mode` file next to the game directory persisting the chosen mode (`MARKER_FILE` in `src-tauri/src/services/bepinex/trampoline.rs`).
- **InstallState** — the frontend/backend contract for the install page: paths, game/mod state, compat state, action gates, and semantic warning codes plus parameters (`InstallState` and `InstallWarning` in `src-tauri/src/services/install/types.rs`).
- **Selected game installation** — the one session-scoped The Bazaar installation shared by Install, History, and Stream, held only in managed memory and recreated empty on app restart (`SelectedGameInstallationState` in `src-tauri/src/services/selected_game_installation.rs`). See `docs/truth/architecture.md` for its resolution priority.
- **Reset (local data)** — the only flow that deletes the mod's `BazaarPlusPlusV5/` data directory; explicit, confirmed, and refused while the game runs (`reset_bpp_data` in `src-tauri/src/services/bepinex/mod.rs`). Uninstall never touches it. See `docs/truth/install-reset.md`.
- **History** — the facade around the Selected game installation's mod-owned SQLite database, including reads, detail, reveal, video deletion, and storage cleanup (`History` in `src-tauri/src/services/history.rs`); the database is created and primarily written by the mod.
- **Semantic problem** — the command failure contract of a stable code, string parameters, and an optional diagnostic (`SemanticProblem` in `src-tauri/src/problem.rs`), shared by History, Install, and Stream command failures. See `docs/truth/architecture.md`.
- **Confirmed operation** — the shared frontend lifecycle for a target-bearing confirmed action: confirming, non-dismissible running, retained failure with retry, and success-only closure (`createConfirmedOperationController` in `src/features/shared/confirmedOperation.ts`). See `docs/truth/frontend.md`.
- **Modal coordinator** — the app-wide frontend owner that renders one registered native dialog at a time, using `critical > confirmation > system > informational` priority and FIFO within each priority (`createModalCoordinator` in `src/features/shared/modalCoordinator.ts`). See `docs/truth/frontend.md`.
- **Updater snapshot** — the discriminated frontend contract for checking, available, downloading, installing, ready-to-restart, restarting, and semantic failure states; only downloading carries progress (`UpdaterSnapshot` in `src/features/about/updater.ts`). See `docs/truth/updater-release.md`.
- **About bootstrap snapshot** — the frontend resource contract distinguishing initial loading, authoritative native data, packaged fallback data, and no-data blocking failure (`AppBootstrapSnapshot` in `src/features/about/appBootstrap.ts`). See `docs/truth/frontend.md`.
- **Stream runtime / overlay** — the single serialized owner of the local Axum service lifecycle, window selection, and exclusive maintenance (`StreamRuntime` in `src-tauri/src/stream/runtime.rs`); the production service remains on `127.0.0.1:17654` and serves the OBS overlay and settings pages (`ProductionServer` in `src-tauri/src/stream/server.rs`).
- **Stream workflow** — the framework-neutral frontend owner of independent service, polling freshness, window, crop, and one-off action capabilities, driven through injected ports (`createStreamWorkflow` in `src/features/stream/streamWorkflow.ts`). See `docs/truth/history-stream.md`.
- **Install workflow** — the framework-neutral frontend owner of authoritative `InstallState`, single-flight install/reset/uninstall/launch/refresh/directory operations, target-bearing confirmations, and derived primary action (`createInstallWorkflow` in `src/features/install/installWorkflow.ts`). See `docs/truth/install-reset.md`.
- **Storage cleanup** — preset-driven deletion of old screenshots and run data with upload-safety and referenced-file protections; its IPC is the two scope-tagged, semantic-problem `preview_storage_cleanup` and `execute_storage_cleanup` commands (`src-tauri/src/commands/history.rs`).
- **Generated bindings** — `src/types/generated/commands.ts`, emitted by `npm run generate:bindings` from the same Specta builder that registers the Tauri invoke handler; never hand-edited (`builder` in `src-tauri/src/commands/registry.rs`, `runGenerateBindings` in `scripts/generate-bindings.mjs`).

## Current Topics

- [Architecture](docs/truth/architecture.md): repo layout, runtime boundaries, build/versioning, and generated bindings.
- [Frontend](docs/truth/frontend.md): shell, native-feel rules, modals, current product surfaces, and verified UI behavior.
- [Install And Reset](docs/truth/install-reset.md): install state contract, BepInEx install/uninstall, and reset-local-data behavior.
- [Launch Modes](docs/truth/launch-modes.md): Steam launch and macOS prefix/trampoline mode.
- [History And Stream](docs/truth/history-stream.md): local history reads, screenshots, stream server, overlay routes, and CORS scope.
- [Updater And Release](docs/truth/updater-release.md): in-app updater, release scripts, version sync, and R2 manifest flow.
- [Verification](docs/truth/verification.md): code-backed verification commands and when they apply.
- Immutable decisions live in `docs/adr/`; each filename names its topic.
