---
status: decision
topic: native-replay-recorder-signing
---

# Installer Owns Native Replay Recorder Release Artifacts

## Context

Combat Replay records in-process through platform-native Unity plugins. The installer must preload those artifacts at platform-specific locations and establish one release-signing authority.

## Decision

- The mod repository owns native recorder source and builds.
- The installer pins the producer commit and exact hashes of staged native inputs.
- macOS inputs arrive ad hoc signed; the installer signs nested code and bundles with the official release identity before outer notarization.
- Platform payloads contain only the native recorder artifacts, not an external encoder fallback.

Current input validation, staging, signing, and packaging are specified in [Release](../release.md).

## Rejected Alternatives

- Keep a process-based encoder fallback. It preserves the high-copy path and adds a runtime executable.
- Silently fall back to software encoding. That hides a performance and capability regression.
- Store officially signed inputs in the producer repository. Release signing remains the installer's responsibility.
- Install render plugins as ordinary managed plugins. Unity must preload them before managed startup.

## Consequences

Every native recorder change updates the pinned producer commit and artifact hashes. Native availability fails closed, and upgrade cleanup retains retired names only as tombstones rather than release inputs.
