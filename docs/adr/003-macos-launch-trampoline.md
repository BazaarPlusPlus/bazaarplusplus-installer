---
status: decision
topic: macos-launch-trampoline
---

# macOS Launch Trampoline

## Context

After macOS updated to 27.0 and the Steam client self-updated to `macos-signed-2` (2026-06-09), The Bazaar stopped launching with BepInEx. The root cause was reproduced live against Steam's `logs/console_log.txt` and `logs/gameprocess_log.txt`:

| LaunchOptions first token | Steam result |
| --- | --- |
| `TheBazaar.app` (empty options) | `Game process added` then `Completed` |
| `run_bepinex.sh` **or** `/bin/sh` (prefix) | `Failed to spawn process`, `AppError_46 "OS Error 0"` |
| `DYLD_…=… %command%` (env prefix) | `OS Error 260` |

The macOS 27 Steam client no longer spawns a prefix executable before `%command%` — even `/bin/sh` fails. The failure is pre-plugin: the mod DLLs never load. BepInEx on macOS depended entirely on the prefix script that set `LaunchOptions` to `"…/run_bepinex.sh" %command%`, so that mechanism is dead on this client. Launching the `.app` directly is the only path that still works, which forces injection to move inside the `.app`.

The same conclusion is recorded next to the code in `src-tauri/src/services/macos_version.rs` and `src-tauri/src/services/bepinex/trampoline.rs`.

## Decision

Force the in-bundle Mach-O trampoline on macOS 27+, offer it as an opt-in compatibility mode on macOS <= 26, and leave non-macOS paths as no-ops. The version gate is `LaunchModeGate::from_platform`, which compares the cached OS probe against `TRAMPOLINE_FORCED_MAJOR`, both in `src-tauri/src/services/launch_mode.rs`; trampoline install/uninstall are the `install_trampoline` and `uninstall_trampoline` functions in `src-tauri/src/services/bepinex/trampoline.rs`.

## Rejected Alternatives

- Keep relying on the prefix launcher for macOS 27+. The module doc comment in `src-tauri/src/services/macos_version.rs` identifies that path as dead on macOS 27+.
- Use trampoline mode without persisting desired launch mode. The implementation writes the `MARKER_FILE` (`.bpp-launch-mode`) in `src-tauri/src/services/bepinex/trampoline.rs` so future detection can distinguish desired mode from a bundle reverted by Steam verify or update.
- Apply trampoline without rollback. The `install_trampoline` function in `src-tauri/src/services/bepinex/trampoline.rs` verifies codesign availability first and restores vanilla layout on failure.

## Consequences

macOS install behavior is now mode-dependent. Detection must compare desired and applied trampoline state, and reinstall is the repair path when the bundle has been reverted.
