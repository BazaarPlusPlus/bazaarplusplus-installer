---
status: truth
topic: install-reset
last-verified: 8c5c3af5d844635b9c2b6ef9124fd7a951533e37
---

# Install And Reset

## Install State Contract

- `InstallState` in `src-tauri/src/services/install/types.rs` is the frontend/backend contract for the install page. It carries selected paths, game/mod state, action gates, resettable-data and BepInEx-folder status, and semantic warnings. `InstallModState::ready` means the payload version and platform bootstrap are both ready; the contract has no launch-mode or compatibility fields.
- Warnings cross IPC only as `InstallWarningCode` plus string parameters, never backend-authored display copy. `install_warnings` in `src-tauri/src/services/install/mod.rs` reports missing game state and, on macOS, unavailable Steam config, non-empty LaunchOptions, a non-current trampoline, or obsolete artifacts. `presentInstallWarning` in `src/features/install/installProblems.ts` maps them to bilingual copy.
- `install_state_from_snapshot` in `src-tauri/src/services/install/mod.rs` derives readiness and actions from one `InstallEnvironmentSnapshot`. On macOS readiness requires an installed current payload, a current bundled trampoline, empty Steam LaunchOptions, and no obsolete artifacts; `detect_for_install` in `src-tauri/src/services/detect/mod.rs` re-reads those live bootstrap facts on each detection.
- `get_install_state` in `src-tauri/src/commands/install.rs` resolves through `build_install_state` and `detect_for_install`. Detection waits for the process-wide `InstallerContextState::get_or_initialize` in `src-tauri/src/services/startup.rs`, which startup also warms from `run` in `src-tauri/src/lib.rs`.
- The frontend `DefaultInstallWorkflow` in `src/features/install/installWorkflow.ts` owns the authoritative state, stale-response protection, action single-flight, target-bearing confirmations, and one primary action derived by `deriveInstallPrimaryAction`. An installed state with `ready == false` routes to Repair.

## Install And Uninstall

- `install_mod` in `src-tauri/src/commands/install.rs` accepts only the game path. `install` in `src-tauri/src/services/install/operation.rs` classifies the payload as missing, changed, or current and rejects macOS mutation before any effect when Steam `localconfig.vdf` cannot be inspected.
- `plan_install` in `src-tauri/src/services/install/plan.rs` has one macOS convergence sequence: close Steam, install the payload when needed, install or refresh the trampoline, clear all The Bazaar LaunchOptions entries, then remove obsolete artifacts. A current payload with a dirty bootstrap repairs only the bootstrap; a fully ready install is a no-op followed by state refresh. Non-macOS installs only update the payload.
- `execute_and_refresh` and `ProductionInstallEffects` in `src-tauri/src/services/install/operation.rs` stop on the first effect failure and return only a freshly detected final `InstallState`. Planner order, payload classification, no-op, bootstrap-only repair, first-error truncation, and refresh-after-success are pinned by the tests in `operation.rs` and `plan.rs`.
- `install_bepinex` in `src-tauri/src/services/bepinex/mod.rs` reads the bundled deterministic ZIP, while `prepare_install_target` in `src-tauri/src/services/bepinex/payload.rs` removes only BPP-owned files that are absent from the incoming payload and preserves the BPP config. `extract_zip` in `src-tauri/src/services/bepinex/zip_archive.rs` skips byte-identical files and overwrites differing files.
- Payload ownership is defined by `BPP_PRIVATE_RELATIVE_PATHS` and `BPP_BUNDLED_DEPENDENCY_RELATIVE_PATHS` in `src-tauri/src/services/bepinex/payload.rs`. `validatePayloadZip` in `scripts/payload-zip.mjs` requires the macOS loader library, rejects non-canonical launcher files, and enforces exact ZIP/staging agreement.
- `uninstall_bpp` in `src-tauri/src/services/bepinex/mod.rs` checks `has_third_party_plugins` and `has_third_party_patchers`. When another mod remains it removes only private BPP files and keeps shared BepInEx/trampoline state; when BPP is last it restores the vanilla bundle, removes the BepInEx bootstrap and payload, and clears Steam LaunchOptions. Obsolete macOS artifact names are removed in either case without parsing their contents.
- Uninstall never deletes `BazaarPlusPlusV5/`; only the explicit local-data reset does.

## Reset Local Data

- The Install workflow fixes the game path when `requestInstall`, `requestResetData`, `requestResetBepinex`, or `requestUninstall` opens a confirmation. Install has no secondary mode choice. React owns only acknowledgement state and modal presentation in `src/pages/Install.tsx` and the confirmation components under `src/features/install/`. Native work is non-cancellable, so active confirmations block Escape, backdrop, close, and secondary dismissal.
- The delete-local-data tile is disabled when reset is unavailable and distinguishes an empty data state from the destructive action in `InstallActionsPanel` in `src/features/install/InstallActionsPanel.tsx`.
- The `reset-data` branch of `DefaultInstallWorkflow.executeConfirmed` calls `resetBppData`, installs the returned refreshed state, and presents removed-versus-empty notices from `ResetBppDataResult::removed_data`. `ConfirmedOperationController.run` in `src/features/shared/confirmedOperation.ts` closes only on success and retains the fixed target for retry after failure.
- `reset_bpp_data` in `src-tauri/src/services/bepinex/mod.rs` enters `StreamRuntime::exclusive_maintenance` in `src-tauri/src/stream/runtime.rs`, rejects a running game, and removes the data tree through `cleanup_bpp_data_directory` in `src-tauri/src/services/bepinex/payload.rs`. Stable reset sentinels are classified into semantic problems at the Rust boundary; frontend copy never consumes raw diagnostics.
