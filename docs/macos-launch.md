---
status: current
topic: macos-launch
last-verified: 17b17d67ba7cc27b52a435d2cff8eadfd3278840
---

# macOS Launch

## Steam Boundary

The installer launches The Bazaar through `launch_game_via_steam` in `src-tauri/src/services/install/mod.rs`, which opens the fixed Steam game URL. Detection resolves Steam installations through `detect_installation_paths` in `src-tauri/src/services/detect/steam.rs`; there is no alternate launch-mode state.

## Trampoline Invariant

- `install_trampoline` in `src-tauri/src/services/bepinex/trampoline.rs` preserves the Unity executable as `.orig`, installs the bundled Mach-O stub as `CFBundleExecutable`, signs the real executable with the required entitlements, seals the bundle, verifies it, and rolls back the layout if installation fails.
- `is_current_trampoline` in the same module requires both the structural `.orig` layout and byte identity with the bundled stub. Steam Verify, game updates, or a new stub therefore produce a repairable state.
- `inspect_launch_options_for_steam` and `clear_launch_options_for_steam` in `src-tauri/src/services/vdf/launch_options.rs` require every direct The Bazaar `LaunchOptions` value to be empty across Steam accounts. Unreadable configuration blocks mutation.
- `remove_obsolete_macos_artifacts` in `src-tauri/src/services/bepinex/trampoline.rs` removes fixed non-canonical residue by name; those files never select behavior.
- `uninstall_trampoline` restores `.orig` and re-seals the vanilla bundle. `uninstall_bpp` invokes it only when BPP is the last installed mod.

`compile_macos_trampoline_stub` in `src-tauri/build.rs` builds the bundled arm64 stub with the deployment target defined by `MACOS_TRAMPOLINE_DEPLOYMENT_TARGET` in `src-tauri/build_support.rs`. Release validation inspects that target before packaging. The rationale for the sole-bootstrap and empty-LaunchOptions choices lives in [ADR-003](adr/003-macos-launch-trampoline.md); the Steam-only product boundary lives in [ADR-006](adr/006-steam-only-launch.md).
