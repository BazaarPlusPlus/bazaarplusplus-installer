---
status: truth
topic: updater-release
last-verified: c77a96d328e88e251024b0fb843261dd9e241903
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
- The release-platform set and its build, bundle, installer, updater-key, and Rust-target facts are defined once in `scripts/release-platforms.mjs:4-115`; `build.sh` queries them through `release_platforms_cli` in `build.sh:151-185`, while Node release scripts import the module directly.
- `run_release_prechecks` runs version sync before release packaging in `build.sh:480-482`; Tauri's `beforeBuildCommand` then runs the single `npm run prebuild-check` gate before the frontend build in `src-tauri/tauri.conf.json:7-10`.
- `scripts/prebuild-check.mjs` checks generated TypeScript bindings, version alignment, platform ZIP payloads, and on Darwin the compiled macOS trampoline stub in `scripts/prebuild-check.mjs:326-346`.

## Manifest Flow

- Platform updater fragments contain version, platform key, URL, and signature; their URL derives from the module's R2 updater-key construction in `scripts/generate-platform-manifest.mjs:6-23` and `scripts/release-platforms.mjs:103-115`.
- `build.sh` uploads installer artifacts, updater artifacts, signatures, and a per-platform `platform-manifest.json` to R2 under version/platform folders in `build.sh:500-544`.
- `build.sh` fetches every module-declared platform fragment and existing `latest.json`, then calls the generator with named flags and uploads the new manifest in `build.sh:547-582`.
- The latest manifest generator accepts only keys from `RELEASE_PLATFORM_KEYS`, preserves existing release notes/pub_date when rebuilding the same version, fails when no platform fragments are available, and exposes `--output`, `--version`, and `--temp-dir` in `scripts/generate-latest-manifest.mjs:5-145`.
