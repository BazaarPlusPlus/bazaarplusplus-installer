---
status: truth
topic: overview
last-verified: 529b56cad3da13db83b0266377503143596e5dad
---

# BazaarPlusPlus Installer Overview

Current documentation truth lives under `docs/truth/`. Historical plans, audits, and specs live under `docs/archive/` and are not current unless code is re-verified.

## System Map

- The app is a Tauri 2 desktop app with a React/Vite frontend and Rust backend. The package entry declares the app version and scripts in `package.json:2-21`; the Tauri app config sets the product name, frontend dev URL, build hooks, window size, and updater endpoint in `src-tauri/tauri.conf.json:3-35`.
- The native runtime registers single-instance, window-state, updater, process, dialog, opener, tray, installer context, and stream runtime state in `src-tauri/src/lib.rs:18-39`.
- Startup warms installer context on a blocking task and emits `startup-ready`; the stream HTTP service starts on setup in `src-tauri/src/lib.rs:40-53`.
- When the stream service is running, closing the main window hides it instead of quitting so OBS can keep using the local HTTP overlay in `src-tauri/src/lib.rs:56-70`.

## Current Topics

- [Architecture](architecture.md): repo layout, runtime boundaries, build/versioning, and generated bindings.
- [Frontend](frontend.md): shell, native-feel rules, modals, current product surfaces, and verified UI behavior.
- [Install And Reset](install-reset.md): install state contract, BepInEx install/uninstall, and reset-local-data behavior.
- [Launch Modes](launch-modes.md): Steam launch and macOS prefix/trampoline mode.
- [History And Stream](history-stream.md): local history reads, screenshots, stream server, overlay routes, and CORS scope.
- [Updater And Release](updater-release.md): in-app updater, release scripts, version sync, and R2 manifest flow.
- [Verification](verification.md): code-backed verification commands and when they apply.

## Non-Truth Locations

- `docs/archive/` is frozen historical context. It may explain why a decision was made, but it can be stale by design.
- `docs/decisions/` records architectural choices and rejected alternatives. These records are immutable unless a new decision supersedes them.
- `docs/plans/` contains active future work only. A plan is not a claim that behavior has shipped.
- `tmp/doc-consolidation-20260611.html` is a generated audit report for review and is intentionally ignored by git.
