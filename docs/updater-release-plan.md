# Updater Build And Release Plan

This document captures the intended release flow for the installer, including both standalone installer packages and in-app updater artifacts.

## Goals

- Use Tauri updater with a static `latest.json`
- Host release assets and `latest.json` in Cloudflare R2
- Keep the updater private key on local machines only
- Allow Windows and macOS releases to be built separately
- Support both fresh installs and in-app upgrades for the same app version
- Allow `latest.json` to be regenerated later as more platform updater artifacts become available

## Release Asset Types

Each version can produce two different kinds of release assets.

### Installer bundles

These are for fresh installs by users who do not already have the app.

Examples:

- Windows NSIS installer
- macOS DMG

Installer bundles are published release artifacts, but they are not used by Tauri updater.

### Updater artifacts

These are for in-app upgrades by users who already have the app installed.

Examples:

- Windows updater archive plus `.sig`
- macOS updater archive plus `.sig`

Updater artifacts are the files referenced by `latest.json`.

## Current Constraints

- Windows builds are produced on Windows only
- macOS builds are produced on macOS only
- Updater signing uses one shared Tauri updater keypair
- The updater private key stays outside git and is stored locally under `signing-secrets`
- `latest.json` must reflect only the updater artifacts that already exist
- Installer bundles and updater artifacts may be uploaded separately, but they should still represent the same intended app version

## Key Distinctions

There are three different concerns involved:

- Tauri updater signing
  - Used only for updater artifacts
  - One keypair can be shared across Windows and macOS
- Platform code signing
  - Windows code signing certificate
  - macOS Apple signing and notarization
  - Separate from the Tauri updater keypair
- Release asset publishing
  - Installer bundles are for first-time installation
  - Updater artifacts are for in-app upgrade
  - `latest.json` should reference only updater artifacts

## Local Secret Storage

Local-only signing material should live under:

```text
signing-secrets/
```

Suggested contents:

```text
signing-secrets/
  tauri-updater.key
```

Notes:

- The updater public key is safe to commit in Tauri config

## Current Endpoint

The committed updater endpoint should point to:

```text
https://bppinstaller.bazaarplusplus.com/latest.json
```

This URL is the public manifest URL used by the app at runtime.

## Planned Tauri Integration

The app-side updater implementation should include:

- Rust dependency: `tauri-plugin-updater`
- Frontend dependency: `@tauri-apps/plugin-updater`
- Tauri plugin initialization in `src-tauri/src/lib.rs`
- Updater capability in `src-tauri/capabilities/default.json`
- Updater config in `src-tauri/tauri.conf.json`

The config should include:

- `bundle.createUpdaterArtifacts: true`
- `plugins.updater.pubkey`
- `plugins.updater.endpoints`

## UI Plan

The updater entry point on the home screen should be added beside the existing top-left buttons in:

- `src/lib/components/installer/InstallerHeader.svelte`

Expected behavior:

- Check for updates on startup
- Show a third small button near About and Bilibili
- Keep the button visible even when no update is available
- Highlight the button when an update is available
- Clicking the button should trigger manual update download and install

Recommended interaction model:

- Startup only checks for updates
- Startup does not auto-download
- Install is still user-triggered
- After installation, the app can prompt for restart or relaunch if desired

## Cloudflare R2 Layout

Recommended object layout:

```text
bppinstaller/
  latest.json
  2.2.0/
    windows-x86_64/
      installer/
        bppinstaller-setup.exe
      updater/
        bppinstaller.nsis.zip
        bppinstaller.nsis.zip.sig
    darwin-aarch64/
      installer/
        BazaarPlusPlus Installer.dmg
      updater/
        BazaarPlusPlus Installer.app.tar.gz
        BazaarPlusPlus Installer.app.tar.gz.sig
```

The exact filenames may vary based on Tauri output. The important part is:

- versioned directory
- platform subdirectory
- separate `installer/` and `updater/` directories
- updater artifact plus matching `.sig`

## Version Consistency Guidance

The main release invariant is:

- assets published under one app version should be intended to represent that same version to users

In practice, there are two levels of strictness.

### Preferred

Prefer building all assets for one version from the same git commit or release tag.

This keeps installer bundles, updater artifacts, and bug reports aligned. It is the simplest and safest release model.

### Acceptable relaxed mode

It is acceptable to build a missing platform later for the same version if all of the following are true:

- the app version remains unchanged
- no user-visible code or bundled content has changed in a way that would make the same version behave differently across platforms
- the later build is only filling in a missing platform artifact for an already-planned release

