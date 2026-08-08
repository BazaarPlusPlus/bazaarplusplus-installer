---
status: truth
topic: updater-release
last-verified: ee30e2721c41e48ca9ded635791d44369ee92987
---

# Updater And Release

## In-App Updater

- The Tauri bundle config creates updater artifacts via `bundle.createUpdaterArtifacts` in `src-tauri/tauri.conf.json`.
- The updater endpoint is `https://bppinstaller.bazaarplusplus.com/latest.json`, and the public key is configured via `plugins.updater.endpoints` / `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`.
- Runtime capabilities allow HTTPS URL opening, updater check, updater download/install, and process restart via the `opener:default`, `updater:allow-check`, `updater:allow-download-and-install`, and `process:allow-restart` entries in the `permissions` array of `src-tauri/capabilities/default.json`.
- The updater implementation keeps the `Update` handle alive across user interactions because `downloadAndInstall` must run on the same handle returned by `check()`; see the `UpdateHandle` type in `src/features/about/updater.ts`.
- `runCheck` in `src/features/about/updater.ts` returns `preview` outside Tauri runtime, `available` with version/notes/handle when a plugin update exists, or `current` when none exists.
- The `UpdaterSnapshot` discriminated union in `src/features/about/updater.ts` encodes checking, available, downloading, installing, ready-to-restart, restarting, and failed states without contradictory progress/problem fields. `createUpdaterMachine` in the same file guards duplicate work/dismissal, consumes handles once, refreshes a handle on retry, separates download from install failure at the Finished event, and preserves known version/notes across restart failure.
- Known updater failures are stable semantic problems rather than native error copy. `updaterProblemFromError` in `src/features/about/updaterProblems.ts` attaches operation and optional version parameters plus diagnostic detail; the `updaterProblem*` keys in the `zh`/`en` catalogs in `src/i18n/messages.ts` supply bilingual recovery text. Restart recovery names a real OS surface, so the `updater_restart_failed` case of `updaterProblemMessageKey` (`src/features/about/updaterProblems.ts`) picks the Windows or macOS variant via `isWindowsPlatform` in `src/features/shared/platform.ts`.
- One phase presentation supplies updater metadata and the modal contract. `getUpdaterUiContract` in `src/features/about/updaterPresentation.ts` keeps update decisions at system priority behind confirmations, while download/install/restart work upgrades the same modal source — the `shell:update` `ModalSource` in `src/layouts/GlobalShell.tsx` — to critical blocked policy. Manual update checking is exposed on the Install page via the check-for-updates `MaintenanceAction` tile in `src/features/install/InstallActionsPanel.tsx`. Modal body/recovery copy names the product as `BazaarPlusPlus {version}` through the `updateModalBody` / `updateInstallingBody` / `updateReadyBody` / `updaterProblemRestartFailedMac` / `updaterProblemRestartFailedWindows` keys in the `zh`/`en` catalogs in `src/i18n/messages.ts`. The mainland-China download card is offered only under the zh locale, gated by `mainlandDownloadUrl` in the `ShellUpdateModal` component (`src/layouts/ShellUpdateModal.tsx`).
- The available-update modal keeps automatic download/install as its primary action and also offers a localized mainland-China manual-download card. Its platform-specific Lanzou URL uses the same `bppwin<version-without-dots>` / `bppmac<version-without-dots>` convention as the website, built by `buildMainlandDownloadUrl` in `src/features/about/mainlandDownload.ts`; the Tauri runtime opens it in the system browser from the `ShellUpdateModal` component (`src/layouts/ShellUpdateModal.tsx`).

## Reproducible Release Inputs

- `package.json` pins the package manager and supported Node/npm ranges via its `packageManager` / `engines` keys, and pins an exact Wrangler dev dependency via `devDependencies.wrangler`; `main` in `build.sh` checks and prints the actual tool versions (`assertSupportedVersion` in `scripts/check-toolchain.mjs`) before any mode proceeds.
- Development may reuse a validated `node_modules`, but release and upload-only modes require `package-lock.json` and run `npm ci`, in `install_dependencies` (`build.sh`). The authoritative gate also checks Cargo metadata with `--locked` in the "Check locked Cargo dependency graph" step of `verificationSteps` (`scripts/verify.mjs`).
- The canonical release-platform table — `RELEASE_PLATFORMS` in `scripts/release-platforms.mjs` — owns platform keys, target triples, bundle paths/targets, Tauri overlays, and resource ZIPs; Windows has no extra Rust target, while macOS requires `aarch64-apple-darwin`. `ensure_required_rust_targets` in `build.sh` returns before invoking rustup when that list is empty.

