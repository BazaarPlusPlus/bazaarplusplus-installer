# Updater Build And Release Workflow

This document describes the release flow implemented in this repository for installer bundles, Tauri updater artifacts, and the public `latest.json` manifest.

## Goals

- Use the Tauri updater with a static `latest.json`.
- Host release assets and `latest.json` in Cloudflare R2.
- Keep the updater private key out of git.
- Allow Windows and macOS artifacts to be built and uploaded separately.
- Rebuild `latest.json` from uploaded per-platform fragments instead of patching it by hand.

## Implemented Tauri Integration

The app has the updater wired in:

- Rust dependency: `tauri-plugin-updater`
- Frontend dependency: `@tauri-apps/plugin-updater`
- Plugin initialization in `src-tauri/src/lib.rs`
- Permission in `src-tauri/capabilities/default.json`
- Updater config in `src-tauri/tauri.conf.json`
- `bundle.createUpdaterArtifacts: true`
- Public updater endpoint: `https://bppinstaller.bazaarplusplus.com/latest.json`

Platform bundle config lives in:

- `src-tauri/tauri.windows.conf.json`
- `src-tauri/tauri.macos.conf.json`

Those files map the platform-specific BepInEx ZIP to the runtime resource path `BepInExSource/BepInEx.zip` and bundle `BppDataVersionPolicy.json`.

## Release Asset Types

Each version can produce two asset groups.

### Installer Bundles

Installer bundles are for fresh installs:

- Windows: NSIS `.exe`
- macOS: DMG

They are uploaded under the platform `installer/` directory and are not directly referenced by Tauri updater.

### Updater Artifacts

Updater artifacts are for in-app upgrades:

- updater artifact emitted by Tauri bundling
- matching `.sig`

They are uploaded under the platform `updater/` directory and are referenced by `latest.json`.

## Local Secret Storage

Local-only signing material belongs under the ignored directory:

```text
signing-secrets/
  tauri-updater.key          # Tauri updater private key (all platforms)
  tauri-updater.password     # optional updater key password
  apple-api-issuer           # macOS: App Store Connect API issuer id
  apple-api-key              # macOS: App Store Connect API key id
  apple-api-key-path         # macOS: path to the .p8 key (optional; inferred if absent)
  apple-signing-identity     # macOS: Developer ID Application identity (optional; auto-detected if absent)
  AuthKey_<key-id>.p8        # macOS: App Store Connect API private key
```

### Updater signing (all platforms)

`tauri-updater.password` is optional. If it is absent and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is not exported, `build.sh` uses an empty password.

Before a release build, either export `TAURI_SIGNING_PRIVATE_KEY` or place the key at `signing-secrets/tauri-updater.key`. `./build.sh --prod` loads the key from `signing-secrets/` when the environment variable is absent.

### Apple signing and notarization (macOS only)

A macOS `./build.sh --prod` build signs the app bundle and the Mach-O binaries bundled inside the BepInEx resource ZIP with a Developer ID Application certificate, then notarizes via the App Store Connect API. For each value it uses the environment variable when set, otherwise the `signing-secrets/` file, otherwise auto-detection where supported:

- `APPLE_API_ISSUER` ← `signing-secrets/apple-api-issuer` — App Store Connect API issuer id (required).
- `APPLE_API_KEY` ← `signing-secrets/apple-api-key` — API key id (required).
- `APPLE_API_KEY_PATH` ← `signing-secrets/apple-api-key-path`, or inferred as `signing-secrets/AuthKey_<APPLE_API_KEY>.p8` — the API private key file (required; the `.p8` must exist).
- `APPLE_SIGNING_IDENTITY` ← `signing-secrets/apple-signing-identity`, or auto-detected from the keychain when exactly one Developer ID Application certificate is installed — the signing identity (required).

Windows `--prod` builds do not use any of the Apple secrets.

## Build Entry Points

Use `build.sh` as the release entry point.

```bash
./build.sh
```

Starts the local Tauri dev app.

```bash
./build.sh --prod
```

Builds release artifacts for the current host platform. In production mode the script:

- installs or reuses npm dependencies
- loads updater signing environment variables
- runs `node scripts/version-sync.mjs`
- runs `npm run prebuild-check`
- verifies the macOS arm64 Rust target when building on macOS
- runs `npm run tauri build -- --no-bundle`
- runs `npm run tauri bundle`

```bash
./build.sh --upload
```

Uploads existing current-host artifacts to Cloudflare R2, writes the per-platform manifest fragment, fetches known platform fragments, rebuilds `latest.json`, and uploads it.

