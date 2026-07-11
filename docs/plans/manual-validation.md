---
status: active-plan
topic: manual-validation
last-verified: 4366cda394fe304066b55564c3c44d1f917a2273
---

# Manual Validation Backlog

These items are not promoted as truth. They are platform or service checks that cannot be concluded from code alone in this audit.

## macOS Launch

- Validate macOS 27+ install/reinstall/launch on a real machine with the current trampoline path. Code forces trampoline on macOS major version 27+ in `src-tauri/src/services/launch_mode.rs:62-72` (threshold constant at `src-tauri/src/services/launch_mode.rs:18`) and applies the trampoline through the `InstallTrampoline` step in `src-tauri/src/services/install/mod.rs:91-92`.
- Validate macOS <= 26 compatibility-mode opt-in separately. Code exposes this as available only below the forced macOS 27 threshold in `src-tauri/src/services/launch_mode.rs:87-101`.
- Validate recovery when Steam verify or a game update reverts the bundle. Code compares desired/applied trampoline state and routes repairs through reinstall in `src-tauri/src/services/install/mod.rs:166-196`.

## Updater Release

- Validate an end-to-end staged release against R2 with a fragment for every key in `RELEASE_PLATFORM_KEYS` before relying on a public `latest.json`. The platform keys are defined in `scripts/release-platforms.mjs:10-43` and consumed in `scripts/generate-latest-manifest.mjs:69-88`.
- Validate Windows NSIS close/restart behavior after `downloadAndInstall`; code treats `relaunch()` as a fallback on Windows in `src/features/about/updater.ts:221-230`.

## Security Follow-Up

- Decide whether and how to restore a Tauri CSP. Current code sets `csp` to `null` in `src-tauri/tauri.conf.json:23-25`; this audit did not make a CSP recommendation.
