---
status: truth
topic: history-stream
last-verified: 7b18f73d4718d3e1406de9f526d1fbba09ac567f
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

## Stream Service

- The stream service binds to `127.0.0.1:17654` in `src-tauri/src/stream/server.rs:16-18`.
- Starting the service stops any existing different-path service, resolves game/database paths, constructs the overlay record repository and settings store, then serves the router with graceful shutdown in `src-tauri/src/stream/server.rs:19-99`.
- The service reports database presence and path from the resolved game path in `src-tauri/src/stream/server.rs:102-111`.
- The service reports window totals and current record from the overlay repository in `src-tauri/src/stream/server.rs:113-131`.
- Stop and restart are explicit async service operations in `src-tauri/src/stream/server.rs:149-165`.

## HTTP Surface

- The local HTTP router exposes `/overlay`, `/settings`, stream record APIs, crop-config APIs, record images, and static overlay/settings assets in `src-tauri/src/stream/http.rs:63-91`.
- CORS is narrowed to Tauri origins and the local Vite dev origins `http://localhost:14207` and `http://127.0.0.1:14207` in `src-tauri/src/stream/http.rs:99-110`.