## Payload Contract

- Real release staging lives under `src-tauri/resources/SourceForBuild/<platform>`. Windows requires the managed payload, version marker, and Media Foundation recorder DLL. macOS requires the managed payload, version marker, CoreAudio capture library, and VideoToolbox render-plugin bundle. Both payloads explicitly reject retired FFmpeg files; macOS also rejects the retired recorder helper.
- The checked-in native recorder inputs are produced by `BazaarPlusPlus/bazaarplusplus-mod`. `scripts/native-recorder-input.lock.json` pins the full mod commit and SHA-256 of every native macOS and Windows artifact. The dedicated verifier and every release-platform prebuild reject missing files or source/hash drift.
- `npm run prepare:resources -- --platform <macos|windows>` sorts entries, preserves Unix modes, and rejects symlinks and OS artifacts via `listPayloadFiles`; fixes ZIP timestamps via `buildZipBuffer`; and writes the ignored ZIP plus a per-entry size/mode/SHA-256 and whole-ZIP checksum manifest via `writeDeterministicZip` — all in `scripts/payload-zip.mjs`.
- Release validation requires `BazaarPlusPlus.version`, checks the staging and checksum manifest, and performs an exact normalized file-set comparison via `validatePayloadZip`, `validateZipEntrySet`, and `normalizedEntryName` in `scripts/payload-zip.mjs`, rejecting missing, stale-extra, absolute, drive, parent-traversal, backslash, duplicate, and OS-artifact entries while allowing directory entries and one common top-level prefix.
- macOS validation additionally checks launcher contents and the arm64 trampoline via `assertMacosLauncherScriptIsSafe` and `assertMacosTrampolineStub` in `scripts/prebuild-check.mjs`. Source CI uses only the marked fixture written by `writeCiResourceFixtures` (`scripts/ci-resource-fixture.mjs`); it cannot satisfy the release payload or checksum contract.

## Build And Artifact Manifest

- Production runs version synchronization, pinned native-input verification, resource preparation, and the authoritative release-platform gate before Tauri packaging, in `run_release_prechecks` (`build.sh`).
- The installer is the only production signer for the macOS VideoToolbox plugin bundle: `assert_ad_hoc_replay_recorder_input` in `build.sh` rejects Developer ID-signed input and requires an ad-hoc input with `TeamIdentifier=not set`, `sign_macos_resource_plugin_bundles` signs the bundle inside-out, and `assert_official_codesign_team_id` then verifies that its executable and bundle report the official Team ID — `OFFICIAL_APPLE_TEAM_ID` in `build.sh:43`, currently `9Z44S3N293`.
- After inner native components are signed, the payload ZIP is rebuilt before the outer Tauri installer is packaged, signed, notarized, stapled, and assessed. The retired standalone recorder helper no longer has a separate notarization path.
- After stale bundle cleanup and a successful bundle, artifact discovery requires exactly one installer and one updater signature and derives the paired updater via `discoverArtifacts`, while `createArtifactManifest` refuses version-mismatched names — both in `scripts/artifact-manifest.mjs`.
- The gitignored manifest records version, build/release platform, commit, dirty state, build timestamp, and exact relative paths, sizes, and SHA-256 values; the signature also records its trimmed content — all in `createArtifactManifest` (`scripts/artifact-manifest.mjs`).
- Upload validates current version/platform/commit/cleanliness and rechecks every path, size, hash, signature, and filename before returning exact files, in `validateArtifactManifest` (`scripts/artifact-manifest.mjs`). `upload_release_assets` in `build.sh` consumes only those returned paths, with no directory-scan fallback.

## Public Updater Manifest Flow

- Platform updater fragments contain version, platform key, URL, and signature via `buildPlatformFragment` in `scripts/generate-platform-manifest.mjs`; their URL derives from `r2UpdaterKey` / `updaterFragmentUrl` in `scripts/release-platforms.mjs`.
- `build.sh` uses only the project-pinned Wrangler executable for R2 access, through the `wrangler_cli` function.
- `generate_latest_manifest` in `build.sh` fetches every canonical platform fragment and the existing `latest.json`, calls the generator with named flags, and uploads the result.
- The latest manifest generator (`scripts/generate-latest-manifest.mjs`) accepts only keys from `RELEASE_PLATFORM_KEYS`, preserves existing release notes/pub_date when rebuilding the same version via `buildLatestManifest`, fails when no platform fragments are available, and exposes `--output`, `--version`, and `--temp-dir` in its `main` function.
