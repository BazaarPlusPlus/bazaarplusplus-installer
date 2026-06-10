---
status: truth
topic: install-reset
last-verified: 7b18f73d4718d3e1406de9f526d1fbba09ac567f
---

# Install And Reset

## Install State Contract

- `InstallState` is the frontend/backend contract for the install page. It includes selected paths, Steam launch-option support, `launch_flow`, game/mod/runtime state, compatibility state, action gates, `has_resettable_data`, and warnings in `src-tauri/src/services/install/types.rs:3-17`.
- Reset returns a typed `ResetBppDataResult` containing the refreshed state and a `removed_data` boolean in `src-tauri/src/services/install/types.rs:19-24`.
- Backend state derives `launch_flow`, `has_resettable_data`, action gates, and warnings in `src-tauri/src/services/install/mod.rs:213-303`.

## Install And Uninstall

- `run_install` detects the environment, resolves Steam versus Tempo launch flow, decides whether macOS trampoline mode is desired, and runs blocking filesystem work on a Tauri blocking task in `src-tauri/src/services/install/mod.rs:36-116`.
- Prefix mode installs BepInEx, removes any prior trampoline, patches Steam launch options only when supported, and writes the launch-mode marker as `Prefix` in `src-tauri/src/services/install/mod.rs:89-112`.
- Trampoline mode installs BepInEx, applies the macOS trampoline, writes the launch-mode marker as `Trampoline`, and clears Steam launch options in `src-tauri/src/services/install/mod.rs:67-88`.
- Uninstall is also async and uses blocking work; it restores trampoline state before removing payload files in `src-tauri/src/services/install/mod.rs:137-165` and `src-tauri/src/services/bepinex/mod.rs:139-176`.

## Reset Local Data

- The frontend opens a dedicated reset confirmation modal and requires an acknowledgement checkbox before confirming in `src/pages/Install.tsx:41-50` and `src/features/install/ResetDataConfirmModal.tsx:71-105`.
- The reset button is disabled when reset is not allowed, and the UI distinguishes "no resettable data" from the destructive action label in `src/features/install/InstallActionsPanel.tsx:97-109`.
- `useInstallPage` treats an already-empty state as a no-op, calls `resetBppData`, refreshes install state from the typed result, and chooses success versus no-op copy from `removed_data` in `src/features/install/useInstallPage.ts:179-209`.
- The Rust reset path stops the stream service before deletion to release SQLite/file handles, then runs blocking deletion in `src-tauri/src/services/bepinex/mod.rs:25-37`.
- Reset refuses to run while The Bazaar is detected as running, records whether the data directory existed before cleanup, and returns stable error-code prefixes for blocked or partial-failure cases in `src-tauri/src/services/bepinex/mod.rs:19-23` and `src-tauri/src/services/bepinex/mod.rs:39-69`.
- The frontend maps reset error prefixes to localized messages and captures partial-failure paths for display in `src/features/install/useInstallPage.ts:282-300`.
