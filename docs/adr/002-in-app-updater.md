---
status: decision
topic: in-app-updater
---

# In-App Updater

## Context

The app has Tauri updater artifacts enabled and a static updater endpoint configured via `plugins.updater.endpoints` and `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. Runtime capabilities allow check, download/install, and process restart via the `updater:allow-check`, `updater:allow-download-and-install`, and `process:allow-restart` permissions in `src-tauri/capabilities/default.json`.

## Decision

Use the Tauri updater as the primary flow: keep the returned `Update` handle alive, render update availability and progress in the shell modal, call `downloadAndInstall` from that handle, and use process restart when needed. Under the zh locale, the available-update modal may also expose the versioned mainland-China mirror as a manual fallback; automatic install remains the primary action. The implementation boundary is the `UpdateHandle` type and `createUpdaterMachine` function in `src/features/about/updater.ts`, with the fallback composed by the `ShellUpdateModal` component in `src/layouts/ShellUpdateModal.tsx`.

## Rejected Alternatives

- Send every user to an external download. The in-app path preserves progress, install, and restart state; the localized mirror is an optional escape hatch for network constraints.
- Discard the `Update` handle after `check()`. The code documents that `downloadAndInstall` must run on the same handle in the `UpdateHandle` type in `src/features/about/updater.ts`.
- Hand-edit `latest.json`. The release scripts generate platform fragments and rebuild latest metadata from uploaded fragments via `upload_release_assets` and `generate_latest_manifest` in `build.sh`.

## Consequences

Updater bugs must be tested through the state machine and shell modal, including the localized fallback boundary, not only through release metadata. Release work must keep version alignment, updater artifacts, platform fragments, and signatures coherent.
