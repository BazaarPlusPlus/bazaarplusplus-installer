# ADR-011: Installer Owns Native Replay Recorder Release Identity

## Context

The macOS replay recorder is a separate app whose designated identity owns Screen Recording permission. A locally available Developer ID can prove that the signing commands work, but distributing that signed binary would attribute the helper to the wrong publisher and a later signer change could cause macOS to treat it as a different TCC identity.

The public BazaarPlusPlus 4.5.0 updater establishes the production publisher as `Developer ID Application: YANG Xinyu (9Z44S3N293)`. The managed `BazaarPlusPlus.dll` has no Apple code-signing role; TCC evaluates the helper app.

## Decision

- `BazaarPlusPlus/bazaarplusplus-mod` owns the helper source and protocol. Its build emits only an ad-hoc-signed app using `com.bazaarplusplus.replay-recorder.debug`.
- This repository pins the imported helper to a full mod commit and exact artifact hashes. Release verification rejects drift before packaging.
- A production build accepts only a valid ad-hoc input with no Team ID. It rewrites the bundle identifier to `com.bazaarplusplus.replay-recorder`, signs nested code inside-out, and requires both the executable and app to report `TeamIdentifier=9Z44S3N293`.
- The helper is notarized and stapled separately before it is placed in the signed payload ZIP. The outer installer is bundled and notarized afterwards with the same configured release identity.
- No official private key or pre-signed official helper is stored in the mod repository. A helper signed with a developer's local identity is rejected rather than redistributed.

## Rejected alternatives

- Shipping the locally signed helper: it carries the wrong publisher identity and cannot be release acceptance.
- Committing an officially signed helper to the mod repository: it reverses signing ownership and turns a source repository into a distributor of privileged release artifacts.
- Reusing the production bundle identifier for Debug: it risks contaminating the stable release TCC grant with development builds.
- Removing FFmpeg from every platform: Windows still depends on the FFmpeg/WASAPI recording backend.

## Consequences

- Every helper change requires updating the installer lock with the merged mod commit and rebuilt ad-hoc artifact hashes.
- Local development can validate capture behavior without access to release credentials, but cannot claim release signing or notarization acceptance.
- A formal macOS release requires the official `9Z44S3N293` Developer ID and Apple notarization credentials; any other Team ID fails closed.
- Windows packaging and recording remain unchanged, including `ffmpeg.exe`, its license, and WASAPI audio capture.