If code changes are required, a new app version should be published instead of reusing the old version number.

This means "same version, same source" is not an absolute rule, but "same version, same release content" should still be treated as the target invariant.

## Ten-Task Implementation Checklist

Use this as the execution checklist for the first complete updater rollout.

1. Add the Tauri updater plugin to Rust and the frontend package dependencies.
2. Add updater permissions to the main desktop capability used by the app window.
3. Add updater UI state and a persistent update button in `InstallerHeader.svelte`.
4. Add startup update checks with safe fallback behavior when updater config is incomplete.
5. Add manual download-and-install behavior with explicit progress and restart messaging.
6. Enable updater artifact generation in Tauri bundle config.
7. Add committed updater config placeholders for endpoint and public key, then replace them with real values before release packaging.
8. Implement `scripts/release-build.mjs` to upload both installer bundles and updater artifacts.
9. Implement `scripts/release-manifest.mjs` to rebuild `latest.json` from updater files in R2.
10. Validate the full release flow on at least one Windows build and one macOS build, including a same-version manifest regeneration pass.

## Local Signing And Build Workflow

Use this workflow on each release machine.

### One-time setup

1. Ensure the project root already ignores `signing-secrets/`.
2. Create the local secret directory:

```text
signing-secrets/
```

3. Generate one shared Tauri updater keypair and keep the private key only on trusted local machines.
4. Commit only the public key into `src-tauri/tauri.conf.json`.

### Generate updater keypair

Run this once on a trusted machine:

```bash
npx tauri signer generate -w ~/.tauri/bppinstaller-updater.key
```

If you prefer to keep the key directly inside the repo-local ignored folder, use:

```bash
npx tauri signer generate -w signing-secrets/tauri-updater.key
```

This command prints the public key. Copy that public key into:

- `src-tauri/tauri.conf.json`
- `plugins.updater.pubkey`

Generate the key without a password for this project.

Do not commit the private key.

### Recommended local file layout

```text
signing-secrets/
  tauri-updater.key
```

### Export signing environment variables

Before any release build that should generate signed updater artifacts, export:

- `TAURI_SIGNING_PRIVATE_KEY`

PowerShell:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content signing-secrets/tauri-updater.key -Raw
```

bash:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat signing-secrets/tauri-updater.key)"
```

### Pre-build validation

`./build.sh --prod` should internally run:

```bash
node scripts/version-sync.mjs
npm run prebuild-check
```

This ensures app versions are aligned and the existing packaging checks still pass.

### Local release build

To generate the current host platform release artifacts locally:

```bash
./build.sh --prod
```

This command now does all of the following in one place:

- loads updater signing env vars from the current shell, or falls back to `signing-secrets/`
- runs `node scripts/version-sync.mjs`
- runs `npm run prebuild-check`
- builds the current host platform app and installer bundle

Expected outcome:

- installer bundle is generated for the current platform
- updater artifact is generated for the current platform
- updater signature is generated for the updater artifact

### Upload built artifacts to R2

To upload the current host platform artifacts that already exist locally:

```bash
./build.sh --upload
```

This uploads:

- the installer bundle to `{version}/{platform}/installer/`
- the updater artifact to `{version}/{platform}/updater/`
- the updater signature to `{version}/{platform}/updater/`
- a per-platform updater fragment to `{version}/{platform}/updater/platform-manifest.json`
- a rebuilt top-level `latest.json`

Current target bucket:

```text
bppinstaller
```

### Build and upload in one step

To build first and then upload immediately:

```bash
./build.sh --prod --upload
```

### What must be true before a real release build

All of the following must be true:

- `src-tauri/tauri.conf.json` uses the real endpoint `https://bppinstaller.bazaarplusplus.com/latest.json`
- `plugins.updater.pubkey` contains the real public key
- `TAURI_SIGNING_PRIVATE_KEY` is exported in the current shell

If any of these are missing, the build may still produce an installer bundle, but the updater flow will not be release-ready.

## Script Responsibilities

Keep build and release concerns separate.

### `build.sh`

Keep `build.sh` focused on local development and production builds:

- dev app launch
- production build for the current host platform
- in `--prod` mode, run version sync before packaging
- in `--prod` mode, run `npm run prebuild-check` before packaging
- in `--prod` mode, load updater signing env vars from `signing-secrets/` when not already exported
- in `--upload` mode, upload current host platform artifacts to R2
- in `--upload` mode, rebuild and upload `latest.json` from uploaded platform fragments in R2
- generate whatever Tauri normally emits for that platform

