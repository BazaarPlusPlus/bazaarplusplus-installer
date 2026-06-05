# History Page Slimdown Plan

Date: 2026-06-05

## Current Code Evidence

- History rows currently render an end-of-run preview, hero, started time, `Result`, `Day`, `Rank`, `Rating`, `Videos`, a `View details` affordance, and a run-video delete button: `src/pages/History.tsx:117`, `src/pages/History.tsx:135`, `src/pages/History.tsx:144`, `src/pages/History.tsx:159`, `src/pages/History.tsx:162`, `src/pages/History.tsx:169`.
- The current list preview is fixed at `w-40 h-16`, which is not the target `2000 x 470` strip ratio: `src/pages/History.tsx:117`.
- The detail page currently repeats the strip screenshot inside the run summary card: `src/pages/RunDetail.tsx:116`.
- Detail page data actions currently exist and should stay: `Open screenshot location` at `src/pages/RunDetail.tsx:78`, battle video reveal/delete actions at `src/pages/RunDetail.tsx:238`.
- Video reveal currently resolves a DB-backed video path and immediately delegates to the system file browser: `src-tauri/src/services/history.rs:57`.
- The file-browser helper currently spawns Finder/Explorer without first proving the target path exists on disk: `src-tauri/src/services/history.rs:141`.

## Target Behavior

### History List Row

Keep each row as the clickable entry into run detail, but remove secondary row actions and reduce the data to the scan-critical fields.

Show:

- End-of-run strip preview at a stable `2000:470` aspect ratio.
- Hero name.
- Started time.
- `Result`.
- `Day`.
- `Rank`.
- `Rating`.

Remove:

- `Videos` metric from the list row.
- Visible `View details` text and chevron.
- Row-level `Delete run videos` button and its loading state.

Keep:

- Clicking the row navigates to `/history/{run_id}`.
- Existing fallback preview placeholder when no strip URL is available.

### Run Detail

Remove the repeated screenshot strip display from the run summary card.

Keep:

- Back to history.
- Run summary fields.
- `Open screenshot location`.
- Battle ledger.
- Per-battle `Open video location`.
- Per-battle `Delete video`.

Also align the run-detail result label with the list formatter so raw values like `IN_PROGRESS` do not leak into the title.

### Video Reveal Hardening

Fix the stale-file case for `Open video location`.

The current lookup selects the requested completed video by `battle_id` and `video_id`, falling back to the latest completed video only when no `video_id` is provided: `src-tauri/src/history/queries.rs:315`. The frontend normally passes the concrete `video_id`: `src/pages/RunDetail.tsx:241`.

The remaining problem is not choosing the wrong DB row. It is that a completed DB row may point to a missing local file. Before calling `reveal_in_file_browser`, check that the resolved path exists and return a clear error if it does not.

## Implementation Plan

1. Update `src/pages/History.tsx`.
   - Remove `ChevronRight`, `Loader2`, and `Trash2` imports if no longer used by the list page.
   - Remove `deleting` and `onDelete` from `RunRow`.
   - Stop passing `actionRunId` and `deleteVideos` into each row.
   - Change the preview container from `w-40 h-16` to a stable `2000:470` ratio.
   - Remove the `Videos` metric.
   - Remove the visible `View details` affordance while keeping the `Link`.
   - Keep row spacing stable after the removed action column.

2. Update `src/features/history/useHistoryPage.ts` only if dead API surface remains.
   - If the list page no longer exposes row-level video deletion, remove `actionRunId` and `deleteVideos` from the hook return.
   - Keep the `deleteRunVideos` API function itself for now only if another call site still uses it.

3. Update `src/pages/RunDetail.tsx`.
   - Remove the screenshot strip block at `src/pages/RunDetail.tsx:116`.
   - Keep the `Open screenshot location` button.
   - Keep battle video reveal/delete actions.
   - Use `formatRunResultLabel` for the run title result instead of `detail.run.result.toUpperCase()`.

4. Harden video reveal in `src-tauri/src/services/history.rs`.
   - After `load_battle_video_path(...)` returns a path, verify that it exists.
   - If missing, return a clear error such as `Video file was not found at <path>.`
   - Keep the current DB-row behavior unchanged.

5. Verification.
   - Run `npm run check` for the React/TypeScript UI change.
   - Run the smallest Rust test seam for the new path-existence helper if added.
   - If no meaningful Rust unit seam is added, run the relevant cargo test target covering history services, and state the gap explicitly.

## Out Of Scope

- No database schema change.
- No migration or backfill.
- No redesign of the battle ledger columns.
- No removal of detail-page screenshot/video actions.
