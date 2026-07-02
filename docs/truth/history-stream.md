---
status: truth
topic: history-stream
last-verified: bcfb9f79745efd6e6cdc6966f44a90e21906c404
---

# History And Stream

## History Data Access

- History reads open the BazaarPlusPlus SQLite database read-only with a two-second busy timeout in `src-tauri/src/history/queries.rs:29-35`.
- Write access is separate and uses `SQLITE_OPEN_READ_WRITE` in `src-tauri/src/history/queries.rs:37-43`.
- History summary counts runs, completed runs, wins, latest run timestamp, and completed combat replay videos in `src-tauri/src/history/queries.rs:62-98`.
- The run list orders by end/last-seen/start timestamp descending, with run id as tie-breaker, in `src-tauri/src/history/queries.rs:100-118`.
- Primary screenshots prefer explicit primary rows and fall back to latest `end_of_run_auto` screenshots in `src-tauri/src/history/screenshots.rs:27-86` and `src-tauri/src/history/screenshots.rs:88-136`.

## History UI

- The History page renders Runs, Videos, and Win Rate summary cards in `src/pages/History.tsx:34-39`.
- History rows include optional preview images and link to `/history/:run_id` details in `src/pages/History.tsx:99-157`.
- Run detail renders run metadata, screenshot reveal, summary stats, and a battle table with video reveal/delete controls in `src/pages/RunDetail.tsx:65-160` and `src/pages/RunDetail.tsx:190-285`.
- The History page renders the storage cleanup card after the summary cards in `src/pages/History.tsx:51`; the card offers separate end-of-run screenshot and run-data rows in `src/features/history/StorageCleanupCard.tsx:90-101`.

## Storage Cleanup

- Tauri exposes preview and execute commands for screenshot cleanup and run-data cleanup in `src-tauri/src/commands/history.rs:103-145`, and all four commands are registered in `src-tauri/src/commands/registry.rs:29-32`.
- The cleanup presets are the wire strings `all`, `older_than_7_days`, and `before_this_month`; `CleanupCutoff::for_preset` computes non-`all` cutoffs from local time and stores UTC strings for SQL comparisons in `src-tauri/src/history/cleanup.rs:9-56`.
- Screenshot cleanup plans and executes against `end_of_run_auto` rows, skips pending BazaarDB screenshot uploads, compares captured timestamps with `datetime()`, protects files still referenced by surviving rows, and sweeps orphan dated-folder files plus stale `UploadCache` copies in `src-tauri/src/history/cleanup.rs:107-156` and `src-tauri/src/history/cleanup.rs:169-235`.
- Run-data cleanup plans only non-active runs, skips upload-unsafe completed Ranked dirty runs, replay-dirty battles, and pending screenshot uploads, and protects screenshot/video files still referenced by kept rows in `src-tauri/src/history/cleanup.rs:297-382`.
- Run-data execution opens the FK-enabled cleanup connection, validates required cascade foreign keys before removing files, deletes replay videos, replay payloads, and eligible screenshots before deleting rows, then removes video rows, screenshot rows, and `runs` rows without directly deleting `battles` in `src-tauri/src/history/cleanup.rs:404-512`.
- The FK-enabled cleanup connection turns on `PRAGMA foreign_keys = ON` in `src-tauri/src/history/queries.rs:49-54`, so current-schema `runs` deletes cascade to run-owned child rows while ghost battles remain outside run cleanup.

## Stream Service

- The stream service binds to `127.0.0.1:17654` in `src-tauri/src/stream/server.rs:16-18`.
- Starting the service stops any existing different-path service, resolves game/database paths, constructs the overlay record repository and settings store, then serves the router with graceful shutdown in `src-tauri/src/stream/server.rs:19-99`.
- The service reports database presence and path from the resolved game path in `src-tauri/src/stream/server.rs:102-111`.
- The service reports window totals and current record from the overlay repository in `src-tauri/src/stream/server.rs:113-131`.
- Stop and restart are explicit async service operations in `src-tauri/src/stream/server.rs:149-165`.

## HTTP Surface

- The local HTTP router exposes `/overlay`, `/settings`, stream record APIs, crop-config APIs, record images, and static overlay/settings assets in `src-tauri/src/stream/http.rs:63-91`.
- CORS is narrowed to Tauri origins and the local Vite dev origins `http://localhost:14207` and `http://127.0.0.1:14207` in `src-tauri/src/stream/http.rs:99-110`.
