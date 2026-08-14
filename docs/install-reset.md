---
status: current
topic: install-reset
last-verified: 17b17d67ba7cc27b52a435d2cff8eadfd3278840
---

# Install And Reset

## State And Planning

- `InstallState` in `src-tauri/src/services/install/types.rs` is the native/frontend contract for selected paths, game and mod readiness, warnings, resettable data, and action gates.
- `install_state_from_snapshot` in `src-tauri/src/services/install/mod.rs` derives the contract from one `InstallEnvironmentSnapshot`; `detect_for_install` in `src-tauri/src/services/detect/mod.rs` refreshes platform bootstrap facts on every detection.
- `DefaultInstallWorkflow` in `src/features/install/installWorkflow.ts` owns stale-response rejection, single-flight operations, fixed confirmation targets, retry, and the one primary action. An installed but non-ready state routes to Repair.
- Warnings and failures cross the boundary as stable codes and parameters. `presentInstallWarning`, `presentInstallProblem`, and `presentInstallNotice` in `src/features/install/installProblems.ts` own localized presentation.

## Install And Uninstall

- `plan_install` in `src-tauri/src/services/install/plan.rs` computes effects; `execute_and_refresh` in `src-tauri/src/services/install/operation.rs` stops on the first failed effect and returns a freshly detected final state.
- `prepare_install_target` in `src-tauri/src/services/bepinex/payload.rs` removes only BPP-owned files absent from the incoming payload and preserves BPP configuration. `extract_zip` in `src-tauri/src/services/bepinex/zip_archive.rs` skips byte-identical files and replaces differing files.
- `BPP_PRIVATE_RELATIVE_PATHS` and `BPP_BUNDLED_DEPENDENCY_RELATIVE_PATHS` in `src-tauri/src/services/bepinex/payload.rs` define payload ownership.
- `uninstall_bpp` in `src-tauri/src/services/bepinex/mod.rs` always removes private BPP files. It removes shared BepInEx and platform bootstrap state only when no third-party plugin or patcher remains. Uninstall preserves the BPP data root.

macOS readiness, repair order, and vanilla restoration are specified in [macOS Launch](macos-launch.md).

## Reset Local Data

Reset is the only installer operation that deletes the current BPP data root. `reset_bpp_data` in `src-tauri/src/services/bepinex/mod.rs` enters `StreamRuntime::exclusive_maintenance`, refuses deletion while the game is running, and delegates filesystem cleanup to `cleanup_bpp_data_directory` in `src-tauri/src/services/bepinex/payload.rs`.

The Install workflow fixes the target path when confirmation opens. A successful `ResetBppDataResult` installs the returned refreshed state and distinguishes removed data from an already-empty target; a failure retains the target for retry. The durable product boundary is recorded in [ADR-005](adr/005-reset-local-data-contract.md) and [ADR-011](adr/011-v5-data-root-and-v4-orphan-policy.md).
