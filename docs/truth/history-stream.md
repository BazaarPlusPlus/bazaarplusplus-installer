---
status: truth
topic: history-stream
last-verified: c56cac3a94fea48f6711c45a5139cab3bc7322d8
---

# History And Stream

## History Data Access

- The History facade resolves the current Selected game installation, privately derives database/game/video storage paths, and owns list, detail, reveal, delete, and cleanup operations in `src-tauri/src/services/history.rs:52-287`; it does not borrow Stream runtime state.
- List/detail resolution emits `history_unavailable`, while SQLite/query failures emit `history_read_failed` with a stable operation parameter and optional diagnostic in `src-tauri/src/services/history.rs:74-102`. Screenshot reveal, video reveal, and video delete failures emit `history_action_failed` with their target operation in `src-tauri/src/services/history.rs:109-188` and `src-tauri/src/services/history.rs:363-367`. Their shared serialized contract is defined in `src-tauri/src/problem.rs:3-42` and crosses the Tauri command boundary at `src-tauri/src/commands/history.rs:7-49`.
- `get_history_run_detail` returns a successful nullable detail, so an absent run is distinct from an unavailable installation or failed read in `src-tauri/src/commands/history.rs:16-23` and `src-tauri/src/services/history.rs:93-107`.
- Tauri History commands pass only domain inputs such as ids, limits, cleanup scope, and preset to the facade; command signatures contain no database, game, video-directory, cutoff, or cleanup-plan values in `src-tauri/src/commands/history.rs:7-79`. Cleanup preview/execute now return `SemanticProblem`, with unavailable selection classified separately and native failures carrying stable `preview_storage_cleanup` or `execute_storage_cleanup` operation parameters in `src-tauri/src/services/history.rs:258-274` and `src-tauri/src/services/history.rs:337-367`.
- History reads open the BazaarPlusPlus SQLite database read-only with a two-second busy timeout in `src-tauri/src/history/queries.rs:29-35`.
- Write access is separate and uses `SQLITE_OPEN_READ_WRITE` in `src-tauri/src/history/queries.rs:37-43`.
- History summary counts runs, completed runs, wins, latest run timestamp, and completed combat replay videos in `src-tauri/src/history/queries.rs:73-109`.
- The run list orders by end/last-seen/start timestamp descending, with run id as tie-breaker, in `src-tauri/src/history/queries.rs:111-129`.
- Primary screenshots prefer explicit primary rows and fall back to latest `end_of_run_auto` screenshots in `src-tauri/src/history/screenshots.rs:27-86` and `src-tauri/src/history/screenshots.rs:88-136`.

## History UI

- History independently starts list loading and status-only preview discovery; it never ensures or starts a Stream session in `src/features/history/useHistoryPage.ts:37-68`. Stopped/failed Stream status becomes a non-blocking preview problem and switches the row fallback label; image load failures fall back inside the row in `src/features/history/historyPreview.ts:14-45` and `src/pages/History.tsx:173-175,232-268`.
- The History page state union makes initial loading, blocking failure, ready-empty, and ready-content exclusive, while refreshing and refresh failure retain successful data in `src/features/shared/pageState.ts:1-61`, `src/features/history/historyPageState.ts:10-42`, and `src/pages/History.tsx:50-136`.
- The History page renders Runs, Videos, and Win Rate summary cards in `src/pages/History.tsx:59-79`.
- History rows include optional preview images and link to `/history/:run_id` details in `src/pages/History.tsx:125-230`.
- Run detail makes initial loading, not-found, blocking failure, and ready content exclusive; refresh failure retains the last successful detail and stale completions are ignored in `src/features/history/runDetailPageState.ts:5-90` and `src/pages/RunDetail.tsx:92-131`. Empty battle lists render EmptyState with a refresh action in `src/pages/RunDetail.tsx:225-246`.
- Detail refresh, screenshot reveal, video reveal, and video deletion share one visible single-flight gate. Action failures stay scoped to the screenshot or affected battle and clear when that target retries in `src/features/history/runDetailPageState.ts:93-167`, `src/features/history/useRunDetailPage.ts:46-165`, `src/pages/RunDetail.tsx:159-181`, and `src/pages/RunDetail.tsx:401-466`.
- Run detail formats dates, replay durations, and replay sizes through shared locale-aware helpers in `src/features/history/format.ts:4-61` and `src/features/history/format.ts:113-150`, with replay metadata rendered beside each video action in `src/pages/RunDetail.tsx:402-445`.
- The History page renders the storage cleanup card after the summary cards only in a successful ready state in `src/pages/History.tsx:57-81`; the card offers separate end-of-run screenshot and run-data rows, then confirms the exact scope, preset, counts, and consequence. Execute failure keeps that target and localized semantic problem in place for retry or safe close; success alone closes and refreshes History in `src/features/history/StorageCleanupCard.tsx:87-199` and `src/features/history/useStorageCleanup.ts:23-78`.

## Storage Cleanup

