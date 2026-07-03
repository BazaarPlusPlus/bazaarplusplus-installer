---
status: truth
topic: launch-modes
last-verified: 529b56cad3da13db83b0266377503143596e5dad
---

# Launch Modes

## Steam Launch

- The installer launches the game exclusively through the Steam client. There is no other launch path — Steam detection is the substrate for every install and launch.
- The launch command takes no arguments and calls `launch_game_via_steam()` directly in `src-tauri/src/commands/install.rs:66-70`, which opens `steam://rungameid/1617400` in `src-tauri/src/services/install/mod.rs:24` and `src-tauri/src/services/install/mod.rs:146-148`; the capability allows `steam://*` URLs in `src-tauri/capabilities/default.json:12-18`.
- Game detection resolves Steam copies only, via `steamapps/libraryfolders.vdf` and well-known Steam library paths in `src-tauri/src/services/detect/steam.rs:268` and `src-tauri/src/services/game_path.rs:125-153`.

## macOS Prefix And Trampoline Modes

- macOS trampoline mode is forced at macOS major version 27 or later, and can be opted into on macOS versions below 27; it is always false off macOS in `src-tauri/src/services/macos_version.rs:15-80`.
- `InstallCompatState` exposes whether compatibility mode is available, forced, desired, and applied in `src-tauri/src/services/install/types.rs:26-38`.
- The trampoline implementation persists the chosen launch mode in `.bpp-launch-mode` next to the game directory in `src-tauri/src/services/bepinex/trampoline.rs:21-33` and `src-tauri/src/services/bepinex/trampoline.rs:56-80`.
- Trampoline install renames the real Unity executable to `.orig`, swaps in a build-time stub, disables the prefix launcher, signs the real binary, seals the app bundle, verifies it, and rolls back on failure in `src-tauri/src/services/bepinex/trampoline.rs:384-467`.
- Trampoline uninstall restores `.orig`, re-seals the bundle, treats already-vanilla bundles as no-op, and errors if the backup is missing while the stub remains in `src-tauri/src/services/bepinex/trampoline.rs:471-495`; callers skip this entirely when third-party plugins or patchers remain, so `uninstall_bpp` only restores the vanilla bundle when BPP is the last installed mod in `src-tauri/src/services/bepinex/mod.rs:163-178`.
- Non-macOS trampoline APIs are explicit no-ops or `false` in `src-tauri/src/services/bepinex/trampoline.rs:512-525`.
