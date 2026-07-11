---
status: truth
topic: updater-release
last-verified: 8c9c6a4e0e337f7b7230b8936f9e8edd0d24cfd1
---

# Updater And Release

## In-App Updater

- The Tauri bundle config creates updater artifacts in `src-tauri/tauri.conf.json:27-30`.
- The updater endpoint is `https://bppinstaller.bazaarplusplus.com/latest.json`, and the public key is configured in `src-tauri/tauri.conf.json:31-35`.
- Runtime capabilities allow updater check, updater download/install, and process restart in `src-tauri/capabilities/default.json:6-11`.
- The updater implementation keeps the `Update` handle alive across user interactions because `downloadAndInstall` must run on the same handle returned by `check()` in `src/features/about/updater.ts:6-14`.
- `runCheck` returns `preview` outside Tauri runtime, `available` with version/notes/handle when a plugin update exists, or `current` when none exists in `src/features/about/updater.ts:42-56`.
- The state machine deduplicates checks, surfaces manual check errors in the header, keeps startup checks silent, tracks download progress, drops consumed handles after `downloadAndInstall`, and transitions to ready/error in `src/features/about/updater.ts:139-240`.
- On Windows, `downloadAndInstall` tries `relaunch()` as a fallback while expecting the NSIS installer to own close/restart behavior in `src/features/about/updater.ts:221-230`.

## Release Scripts

- `scripts/version-sync.mjs` reads the version from `package.json`, writes the Tauri and Cargo versions, updates Cargo.lock when present, and asserts all versions align in `scripts/version-sync.mjs:33-175`.
- `run_release_prechecks` runs version sync before release packaging in `build.sh:502-504`; Tauri's `beforeBuildCommand` then runs the single `npm run prebuild-check` gate before the frontend build in `src-tauri/tauri.conf.json:7-10`.
- `scripts/prebuild-check.mjs` checks generated TypeScript bindings, version alignment, platform ZIP payloads, and on Darwin the compiled macOS trampoline stub in `scripts/prebuild-check.mjs:327-346`.

## Manifest Flow

- Platform updater fragments contain version, platform key, URL, and signature; URLs are based on `<baseUrl>/<version>/<platform>/updater/<artifact>` in `scripts/generate-platform-manifest.mjs:5-18`.
- `build.sh` uploads installer artifacts, updater artifacts, signatures, and a per-platform `platform-manifest.json` to R2 under version/platform folders in `build.sh:486-530`.
- `build.sh` fetches uploaded platform fragments and existing `latest.json`, then generates and uploads the new `latest.json` in `build.sh:533-565`.
- The latest manifest generator accepts only known platform fragments for `windows-x86_64` and `darwin-aarch64`, preserves existing release notes/pub_date when rebuilding the same version, and fails when no platform fragments are available in `scripts/generate-latest-manifest.mjs:5-89`.
