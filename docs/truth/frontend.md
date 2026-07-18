---
status: truth
topic: frontend
last-verified: d7b3dee85f26f15bc46c0f4a64d1e6dc21e4deeb
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
- The five install, reset, cleanup, and video-delete confirmation flows share the `Dialog`-composing `ConfirmDialog`, which owns tone-specific chrome, acknowledgement gating, busy affordances, and an explicit dismiss gate in `src/components/ui/ConfirmDialog.tsx:43-180`. Run Detail enables that gate while native video deletion is in flight, so Escape, backdrop, close, and cancel do not present the operation as cancellable in `src/pages/RunDetail.tsx:248-268`.
- The current Tauri security config has `csp: null` in `src-tauri/tauri.conf.json:23-25`; treat any CSP hardening claim as future work until code changes.

## Runtime Seam

- `commandClient` selects the normalized generated native client or Browser Preview adapter once at module load in `src/api/commandClient.ts:1-10`; feature APIs call typed command functions rather than command strings.
- Both adapters implement a contract derived from the generated command object in `src/api/commandAdapter.ts:1-16`. The native adapter normalizes backend rejections and preserves validated semantic problems in `src/api/nativeCommands.ts:5-37` and `src/api/problems.ts:3-41`, while Preview declares every generated operation and returns scope-tagged cleanup values for both scopes in `src/api/previewCommands.ts:14-51`.
- Shared install, stream, crop, history, cleanup, and bootstrap preview values live in the leaf module `src/api/previewDefaults.ts`; Preview reuses those object references in `src/api/previewCommands.ts:16-50` so polling preserves React state bailouts.
- Stream commands pass through one semantic port over the selected native or Preview command adapter in `src/features/stream/streamApi.ts:7-36`. The framework-neutral workflow owns replayable lifecycle initialization, polling thresholds and response epochs, action serialization, error priority, transient messages, and the derived page snapshot in `src/features/stream/streamWorkflow.ts:139-293` and `src/features/stream/streamWorkflow.ts:395-539`; `useStreamPage` only supplies browser ports and binds its lifecycle to React in `src/features/stream/useStreamPage.ts:10-61`.
- The shared page-state seam is a discriminated union of initial loading, blocking failure, ready-empty, and ready-content with nested idle/refreshing/failed refresh state; request ids reject stale completions in `src/features/shared/pageState.ts:1-60`. Shared UI problems retain code, parameters, and optional diagnostics separately from localized copy in `src/features/shared/problems.ts:4-40` and `src/components/ui/ProblemBanner.tsx:3-43`.
- Run Detail specializes that seam with a distinct not-found state, preserved ready content on refresh failure, and a separate action state that globally gates conflicting work while retaining target-scoped failures in `src/features/history/runDetailPageState.ts:5-167`. Its semantic problem presenter maps stable backend codes and operation parameters to localized copy without using diagnostics as user-facing text in `src/features/history/runDetailProblems.ts:9-62`.

## Current Product Surfaces

- Install renders status and action panels plus install and reset confirmation modals in `src/pages/Install.tsx:68-111`.
- Install facts currently show only BazaarPlusPlus, not the broader fact list from the historical design spec, in `src/features/install/InstallActionsPanel.tsx:49-58`.
- The reset-local-data button is disabled unless backend action gates allow reset data, and its label switches to a no-data message when the game path is valid but no resettable data exists in `src/features/install/InstallActionsPanel.tsx:93-105`.
- History renders loading, blocking failure, and the two successful list states as mutually exclusive branches; refresh failures remain inside the ready branch and keep prior data in `src/pages/History.tsx:42-97` and `src/features/shared/pageState.ts:43-54`.
- History summary cards are Runs, Videos, and Win Rate in `src/pages/History.tsx:50-64`.
- History rows link to details, show lazy-decoded preview images with an error fallback, and display hero, locale-formatted date, result, progress, rank, and rating in `src/pages/History.tsx:125-230` and `src/features/history/format.ts:4-27`.
- History list loading calls `listHistoryRuns` independently from status-only Stream preview discovery; stopped or failed Stream status produces a thumbnail-only problem and never rejects the list request in `src/features/history/useHistoryPage.ts:37-64` and `src/features/history/historyPreview.ts:14-45`.
- Run detail renders explicit initial-loading, not-found, blocking-failure, and ready branches, preserving ready content behind a localized refresh-failure banner in `src/pages/RunDetail.tsx:66-130`. Screenshot, video, delete, and refresh controls share one action gate, failures retry beside their screenshot or battle target, and replay duration/size use locale-aware formatters in `src/pages/RunDetail.tsx:160-181`, `src/pages/RunDetail.tsx:297-421`, and `src/features/history/format.ts:113-150`.
- Storage cleanup submits only generated `StorageCleanupScope` plus `StorageCleanupPreset`, retains the tagged preview/execution result, and narrows on `scope` when rendering screenshot versus run-data copy in `src/features/history/useStorageCleanup.ts:1-59` and `src/features/history/StorageCleanupCard.tsx:32-77`.
- Stream renders only the workflow snapshot and invokes its intents; status copy, feedback, and control availability are no longer recomputed in the page in `src/pages/Stream.tsx:26-131` and `src/pages/Stream.tsx:135-240`.

## Update Modal

- The update modal is phase-driven: `available`, `downloading`, `installing`, `ready`, and install-sourced `error` render in the modal path in `src/features/about/updater.ts:90-103`.
- During download/install the modal is not dismissible because `downloadAndInstall` is not cancellable in `src/layouts/ShellUpdateModal.tsx:23-29`.
- Download progress reports downloaded MB and percentage when total size is known in `src/layouts/ShellUpdateModal.tsx:165-194`.
