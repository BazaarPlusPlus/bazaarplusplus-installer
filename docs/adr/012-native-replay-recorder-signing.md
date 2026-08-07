# ADR-012: Installer Owns Native Replay Recorder Release Artifacts

## Context

Combat Replay records in-process on both desktop platforms. macOS uses a Unity Metal render plugin, VideoToolbox, AVFoundation, and a CoreAudio process tap. Windows uses a Unity D3D11 render plugin, Media Foundation, and WASAPI. The installer must ship the native code at Unity's preload locations and must not rely on an external encoder executable.

## Decision

- `BazaarPlusPlus/bazaarplusplus-mod` owns both native recorder implementations and their build scripts.
- This repository pins the full mod commit and exact SHA-256 of the macOS bundle, macOS audio dylib, and Windows DLL.
- macOS accepts only an ad-hoc-signed input bundle with no Team ID. The release build signs its Mach-O executable and bundle inside-out with `TeamIdentifier=9Z44S3N293`; the outer installer notarization then covers the signed payload.
- Windows stages `GfxPluginBppReplayMediaFoundation.dll` under `TheBazaar_Data/Plugins/x86_64`.
- macOS stages `GfxPluginBppReplayVideoToolbox.bundle` under `TheBazaar.app/Contents/Plugins` and `libBppMacAudio.dylib` under `BepInEx/plugins`.
- Payload preparation rejects retired external encoder files on both platforms. Installer ownership retains their old names only as upgrade/uninstall tombstones.

## Rejected alternatives

- Keeping a process-based fallback: it preserves the high-copy path and makes release behavior depend on an extra runtime executable.
- Silently falling back to software encoding: it hides a performance regression; native recorder availability fails closed instead.
- Storing officially signed native inputs in the mod repository: release signing remains the installer's responsibility.
- Installing the render plugins under `BepInEx/plugins`: Unity must preload them before managed plugin startup.

## Consequences

- Every native recorder change requires rebuilding the affected artifact and updating the installer lock to the exact mod commit.
- Release staging is larger by two small native plugins but no longer includes the external encoder archive or license payload.
- Existing installations are cleaned during upgrade, while new payload ZIPs contain only the platform-native recorder path.
