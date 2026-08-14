---
status: current
topic: release
last-verified: ef77a33ab317dcb8b447f5590452eeff1d7cf6f4
---

# Release

## Verification Gates

- `npm run verify -- --source-only` is the authoritative clean-checkout source gate. `npm run verify -- --release-platform <macos|windows>` adds real release-payload validation for one platform.
- `verificationSteps` in `scripts/verify.mjs` generates bindings while running the Rust suite once, checks generated drift and formatting, type-checks, runs Vitest, validates the locked Cargo graph, runs strict Rust checks, applies the selected prebuild guard, and builds the production frontend. `runVerification` stops on the first failed step.
- `npm run prebuild-check` is the focused guard for version alignment, generated bindings, platform configuration, bundled resources, and pinned native inputs.
- `./build.sh --prod` runs release prechecks before platform packaging. It is the release path, not the default verification command for source-only changes.

## Reproducible Inputs

- `package.json` is the version source. `synchronizeVersions` in `scripts/version-sync.mjs` updates package-lock, Tauri, and Cargo versions; `collectVersionSnapshot` and `assertVersionsAreAligned` guard drift.
- `RELEASE_PLATFORMS` in `scripts/release-platforms.mjs` is the platform source for target triples, bundle layout, Tauri overlays, resource ZIPs, and updater keys.
- `scripts/native-recorder-input.lock.json` pins the producer commit and SHA-256 of every native recorder input. `verifyNativeRecorderInput` in `scripts/native-recorder-input.mjs` and every release-platform prebuild reject source or hash drift.
- `listPayloadFiles`, `buildZipBuffer`, and `writeDeterministicZip` in `scripts/payload-zip.mjs` create deterministic resource ZIPs and entry manifests. `validatePayloadZip` enforces staging/ZIP agreement and rejects unsafe or retired paths.

## Packaging And Signing

`run_release_prechecks` in `build.sh` synchronizes versions, verifies native inputs, prepares resources, and runs the platform release gate before Tauri packaging.

On macOS, the installer accepts ad-hoc native recorder inputs, signs nested Mach-O components and bundles inside-out with the official identity, rebuilds the payload ZIP, and then packages and notarizes the outer installer. The ownership decision lives in [ADR-006](adr/006-native-replay-recorder-signing.md). `assertMacosTrampolineStub` in `scripts/prebuild-check.mjs` separately proves the bundled trampoline architecture and deployment target.

## Artifact And Upload Boundary

- `discoverArtifacts` and `createArtifactManifest` in `scripts/artifact-manifest.mjs` require exactly one coherent installer/updater pair and record commit, cleanliness, paths, sizes, hashes, and signature content.
- `validateArtifactManifest` rechecks those facts before upload. `upload_release_assets` in `build.sh` consumes only the validated paths and has no directory-scan fallback.
- Platform fragments come from `buildPlatformFragment` in `scripts/generate-platform-manifest.mjs`. `generate_latest_manifest` in `build.sh` fetches the canonical fragments and rebuilds `latest.json` through `buildLatestManifest` in `scripts/generate-latest-manifest.mjs`.
- R2 access runs through the project-pinned Wrangler executable selected by `wrangler_cli` in `build.sh`.
