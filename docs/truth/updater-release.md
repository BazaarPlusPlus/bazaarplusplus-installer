---
status: truth
topic: updater-release
last-verified: c56cac3a94fea48f6711c45a5139cab3bc7322d8
---

# Updater And Release

## In-App Updater

- The Tauri bundle config creates updater artifacts in `src-tauri/tauri.conf.json:32-35`.
- The updater endpoint is `https://bppinstaller.bazaarplusplus.com/latest.json`, and the public key is configured in `src-tauri/tauri.conf.json:36-40`.
- Runtime capabilities allow updater check, updater download/install, and process restart in `src-tauri/capabilities/default.json:13-15`.
- The updater implementation keeps the `Update` handle alive across user interactions because `downloadAndInstall` must run on the same handle returned by `check()` in `src/features/about/updater.ts:9-17`.
- `runCheck` returns `preview` outside Tauri runtime, `available` with version/notes/handle when a plugin update exists, or `current` when none exists in `src/features/about/updater.ts:45-59`.
- The discriminated snapshot encodes checking, available, downloading, installing, ready-to-restart, restarting, and failed states without contradictory progress/problem fields in `src/features/about/updater.ts:61-120`. The machine guards duplicate work/dismissal, consumes handles once, refreshes a handle on retry, separates download from install failure at the Finished event, and preserves known version/notes across restart failure in `src/features/about/updater.ts:132-335`.
- Known updater failures are stable semantic problems rather than native error copy. Check/download/install/restart codes carry operation and optional version parameters plus diagnostic detail; bilingual presenters supply recovery text in `src/features/about/updaterProblems.ts:9-63`, `src/i18n/messages.ts:217-222`, and `src/i18n/messages.ts:661-668`.
- One phase presentation supplies updater metadata and the modal contract. Update decisions remain system priority behind confirmations, while download/install/restart work upgrades the same modal source to critical blocked policy in `src/features/about/updaterPresentation.ts:22-118` and `src/layouts/GlobalShell.tsx:148-157`. Manual update checking is exposed on the Install page in `src/features/install/InstallActionsPanel.tsx:63-70` and on the About page via `useUpdater().checkNow` in `src/pages/About.tsx:48-57` and `src/pages/About.tsx:93-112`. Modal body/recovery copy brands the app as `BazaarPlusPlus Installer {version}` in `src/i18n/messages.ts:199-222` and `src/i18n/messages.ts:640-668`.

## Reproducible Release Inputs

- `package.json` pins the package manager, supported Node/npm ranges, and exact Wrangler dev dependency in `package.json:6-10` and `package.json:50-62`; `build.sh` checks and prints the actual tool versions before any mode proceeds in `build.sh:687-708`.
- Development may reuse a validated `node_modules`, but release and upload-only modes require `package-lock.json` and run `npm ci` in `build.sh:175-194` and `build.sh:721-743`. The authoritative gate also checks Cargo metadata with `--locked` in `scripts/verify.mjs:44-57`.
- The canonical release-platform table owns platform keys, target triples, bundle paths/targets, Tauri overlays, and resource ZIPs in `scripts/release-platforms.mjs:11-40`; Windows has no extra Rust target, while macOS requires `aarch64-apple-darwin`. The target check returns before invoking rustup when that list is empty in `build.sh:196-221`.

## Payload Contract

- Real release staging lives under `src-tauri/resources/SourceForBuild/<platform>`. The required private DLL, version marker, ffmpeg binary, and license inputs are explicit in `scripts/payload-zip.mjs:9-28`; preparation reports every missing required path together in `scripts/payload-zip.mjs:100-115`.
- `npm run prepare:resources -- --platform <macos|windows>` sorts entries, fixes ZIP timestamps, preserves Unix modes, rejects symlinks and OS artifacts, writes the ignored ZIP, and writes a per-entry size/mode/SHA-256 plus whole-ZIP checksum manifest in `scripts/payload-zip.mjs:64-98`, `scripts/payload-zip.mjs:132-197`, and `scripts/payload-zip.mjs:346-420`.
- Release validation requires `BazaarPlusPlus.version`, checks the staging and checksum manifest, performs an exact normalized file-set comparison, and rejects missing, stale-extra, absolute, drive, parent-traversal, backslash, duplicate, and OS-artifact entries while allowing directory entries and one common top-level prefix in `scripts/payload-zip.mjs:259-343` and `scripts/payload-zip.mjs:422-485`.
- macOS validation additionally checks launcher contents and the arm64 trampoline in `scripts/prebuild-check.mjs:132-162`. Source CI uses only the marked fixture in `scripts/ci-resource-fixture.mjs:8-21`; it cannot satisfy the release payload or checksum contract.

## Build And Artifact Manifest

- Production runs version synchronization, resource preparation, and the authoritative release-platform verify gate before Tauri packaging in `build.sh:450-457` and `build.sh:721-736`. macOS nested Mach-O resources and the trampoline are signed before the final bundle, and the signed ZIP checksum manifest is refreshed, in `build.sh:407-448` and `build.sh:627-653`.
- After stale bundle cleanup and a successful bundle, artifact discovery requires exactly one installer and one updater signature, derives the paired updater, and refuses version-mismatched names in `scripts/artifact-manifest.mjs:60-121` and `scripts/artifact-manifest.mjs:134-171`.
- The gitignored manifest records version, build/release platform, commit, dirty state, build timestamp, and exact relative paths, sizes, and SHA-256 values; the signature also records its trimmed content in `scripts/artifact-manifest.mjs:134-171`.
- Upload validates current version/platform/commit/cleanliness and rechecks every path, size, hash, signature, and filename before returning exact files in `scripts/artifact-manifest.mjs:174-255`. `build.sh` consumes only those returned paths, with no directory-scan fallback, in `build.sh:474-519`.

## Public Updater Manifest Flow

- Platform updater fragments contain version, platform key, URL, and signature; their URL derives from the module's R2 updater-key construction in `scripts/generate-platform-manifest.mjs:6-23` and `scripts/release-platforms.mjs:104-115`.
- `build.sh` uses only the project-pinned Wrangler executable for R2 access in `build.sh:459-471` and `build.sh:559-566`.
- `build.sh` fetches every canonical platform fragment and existing `latest.json`, calls the generator with named flags, and uploads the result in `build.sh:521-557`.
- The latest manifest generator accepts only keys from `RELEASE_PLATFORM_KEYS`, preserves existing release notes/pub_date when rebuilding the same version, fails when no platform fragments are available, and exposes `--output`, `--version`, and `--temp-dir` in `scripts/generate-latest-manifest.mjs:5-145`.
