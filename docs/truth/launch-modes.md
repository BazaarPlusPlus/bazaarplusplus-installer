---
status: truth
topic: launch-modes
last-verified: e2c5cf500dc5def6a838e071b431e8fab446ae97
---

# Launch Modes

## Steam Launch

- The installer launches the game exclusively through the Steam client. There is no other launch path — Steam detection is the substrate for every install and launch.
- The launch command takes no arguments, calls `launch_game_via_steam()`, and maps failures to the Install semantic problem contract, in the `launch_game` command in `src-tauri/src/commands/install.rs`. The service opens `STEAM_BAZAAR_URL` (`steam://rungameid/1617400`) via `launch_game_via_steam` in `src-tauri/src/services/install/mod.rs`; the capability allows `steam://*` URLs via the `opener:allow-open-url` permission entry in `src-tauri/capabilities/default.json`.
- Game detection resolves Steam copies only, via `steamapps/libraryfolders.vdf` in `get_game_path_from_vdf` and Steam-library candidates in `detect_installation_paths` (both in `src-tauri/src/services/detect/steam.rs`), plus well-known platform paths in `fallback_game_candidates` in `src-tauri/src/services/game_path.rs`.

## macOS Prefix And Trampoline Modes

- macOS trampoline mode is forced at macOS major version 27 or later (`TRAMPOLINE_FORCED_MAJOR`), can be opted into below 27, and always resolves to prefix mode off macOS, per `LaunchModeGate::from_platform` in `src-tauri/src/services/launch_mode.rs`; `macos_major` in `src-tauri/src/services/macos_version.rs` is only the cached macOS version probe.
- `InstallCompatState` in `src-tauri/src/services/install/types.rs` exposes whether compatibility mode is available, forced, desired, and applied.
- The `LaunchMode` enum and its stable marker codec (`as_marker`/`from_marker`) live in `src-tauri/src/services/launch_mode.rs`; marker IO (`write_launch_mode_marker`/`read_launch_mode_marker`/`remove_launch_mode_marker`) persists the chosen mode in the `MARKER_FILE` (`.bpp-launch-mode`) inside the game directory (outside the `.app`), in `src-tauri/src/services/bepinex/trampoline.rs`.
- `install_trampoline` in `src-tauri/src/services/bepinex/trampoline.rs` renames the real Unity executable to `.orig`, swaps in a build-time stub, disables the prefix launcher, signs the real binary, seals the app bundle, verifies it, and rolls back on failure.
- `uninstall_trampoline` in `src-tauri/src/services/bepinex/trampoline.rs` restores `.orig`, re-seals the bundle, treats already-vanilla bundles as no-op, and errors if the backup is missing while the stub remains; callers skip this entirely when third-party plugins or patchers remain, so `uninstall_bpp` in `src-tauri/src/services/bepinex/mod.rs` only restores the vanilla bundle when BPP is the last installed mod.
- Off macOS, the marker functions (`write_launch_mode_marker`/`read_launch_mode_marker`/`remove_launch_mode_marker`) and trampoline functions (`is_trampolined`/`install_trampoline`/`uninstall_trampoline`) in `src-tauri/src/services/bepinex/trampoline.rs` are explicit no-ops or `false`.
