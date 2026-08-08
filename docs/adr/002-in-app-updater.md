---
status: decision
topic: in-app-updater
---

# In-App Updater

## Context

The app has Tauri updater artifacts enabled and a static updater endpoint configured via `plugins.updater.endpoints` and `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. Runtime capabilities allow check, download/install, and process restart via the `updater:allow-check`, `updater:allow-download-and-install`, and `process:allow-restart` permissions in `src-tauri/capabilities/default.json`.

## Decision

Use the Tauri updater as an in-app flow: keep the returned `Update` handle alive, render update availability and progress in the shell modal, call `downloadAndInstall` from that handle, and use process restart when needed. The implementation is in the `UpdateHandle` type and `createUpdaterMachine` function in `src/features/about/updater.ts`.

## Rejected Alternatives

- Send users to GitHub releases for install. The current shell update modal has install/retry/restart actions and no GitHub fallback in the `ShellUpdateModal` component in `src/layouts/ShellUpdateModal.tsx`.
- Discard the `Update` handle after `check()`. The code documents that `downloadAndInstall` must run on the same handle in the `UpdateHandle` type in `src/features/about/updater.ts`.
- Hand-edit `latest.json`. The release scripts generate platform fragments and rebuild latest metadata from uploaded fragments via `upload_release_assets` and `generate_latest_manifest` in `build.sh`.

## Consequences

Updater bugs must be tested through the state machine and the shell modal, not only through release metadata. Release work must keep version alignment, updater artifacts, platform fragments, and signatures coherent.
