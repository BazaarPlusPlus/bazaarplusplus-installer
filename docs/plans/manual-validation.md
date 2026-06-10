---
status: active-plan
topic: manual-validation
last-verified: 7b18f73d4718d3e1406de9f526d1fbba09ac567f
---

# Manual Validation Backlog

These items are not promoted as truth. They are platform or service checks that cannot be concluded from code alone in this audit.

## macOS Launch

- Validate macOS 27+ install/reinstall/launch on a real machine with the current trampoline path. Code forces trampoline on macOS major version 27+ in `src-tauri/src/services/macos_version.rs:51-68` and applies the trampoline in `src-tauri/src/services/install/mod.rs:67-88`.
- Validate macOS <= 26 compatibility-mode opt-in separately. Code exposes this as available only below the forced macOS 27 threshold in `src-tauri/src/services/macos_version.rs:75-80`.
- Validate recovery when Steam verify or a game update reverts the bundle. Code compares desired/applied trampoline state and routes repairs through reinstall in `src-tauri/src/services/install/mod.rs:224-232`.

## Tempo Native Launch

- Validate native Tempo capture/replay on macOS and Windows. Code backs up/removes payload, starts Tempo, captures process arguments, restores payload, and launches modded game in `src-tauri/src/services/tempo.rs:173-223`.
- Validate cancellation and timeout copy in the live app. Code exposes cancel through `request_cancel` and frontend `cancelLaunch` in `src-tauri/src/services/tempo.rs:40-46` and `src/features/install/useInstallPage.ts:246-248`.

## Updater Release

- Validate an end-to-end staged release against R2 with both `windows-x86_64` and `darwin-aarch64` fragments before relying on a public `latest.json`. The generator accepts those platform keys in `scripts/generate-latest-manifest.mjs:5-89`.
- Validate Windows NSIS close/restart behavior after `downloadAndInstall`; code treats `relaunch()` as a fallback on Windows in `src/features/about/updater.ts:221-230`.

## Security Follow-Up

- Decide whether and how to restore a Tauri CSP. Current code sets `csp` to `null` in `src-tauri/tauri.conf.json:23-25`; this audit did not make a CSP recommendation.
