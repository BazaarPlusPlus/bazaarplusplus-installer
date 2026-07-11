---
status: truth
topic: frontend
last-verified: 4366cda394fe304066b55564c3c44d1f917a2273
---

# Frontend

## Shell

- `GlobalShell` wraps the app in `AppBootstrapProvider` and `UpdaterProvider`, then renders the shell header, nav rail, page outlet, payment modal, and update modal in `src/layouts/GlobalShell.tsx:14-21` and `src/layouts/GlobalShell.tsx:54-96`.
- Header dropdowns close on Escape and outside pointer-down events in `src/layouts/GlobalShell.tsx:31-52`.
- The update modal is rendered only for updater phases considered modal phases by `isUpdateModalPhase` in `src/layouts/GlobalShell.tsx:92-95` and `src/features/about/updater.ts:90-103`.

## Native-Feel Rules

- Global app chrome disables page-style selection by default, keeps text controls selectable, and keeps focus-visible outlines in `src/styles/index.css:42-82`.
- `.selectable` and `.user-content` opt content back into text selection in `src/styles/index.css:84-89`.
- Reduced motion is honored through `prefers-reduced-motion` in `src/styles/index.css:91-99`.
- App modals use the native `<dialog>` wrapper and top-layer dialog styling; dialog CSS is in `src/styles/index.css:101-128`, and the updater modal consumes the shared `Dialog` component in `src/layouts/ShellUpdateModal.tsx:40-45`.
- The five install, reset, cleanup, and video-delete confirmation flows share the `Dialog`-composing `ConfirmDialog`, which owns tone-specific chrome, acknowledgement gating, and busy affordances in `src/components/ui/ConfirmDialog.tsx:52-170`; feature call sites provide direct body children so their rendered DOM stays unchanged.
- The current Tauri security config has `csp: null` in `src-tauri/tauri.conf.json:23-25`; treat any CSP hardening claim as future work until code changes.

## Runtime Seam

- Tauri command wrappers dispatch through `invokeOrFallback`, which uses native `invoke` when the runtime is present and otherwise resolves the command's centralized preview behavior in `src/api/tauri.ts:142-193`.
- `PREVIEW_FALLBACKS` is exhaustive over the generated `TauriCommandName` union, so adding a generated command requires declaring its command-map entry and preview behavior at compile time in `src/api/previewFallbacks.ts:11-79`.
- Shared install, stream, crop, history, and bootstrap preview values live in the leaf module `src/api/previewDefaults.ts:1-103`; consumers and fallbacks reuse the same object references so preview polling preserves React state bailouts.

## Current Product Surfaces

- Install renders status and action panels plus install and reset confirmation modals in `src/pages/Install.tsx:68-111`.
- Install facts currently show only BazaarPlusPlus, not the broader fact list from the historical design spec, in `src/features/install/InstallActionsPanel.tsx:49-58`.
- The reset-local-data button is disabled unless backend action gates allow reset data, and its label switches to a no-data message when the game path is valid but no resettable data exists in `src/features/install/InstallActionsPanel.tsx:93-105`.
- History summary cards are Runs, Videos, and Win Rate in `src/pages/History.tsx:37-50`.
- History rows link to details, show lazy-decoded preview images when available, and display hero, date, result, progress, rank, and rating in `src/pages/History.tsx:101-178`.
- Run detail shows a hero/result header, run stats, screenshot reveal, and a battle table with fixed columns and video reveal/delete actions in `src/pages/RunDetail.tsx:52-176` and `src/pages/RunDetail.tsx:222-319`.

## Update Modal

- The update modal is phase-driven: `available`, `downloading`, `installing`, `ready`, and install-sourced `error` render in the modal path in `src/features/about/updater.ts:90-103`.
- During download/install the modal is not dismissible because `downloadAndInstall` is not cancellable in `src/layouts/ShellUpdateModal.tsx:23-29`.
- Download progress reports downloaded MB and percentage when total size is known in `src/layouts/ShellUpdateModal.tsx:165-194`.
