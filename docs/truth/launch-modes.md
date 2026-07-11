---
status: truth
topic: launch-modes
last-verified: 63783504d733039d18aa0278645457fe12064d63
---

# Launch Modes

## Steam Launch

- The installer launches the game exclusively through the Steam client. There is no other launch path — Steam detection is the substrate for every install and launch.
- The launch command takes no arguments and calls `launch_game_via_steam()` directly in `src-tauri/src/commands/install.rs:76-81`, which opens `steam://rungameid/1617400` in `src-tauri/src/services/install/mod.rs:24` and `src-tauri/src/services/install/mod.rs:156-158`; the capability allows `steam://*` URLs in `src-tauri/capabilities/default.json:12-19`.
- Game detection resolves Steam copies only, via `steamapps/libraryfolders.vdf` and Steam-library candidates in `src-tauri/src/services/detect/steam.rs:149-316` and well-known platform paths in `src-tauri/src/services/game_path.rs:191-225`.

## macOS Prefix And Trampoline Modes

- macOS trampoline mode is forced at macOS major version 27 or later, can be opted into below 27, and always resolves to prefix mode off macOS in `src-tauri/src/services/launch_mode.rs:17-102`; `src-tauri/src/services/macos_version.rs:12-40` is only the cached macOS version probe.
- `InstallCompatState` exposes whether compatibility mode is available, forced, desired, and applied in `src-tauri/src/services/install/types.rs:35-48`.
- The `LaunchMode` enum and stable marker codec live in `src-tauri/src/services/launch_mode.rs:20-46`; marker IO persists the chosen mode in `.bpp-launch-mode` next to the game directory in `src-tauri/src/services/bepinex/trampoline.rs:23-71`.
- Trampoline install renames the real Unity executable to `.orig`, swaps in a build-time stub, disables the prefix launcher, signs the real binary, seals the app bundle, verifies it, and rolls back on failure in `src-tauri/src/services/bepinex/trampoline.rs:362-445`.
- Trampoline uninstall restores `.orig`, re-seals the bundle, treats already-vanilla bundles as no-op, and errors if the backup is missing while the stub remains in `src-tauri/src/services/bepinex/trampoline.rs:447-472`; callers skip this entirely when third-party plugins or patchers remain, so `uninstall_bpp` only restores the vanilla bundle when BPP is the last installed mod in `src-tauri/src/services/bepinex/mod.rs:210-236`.
- Non-macOS marker and trampoline APIs are explicit no-ops or `false` in `src-tauri/src/services/bepinex/trampoline.rs:58-71` and `src-tauri/src/services/bepinex/trampoline.rs:490-503`.
