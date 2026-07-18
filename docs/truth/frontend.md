---
status: truth
topic: frontend
last-verified: 0f609de844c0cbc48e7fb53396a90d5f32776c2b
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
- Install, reset, cleanup, and video-delete confirmations share the `Dialog`-composing `ConfirmDialog`. It requires an explicit active dismissal policy for Escape, backdrop, close, and secondary actions; blocked work removes the secondary cancel affordance, disables close, and says that the operation cannot be cancelled in `src/components/ui/ConfirmDialog.tsx:14-62` and `src/components/ui/ConfirmDialog.tsx:98-242`. Current native destructive commands all use the blocked policy because none exposes a cancellation contract (`src/pages/Install.tsx:143-176`, `src/features/history/StorageCleanupCard.tsx:124-171`, `src/pages/RunDetail.tsx:246-277`).
- The current Tauri security config has `csp: null` in `src-tauri/tauri.conf.json:23-25`; treat any CSP hardening claim as future work until code changes.

## Runtime Seam

- `commandClient` selects the normalized generated native client or Browser Preview adapter once at module load in `src/api/commandClient.ts:1-10`; feature APIs call typed command functions rather than command strings.
- Both adapters implement a contract derived from the generated command object in `src/api/commandAdapter.ts:1-16`. The native adapter normalizes backend rejections and preserves validated semantic problems in `src/api/nativeCommands.ts:5-37` and `src/api/problems.ts:3-41`, while Preview declares every generated operation and returns scope-tagged cleanup values for both scopes in `src/api/previewCommands.ts:14-51`.
- Shared install, stream, crop, history, cleanup, and bootstrap preview values live in the leaf module `src/api/previewDefaults.ts`; Preview reuses those object references in `src/api/previewCommands.ts:16-50` so polling preserves React state bailouts.
- Stream commands pass through one semantic port over the selected native or Preview command adapter in `src/features/stream/streamApi.ts:7-36`. The framework-neutral workflow owns replayable initialization, polling freshness and response epochs, capability-scoped operations/problems, semantic notices, and the derived page snapshot in `src/features/stream/streamWorkflow.ts:185-320` and `src/features/stream/streamWorkflow.ts:509-733`; `useStreamPage` supplies browser ports and creates the workflow once, independently of locale, before binding its lifecycle to React in `src/features/stream/useStreamPage.ts:9-42`.
- The shared page-state seam is a discriminated union of initial loading, blocking failure, ready-empty, and ready-content with nested idle/refreshing/failed refresh state; request ids reject stale completions in `src/features/shared/pageState.ts:1-60`. Shared UI problems retain code, parameters, and optional diagnostics separately from localized copy in `src/features/shared/problems.ts:4-40` and `src/components/ui/ProblemBanner.tsx:3-43`.
- Destructive workflows use a framework-neutral confirmed-operation controller that keeps the target across confirming/running/failure, rejects conflicting requests and repeat execution, blocks dismissal while running, closes only after success, and retains a semantic problem for retry or safe exit after failure in `src/features/shared/confirmedOperation.ts:3-94`.
- Run Detail specializes that seam with a distinct not-found state, preserved ready content on refresh failure, and a separate action state that globally gates conflicting work while retaining target-scoped failures in `src/features/history/runDetailPageState.ts:5-167`. Its semantic problem presenter maps stable backend codes and operation parameters to localized copy without using diagnostics as user-facing text in `src/features/history/runDetailProblems.ts:9-62`.

## Current Product Surfaces

