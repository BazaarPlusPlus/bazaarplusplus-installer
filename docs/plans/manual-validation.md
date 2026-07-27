---
status: active-plan
topic: manual-validation
last-verified: c56cac3a94fea48f6711c45a5139cab3bc7322d8
---

# Manual Validation Backlog

These items are not promoted as truth. They are platform or service checks that cannot be concluded from code alone in this audit.

## macOS Launch

- Validate macOS 27+ install/reinstall/launch on a real machine with the current trampoline path. Code forces trampoline on macOS major version 27+ in `src-tauri/src/services/launch_mode.rs:62-72` (threshold constant at `src-tauri/src/services/launch_mode.rs:18`) and the production install operation applies its private `InstallTrampoline` effect in `src-tauri/src/services/install/operation.rs:94-117`.
- Validate macOS <= 26 compatibility-mode opt-in separately. Code exposes this as available only below the forced macOS 27 threshold in `src-tauri/src/services/launch_mode.rs:87-101`.
- Validate recovery when Steam verify or a game update reverts the bundle. Code folds desired/applied trampoline consistency into `version_matches`, which routes an installed but inconsistent bundle to reinstall in `src-tauri/src/services/install/mod.rs:118-125` and `src-tauri/src/services/install/mod.rs:146-160`.

## Updater Release

- Validate an end-to-end staged release against R2 with a fragment for every key in `RELEASE_PLATFORM_KEYS` before relying on a public `latest.json`. The platform keys are defined in `scripts/release-platforms.mjs:11-44` and consumed in `scripts/generate-latest-manifest.mjs:69-88`.
- Validate Windows NSIS close/restart behavior after `downloadAndInstall`; code treats `relaunch()` as a fallback on Windows in `src/features/about/updater.ts:286-297`.

## Architecture Deepening Native Smoke

- Validate the destructive native paths against disposable game data: History video deletion, both cleanup scopes with non-empty previews, and Reset local data while Stream is running. The automated facade and runtime tests cover their boundaries, but the 2026-07-18 smoke deliberately did not delete the real installed game's files (`src-tauri/src/services/history.rs:675-781`, `src-tauri/src/stream/runtime.rs:514-572`).
- Validate the bundled native window and tray interactions: History detail/reveal, overlay copy/window/crop/restart/stop, close-to-tray, tray stop, and quit. The unbundled 2026-07-18 dev binary started successfully and served `/overlay`, `/settings`, `/api/stream/records`, and `/api/overlay/crop-config` on the fixed local server, but its window was not exposed through the macOS app accessibility identifier (`src-tauri/src/stream/http.rs:29-40`, `src-tauri/src/tray.rs:28-61`).

## Security Follow-Up

- Decide whether and how to restore a Tauri CSP. Current code sets `csp` to `null` in `src-tauri/tauri.conf.json:28-30`; this audit did not make a CSP recommendation.
