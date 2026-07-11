---
status: active-plan
topic: manual-validation
last-verified: 91bb9c5adaacb94b8d30b21260752e2eb2ddda1b
---

# Manual Validation Backlog

These items are not promoted as truth. They are platform or service checks that cannot be concluded from code alone in this audit.

## macOS Launch

- Validate macOS 27+ install/reinstall/launch on a real machine with the current trampoline path. Code forces trampoline on macOS major version 27+ in `src-tauri/src/services/macos_version.rs:51-68` and applies the trampoline in `src-tauri/src/services/install/mod.rs:56-77`.
- Validate macOS <= 26 compatibility-mode opt-in separately. Code exposes this as available only below the forced macOS 27 threshold in `src-tauri/src/services/macos_version.rs:75-80`.
- Validate recovery when Steam verify or a game update reverts the bundle. Code compares desired/applied trampoline state and routes repairs through reinstall in `src-tauri/src/services/install/mod.rs:167-186`.

## Updater Release

- Validate an end-to-end staged release against R2 with a fragment for every key in `RELEASE_PLATFORM_KEYS` before relying on a public `latest.json`. The platform keys are defined in `scripts/release-platforms.mjs:10-43` and consumed in `scripts/generate-latest-manifest.mjs:69-88`.
- Validate Windows NSIS close/restart behavior after `downloadAndInstall`; code treats `relaunch()` as a fallback on Windows in `src/features/about/updater.ts:221-230`.

## Security Follow-Up

- Decide whether and how to restore a Tauri CSP. Current code sets `csp` to `null` in `src-tauri/tauri.conf.json:23-25`; this audit did not make a CSP recommendation.
