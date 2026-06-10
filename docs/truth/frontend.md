---
status: truth
topic: frontend
last-verified: df2a1aff04d29bed00f16d369d7558755e31a556
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
- The current Tauri security config has `csp: null` in `src-tauri/tauri.conf.json:23-25`; treat any CSP hardening claim as future work until code changes.

## Current Product Surfaces

- Install renders status and action panels plus install and reset confirmation modals in `src/pages/Install.tsx:52-85`.
- Install facts currently show only BazaarPlusPlus, not the broader fact list from the historical design spec, in `src/features/install/InstallActionsPanel.tsx:49-58`.
- The reset-local-data button is disabled unless backend action gates allow reset data, and its label switches to a no-data message when the game path is valid but no resettable data exists in `src/features/install/InstallActionsPanel.tsx:93-105`.
- History summary cards are Runs, Videos, and Win Rate in `src/pages/History.tsx:34-39`.
- History rows link to details, show lazy-decoded preview images when available, and display hero, date, result, progress, rank, and rating in `src/pages/History.tsx:99-157`.
- Run detail shows a hero/result header, run stats, screenshot reveal, and a battle table with fixed columns and video reveal/delete actions in `src/pages/RunDetail.tsx:65-160` and `src/pages/RunDetail.tsx:190-285`.

## Update Modal

- The update modal is phase-driven: `available`, `downloading`, `installing`, `ready`, and install-sourced `error` render in the modal path in `src/features/about/updater.ts:90-103`.
- During download/install the modal is not dismissible because `downloadAndInstall` is not cancellable in `src/layouts/ShellUpdateModal.tsx:23-29`.
- Download progress reports downloaded MB and percentage when total size is known in `src/layouts/ShellUpdateModal.tsx:165-194`.
