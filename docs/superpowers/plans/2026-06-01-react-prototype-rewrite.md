# React Prototype Rewrite Implementation Plan

> **For agentic workers:** This document is a **contract + design spec**, not a line-by-line task script. The `P0`–`P3` sections below are *epics*. Before executing an epic, expand it into a bite-sized TDD sub-plan with `superpowers:writing-plans`, then run it with `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax for epic-level tracking.

**Goal:** Replace the current Svelte/Subview Lite installer frontend with the approved React Prototype behavior and visual surface, and reshape the Tauri/Rust command + local-HTTP contract into product use-case names, taking breaking changes wherever they produce a cleaner system.

**Architecture:** The React Prototype is the product source of truth for page structure, copy, and flow. React talks to a small typed Tauri command layer (app / install / stream / history) and to the local stream HTTP service for OBS pages, overlay data, and strip image previews. The local SQLite database is **owned by the mod** (`bazaarplusplus-mod` `RunLogSchema.cs`); the installer is a read-mostly client of it and must not migrate or re-shape that schema.

**Tech Stack:** React, React Router, Vite, TypeScript, Tailwind CSS, lucide-react, Tauri 2, Rust, Axum local HTTP, SQLite (`ts-rs`-generated TS bindings).

---

## Goal

### Background

The BazaarPlusPlus desktop installer ships today as a **SvelteKit + Tauri 2** app whose frontend is the "Subview Lite" Svelte surface. The product has since moved past what that surface was built for:

- A **high-fidelity React prototype** (`bpp-react-prototype/`) and an approved product-surface spec (`docs/superpowers/specs/2026-05-31-installer-product-surfaces-design.md`) now define the intended pages, copy, density, and flow. The Svelte app no longer matches the product.
- The Tauri command + local-HTTP + DTO surface grew organically. Names describe implementation rather than product use cases (`start_stream_service`, `/api/records/*`, `list_stream_overlay_records`), and DTOs leak local file paths (`OverlayRecord.image_path`) into the UI.
- "History" is modeled as a **screenshot-record library**, but the product wants a **run-centric** history backed by the local SQLite database the mod writes (`<GameRoot>/BazaarPlusPlusV4/`; schema owned by `bazaarplusplus-mod/Storage/RunLog/RunLogSchema.cs`).
- The stream/overlay lifecycle is a manual start/stop model, while the approved spec calls for the service to **auto-start with the app** and removes "stop" as a page action.

Rather than bend the Svelte app incrementally toward the prototype, we do a clean replacement: React becomes the single product source of truth, and the backend contract is reshaped into product use-case names with breaking changes where they make the system clearer.

### What We're Building

A complete, single-track replacement — **all of P0–P3 in this plan, end to end** — that leaves no parallel build chain behind:

1. **Frontend:** replace the Svelte/Subview Lite runtime with a React + React Router + Vite + Tailwind app, productionized from the approved prototype (`安装 / 战绩 / 直播 / 关于` shell plus run detail), wired to real backends instead of the prototype's mock/`setTimeout` data.
2. **Typed contract, one source of truth:** a small product-named Tauri command layer and renamed local-HTTP endpoints, with every DTO defined once in Rust and **generated** to TypeScript via `ts-rs` (no hand-authored parallel types).
3. **Run-centric history:** `list_history_runs` / `get_history_run_detail` backed by the mod's SQLite schema, using the **actual** columns and the mod's own outcome derivations (`victories`/`losses`, `final_player_rank/rating`, battle `result`, UPPERCASE video status). The installer reads — and narrowly deletes videos — but never migrates that schema.
4. **Strict image boundary:** React never renders a full local screenshot; previews come only from the local stream service's strip endpoint (`/images/{record_id}/strip`), composed from a session `base_url`.
5. **Stream lifecycle aligned to the spec:** an idempotent `ensure_stream_session` for app-start, `/stream` entry, and History's image needs (non-destructive — never tears down a live OBS source), with an explicit `restart_stream_session` reserved for the manual retry button; stop stays internal for tray/app quit.
6. **Clean removal:** delete the old Svelte routes/components/controllers, SvelteKit dependencies and scripts, and the screenshot-library mental model; then validate the release path.

### Definition of Done

The plan is complete only when every item below passes. This is the authoritative acceptance list and supersedes any partial milestone — all P0–P3 epics are in scope.

**Frontend replacement**
- [ ] Root app is React, not SvelteKit; no parallel frontend build chain remains.
- [ ] All five pages (`安装 / 战绩 / 直播 / 关于` + run detail) match the React Prototype's structure and visual density and render real backend data, not mock/`setTimeout` data.
- [ ] Old Svelte routes, components, controllers, `svelte.config.js`, and SvelteKit dependencies are removed; `rg "svelte|SvelteKit|\.svelte"` finds only docs/history.

**Stream lifecycle**
- [ ] The overlay service auto-starts with the app; entering `/stream` performs a non-destructive `ensure` (reuses a healthy session — no flicker, no window reset); the manual button performs a hard `restart`.
- [ ] Repeated `/stream` entry leaves no stale ports; tray quit / app quit still stop the service.
- [ ] OBS `/overlay` and `/settings` (with their `/assets/*`) still load.

**Image boundary**
- [ ] React displays no full image URLs anywhere; previews load only via `base_url + strip_url`.
- [ ] No React-facing DTO carries `image_path` / `image_url`.

**History and data correctness**
- [ ] History is run-centric and backed by SQLite, using the actual schema column names and the mod's outcome derivations; run list, summary, and run detail render against a local DB seeded with the real schema.
- [ ] Run detail shows the battle ledger with opponent fields and per-battle video reveal, plus `无视频` when no completed video exists; video delete/reveal actions work without corrupting the mod's DB.

**Backend contract**
- [ ] Tauri command names and local-HTTP routes reflect product use cases; `/api/records/*` are renamed to `/api/stream/*`; install state is one snapshot.
- [ ] TypeScript DTOs are generated from Rust (`ts-rs`) with no hand-authored duplicates; bindings regenerate cleanly after Rust changes.

**Verification gates**
- [ ] `npm run generate:bindings`, `npm run test:rust`, `npm run test:unit`, and `npm run build` pass.
- [ ] `npm run tauri dev` exercises the install / stream / history / run-detail / about flows against a real or debug game path.
- [ ] `npm run prebuild-check` passes for any Tauri-config / packaged-resource change; `./build.sh --prod` produces a valid release bundle with updater metadata matching the app version and installer resources packaged.

## Document Role and Execution Model

This plan deliberately sits at *contract altitude*: it freezes interface names, DTO shapes, SQL shapes, and behavior, and it maps the current code onto the target. It is **not** a sequence of 2–5 minute TDD steps, because a rewrite of this size has too many local decisions to enumerate up front without going stale.

Execution model:

1. Freeze the contract (`P0: Contract Freeze`). This is the one section that must be correct before any code is written, because it locks the DTOs that everything else depends on.
2. For each subsequent epic, generate a focused sub-plan (`writing-plans`) that contains the actual Rust/React code, failing-test-first steps, and exact commands.
3. Execute sub-plans task-by-task with review checkpoints.

Anything below that reads like an outcome ("Implement `get_install_state`") is an epic boundary, not a step. The step-level detail is produced at execution time.

## Verification Provenance

Every schema, command, and endpoint claim in this plan was checked against source on 2026-06-01:

- SQLite DDL: `../bazaarplusplus-mod/Storage/RunLog/RunLogSchema.cs` (authoritative; schema version 13).
- Reference query + outcome logic: `../bazaarplusplus-mod/Game/HistoryPanel/Storage/HistoryPanelRepository.cs`, `../bazaarplusplus-mod/Game/HistoryPanel/HistoryPanelFormatter.cs`.
- Current installer backend: `src-tauri/src/lib.rs` (command registry), `src-tauri/src/stream/http.rs` (routes), `src-tauri/src/stream/state.rs`, `src-tauri/src/stream/records/mapper.rs`.
- Approved product spec: `docs/superpowers/specs/2026-05-31-installer-product-surfaces-design.md`.

Where this plan's field names differ from an earlier draft, it is because the earlier draft used idealized names that do not exist in the DDL. The DDL wins.

---

## Scope Decision

This is a direct replacement, not a merge of two build chains.

- `bpp-react-prototype/` remains the visual and interaction reference (a standalone Vite + React app using `MemoryRouter` and **mock/`setTimeout` data** — no real `invoke`). Wiring it to real backends is net-new work, not a copy.
- Production React code is copied into the root app and wired; we do not run SvelteKit and React side by side.
- Current Svelte/Subview Lite routes, components, stores, and controllers are removed once the React equivalents are wired.
- Backend compatibility with the old frontend interfaces is **not** required; commands and endpoints are renamed/combined/deleted to make the React contract clearer.
- The finished product matches the current React Prototype pages and flow, not the current Svelte app.

## Theory Framework Principles

- **Prototype first:** the React Prototype defines page structure, copy placement, visual density, and user flow.
- **Capability boundary:** Tauri commands expose product use cases, not low-level UI mechanics.
- **Route-owned state:** each React route owns its loading / error / action state through a feature hook.
- **One typed contract, generated:** Rust DTOs derive `ts_rs::TS`; the TypeScript types are **generated**, never hand-authored in parallel. React imports the generated types. (This is the existing `generate:bindings` mechanism — keep one source of truth to avoid the drift that caused the schema-name bugs in the prior draft.)
- **No production mocks:** mock data lives only in tests or isolated fixtures.
- **Local media boundary:** React never renders a full local screenshot. It renders only strip-preview URLs from the live stream service.
- **Stream service ownership:** the local stream backend owns crop, cache, overlay/calibration pages, and resized image generation.
- **Schema is the mod's, not ours:** the installer reads (and, for video deletion, performs narrow writes to) the mod's SQLite. It must not add/alter tables or indexes, must tolerate columns being absent, and must not assume exclusive DB access. Any index or schema change belongs in the mod (`RunLogSchema.cs`), not here.
- **Breaking change allowed:** old names such as `start_stream_service` are replaced by clearer names such as `restart_stream_session`.

## Source Map

Current reference files:

- React Prototype shell: `bpp-react-prototype/src/App.tsx`
- React Prototype global shell: `bpp-react-prototype/src/layouts/GlobalShell.tsx`
- React Prototype pages: `bpp-react-prototype/src/pages/{Install,History,RunDetail,Stream,About}.tsx`
- Approved product-surface spec: `docs/superpowers/specs/2026-05-31-installer-product-surfaces-design.md`
- Old Svelte entry points: `src/routes/install/+page.svelte`, `src/routes/stream/+page.svelte`, `src/lib/components/stream/StreamModePanel.svelte`, `src/lib/components/stream/StreamRecordLibrary.svelte`
- Current frontend API references: `src/lib/bridge/commands.ts`, `src/lib/installer/api.ts`, `src/lib/stream/api.ts`
- Current generated bindings: `src/lib/generated/commands.ts` (barrel) + `src/lib/generated/bindings/*.ts` (per-type, emitted by `scripts/generate-bindings.mjs` via `cargo test export_bindings`)
- Current Tauri command registration: `src-tauri/src/lib.rs`
- Current stream backend: `src-tauri/src/commands/stream.rs`, `src-tauri/src/stream/{server,state,http}.rs`, `src-tauri/src/stream/records/`
- SQLite schema (authoritative): `../bazaarplusplus-mod/Storage/RunLog/RunLogSchema.cs`
- Mod history query + outcome logic: `../bazaarplusplus-mod/Game/HistoryPanel/Storage/HistoryPanelRepository.cs`, `../bazaarplusplus-mod/Game/HistoryPanel/HistoryPanelFormatter.cs`

## Target Product Behavior

### Global Shell

- Full-width `BazaarPlusPlus` header.
- Left rail below header with `安装 / 战绩 / 直播 / 关于`.
- Header owns update check, support popover, and locale toggle.
- No install-page embedded stream toggle (stream is its own rail page — spec §`直播模式 must not remain a header toggle`).

### Install Page

- Two-column status console matching the Prototype.
- Left column: current status and game path. Right column: launch, install, reinstall, repair, uninstall, and facts.
- Real data comes from a single consolidated install backend snapshot (`get_install_state`).

### Stream Page

The approved spec (§"The Overlay service will eventually auto-start when the app starts … keeps start/stop/restart backend capabilities … Stop service should not be a top-level page action") drives this model. The page does **not** hard-restart the service on every entry — that would tear down a live OBS browser-source and reset a streamer's window mid-stream.

- Entering `/stream` calls `ensure_stream_session({ reason: 'route_enter' })` — **idempotent**: it starts the service only if it is not already running healthy, and does **not** reset the active window when reusing a healthy session.
- Manual `重启服务` calls `restart_stream_session({ reason: 'manual' })` — an explicit hard stop+start that resets the active window. This is the retry/recovery path.
- Stop service is not a top-level page action (it remains an internal capability for tray/app quit).
- OBS URL is shown only after the session reports a `base_url`.
- DB status is derived from backend detection within the session payload.
- 展示窗口 state lives in backend stream runtime state.
- Overlay config uses backend settings, crop code, and display mode.
- The stream page does not show screenshot history.

### Image Logic

The strip pipeline **already exists** in the Rust stream backend (`/images/{record_id}/strip` with crop/cache/invalidation in `http.rs`). The work here is mostly *removing the full-image path from React-facing DTOs* and *renaming the record endpoints*, not building strip generation from scratch.

- React must not display full images.
- React preview images use only the live stream service strip endpoint: `GET http://127.0.0.1:{port}/images/{record_id}/strip` (note: the route param is `{record_id}`, snake_case, matching the existing axum route).
- Full local screenshot paths are not present in any React-rendering DTO. The current `OverlayRecord.image_path` / `image_url` fields are removed from the React contract.
- File-reveal commands may still open Finder/Explorer for a screenshot — that is an action, not an image display path.
- Strip image generation, crop, cache, and invalidation stay in the Rust stream backend.

### History Page

- History is a **run list**, not a screenshot-record library.
- Top summary shows `Runs`, `Videos`, `Last Run`, and `Win Rate` (see derivation in SQL section; `Win Rate` is nullable).
- Rows show run-level data: hero, time, result (VICTORY/DEFEAT), end day, final rank, final rating, optional strip preview, detail link, and a delete-videos action.
- No screenshot-library filters or badges.
- **Image-service dependency:** the History strip previews require the local image service. On mount the History hook calls `ensure_stream_session({ reason: 'history' })` to obtain `base_url`, then composes `base_url + strip_url`. It must **not** call `restart_stream_session` (that would disrupt an active stream). It shows no stream-control UI.

### Run Detail Page

- Shows run summary, end-of-run strip, and a battle ledger.
- Summary fields: hero, player name (sourced from the run's battles, see below), game mode, start–end time, status, 胜/负 (`victories`/`losses`), 结束日 (`final_day`), 最终段位 (`final_player_rank`), 最终评分 (`final_player_rating`).
- Battle rows show day, result (WIN/LOSS), opponent hero, opponent player, rank, rating, and a video reveal action (or `无视频`).
- No battle screenshots, inline video player, card art, rating deltas, level/gold, or local-file side panel.
- The Prototype header shows a decorative run ordinal ("Run CLIII"). There is **no** ordinal column in the schema; treat it as frontend-only flavor (derive from list position, or omit). Do not invent a backend field for it.

### About Page

- Uses the Prototype about layout.
- Credits and licenses reflect React/Tauri after replacement (sourced from a backend-provided `AppBootstrap`; the data may be a static table compiled into the Rust app module).
- Support UI lives in the global header, not duplicated in About.

## Frontend Interface Requirements

These are the target React-facing contracts. **The canonical definitions are the Rust DTO structs** (deriving `ts_rs::TS`); the TypeScript below illustrates the generated output that React consumes. Command names intentionally break from the old Svelte names.

### Shared Types

```ts
export type ResultState = 'idle' | 'loading' | 'ready' | 'error';
export type Locale = 'zh' | 'en';
export type FileActionResult = { ok: true }; // failures surface as a rejected invoke, normalized by the API layer
```

### App Shell Interfaces

| Interface | Method | Purpose | Request | Response |
| --- | --- | --- | --- | --- |
| `get_app_bootstrap` | Tauri invoke | Load app version, locale, links, support + about metadata | none | `AppBootstrap` |
| `set_app_locale` | Tauri invoke | Change UI locale and tray menu labels | `{ locale: Locale }` | `{ locale: Locale }` |
| Tauri updater plugin | Plugin call | Check/download/install app updates | plugin-defined | updater plugin result |

```ts
export type AppBootstrap = {
  app_version: string;
  bundled_bpp_version: string | null;
  locale: Locale;
  links: {
    github: string;
    bilibili: string;
    xiaohongshu: string;
    kofi: string;
    supporter_list: string;
  };
  credits: Array<{ name: string; role: string }>;
  licenses: Array<{ name: string; license: string; category: 'runtime' | 'frontend' | 'backend' }>;
};
```

### Install Page Interfaces

| Interface | Method | Purpose | Request | Response |
| --- | --- | --- | --- | --- |
| `get_install_state` | Tauri invoke | Load all install-page status cards and available actions in one snapshot | `{ game_path?: string }` | `InstallState` |
| `choose_game_directory` | Tauri invoke (wraps the Tauri dialog plugin) | Pick and normalize a game directory | none | `{ game_path: string \| null }` |
| `install_mod` | Tauri invoke | Install bundled BepInEx + BazaarPlusPlus, then patch launch options where supported | `{ game_path: string; skip_steam_shutdown: boolean }` | `InstallState` |
| `repair_mod` | Tauri invoke | Repair install and recover/remove broken local history as needed | `{ game_path: string }` | `InstallState` |
| `uninstall_mod` | Tauri invoke | Remove install artifacts | `{ game_path: string }` | `InstallState` |
| `launch_game` | Tauri invoke | Start The Bazaar via Steam launch URL / platform opener | `{ game_path?: string }` | `FileActionResult` |
| `close_steam` | Tauri invoke | Close Steam when the install flow needs it | none | `FileActionResult` |

```ts
export type InstallState = {
  selected_game_path: string | null;
  steam_path: string | null;
  steam_running: boolean;
  steam_launch_options_supported: boolean;
  game: { found: boolean; path_valid: boolean; display_version: string | null };
  mod: { installed: boolean; installed_version: string | null; bundled_version: string | null; version_matches: boolean };
  runtime: { dotnet_version: string | null; dotnet_ok: boolean };
  actions: { can_install: boolean; can_reinstall: boolean; can_repair: boolean; can_uninstall: boolean; can_launch: boolean };
  warnings: Array<{
    code: 'steam_running' | 'game_missing' | 'dotnet_missing' | 'launch_options_unsupported';
    message: string;
  }>;
};
```

`get_install_state` folds in the current `initialize_installer_context`, `detect_environment`, and `detect_steam_running`. `repair_mod` subsumes `get_legacy_record_directory_info`'s recover/remove behavior.

### Stream Page Tauri Interfaces

| Interface | Method | Purpose | Request | Response |
| --- | --- | --- | --- | --- |
| `ensure_stream_session` | Tauri invoke | **Idempotent** start: start the service if not running healthy; otherwise return current state untouched (no window reset, no teardown). Resolves DB + window summary. | `{ game_path?: string; reason: 'app_start' \| 'route_enter' \| 'history' }` | `StreamSession` |
| `restart_stream_session` | Tauri invoke | **Hard restart:** stop any existing service, start fresh, reset active window, return runtime state | `{ game_path?: string; reason: 'manual' \| 'recovery' }` | `StreamSession` |
| `get_stream_session` | Tauri invoke | Read current runtime state without starting it | none | `StreamSession` |
| `set_stream_window` | Tauri invoke | Move showcase window earlier/later or back to current | `{ offset: number }` | `StreamSession` |
| `get_overlay_settings` | Tauri invoke | Read crop code and display mode | none | `OverlaySettingsPayload` |
| `save_overlay_display_mode` | Tauri invoke | Persist display mode | `{ display_mode: OverlayDisplayMode }` | `OverlaySettingsPayload` |
| `apply_overlay_crop_code` | Tauri invoke | Validate and persist crop code | `{ code: string }` | `OverlaySettingsPayload` |
| `reset_overlay_crop` | Tauri invoke | Restore default crop and return new code | none | `OverlaySettingsPayload` |
| `open_external_url` | Tauri plugin wrapper | Open overlay preview / calibration page | `{ url: string }` | plugin-defined |

```ts
export type StreamSession = {
  running: boolean;
  host: string;                 // '127.0.0.1'
  port: number | null;
  base_url: string | null;      // `http://{host}:{port}`
  overlay_url: string | null;   // `${base_url}/overlay`
  settings_url: string | null;  // `${base_url}/settings`
  last_error: string | null;
  started_at: string | null;
  active_from: string | null;
  active_window_offset: number;
  db: { found: boolean; path: string | null };
  window: {
    total_records: number;
    existing_before_start: number;
    captured_since_start: number;
    current_hero: string | null;
    current_start_label: string | null;
  };
};

export type OverlayDisplayMode = 'current' | 'hero' | 'herohalf';

export type OverlaySettingsPayload = {
  crop: { left: number; top: number; width: number; height: number };
  code: string;
  display_mode: OverlayDisplayMode;
};
```

`StreamSession` extends today's `StreamServiceStatus` (`running/host/port/overlay_url/last_error/started_at/active_from/active_window_offset` already exist in `state.rs`) with `base_url`, `settings_url`, `db`, and `window`.

### Stream Local HTTP Interfaces

Served by the local stream backend. React calls them only after `StreamSession.base_url` is available.

| Endpoint | Method | Purpose | Query/body | Response |
| --- | --- | --- | --- | --- |
| `/health` | GET | Liveness check | none | `{ ok: true }` |
| `/overlay` | GET | OBS browser-source page | none | HTML |
| `/settings` | GET | Crop calibration page | none | HTML |
| `/assets/overlay.{css,js}`, `/assets/settings.{css,js}`, `/assets/badges/{category}/{file}` | GET | Static assets for the pages above | none | css/js/image |
| `/api/stream/window-summary` | GET | Active stream-window summary (rename of `/api/records/summary`) | none | `StreamWindowSummary` |
| `/api/stream/records/latest` | GET | Latest record in active window (rename of `/api/records/latest`) | `offset?: number` | `StreamRecordPreview \| null` |
| `/api/stream/records` | GET | Record list in active window (rename of `/api/records/list`) | `limit?: number` | `StreamRecordPreview[]` |
| `/api/overlay/crop-config` | GET/POST | Crop config for the calibration page | `{ crop }` on POST | `OverlaySettingsPayload` |
| `/images/{record_id}/strip` | GET | Resized/cropped preview image | `preview?: boolean; left?; top?; width?; height?` | `image/png` |

```ts
export type StreamWindowSummary = {
  total_records: number;
  existing_before_start: number;
  captured_since_start: number;
  active_from: string | null;
};

export type StreamRecordPreview = {
  id: string;                  // run_screenshots.screenshot_id
  run_id: string | null;       // run_screenshots.run_id is NULLable
  hero: string | null;         // run_screenshots.hero_name
  captured_at: string;         // captured_at_local
  captured_at_utc: string;
  wins: number | null;         // victories_at_capture
  battle_count: number | null;
  rank: string | null;         // player_rank
  rating: number | null;       // player_rating
  strip_url: string | null;    // e.g. '/images/{screenshot_id}/strip' (relative)
};
```

Image rule:

- `StreamRecordPreview.strip_url` is relative (e.g. `/images/snap-1/strip`); React composes it with `StreamSession.base_url`.
- No React DTO exposes a full image path/URL for rendering.
- The full-image endpoint `/images/{record_id}` is removed from the React contract. Keep it internally **only** if `/overlay` or `/settings` HTML actually references it (verify during the strip-backend epic); otherwise delete it.

### History Interfaces

| Interface | Method | Purpose | Request | Response |
| --- | --- | --- | --- | --- |
| `list_history_runs` | Tauri invoke | Run-list summary + rows | `{ game_path?: string; limit: number; cursor?: string }` | `HistoryRunList` |
| `get_history_run_detail` | Tauri invoke | One run summary + battle ledger | `{ game_path?: string; run_id: string }` | `HistoryRunDetail` |
| `reveal_run_screenshot` | Tauri invoke | Reveal run screenshot in Finder/Explorer | `{ game_path?: string; run_id: string }` | `FileActionResult` |
| `reveal_battle_video` | Tauri invoke | Reveal a battle replay video | `{ game_path?: string; battle_id: string; video_id?: string }` | `FileActionResult` |
| `delete_battle_video` | Tauri invoke | Delete one completed battle video (file + SQLite row), return refreshed detail | `{ game_path?: string; battle_id: string; video_id: string }` | `HistoryRunDetail` |
| `delete_run_videos` | Tauri invoke | Delete all completed videos for a run (list-row action), return refreshed list page | `{ game_path?: string; run_id: string; limit: number; cursor?: string }` | `HistoryRunList` |

```ts
export type RunResult = 'win' | 'loss' | 'in_progress' | 'abandoned' | 'unknown';
export type BattleResult = 'win' | 'loss' | 'unknown';
export type VideoStatus = 'COMPLETED' | 'RECORDING' | 'FAILED'; // schema stores UPPERCASE

export type HistoryRunList = {
  summary: {
    runs: number;
    videos: number;               // COMPLETED videos across all runs
    last_run_at_utc: string | null;
    win_rate: number | null;      // see derivation; null when there are no completed runs
  };
  runs: HistoryRunRow[];
  next_cursor: string | null;
};

export type HistoryRunRow = {
  run_id: string;
  hero: string;
  game_mode: string;
  started_at_utc: string;
  ended_at_utc: string | null;
  last_seen_at_utc: string;
  result: RunResult;              // derived backend-side
  victories: number | null;
  losses: number | null;
  final_day: number | null;
  final_player_rank: string | null;
  final_player_rating: number | null;
  screenshot_id: string | null;   // run_screenshots.screenshot_id (primary)
  strip_url: string | null;       // '/images/{screenshot_id}/strip', relative
  video_count: number;            // COMPLETED videos for this run
};

export type HistoryRunDetail = {
  run: HistoryRunRow & {
    player_name: string | null;   // sourced from battles.player_name (local player); NOT a runs column
    status: string;               // raw runs.status ('completed' | 'abandoned' | in-progress states)
    final_hour: number | null;
  };
  battles: HistoryBattleRow[];
};

export type HistoryBattleRow = {
  battle_id: string;
  day: number | null;
  hour: number | null;
  result: BattleResult;           // mapped from battles.result ('Win'/'Won' -> win, 'Loss'/'Lost' -> loss)
  opponent_hero: string | null;
  opponent_name: string | null;   // schema column is opponent_name (the opponent player)
  opponent_rank: string | null;
  opponent_rating: number | null;
  video: { video_id: string; status: VideoStatus; file_size_bytes: number | null; duration_ms: number | null } | null;
};
```

History image rule:

- Run list and run detail display a run strip using `strip_url`, resolved through `StreamSession.base_url`.
- If the local image service is not running, the History/RunDetail hooks call `ensure_stream_session({ reason: 'history' })` (never `restart_stream_session`) to obtain `base_url`, then compose URLs. No stream-control UI is shown.

## Interface Difference Comparison

### New Interfaces

- `get_app_bootstrap`, `get_install_state`, `choose_game_directory`, `install_mod`, `launch_game`
- `ensure_stream_session`, `restart_stream_session`, `set_stream_window`, `get_overlay_settings`, `apply_overlay_crop_code`, `reset_overlay_crop`
- `list_history_runs`, `get_history_run_detail`, `reveal_run_screenshot`, `reveal_battle_video`, `delete_battle_video`, `delete_run_videos`
- HTTP `/api/stream/window-summary`, `/api/stream/records/latest`, `/api/stream/records`

### Removed From React Contract

- `start_stream_service` / `stop_stream_service` as page-level public actions (stop stays internal for tray/app quit).
- `list_stream_overlay_records`, `reveal_stream_record_image`, `delete_stream_record` (old screenshot-library actions).
- `detect_stream_db_path` as a separate frontend call (folded into the session payload).
- HTTP `/api/records/summary`, `/api/records/latest`, `/api/records/list` (renamed under `/api/stream/*`).
- `OverlayRecord.image_path` / `image_url` for React rendering, and any full-image URL usage in React.

### Modified Interfaces

| Old | New | Change |
| --- | --- | --- |
| `initialize_installer_context` + `detect_environment` + `detect_steam_running` | `get_install_state` | Combined into one install-page snapshot. |
| `install_bepinex` + `patch_launch_options` | `install_mod` | One product action owns install + launch-option patching. |
| `uninstall_bpp` | `uninstall_mod` | Rename; returns `InstallState`. |
| `repair_bpp` (+ `get_legacy_record_directory_info`) | `repair_mod` | Rename; returns `InstallState`; subsumes legacy-record recovery. |
| `set_tray_locale` | `set_app_locale` | Locale change updates UI state and tray labels in one command. |
| `start_stream_service` + `stop_stream_service` | `ensure_stream_session` (start path) + internal stop | Route-enter is idempotent start, not destructive restart. |
| *(no old equivalent)* | `restart_stream_session` | New explicit hard restart for the manual retry button. |
| `get_stream_service_status` | `get_stream_session` | Adds DB status and window summary. |
| `set_stream_overlay_window_offset` | `set_stream_window` | Same behavior, product naming. |
| `get_stream_overlay_crop_settings` | `get_overlay_settings` | Rename. |
| `save_stream_overlay_display_mode` | `save_overlay_display_mode` | Rename; returns `OverlaySettingsPayload`. |
| `import_stream_overlay_crop_code` | `apply_overlay_crop_code` | Rename; returns normalized settings. |
| `/api/records/{summary,latest,list}` | `/api/stream/window-summary`, `/api/stream/records/latest`, `/api/stream/records` | Renamed. |
| `/images/{record_id}` | not in React contract | Full image rendering removed; keep internal only if a page needs it. |
| `/images/{record_id}/strip` | unchanged | The only React preview image source. |

### Flow Differences

Old flow: user manually starts the stream service; frontend separately asks status, DB path, crop settings, summary, records; stream page can show a screenshot library; record DTO carries a full local image path + URL.

New flow:

1. The service auto-starts when the app starts (`ensure_stream_session({ reason: 'app_start' })`), per spec.
2. Entering `/stream` calls `ensure_stream_session({ reason: 'route_enter' })` — reuses a healthy session, starts one if needed; never tears down a live session.
3. The manual `重启服务` button calls `restart_stream_session({ reason: 'manual' })`.
4. React renders status, OBS URL, DB status, window metadata, and overlay config from one typed `StreamSession`.
5. React preview images use only `base_url + strip_url`.
6. The stream page contains overlay control only; History owns the run list and run detail; History obtains `base_url` via `ensure_stream_session`.

## Backend Interface Inventory After Replacement

| Backend surface | Final name/path | Status | Notes |
| --- | --- | --- | --- |
| App bootstrap | `get_app_bootstrap` | New | Replaces scattered version/about/link reads. |
| Locale | `set_app_locale` | Modify | Replaces `set_tray_locale`; returns normalized locale. |
| Updater | Tauri updater plugin | Keep | Wire into the React shell header. |
| Install snapshot | `get_install_state` | New | Replaces `initialize_installer_context` + `detect_environment` + `detect_steam_running`. |
| Game directory picker | `choose_game_directory` | New | Wraps the Tauri dialog plugin. |
| Install | `install_mod` | Modify | Combines `install_bepinex` + `patch_launch_options`; returns state. |
| Repair | `repair_mod` | Modify | Returns `InstallState`; absorbs legacy-record recovery. |
| Uninstall | `uninstall_mod` | Modify | Returns `InstallState`. |
| Launch | `launch_game` | New | Launch URL behavior behind a backend action. |
| Steam close | `close_steam` | Keep | Used by the install modal. |
| Stream ensure | `ensure_stream_session` | New | Idempotent start; route-enter + history + app-start. |
| Stream restart | `restart_stream_session` | New | Explicit hard restart for manual retry. |
| Stream read | `get_stream_session` | Modify | Replaces `get_stream_service_status`; adds DB + summary. |
| Stream stop | internal `stop_stream_session` | Internal | Tray quit / app shutdown only; not a page action. |
| Stream window | `set_stream_window` | Modify | Replaces `set_stream_overlay_window_offset`. |
| Overlay settings read | `get_overlay_settings` | Modify | Rename. |
| Overlay display mode | `save_overlay_display_mode` | Modify | Rename of `save_stream_overlay_display_mode`. |
| Overlay crop apply | `apply_overlay_crop_code` | Modify | Rename of `import_stream_overlay_crop_code`. |
| Overlay crop reset | `reset_overlay_crop` | New | Required by Prototype `恢复默认裁切`. |
| History list | `list_history_runs` | New | Query `runs` + primary screenshot + completed-video count. |
| Run detail | `get_history_run_detail` | New | Query `runs` + `battles` + latest completed video + local player name. |
| Reveal screenshot | `reveal_run_screenshot` | New | File action only. |
| Reveal video | `reveal_battle_video` | New | File action only. |
| Delete video | `delete_battle_video` | New | Delete MP4 + remove `combat_replay_videos` row (see DB-ownership note). |
| Delete run videos | `delete_run_videos` | New | List-row bulk delete. |
| HTTP health/pages/assets | `/health`, `/overlay`, `/settings`, `/assets/*` | Keep | Preserve asset routes the pages depend on. |
| Stream summary/latest/list | `/api/stream/window-summary`, `/api/stream/records/latest`, `/api/stream/records` | Modify | Renamed from `/api/records/*`. |
| Overlay crop config | `GET/POST /api/overlay/crop-config` | Keep | Used by calibration page. |
| Strip image | `GET /images/{record_id}/strip` | Keep | Only React preview image endpoint (already implemented). |
| Full image | `GET /images/{record_id}` | Remove from React contract | Delete unless a page references it. |

## Behavior Change Analysis

### Added

- React global shell with persistent header + rail.
- App-start auto-start of the overlay service; idempotent `ensure` on `/stream` entry and on History entry.
- Manual hard-restart button as the retry path.
- History run list and run-detail battle ledger.
- Per-battle / per-run video reveal + delete actions.
- Header support popover; About payload aligned with React/Tauri.

### Removed

- Svelte/Subview Lite frontend runtime.
- Install-page stream-mode toggle.
- Manual-only stream start flow and any destructive route-enter restart.
- Stream-page screenshot-history library.
- Full-image rendering in the frontend.
- Old screenshot-record mental model for history; battle screenshots and embedded video preview from run detail.
- Old page-level support-bar duplication.

### Changed

- Stream page state starts from an idempotent ensure (not a restart).
- Image preview source is the local-service strip only.
- Install status is one backend snapshot.
- History is run-centric, backed by SQLite.
- Backend command names become product use-case names.
- Frontend DTOs no longer carry local full-image paths.

## SQL And Data Requirements

Required SQLite tables (others are out of scope — note `battle_snapshots` is **not** needed because the run detail shows no card art and opponent fields live on `battles`):

- `runs`, `battles`, `run_screenshots`, `combat_replay_videos`

Authoritative column facts (from `RunLogSchema.cs`, schema v13) — use these names exactly:

- `runs`: `run_id`, `started_at_utc`, `last_seen_at_utc`, `status`, `completed`, `hero`, `game_mode`, `ended_at_utc`, `final_day`, `final_hour`, **`victories`**, `losses`, **`final_player_rank`**, **`final_player_rating`**, `final_player_rating_delta`. There is **no** `player_name`, `wins`, `final_rank`, or `final_rating` column.
- `battles`: `battle_id`, `source` (`'LOCAL'`/`'GHOST'`), `run_id`, `recorded_at_utc`, `day`, `hour`, `player_name`, `player_hero`, `opponent_hero`, **`opponent_name`**, `opponent_rank`, `opponent_rating`, `result` (values `'Win'`/`'Won'`/`'Loss'`/`'Lost'`), `deleted_at_utc` (soft-delete). There is **no** `opponent_player_name` column.
- `run_screenshots`: `screenshot_id` (PK / the record id), `run_id` (NULLable), `hero_name`, `capture_source` (constant `'end_of_run_auto'` available as `RunLogSchema.CaptureSourceEndOfRunAuto`), `is_primary`, `image_relative_path` (relative, not absolute), `captured_at_utc`, `captured_at_local`, `player_rank`, `player_rating`, `victories_at_capture`.
- `combat_replay_videos`: `video_id` (PK), `battle_id`, `video_relative_path`, `started_at_utc`, `duration_ms`, `file_size_bytes`, `status` (UPPERCASE `'COMPLETED'`/`'RECORDING'`/`'FAILED'`).

Indexes that already exist (do **not** add new ones to the mod's DB):

- `idx_run_screenshots_primary_run` — `UNIQUE (run_id) WHERE is_primary = 1` → at most one primary screenshot per run; backs the primary-screenshot lookup.
- `idx_run_screenshots_run_id_captured_at_utc` — `(run_id, captured_at_utc DESC)` → backs the latest-`end_of_run_auto` fallback.
- `idx_combat_replay_videos_battle` — `(battle_id, started_at_utc DESC)` → backs the latest-completed-video-per-battle lookup.
- `idx_battles_run_id_recorded` — `(run_id, recorded_at_utc DESC)` → backs the run-detail battle ordering.
- `idx_runs_started_at_utc`, `idx_runs_status_last_seen` on `runs`.

Run-list query shape (mirrors `HistoryPanelRepository.ListRecentRuns`):

```sql
SELECT
  r.run_id, r.hero, r.game_mode,
  r.started_at_utc, r.ended_at_utc, r.last_seen_at_utc,
  r.status, r.victories, r.losses,
  r.final_day, r.final_player_rank, r.final_player_rating,
  ps.screenshot_id,
  COALESCE(vc.video_count, 0) AS video_count
FROM runs r
LEFT JOIN run_screenshots ps
  ON ps.run_id = r.run_id AND ps.is_primary = 1            -- unique-index-backed primary
LEFT JOIN (
  SELECT b.run_id, COUNT(*) AS video_count
  FROM combat_replay_videos cv
  JOIN battles b ON b.battle_id = cv.battle_id
  WHERE cv.status = 'COMPLETED' AND b.deleted_at_utc IS NULL
  GROUP BY b.run_id
) vc ON vc.run_id = r.run_id
ORDER BY COALESCE(r.ended_at_utc, r.last_seen_at_utc, r.started_at_utc) DESC, r.run_id DESC
LIMIT $limit;
```

- Primary-screenshot fallback: when `ps.screenshot_id` is NULL, optionally resolve the latest `capture_source = 'end_of_run_auto'` row for that run via `idx_run_screenshots_run_id_captured_at_utc`.
- `strip_url` is built as `'/images/' || screenshot_id || '/strip'` (relative).

Summary query shape:

```sql
SELECT
  COUNT(*) AS runs,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_runs,
  SUM(CASE WHEN status = 'completed' AND COALESCE(victories, 0) >= 10 THEN 1 ELSE 0 END) AS win_runs,
  MAX(COALESCE(ended_at_utc, last_seen_at_utc, started_at_utc)) AS last_run_at_utc
FROM runs;
-- videos: SELECT COUNT(*) FROM combat_replay_videos WHERE status = 'COMPLETED';
-- win_rate = completed_runs > 0 ? (win_runs / completed_runs) : null
```

Run-detail query shape:

```sql
-- 1. run row: SELECT <run cols> FROM runs WHERE run_id = $runId;
-- 2. local player name (no runs column; pull from a battle):
SELECT player_name FROM battles
  WHERE run_id = $runId AND source = 'LOCAL' AND player_name IS NOT NULL
  ORDER BY recorded_at_utc DESC LIMIT 1;
-- 3. primary screenshot: SELECT screenshot_id FROM run_screenshots
--      WHERE run_id = $runId AND is_primary = 1 LIMIT 1;   (fallback: latest end_of_run_auto)
-- 4. battles + latest completed video per battle:
SELECT
  b.battle_id, b.day, b.hour, b.result,
  b.opponent_hero, b.opponent_name, b.opponent_rank, b.opponent_rating,
  cv.video_id, cv.status, cv.file_size_bytes, cv.duration_ms
FROM battles b
LEFT JOIN combat_replay_videos cv ON cv.video_id = (
  SELECT video_id FROM combat_replay_videos
  WHERE battle_id = b.battle_id AND status = 'COMPLETED'
  ORDER BY started_at_utc DESC LIMIT 1
)
WHERE b.run_id = $runId AND b.source = 'LOCAL' AND b.deleted_at_utc IS NULL
ORDER BY b.recorded_at_utc DESC, b.battle_id DESC;
```

Derivation rules (mirror `HistoryPanelFormatter`):

- **Run `result`:** `in_progress` if `status NOT IN ('completed','abandoned')`; `abandoned` if `status = 'abandoned'`; if `status = 'completed'` then `win` when `COALESCE(victories,0) >= 10`, else `loss`; otherwise `unknown`.
- **Battle `result`:** `'Win'`/`'Won'` → `win`; `'Loss'`/`'Lost'` → `loss`; anything else (including NULL) → `unknown`.
- **Video `status`:** pass through the UPPERCASE value; the UI maps presence-of-`COMPLETED` to the "打开视频位置" vs "无视频" states.

Performance notes:

- The run-list `ORDER BY COALESCE(ended_at_utc, last_seen_at_utc, started_at_utc) DESC` has **no covering index** (SQLite can't index that expression here). This matches the mod's existing query, which accepts a scan+sort at personal-DB sizes (hundreds–low-thousands of runs). Accept it; do not add an index to the mod's DB. If it ever matters, propose the index in `RunLogSchema.cs`.
- Battle ordering and latest-video lookups are index-backed (see indexes above).
- Do not join `battle_snapshots` (card JSON) for either query.

DB-ownership notes (cross-process):

- The game/mod may hold this SQLite file open while running. Open with appropriate busy-timeout/WAL handling; treat write contention as expected and surface a friendly error rather than crashing.
- `delete_battle_video` / `delete_run_videos` perform the only installer writes: delete the MP4 (resolve `video_relative_path` against the data dir) and delete the matching `combat_replay_videos` row(s). Do not touch `battles`/`runs`. Confirm during implementation that the mod's uploader does not require the row to persist after the local file is gone; if it does, prefer marking the row instead of deleting it.
- Be defensive about schema drift: if a column the query expects is missing (older mod), fail soft for that field rather than erroring the whole page.

## File Structure Plan

### React App

- `src/main.tsx` — React entry point.
- `src/App.tsx` — routes `/`, `/history`, `/history/:runId`, `/stream`, `/about`.
- `src/layouts/GlobalShell.tsx` — productionized shell.
- `src/pages/{Install,History,RunDetail,Stream,About}.tsx` — copied from Prototype, wired to hooks.
- `src/styles/index.css` — Tailwind + Prototype theme.
- `src/api/tauri.ts` — typed `invoke` wrapper; `src/api/http.ts` — typed local-HTTP helper.
- `src/features/install/{installApi.ts,useInstallPage.ts}`
- `src/features/stream/{streamApi.ts,useStreamPage.ts}`
- `src/features/history/{historyApi.ts,useHistoryPage.ts,useRunDetailPage.ts}`
- `src/features/about/aboutApi.ts`
- `src/types/generated/` — **generated** TS DTOs (target dir for `generate:bindings`); `src/types/backend.ts` is a barrel re-export of generated types (no hand-authored DTO shapes).

### Removed Frontend Files (after the React replacement compiles)

- `src/routes/`, `src/lib/components/**/*.svelte`
- `src/lib/installer/**/*.ts` and `src/lib/stream/**/*.ts` that only serve old Svelte controllers/selectors
- `svelte.config.js`; SvelteKit deps from `package.json`

Keep or convert: framework-neutral storage helpers (persisted game path) and updater helper logic can be rewritten as plain React utilities.

### Rust Backend

- `src-tauri/src/lib.rs` — register new command names; remove deleted ones.
- `src-tauri/src/commands/app.rs` (new) — bootstrap + locale.
- `src-tauri/src/commands/install.rs` (new) and `src-tauri/src/commands/bepinex/mod.rs` (modify) — install use-case commands.
- `src-tauri/src/commands/stream.rs` (modify) — `ensure`/`restart`/`get` session + overlay commands.
- `src-tauri/src/commands/history.rs` (new) — history list/detail/file/delete commands.
- `src-tauri/src/stream/{state.rs,server.rs}` (modify) — represent ensure vs restart; atomic restart entry point; keep idempotent start.
- `src-tauri/src/stream/http.rs` (modify) — rename `/api/records/*` → `/api/stream/*`; keep `/assets/*`, `/overlay`, `/settings`, strip; enforce no-`image_path` preview contract.
- `src-tauri/src/stream/records/{mapper.rs,mod.rs}` (modify) — preview DTOs without `image_path`/`image_url`.
- `src-tauri/src/history/{mod.rs,repo.rs,mapper.rs}` (new) — run list/detail query + projection modules.

### Build Configuration

- `package.json` — replace SvelteKit scripts/deps with React/Vite; keep `generate:bindings`, `test:rust`, `test:unit`, `prebuild-check`, `tauri`. Point `dev`/`build`/`check` at the React app (drop `svelte-kit sync`, `svelte-check`).
- `vite.config.js` → `vite.config.ts` — `@vitejs/plugin-react` + Tailwind plugin (mirror the prototype's config).
- `tsconfig.json` — React JSX.
- `scripts/generate-bindings.mjs` — change `TS_RS_EXPORT_DIR` to `src/types/generated/`; otherwise unchanged (still `cargo test export_bindings`).
- Keep `src-tauri/` packaging + updater config. Do not introduce a second app build chain.

## Replacement Task Checklist

### P0: Contract Freeze

**Files:** this plan; `src/types/generated/` (generated); Rust DTOs under `src-tauri/src/`.

- [ ] Confirm final command names against the inventory above.
- [ ] **Verify every History/RunDetail/Stream DTO field name against `RunLogSchema.cs` DDL** (`victories`, `final_player_rank`, `final_player_rating`, `opponent_name`, `screenshot_id`, UPPERCASE video status; no `player_name` on `runs`).
- [ ] Confirm no React DTO includes a full image path/URL for display.
- [ ] Confirm `/stream` route-enter uses `ensure_stream_session` (idempotent), and only the manual button uses `restart_stream_session`. Confirm this matches the spec's auto-start model; if the spec needs a one-line wording update, raise it.
- [ ] Confirm the `/assets/*`, `/overlay`, `/settings` routes are preserved and only `/api/records/*` is renamed.
- [ ] Confirm a single TS DTO source of truth (generated via `ts-rs`), with `src/types/backend.ts` as a re-export barrel.
- [ ] Confirm Svelte compatibility is not a goal.

### P0: React Root Replacement

**Files:** `src/main.tsx`, `src/App.tsx`, `src/layouts/GlobalShell.tsx`, `src/styles/index.css`, `package.json`, `vite.config.ts`, `tsconfig.json`.

- [ ] Copy the Prototype shell + route structure into root `src/`.
- [ ] Replace Prototype `MemoryRouter` with production React Router routes.
- [ ] Replace SvelteKit build/dev/check scripts with React/Vite equivalents; keep `generate:bindings` in `dev`/`build`.
- [ ] Keep Tauri dev/build pointed at the root Vite app.
- [ ] `npm install`; then `npm run build` and fix TS/Vite errors.

### P0: Typed API Layer

**Files:** `src/api/tauri.ts`, `src/api/http.ts`, `src/types/backend.ts`, `scripts/generate-bindings.mjs`.

- [ ] Single typed `invokeCommand` helper with a command map for every final Tauri command.
- [ ] Local-HTTP helper for stream-service calls; central `strip_url = base_url + relative` composition.
- [ ] Normalize backend errors into route-friendly messages.
- [ ] Point `generate:bindings` at `src/types/generated/`; re-export from `backend.ts`.
- [ ] Vitest coverage for URL composition (especially strip image URLs); `npm run test:unit`.

### P0: Stream Backend Session Contract

**Files:** `src-tauri/src/commands/stream.rs`, `src-tauri/src/stream/{server,state}.rs`, `src-tauri/src/lib.rs`.

- [ ] Implement `ensure_stream_session` (idempotent: reuse healthy session with no window reset / no teardown; start if not running).
- [ ] Implement `restart_stream_session` (stop existing task before re-binding the port; reset `active_window_offset` to 0).
- [ ] Both resolve DB path + include `db` status and `window` summary; populate `base_url`, `overlay_url`, `settings_url`.
- [ ] Keep internal stop for tray quit / app quit; keep existing port-conflict reporting.
- [ ] Rust tests: ensure-reuse leaves window untouched; restart resets window; port-conflict surfaces an error. `npm run test:rust`.

### P0: Stream React Page

**Files:** `src/features/stream/{streamApi.ts,useStreamPage.ts}`, `src/pages/Stream.tsx`.

- [ ] On mount call `ensure_stream_session({ reason: 'route_enter' })`; loading state in the status row; error state in the main card.
- [ ] Wire `打开预览页`→`overlay_url`, `打开校准页`→`settings_url`, `重启服务`→`restart_stream_session({ reason: 'manual' })`.
- [ ] Wire display mode → `save_overlay_display_mode`; crop apply → `apply_overlay_crop_code`; reset → `reset_overlay_crop`; window earlier/later/current → `set_stream_window`.
- [ ] Verify no screenshot-history component appears.

### P0: Strip Image Backend (refactor + rename)

**Files:** `src-tauri/src/stream/http.rs`, `src-tauri/src/stream/records/{mapper.rs,mod.rs}`.

- [ ] Keep `GET /images/{record_id}/strip` (already implemented) as the preview endpoint; keep `image/png` + appropriate cache headers; keep existing crop cache + invalidation.
- [ ] Remove `image_path`/`image_url` from React-facing preview DTOs (`StreamRecordPreview`).
- [ ] Rename `/api/records/*` → `/api/stream/*`; leave `/assets/*`, `/overlay`, `/settings` intact.
- [ ] Decide `/images/{record_id}` (full): delete unless `/overlay` or `/settings` HTML references it; if kept, ensure React never calls it.
- [ ] Rust tests for strip URL DTO + crop endpoint. `npm run test:rust`.

### P1: Install Page Backend And React Wiring

**Files:** `src/features/install/{installApi.ts,useInstallPage.ts}`, `src/pages/Install.tsx`, `src-tauri/src/commands/{install.rs,bepinex/mod.rs}`.

- [ ] Implement `get_install_state` (folds `initialize_installer_context` + `detect_environment` + `detect_steam_running`).
- [ ] Implement `install_mod` / `repair_mod` / `uninstall_mod` (return refreshed `InstallState`) and `launch_game`.
- [ ] Replace Prototype `setTimeout` fake progress with real action state; preserve modal shape + acknowledgment behavior.
- [ ] Verify the install page operates with no stream-UI coupling.

### P1: History Backend

**Files:** `src-tauri/src/commands/history.rs`, `src-tauri/src/history/{mod,repo,mapper}.rs`, `src-tauri/src/lib.rs`.

- [ ] Implement `list_history_runs` with the run-list + summary queries above (bounded `limit`; cursor optional).
- [ ] Attach primary screenshot (`is_primary = 1`, fallback latest `end_of_run_auto`) and completed-video count.
- [ ] Return `strip_url` (relative) and `screenshot_id`; never a full image path.
- [ ] Apply the run-`result` derivation rule.
- [ ] Rust tests against a temporary SQLite DB seeded with the real schema (in-progress / abandoned / completed-win / completed-loss runs). `npm run test:rust`.

### P1: History React Page

**Files:** `src/features/history/{historyApi.ts,useHistoryPage.ts}`, `src/pages/History.tsx`.

- [ ] On mount call `ensure_stream_session({ reason: 'history' })` to get `base_url`; then `list_history_runs`.
- [ ] Render summary cards + run rows from backend; compose strip previews via `base_url + strip_url`.
- [ ] Empty state when no runs; row click → `/history/:runId`; delete-videos → `delete_run_videos`.
- [ ] Confirm no screenshot-record filter panel exists.

### P1: Run Detail Backend

**Files:** `src-tauri/src/commands/history.rs`, `src-tauri/src/history/{repo,mapper}.rs`.

- [ ] Implement `get_history_run_detail` (run row + local player name from battles + primary screenshot + battle ledger with latest completed video per battle).
- [ ] Implement `reveal_run_screenshot`, `reveal_battle_video`, `delete_battle_video` (file + row; honor DB-ownership notes).
- [ ] Filter battles `source = 'LOCAL' AND deleted_at_utc IS NULL`; order `recorded_at_utc DESC, battle_id DESC`; do not load card JSON.
- [ ] Apply the battle-`result` mapping; pass through UPPERCASE video status.
- [ ] Rust tests for completed / missing / failed video rows. `npm run test:rust`.

### P1: Run Detail React Page

**Files:** `src/features/history/useRunDetailPage.ts`, `src/pages/RunDetail.tsx`.

- [ ] Replace static detail with `get_history_run_detail`; render summary + strip.
- [ ] Wire `打开截图位置`→`reveal_run_screenshot`; battle video button→`reveal_battle_video`; `无视频` for battles with no completed video.
- [ ] Keep no inline player and no battle screenshot preview.

### P2: About, Header, Support, Locale, Updater

**Files:** `src/features/about/aboutApi.ts`, `src/layouts/GlobalShell.tsx`, `src/pages/About.tsx`, `src-tauri/src/commands/app.rs`, `src-tauri/src/lib.rs`.

- [ ] Implement `get_app_bootstrap` + `set_app_locale`.
- [ ] Wire header update check → Tauri updater plugin; support popover links from bootstrap; locale toggle → `set_app_locale`.
- [ ] Replace Prototype QR mock with the production asset if available; update About dependency list to React/Tauri/Tailwind.

### P2: Delete Old Svelte Surface

**Files:** `src/routes/`, obsolete `src/lib/**` Svelte files, `svelte.config.js`, `package.json`, SvelteKit-dependency tests.

- [ ] Remove SvelteKit/Svelte deps + Svelte-only tests; keep backend tests + build/release scripts.
- [ ] `rg -n "svelte|SvelteKit|\.svelte" src package.json scripts docs`; ensure remaining mentions are docs/history or intentionally updated.

### P2: Verification

- [ ] `npm run generate:bindings`, `npm run test:rust`, `npm run test:unit`, `npm run build`, `npm run tauri dev`.
- [ ] Install page with a real/debug game path.
- [ ] `/stream` entry reuses a healthy session (no flicker), starts one when absent; repeated entry leaves no stale ports.
- [ ] React never displays a full image URL; strip previews load from the live local backend.
- [ ] OBS `/overlay` and `/settings` still load (assets intact).
- [ ] History list + run detail against a local DB seeded with the real schema.

### P3: Release Validation

**Files:** `build.sh`, `scripts/prebuild-check.mjs`, `src-tauri/tauri.*.conf.json`.

- [ ] `npm run prebuild-check` when Tauri config / packaged resources change.
- [ ] `./build.sh` for a local smoke; `./build.sh --prod` only for release validation.
- [ ] Confirm updater metadata matches app version; confirm installer resources are still packaged.

## Acceptance Criteria

The authoritative acceptance list is the **Definition of Done** in the [Goal](#goal) section. The plan is complete when every checkbox there passes; treat the per-epic checklists above as the work that gets each of those boxes to green.

## Key Risks

- **History needs the image service.** Resolved by `ensure_stream_session({ reason: 'history' })`; verify it never disrupts an active stream (it must not restart or reset the window).
- **DB is the mod's.** Cross-process reads/writes against a possibly-open SQLite file; handle busy/locked gracefully; never migrate or index the mod's schema from the installer; be defensive about column drift.
- **Renames are atomic.** Renaming Tauri commands + HTTP routes requires regenerating TS bindings and updating `invoke` registration in the same change; stale generated bindings must be regenerated before trusting DTO shape.
- **Run-list ordering scans.** The `COALESCE(...)` order-by is unindexed by design; acceptable at personal-DB sizes (matches the mod). Revisit only with evidence, and only in `RunLogSchema.cs`.
- **Video deletion semantics.** Confirm the mod's uploader tolerates a deleted `combat_replay_videos` row before choosing delete-row vs mark-status.

## Non-Goals

- Preserve the old Svelte route structure or the old manual start/stop UX.
- Show full screenshots in React, add battle screenshots, or add inline video playback.
- Keep old endpoint paths for frontend compatibility.
- Build a generic media server beyond local overlay + strip preview needs.
- Add or alter tables/indexes in the mod's SQLite schema.
