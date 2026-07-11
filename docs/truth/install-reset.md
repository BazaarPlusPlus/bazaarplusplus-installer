---
status: truth
topic: install-reset
last-verified: e6e3f695a897973b0b3bc1e06ce3faf56261ecec
---

# Install And Reset

## Install State Contract

- `InstallState` is the frontend/backend contract for the install page. It includes selected paths, Steam launch-option support, game/mod state, compatibility state, action gates, resettable-data and BepInEx-folder status, and warnings in `src-tauri/src/services/install/types.rs:3-19`.
- Reset returns a typed `ResetBppDataResult` containing the refreshed state and a `removed_data` boolean in `src-tauri/src/services/install/types.rs:21-26`.
- Backend state derives `has_resettable_data`, action gates, and warnings in `src-tauri/src/services/install/mod.rs`.

## Install And Uninstall

- `run_install` gathers detection and launch-mode facts, passes them to the pure `plan_install`, executes the returned steps through `execute_install_step` on a Tauri blocking task, and rebuilds state from a fresh detection in `src-tauri/src/services/install/mod.rs:36-104` and `src-tauri/src/services/install/plan.rs:58-132`.
- Marker-before-Steam-clear, close-Steam-only-on-mode-switch, and prefix-marker-last are planner-output constraints pinned by scenario-named exact-sequence rows and a 16-combination positional sweep in `src-tauri/src/services/install/plan.rs:1-12` and `src-tauri/src/services/install/plan.rs:155-367`.
- Prefix mode installs BepInEx, removes any prior trampoline, patches Steam launch options only when supported, and writes the launch-mode marker as `Prefix` last in `src-tauri/src/services/install/plan.rs:107-129`.
- Trampoline mode installs BepInEx, applies the macOS trampoline, writes the launch-mode marker as `Trampoline`, and clears Steam launch options in `src-tauri/src/services/install/plan.rs:88-106`.
- Install pre-clean removes only BPP-owned files the incoming payload no longer ships in `prepare_install_target` and `remove_stale_bpp_files` in `src-tauri/src/services/bepinex/payload.rs:380-416`; extraction skips byte-identical existing files and overwrites the rest in `src-tauri/src/services/bepinex/zip_archive.rs:39-79`. Third-party files are never pre-deleted, but a colliding path with different content is still overwritten by extraction.
- Ownership is defined by `BPP_PRIVATE_RELATIVE_PATHS` and `BPP_BUNDLED_DEPENDENCY_RELATIVE_PATHS` in `src-tauri/src/services/bepinex/payload.rs:10-35`; `test_ownership_lists_match_shipped_payload` pins them to `resources/SourceForBuild/{macos,windows}/BepInEx/plugins` in `src-tauri/src/services/bepinex/payload.rs:752-786`, and `scripts/prebuild-check.mjs` requires every `SourceForBuild` file to exist in the bundled zips and rejects stray OS artifacts (`.DS_Store` and the like) in both the tree and the zips in `scripts/prebuild-check.mjs:33-64` and `scripts/prebuild-check.mjs:222-250`.
- Uninstall is gated on `has_third_party_plugins` and `has_third_party_patchers` in `src-tauri/src/services/bepinex/mod.rs:194-244` and `src-tauri/src/services/bepinex/payload.rs:326-352`: when another mod's plugin (in `BepInEx/plugins`) or patcher (any file under `BepInEx/patchers`) is present, only private BPP files are removed and shared dependencies, trampoline, launch options, and BepInEx bootstrap stay; when BPP is the last mod, the full payload, trampoline, launch-mode marker, Steam launch options, and BepInEx bootstrap are removed through `remove_bootstrap_files` in `src-tauri/src/services/bepinex/payload.rs:313-324`, which lets `is_bepinex_installed` return false in `src-tauri/src/services/detect/game.rs:3-21`.
- Uninstall never touches the `BazaarPlusPlusV4/` data directory; only the explicit Reset flow removes it via `cleanup_bpp_data_directory` in `src-tauri/src/services/bepinex/payload.rs:450-452`.

## Reset Local Data

- The frontend opens a dedicated reset confirmation modal and requires an acknowledgement checkbox before confirming in `src/pages/Install.tsx:94-103` and `src/features/install/ResetDataConfirmModal.tsx:72-102`.
- The reset button is disabled when reset is not allowed, and the UI distinguishes "no resettable data" from the destructive action label in `src/features/install/InstallActionsPanel.tsx:97-109`.
- `useInstallPage` treats an already-empty state as a no-op, calls `resetBppData`, refreshes install state from the typed result, and chooses success versus no-op copy from `removed_data` in `src/features/install/useInstallPage.ts:111-141`.
- The Rust reset path stops the stream service before deletion to release SQLite/file handles, then runs blocking deletion in `src-tauri/src/services/bepinex/mod.rs:29-41`.
- Reset refuses to run while The Bazaar is detected as running, records whether the data directory existed before cleanup, and returns stable error-code prefixes for blocked or partial-failure cases in `src-tauri/src/services/bepinex/mod.rs:18-27` and `src-tauri/src/services/bepinex/mod.rs:43-69`.
- The frontend maps reset error prefixes to localized messages and captures partial-failure paths for display in `src/features/install/useInstallPage.ts:230-267`.