- Tauri exposes only `preview_storage_cleanup(scope, preset)` and `execute_storage_cleanup(scope, preset)` in `src-tauri/src/commands/history.rs:61-79`. Their Specta-generated success results are Serde scope-tagged unions for `screenshots` and `run_data` in `src-tauri/src/services/history.rs:25-44`; failures use the shared semantic problem contract.
- The facade derives the same preset cutoff for preview and execute before dispatching on scope in `src-tauri/src/services/history.rs:200-256`; its tempfile-backed behavior test covers list/detail/reveal/delete and both cleanup scopes against real SQLite rows and files in `src-tauri/src/services/history.rs:676-781`.
- The cleanup presets are the wire strings `all`, `older_than_7_days`, and `before_this_month`; `CleanupCutoff::for_preset` computes non-`all` cutoffs from local time and stores UTC strings for SQL comparisons in `src-tauri/src/history/cleanup.rs:9-71`. A non-`all` preset never collapses to `None` (the wire meaning of `all`): a spring-forward DST gap at local month-start falls back to local noon.
- Screenshot cleanup plans and executes against `end_of_run_auto` rows, skips pending BazaarDB screenshot uploads, compares captured timestamps with `datetime()`, protects files still referenced by surviving rows, and sweeps orphan dated-folder files plus stale `UploadCache` copies in `src-tauri/src/history/cleanup.rs:121-172` and `src-tauri/src/history/cleanup.rs:184-252`.
- The orphan sweep skips any folder whose local date is at or after `min(cutoff_date, today_local_date)`, so today's local-date folder is always protected — even under preset `all`, where there is no cutoff — because the mod writes a screenshot's PNG (through an atomic `<name>.png.<guid>.tmp` rename) before it inserts the matching `run_screenshots` row, and an in-flight, not-yet-rowed file would otherwise be swept. `today_local_date` is derived from the same `chrono::Local::now()` that builds the cutoff in `src-tauri/src/services/history.rs:200-256` and threaded into `scan_orphan_screenshot_files` at `src-tauri/src/history/cleanup.rs:987-1051` (a capture straddling local midnight into yesterday's folder is a known, unclosed sub-second window).
- Run-data cleanup plans only non-active runs, skips upload-unsafe completed Ranked dirty runs, replay-dirty battles, and pending screenshot uploads, and protects screenshot/video files still referenced by kept rows in `src-tauri/src/history/cleanup.rs:307-394`.
- Run-data execution opens the FK-enabled cleanup connection, validates required cascade foreign keys before removing files, deletes replay videos, replay payloads, and eligible screenshots before deleting rows, then removes video rows, screenshot rows, and `runs` rows without directly deleting `battles`; cleanup file resolution refuses drive-relative escapes in `src-tauri/src/history/cleanup.rs:409-521`.
- The FK-enabled cleanup connection turns on `PRAGMA foreign_keys = ON` in `src-tauri/src/history/queries.rs:49-54`, so current-schema `runs` deletes cascade to run-owned child rows while ghost battles remain outside run cleanup.

## Stream Service

- The stream service binds to `127.0.0.1:17654` in `src-tauri/src/stream/server.rs:16-17`.
- `StreamRuntime` is the single lifecycle owner. Its async lifecycle mutex serializes ensure, restart, stop, window changes, and exclusive maintenance; task handles and captured installation paths remain private in `src-tauri/src/stream/runtime.rs:43-108` and `src-tauri/src/stream/runtime.rs:188-280`.
- Ensure and restart resolve one Selected game installation snapshot while holding the lifecycle gate; window changes reuse the captured record path instead of re-resolving a possibly changed selection in `src-tauri/src/stream/runtime.rs:66-98`, `src-tauri/src/stream/runtime.rs:203-220`, and `src-tauri/src/stream/runtime.rs:300-357`.
- The production server adapter constructs the overlay repository and settings store, reports database/window status, and serves the router with graceful shutdown in `src-tauri/src/stream/server.rs:19-102`; stop sends shutdown and awaits the task before publishing idle state in `src-tauri/src/stream/runtime.rs:188-201`.
- Startup, stream commands, tray stop/quit, and window-close behavior use the runtime rather than composing server mutations directly in `src-tauri/src/lib.rs:80-109`, `src-tauri/src/commands/stream.rs:12-92`, and `src-tauri/src/tray.rs:32-48`.
- Stream commands return `SemanticProblem`: service, display-window, and crop-setting failures keep stable capability and operation codes while native details remain optional diagnostics in `src-tauri/src/commands/stream.rs:12-110` and `src-tauri/src/problem.rs:3-42`.

## Stream UI Capabilities

- The Stream snapshot keeps service, polling freshness, display window, crop settings, and clipboard/opener actions as independent capability states with their own phase, operation, problem, and action gates in `src/features/stream/streamWorkflow.ts:53-106` and `src/features/stream/streamWorkflow.ts:640-733`.
- Service and crop initialization run independently; crop loading or failure does not block service/window controls, and crop plus one-off operations use separate single-flight gates in `src/features/stream/streamWorkflow.ts:185-268` and `src/features/stream/streamWorkflow.ts:509-590`.
- Three consecutive status-poll failures preserve the last value but mark it stale, disable actions that require an authoritative running service, and expose a manual refresh; a successful poll restores freshness in `src/features/stream/streamWorkflow.ts:271-324` and `src/features/stream/streamWorkflow.ts:640-733`.
- Workflow state stores semantic problems and notices rather than localized copy. Translation is a pure presentation step, and `useStreamPage` creates the workflow independently of locale so language switches do not dispose, restart, or re-ensure the session in `src/features/stream/streamProblems.ts:7-105`, `src/features/stream/streamPresentation.ts:20-80`, and `src/features/stream/useStreamPage.ts:20-42`.

## HTTP Surface

- The local HTTP router exposes `/overlay`, `/settings`, stream record APIs, crop-config APIs, record images, and static overlay/settings assets in `src-tauri/src/stream/http.rs:29-40` and `src-tauri/src/stream/http.rs:75-109`.
- CORS is narrowed to Tauri origins and the local Vite dev origins `http://localhost:14207` and `http://127.0.0.1:14207` in `src-tauri/src/stream/http.rs:111-122`.
