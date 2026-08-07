---
status: decision
topic: in-app-updater
---

# In-App Updater

## Context

The app has Tauri updater artifacts enabled and a static updater endpoint configured in `src-tauri/tauri.conf.json:27-35`. Runtime capabilities allow check, download/install, and process restart in `src-tauri/capabilities/default.json:6-11`.

## Decision

Use the Tauri updater as an in-app flow: keep the returned `Update` handle alive, render update availability and progress in the shell modal, call `downloadAndInstall` from that handle, and use process restart when needed. The implementation is in `src/features/about/updater.ts:6-14` and `src/features/about/updater.ts:139-240`.

## Rejected Alternatives

- Send users to GitHub releases for install. The current shell update modal has install/retry/restart actions and no GitHub fallback in `src/layouts/ShellUpdateModal.tsx:177-200`.
- Discard the `Update` handle after `check()`. The code documents that `downloadAndInstall` must run on the same handle in `src/features/about/updater.ts:6-14`.
- Hand-edit `latest.json`. The release scripts generate platform fragments and rebuild latest metadata from uploaded fragments in `build.sh:486-565`.

## Consequences

Updater bugs must be tested through the state machine and the shell modal, not only through release metadata. Release work must keep version alignment, updater artifacts, platform fragments, and signatures coherent.