- Install renders mutually exclusive initial-detection, blocking-failure, and completed-state branches; a refresh failure keeps the completed status and actions visible behind a localized retry banner in `src/pages/Install.tsx:63-105` and `src/features/install/installPageState.ts:34-73`.
- Install facts currently show only BazaarPlusPlus, not the broader fact list from the historical design spec, in `src/features/install/InstallActionsPanel.tsx:58-65`.
- Install renders exactly one primary action. Its choose/install/repair/launch mode, gate, and loading state are derived from one view model based on path validity, install/version state, compatibility consistency, and the active operation in `src/features/install/installPageState.ts:75-132` and `src/features/install/InstallActionsPanel.tsx:141-222`.
- Install warnings and failures are presented from stable semantic codes in bilingual frontend copy; native diagnostics are kept in the diagnostic disclosure rather than used as the message in `src/features/install/installProblems.ts:23-107` and `src/features/install/InstallProblemBanner.tsx:1-32`.
- The reset-local-data button is disabled unless backend action gates allow reset data, and its label switches to a no-data message when the game path is valid but no resettable data exists in `src/features/install/InstallActionsPanel.tsx:103-115`. Both reset confirmations retain the selected game path as their target; failure keeps the modal, semantic problem, acknowledgement, and partial-failure paths available for retry or safe close, while success alone closes and refreshes state in `src/pages/Install.tsx:53-84` and `src/pages/Install.tsx:143-176`.
- History renders loading, blocking failure, and the two successful list states as mutually exclusive branches; refresh failures remain inside the ready branch and keep prior data in `src/pages/History.tsx:42-97` and `src/features/shared/pageState.ts:43-54`.
- History summary cards are Runs, Videos, and Win Rate in `src/pages/History.tsx:50-64`.
- History rows link to details, show lazy-decoded preview images with an error fallback, and display hero, locale-formatted date, result, progress, rank, and rating in `src/pages/History.tsx:125-230` and `src/features/history/format.ts:4-27`.
- History list loading calls `listHistoryRuns` independently from status-only Stream preview discovery; stopped or failed Stream status produces a thumbnail-only problem and never rejects the list request in `src/features/history/useHistoryPage.ts:37-64` and `src/features/history/historyPreview.ts:14-45`.
- Run detail renders explicit initial-loading, not-found, blocking-failure, and ready branches, preserving ready content behind a localized refresh-failure banner in `src/pages/RunDetail.tsx:66-130`. Screenshot, video, delete, and refresh controls share one action gate; video deletion keeps its battle/video target visible, blocks dismissal while running, retains localized semantic failure for retry/close, and closes only after the returned detail replaces page data in `src/features/history/useRunDetailPage.ts:84-153` and `src/pages/RunDetail.tsx:246-277`.
- Storage cleanup submits only generated `StorageCleanupScope` plus `StorageCleanupPreset`. Preview and execute are separately single-flight; the selected scope, preset, counts, and consequence remain in the confirmed-operation target through running/failure, and success refreshes History before publishing the outcome in `src/features/history/useStorageCleanup.ts:23-78` and `src/features/history/StorageCleanupCard.tsx:124-171`. Cleanup failures are localized from semantic problem codes/operation parameters while diagnostics remain separate in `src/features/history/storageCleanupProblems.ts:9-52`.
- Stream renders capability-localized service, polling, display-window, crop, and one-off action problems beside the controls that can recover them; diagnostics remain in the optional disclosure rather than becoming user copy in `src/pages/Stream.tsx:34-137`, `src/pages/Stream.tsx:182-319`, and `src/pages/Stream.tsx:324-358`.
- Stream status, database, window, and notice copy is derived from the current translator at render time. Stale running/stopped values have distinct presentation and are not presented as authoritative in `src/features/stream/streamPresentation.ts:20-80`.

## Update Modal

- The update modal is phase-driven: `available`, `downloading`, `installing`, `ready`, and install-sourced `error` render in the modal path in `src/features/about/updater.ts:90-103`.
- During download/install the modal is not dismissible because `downloadAndInstall` is not cancellable in `src/layouts/ShellUpdateModal.tsx:23-29`.
- Download progress reports downloaded MB and percentage when total size is known in `src/layouts/ShellUpdateModal.tsx:165-194`.
