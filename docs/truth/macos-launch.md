---
status: truth
topic: macos-launch
last-verified: 8c5c3af5d844635b9c2b6ef9124fd7a951533e37
---

# macOS Launch

## Steam Launch

- The installer launches the game exclusively through Steam. The `launch_game` command in `src-tauri/src/commands/install.rs` calls `launch_game_via_steam` in `src-tauri/src/services/install/mod.rs`, which opens `steam://rungameid/1617400`; `opener:allow-open-url` in `src-tauri/capabilities/default.json` permits the URL.
- Game detection resolves Steam copies through `get_game_path_from_vdf` and `detect_installation_paths` in `src-tauri/src/services/detect/steam.rs`, with platform candidates from `fallback_game_candidates` in `src-tauri/src/services/game_path.rs`.

## Sole macOS Bootstrap

- macOS has one bootstrap: the in-bundle Mach-O trampoline implemented by `install_trampoline` in `src-tauri/src/services/bepinex/trampoline.rs`. There is no launch-mode model, OS-version gate, compatibility option, or persisted mode choice.
- The trampoline replaces the bundle's `CFBundleExecutable` with the bundled stub, preserves the Unity executable as `<executable>.orig`, signs the real executable with the required JIT entitlements, seals the app bundle, verifies it, and rolls the bundle layout back if installation fails. The stub source is `src-tauri/trampoline/bpp_launcher.c` and `compile_macos_trampoline_stub` in `src-tauri/build.rs` creates the bundled arm64 resource.
- `is_current_trampoline` in `src-tauri/src/services/bepinex/trampoline.rs` requires both the structural `.orig` layout and byte identity with the currently bundled stub. Steam verification, a game update, or a changed stub therefore makes the install repairable rather than ready.
- A ready macOS bootstrap also requires every direct `LaunchOptions` value for The Bazaar to be empty across Steam accounts. `inspect_launch_options_for_steam` and `clear_launch_options_for_steam` in `src-tauri/src/services/vdf/launch_options.rs` inspect and clear the property; `launch_options_empty_in_content` and `clear_launch_options` in `src-tauri/src/services/vdf/parse.rs` treat any non-empty value as dirty without interpreting its contents.
- `remove_obsolete_macos_artifacts` in `src-tauri/src/services/bepinex/trampoline.rs` deletes the fixed non-canonical filenames `run_bepinex.sh`, `bpp_launcher.c`, and `.bpp-launch-mode` without reading or parsing them. These names are cleanup residue only and are not part of detection, configuration, or compatibility behavior.
- `uninstall_trampoline` in `src-tauri/src/services/bepinex/trampoline.rs` restores `.orig`, re-seals the bundle, treats an already-vanilla bundle as a no-op, and rejects a stubbed bundle with no backup. `uninstall_bpp` in `src-tauri/src/services/bepinex/mod.rs` restores the vanilla bootstrap only when no third-party plugin or patcher remains.
- Off macOS, trampoline installation and cleanup functions are no-ops, current-bootstrap detection is satisfied, and Steam launch options are not part of install readiness.
