---
status: decision
topic: reset-local-data
---

# Reset Local Data Contract

## Context

Resetting BazaarPlusPlus data is destructive but should not uninstall the mod. The backend owns filesystem deletion, while the frontend owns confirmation, disabled states, localized copy, and partial-failure display.

## Decision

Expose `has_resettable_data` and action gates in install state, require a confirmation modal with acknowledgement before reset, and return a typed `ResetBppDataResult` with refreshed state and `removed_data`. The backend contract is in the `InstallState` and `ResetBppDataResult` types in `src-tauri/src/services/install/types.rs`; the frontend confirmation path is in the `Install` component in `src/pages/Install.tsx` and the `ResetDataConfirmModal` component in `src/features/install/ResetDataConfirmModal.tsx`.

## Rejected Alternatives

- Keep reset always enabled. The current action gate disables reset unless `has_resettable_data` is true, in the `can_reset_data` field assignment in the `install_state_from_snapshot` function in `src-tauri/src/services/install/mod.rs`.
- Let the frontend delete files directly. Rust reset stops the stream service first and runs deletion in a blocking task in the `reset_bpp_data` function in `src-tauri/src/services/bepinex/mod.rs`.
- Return only a generic success string. The typed result distinguishes removed data from no-op in the `reset-data` case of the `executeConfirmed` method in `src/features/install/installWorkflow.ts`, and stable error prefixes let the frontend show blocked or partial-failure states via `installProblemMessageKey` in `src/features/install/installProblems.ts`.

## Consequences

Any future reset behavior must preserve the backend-owned deletion boundary and the typed result. UI changes should keep no-data, blocked-by-game, and partial-failure cases distinct.
