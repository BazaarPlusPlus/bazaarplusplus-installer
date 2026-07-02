---
status: truth
topic: install-reset
last-verified: 077a0b87aafce8c46c57283ce60d02c024fad789
---

# Install And Reset

## Install State Contract

- `InstallState` is the frontend/backend contract for the install page. It includes selected paths, Steam launch-option support, `launch_flow`, game/mod state, compatibility state, action gates, `has_resettable_data`, and warnings in `src-tauri/src/services/install/types.rs:3-16`.
- Reset returns a typed `ResetBppDataResult` containing the refreshed state and a `removed_data` boolean in `src-tauri/src/services/install/types.rs:19-24`.
- Backend state derives `launch_flow`, `has_resettable_data`, action gates, and warnings in `src-tauri/src/services/install/mod.rs:230-292`.

## Install And Uninstall

- `run_install` detects the environment, resolves Steam versus Tempo launch flow, decides whether macOS trampoline mode is desired, and runs blocking filesystem work on a Tauri blocking task in `src-tauri/src/services/install/mod.rs:36-120`.
- Prefix mode installs BepInEx, removes any prior trampoline, patches Steam launch options only when supported, and writes the launch-mode marker as `Prefix` in `src-tauri/src/services/install/mod.rs:89-112`.
- Trampoline mode installs BepInEx, applies the macOS trampoline, writes the launch-mode marker as `Trampoline`, and clears Steam launch options in `src-tauri/src/services/install/mod.rs:67-88`.
- Install pre-clean removes only BPP-owned files the incoming payload no longer ships in `prepare_install_target` and `remove_stale_bpp_files` in `src-tauri/src/services/bepinex/payload.rs:358-394`; extraction skips byte-identical existing files and overwrites the rest in `src-tauri/src/services/bepinex/zip_archive.rs:39-79`. Third-party files are never pre-deleted, but a colliding path with different content is still overwritten by extraction.
- Ownership is defined by `BPP_PRIVATE_RELATIVE_PATHS` and `BPP_BUNDLED_DEPENDENCY_RELATIVE_PATHS` in `src-tauri/src/services/bepinex/payload.rs:10-35`; `test_ownership_lists_match_shipped_payload` pins them to `resources/SourceForBuild/{macos,windows}/BepInEx/plugins` in `src-tauri/src/services/bepinex/payload.rs:703-736`, and `scripts/prebuild-check.mjs` requires every `SourceForBuild` file to exist in the bundled zips in `scripts/prebuild-check.mjs:33-56` and `scripts/prebuild-check.mjs:224-235`.
- Uninstall is gated on `has_third_party_plugins` in `src-tauri/src/services/bepinex/mod.rs:147-194` and `src-tauri/src/services/bepinex/payload.rs:326-344`: when another mod's plugin is present, only private BPP files are removed and shared dependencies, trampoline, launch options, and BepInEx bootstrap stay; when BPP is the last plugin, the full payload, trampoline, launch-mode marker, Steam launch options, and BepInEx bootstrap are removed through `remove_bootstrap_files` in `src-tauri/src/services/bepinex/payload.rs:313-323`, which lets `is_bepinex_installed` return false in `src-tauri/src/services/detect/game.rs:3-21`.
- Uninstall never touches the `BazaarPlusPlusV4/` data directory; only the explicit Reset flow removes it via `cleanup_bpp_data_directory` in `src-tauri/src/services/bepinex/payload.rs:428-430`.

## Reset Local Data

- The frontend opens a dedicated reset confirmation modal and requires an acknowledgement checkbox before confirming in `src/pages/Install.tsx:41-50` and `src/features/install/ResetDataConfirmModal.tsx:71-105`.
- The reset button is disabled when reset is not allowed, and the UI distinguishes "no resettable data" from the destructive action label in `src/features/install/InstallActionsPanel.tsx:97-109`.
- `useInstallPage` treats an already-empty state as a no-op, calls `resetBppData`, refreshes install state from the typed result, and chooses success versus no-op copy from `removed_data` in `src/features/install/useInstallPage.ts:179-209`.
- The Rust reset path stops the stream service before deletion to release SQLite/file handles, then runs blocking deletion in `src-tauri/src/services/bepinex/mod.rs:25-37`.
- Reset refuses to run while The Bazaar is detected as running, records whether the data directory existed before cleanup, and returns stable error-code prefixes for blocked or partial-failure cases in `src-tauri/src/services/bepinex/mod.rs:19-23` and `src-tauri/src/services/bepinex/mod.rs:39-69`.
- The frontend maps reset error prefixes to localized messages and captures partial-failure paths for display in `src/features/install/useInstallPage.ts:282-300`.