```bash
./build.sh --prod --upload
```

Builds the current host platform and then uploads it in one run.

## Version And Prebuild Checks

`scripts/version-sync.mjs` treats `package.json` as the source version and writes that version into:

- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`

`npm run prebuild-check` validates:

- version alignment across package, Tauri, Cargo, and Cargo.lock
- `src-tauri/resources/BppDataVersionPolicy.json`
- required entries inside each platform BepInEx ZIP, or the target platform ZIP when `TAURI_ENV_PLATFORM` is set

Run `npm run prebuild-check` before release-oriented changes. `./build.sh --prod` runs it automatically.

## R2 Layout

The upload target bucket is:

```text
bppinstaller
```

The object layout is:

```text
latest.json
<version>/
  windows-x86_64/
    installer/
      <windows installer>
    updater/
      <windows updater artifact>
      <windows updater artifact>.sig
      platform-manifest.json
  darwin-aarch64/
    installer/
      <macOS installer>
    updater/
      <macOS updater artifact>
      <macOS updater artifact>.sig
      platform-manifest.json
```

`platform-manifest.json` is generated by `scripts/generate-platform-manifest.mjs` and contains:

```json
{
  "version": "3.2.0",
  "platform": "windows-x86_64",
  "url": "https://bppinstaller.bazaarplusplus.com/3.2.0/windows-x86_64/updater/<artifact>",
  "signature": "<signature>"
}
```

## `latest.json` Generation

`build.sh --upload` fetches available platform fragments from R2 into a temporary directory:

- `<version>/windows-x86_64/updater/platform-manifest.json`
- `<version>/darwin-aarch64/updater/platform-manifest.json`

It also fetches the existing top-level `latest.json` when present. Then it runs `scripts/generate-latest-manifest.mjs`.

Manifest behavior:

- Only fragments matching the requested version and platform key are included.
- Missing platforms are skipped.
- If no valid fragments exist, generation fails.
- If the existing `latest.json` has the same version, its `notes` and `pub_date` are reused.
- If the version is new, `notes` defaults to `Release <version>` and `pub_date` is generated at manifest creation time.

Final shape:

```json
{
  "version": "3.2.0",
  "notes": "Release 3.2.0",
  "pub_date": "2026-04-04T12:00:00.000Z",
  "platforms": {
    "windows-x86_64": {
      "url": "https://bppinstaller.bazaarplusplus.com/3.2.0/windows-x86_64/updater/<artifact>",
      "signature": "<signature>"
    }
  }
}
```

## Platform Notes

Windows builds use the default release target layout:

```text
src-tauri/target/release/
```

macOS production builds target Apple Silicon:

```text
src-tauri/target/aarch64-apple-darwin/release/
```

Install the target before macOS production builds:

```bash
rustup target add aarch64-apple-darwin
```

## Release Sequences

### Windows-only release

1. Update `package.json` to the release version.
2. Run `./build.sh --prod --upload` on Windows.
3. Confirm the generated `latest.json` contains `windows-x86_64`.

Result:

- fresh Windows installer is uploaded
- Windows in-app updates are available
- macOS is absent from `latest.json` until a valid macOS fragment exists

### Add macOS for the same version

1. Check out the same release content on macOS.
2. Run `./build.sh --prod --upload`.
3. Confirm the regenerated `latest.json` contains both `windows-x86_64` and `darwin-aarch64`.

This is acceptable only when the same app version still represents the same release content. If code or bundled content changes in a user-visible way, publish a new version.

## Failure Rules

Production build should fail when:

- updater signing key is missing
- required platform resource ZIP is missing
- version alignment fails
- BPP data version policy is invalid
- required BepInEx ZIP entries are missing
- required Rust target is missing for macOS

Upload should fail when:

- installer artifact is missing
- updater artifact or `.sig` is missing
- `wrangler` upload fails
- no valid platform fragments exist for the requested version

## Script Map

- `build.sh`: dev, production build, upload, and `latest.json` orchestration
- `scripts/version-sync.mjs`: align package, Tauri, Cargo, and Cargo.lock versions
- `scripts/prebuild-check.mjs`: validate versions, BPP data policy, and platform ZIP contents
- `scripts/generate-platform-manifest.mjs`: create one platform updater fragment
- `scripts/generate-latest-manifest.mjs`: combine uploaded fragments into `latest.json`

There are no `scripts/release-build.mjs` or `scripts/release-manifest.mjs` entry points in the current repository.