### `scripts/release-build.mjs`

This script should:

- detect the current platform
- load updater signing env vars from `signing-secrets`
- run version checks
- run production build for the current platform
- locate installer bundles produced by Tauri
- locate updater artifacts produced by Tauri
- upload installer bundles to the platform `installer/` directory in R2
- upload updater artifacts to the platform `updater/` directory in R2

This script should not update `latest.json`.

### `scripts/release-manifest.mjs`

This script should:

- accept a target app version
- inspect R2 for updater artifacts already uploaded for that version
- include only platforms whose updater artifact and signature both exist
- ignore installer bundles completely
- regenerate the full `latest.json` from scratch
- upload the rewritten `latest.json` to R2

This script must be idempotent with respect to the same version metadata and the same updater files in R2.

### `scripts/release-config.mjs`

Centralize constants such as:

- R2 bucket name
- public base URL
- version path prefix
- platform key mapping
- installer bundle naming rules
- updater artifact naming rules

### Optional release metadata source

If `latest.json` includes fields such as `notes` or `pub_date`, those values should come from a stable input source such as:

- checked-in release metadata
- explicit CLI arguments
- a separate release metadata file uploaded for that version

Do not derive those fields from the current wall-clock time during each manifest regeneration unless changing them on each run is explicitly desired.

## Release Flow

### Windows-only release

1. Bump version
2. Sync versions
3. Build and upload Windows installer bundle and Windows updater artifacts on Windows
4. Generate `latest.json`

Result:

- `latest.json` contains only `windows-x86_64`
- fresh Windows installs are available
- in-app updates are available for Windows

### Add macOS later for the same version

1. Build and upload macOS installer bundle and macOS updater artifacts on macOS
2. Regenerate `latest.json`

Result:

- `latest.json` now contains both `windows-x86_64` and `darwin-aarch64`
- fresh macOS installs are now available
- in-app updates are now available for macOS

This is valid as long as the same app version is still being represented honestly.

## Important Manifest Rule

`latest.json` must always be rebuilt from the current updater contents of R2 for the selected version.

Do not implement `latest.json` generation as an append-only or patching workflow.

Correct behavior:

- first run may generate a one-platform manifest
- later run may generate a two-platform manifest
- rerunning the script should produce the same output if updater files and release metadata have not changed

## Example Release Sequence

### On Windows

```powershell
node scripts/version-sync.mjs
node scripts/release-build.mjs --version 2.2.0
node scripts/release-manifest.mjs --version 2.2.0
```

### Later on macOS

```bash
node scripts/version-sync.mjs
node scripts/release-build.mjs --version 2.2.0
node scripts/release-manifest.mjs --version 2.2.0
```

The second manifest run should keep the Windows entry and add the macOS entry.

## `latest.json` Shape

Expected structure:

```json
{
  "version": "2.2.0",
  "notes": "Release notes for 2.2.0",
  "pub_date": "2026-04-04T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "url": "https://downloads.example.com/bppinstaller/2.2.0/windows-x86_64/updater/bppinstaller.nsis.zip",
      "signature": "..."
    },
    "darwin-aarch64": {
      "url": "https://downloads.example.com/bppinstaller/2.2.0/darwin-aarch64/updater/BazaarPlusPlus Installer.app.tar.gz",
      "signature": "..."
    }
  }
}
```

The manifest generator should populate only the platform entries whose updater files are actually available.

## Failure Rules

`scripts/release-manifest.mjs` should fail if:

- no platform updater artifacts exist for the requested version
- a platform updater artifact exists but its `.sig` is missing
- multiple conflicting updater artifacts are found for one platform and the script cannot determine the correct one
- the target version does not match the version path being processed

`scripts/release-build.mjs` should fail if:

- the private key is missing
- the configured platform is unsupported on the current host
- expected installer bundles were not generated
- expected updater artifacts were not generated

## Recommended Implementation Order

1. Add updater plugin and config
2. Confirm local builds produce both installer bundles and updater artifacts
3. Add startup update check and header button
4. Implement `release-build.mjs`
5. Implement `release-manifest.mjs`
6. Test Windows-only release asset upload and manifest generation
7. Test adding macOS later and regenerating the same version manifest

## Non-Goals For The First Pass

- full CI-based release automation
- remote private key storage
- automatic background download on startup
- forcing both platforms to exist before publishing a usable manifest
