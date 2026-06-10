---
status: decision
topic: macos-launch-trampoline
---

# macOS Launch Trampoline

## Context

The macOS launch code documents that macOS 27 changed the Steam client so prefix executables before `%command%` no longer work for BepInEx injection in `src-tauri/src/services/macos_version.rs:1-10` and `src-tauri/src/services/bepinex/trampoline.rs:1-12`.

## Decision

Force the in-bundle Mach-O trampoline on macOS 27+, offer it as an opt-in compatibility mode on macOS <= 26, and leave non-macOS paths as no-ops. The version gate is in `src-tauri/src/services/macos_version.rs:51-80`; trampoline install/uninstall APIs are in `src-tauri/src/services/bepinex/trampoline.rs:497-525`.

## Rejected Alternatives

- Keep relying on the prefix launcher for macOS 27+. The code comments identify that path as dead on macOS 27+ in `src-tauri/src/services/macos_version.rs:3-10`.
- Use trampoline mode without persisting desired launch mode. The implementation writes `.bpp-launch-mode` so future detection can distinguish desired mode from a bundle reverted by Steam verify or update in `src-tauri/src/services/bepinex/trampoline.rs:21-33`.
- Apply trampoline without rollback. The implementation verifies codesign availability first and restores vanilla layout on failure in `src-tauri/src/services/bepinex/trampoline.rs:384-467`.

## Consequences

macOS install behavior is now mode-dependent. Detection must compare desired and applied trampoline state, and reinstall is the repair path when the bundle has been reverted.
