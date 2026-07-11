---
status: decision
topic: reset-local-data
---

# Reset Local Data Contract

## Context

Resetting BazaarPlusPlus data is destructive but should not uninstall the mod. The backend owns filesystem deletion, while the frontend owns confirmation, disabled states, localized copy, and partial-failure display.

## Decision

Expose `has_resettable_data` and action gates in install state, require a confirmation modal with acknowledgement before reset, and return a typed `ResetBppDataResult` with refreshed state and `removed_data`. The backend contract is in `src-tauri/src/services/install/types.rs:3-24`; the frontend confirmation path is in `src/pages/Install.tsx:41-50` and `src/features/install/ResetDataConfirmModal.tsx:71-105`.

## Rejected Alternatives

- Keep reset always enabled. The current action gate disables reset unless `has_resettable_data` is true in `src-tauri/src/services/install/mod.rs:293-300`.
- Let the frontend delete files directly. Rust reset stops the stream service first and runs deletion in a blocking task in `src-tauri/src/services/bepinex/mod.rs:25-37`.
- Return only a generic success string. The typed result distinguishes removed data from no-op, and stable error prefixes let the frontend show blocked or partial-failure states in `src/features/install/useInstallPage.ts:179-209` and `src/features/install/useInstallPage.ts:282-300`.

## Consequences

Any future reset behavior must preserve the backend-owned deletion boundary and the typed result. UI changes should keep no-data, blocked-by-game, and partial-failure cases distinct.
