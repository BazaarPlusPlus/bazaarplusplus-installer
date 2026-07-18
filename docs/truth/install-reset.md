---
status: truth
topic: install-reset
last-verified: 7500016b1c4adfc7b5d0206c7def0ceabae514d5
---

# Install And Reset

## Install State Contract

- `InstallState` is the frontend/backend contract for the install page. It includes selected paths, Steam launch-option support, game/mod state, compatibility state, action gates, resettable-data and BepInEx-folder status, and warnings in `src-tauri/src/services/install/types.rs:3-19`.
- Reset returns a typed `ResetBppDataResult` containing the refreshed state and a `removed_data` boolean in `src-tauri/src/services/install/types.rs:21-26`.
- Backend state derives `has_resettable_data`, action gates, and warnings from one detection snapshot in `src-tauri/src/services/install/mod.rs:83-159`.

## Install And Uninstall

- `install` is one operation: it classifies the payload as missing, changed, or current; gathers launch-mode facts; executes private planned effects through the production adapter; stops on the first effect error; and returns only a freshly detected `InstallState` in `src-tauri/src/services/install/operation.rs:21-125`.
- A current payload with an already-satisfied launch mode produces no effects but still runs the final refresh; missing or changed payloads install BepInEx, while launch-mode-only repair leaves a current payload intact in `src-tauri/src/services/install/plan.rs:70-152`.
- Marker-before-Steam-clear, close-Steam-only-on-mode-switch, prefix-marker-last, and payload-before-bundle mutation remain private planner invariants when their corresponding effects are present in `src-tauri/src/services/install/plan.rs:97-152` and `src-tauri/src/services/install/plan.rs:176-255`.
- Prefix/trampoline ordering, fresh/missing/changed/current payload states, current-install no-op, launch-mode-only repair, first-error truncation, and refresh-after-success are tested through the operation's effect recorder in `src-tauri/src/services/install/operation.rs:165-289`; no command or service caller observes the planned effect vector.
- Install pre-clean removes only BPP-owned files the incoming payload no longer ships in `prepare_install_target` and `remove_stale_bpp_files` in `src-tauri/src/services/bepinex/payload.rs:380-416`; extraction skips byte-identical existing files and overwrites the rest in `src-tauri/src/services/bepinex/zip_archive.rs:39-79`. Third-party files are never pre-deleted, but a colliding path with different content is still overwritten by extraction.
- Ownership is defined by `BPP_PRIVATE_RELATIVE_PATHS` and `BPP_BUNDLED_DEPENDENCY_RELATIVE_PATHS` in `src-tauri/src/services/bepinex/payload.rs:10-35`; `test_ownership_lists_match_shipped_payload` pins them to `resources/SourceForBuild/{macos,windows}/BepInEx/plugins` in `src-tauri/src/services/bepinex/payload.rs:752-786`, and `scripts/prebuild-check.mjs` requires every `SourceForBuild` file to exist in the bundled zips and rejects stray OS artifacts (`.DS_Store` and the like) in both the tree and the zips in `scripts/prebuild-check.mjs:30-61` and `scripts/prebuild-check.mjs:219-250`.
- Uninstall is gated on `has_third_party_plugins` and `has_third_party_patchers` in `src-tauri/src/services/bepinex/mod.rs:194-244` and `src-tauri/src/services/bepinex/payload.rs:326-352`: when another mod's plugin (in `BepInEx/plugins`) or patcher (any file under `BepInEx/patchers`) is present, only private BPP files are removed and shared dependencies, trampoline, launch options, and BepInEx bootstrap stay; when BPP is the last mod, the full payload, trampoline, launch-mode marker, Steam launch options, and BepInEx bootstrap are removed through `remove_bootstrap_files` in `src-tauri/src/services/bepinex/payload.rs:313-324`, which lets `is_bepinex_installed` return false in `src-tauri/src/services/detect/game.rs:3-21`.
- Uninstall never touches the `BazaarPlusPlusV4/` data directory; only the explicit Reset flow removes it via `cleanup_bpp_data_directory` in `src-tauri/src/services/bepinex/payload.rs:450-452`.

## Reset Local Data

- The frontend opens a dedicated reset confirmation modal and requires an acknowledgement checkbox before confirming in `src/pages/Install.tsx:93-100` and `src/features/install/ResetDataConfirmModal.tsx:21-55`.
- The reset button is disabled when reset is not allowed, and the UI distinguishes "no resettable data" from the destructive action label in `src/features/install/InstallActionsPanel.tsx:97-109`.
- `useInstallPage` treats an already-empty state as a no-op, calls `resetBppData`, refreshes install state from the typed result, and chooses success versus no-op copy from `removed_data` in `src/features/install/useInstallPage.ts:111-141`.
- The Rust reset path enters `StreamRuntime` exclusive maintenance, stops and awaits the stream task, and keeps lifecycle operations excluded throughout blocking deletion in `src-tauri/src/services/bepinex/mod.rs:29-42` and `src-tauri/src/stream/runtime.rs:100-108`.
- Reset refuses to run while The Bazaar is detected as running, records whether the data directory existed before cleanup, and returns stable error-code prefixes for blocked or partial-failure cases in `src-tauri/src/services/bepinex/mod.rs:20-27` and `src-tauri/src/services/bepinex/mod.rs:44-70`.
- The frontend maps reset error prefixes to localized messages and captures partial-failure paths for display in `src/features/install/useInstallPage.ts:230-267`.
