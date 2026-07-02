# Storage Cleanup (End-of-run Snapshots + Run Data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an installer-side storage cleanup feature that deletes end-of-run screenshots (Phase 1) and full run data (Phase 2) from the mod-owned `bazaarplusplus.db` + on-disk files, with three presets: clean all / clean older than 7 days / keep only the current month.

**Architecture:** A new `src-tauri/src/history/cleanup.rs` repo module implements plan (dry-run) + execute for both scopes, reusing the existing delete-video precedent (files first, then rows in short transactions). A cleanup-specific write connection enables `PRAGMA foreign_keys = ON` so the mod schema's `ON DELETE CASCADE` chains fire. The UI is a "Storage Cleanup" card on the History page with preset buttons, a preview-count confirm modal, and a post-cleanup refresh.

**Tech Stack:** Rust (rusqlite, chrono, ts-rs), Tauri 2 commands, React + TypeScript frontend, vitest/cargo test.

## Global Constraints

- **Never `DELETE FROM battles` directly.** Ghost battles share the `battles` table (`source='GHOST'`, `run_id NULL`). Run data is deleted only via `DELETE FROM runs` + FK cascade.
- **All cleanup DB writes go through `open_cleanup_connection`** (write connection + `PRAGMA foreign_keys = ON`). The plain `open_write_connection` does NOT cascade — using it would orphan child rows.
- **Rows and files are deleted together**, files first then rows within the same chunk (mirrors `delete_battle_video` in `src-tauri/src/history/repo.rs:117-137`). Deleting only files would mark pending BazaarDB uploads `permanent_failure` (mod `BazaarDbSnapshotUploadService.cs:147-150`) and leave broken History thumbnails.
- **Upload-safety gates (never delete un-uploaded data):**
  - Screenshots with `bazaardb_snapshot_uploads.status = 'pending'` are skipped.
  - Runs are skipped when `run_sync_state.dirty = 1 AND runs.completed = 1 AND runs.game_mode = 'Ranked'` (only these ever upload, mod `RunBundleUploadStore.cs:34-49`), or any of the run's battles has `replay_dirty = 1`, or any of the run's screenshots has a pending upload.
- **File paths resolve via `resolve_cleanup_file_path`** which rejects absolute paths and strips traversal segments. Never delete a path taken verbatim from the DB.
- **Presets and wire strings are exactly:** `all`, `older_than_7_days`, `before_this_month`. "Before this month" means: keep everything captured in the current local calendar month.
- **Timestamp comparisons in SQL always wrap both sides in `datetime()`** — stored timestamps mix `Z` and `+00:00` suffix styles.
- Every new i18n key is added to BOTH `zh` and `en` objects in `src/i18n/messages.ts` (en is compile-time-checked against zh).
- Every new Tauri command requires: `#[tauri::command]` fn, a line in `with_commands!` in `src-tauri/src/commands/registry.rs`, bumping the count assert in that file's test, a `TauriCommandMap` entry in `src/api/tauri.ts`, and `npm run check` to regenerate bindings.
- Verification commands: `cargo test --manifest-path src-tauri/Cargo.toml <filter>` for Rust, `npm run check` for TS/bindings, `npx vitest run <file>` for frontend tests. Do NOT run `./build.sh --prod`.
- Cleanup may run while the game is open: the DB is WAL, both sides use a 2s busy_timeout, and the mod uses short per-operation connections. Chunked short transactions keep write locks brief. On `SQLITE_BUSY` the command returns an `Err(String)` shown in the UI error banner; the operation is idempotent and can be retried.

---

# Phase 1 — End-of-run screenshot cleanup

### Task 1: Cleanup presets and cutoff computation

**Files:**
- Create: `src-tauri/src/history/cleanup.rs`
- Modify: `src-tauri/src/history/mod.rs`

**Interfaces:**
- Produces: `CleanupPreset` enum (wire: `"all" | "older_than_7_days" | "before_this_month"`), `CleanupCutoff { utc: String, local_date: NaiveDate }`, `CleanupCutoff::for_preset<Tz: TimeZone>(preset, now: DateTime<Tz>) -> Option<CleanupCutoff>` (None means "no cutoff, delete everything eligible").

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/history/cleanup.rs` with only the test module first:

```rust
#[cfg(test)]
mod tests {
    use super::{CleanupCutoff, CleanupPreset};
    use chrono::{FixedOffset, NaiveDate, TimeZone};

    #[test]
    fn cutoff_for_all_preset_is_none() {
        let tz = FixedOffset::east_opt(8 * 3600).unwrap();
        let now = tz.with_ymd_and_hms(2026, 7, 15, 10, 0, 0).unwrap();
        assert!(CleanupCutoff::for_preset(CleanupPreset::All, now).is_none());
    }

    #[test]
    fn cutoff_older_than_7_days_subtracts_from_now() {
        let tz = FixedOffset::east_opt(8 * 3600).unwrap();
        let now = tz.with_ymd_and_hms(2026, 7, 15, 10, 0, 0).unwrap();
        let cutoff = CleanupCutoff::for_preset(CleanupPreset::OlderThan7Days, now).unwrap();
        assert_eq!(cutoff.utc, "2026-07-08T02:00:00Z");
        assert_eq!(cutoff.local_date, NaiveDate::from_ymd_opt(2026, 7, 8).unwrap());
    }

    #[test]
    fn cutoff_before_this_month_is_local_month_start_in_utc() {
        let tz = FixedOffset::east_opt(8 * 3600).unwrap();
        let now = tz.with_ymd_and_hms(2026, 7, 15, 10, 0, 0).unwrap();
        let cutoff = CleanupCutoff::for_preset(CleanupPreset::BeforeThisMonth, now).unwrap();
        // Local 2026-07-01T00:00:00+08:00 == 2026-06-30T16:00:00Z
        assert_eq!(cutoff.utc, "2026-06-30T16:00:00Z");
        assert_eq!(cutoff.local_date, NaiveDate::from_ymd_opt(2026, 7, 1).unwrap());
    }
}
```

Add `pub mod cleanup;` to `src-tauri/src/history/mod.rs` (after `pub mod dto;` alphabetically: between `dto` and `files`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml history::cleanup`
Expected: FAIL to compile with "cannot find type `CleanupCutoff`".

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/history/cleanup.rs` (above the test module):

```rust
use chrono::{DateTime, Datelike, Duration, NaiveDate, SecondsFormat, TimeZone, Utc};

/// Wire strings are a stable contract with the frontend preset buttons.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize, ts_rs::TS)]
#[ts(export)]
pub enum CleanupPreset {
    #[serde(rename = "all")]
    All,
    #[serde(rename = "older_than_7_days")]
    OlderThan7Days,
    #[serde(rename = "before_this_month")]
    BeforeThisMonth,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CleanupCutoff {
    /// RFC3339 UTC instant; SQL compares via datetime() on both sides.
    pub utc: String,
    /// Local calendar date of the cutoff; used for dated-folder orphan sweeps
    /// (folder names come from captured_at_local).
    pub local_date: NaiveDate,
}

impl CleanupCutoff {
    pub fn for_preset<Tz: TimeZone>(preset: CleanupPreset, now: DateTime<Tz>) -> Option<CleanupCutoff> {
        let instant = match preset {
            CleanupPreset::All => return None,
            CleanupPreset::OlderThan7Days => now.clone() - Duration::days(7),
            CleanupPreset::BeforeThisMonth => {
                let month_start = now
                    .date_naive()
                    .with_day(1)
                    .expect("day 1 is always a valid day")
                    .and_hms_opt(0, 0, 0)
                    .expect("midnight is always a valid time");
                now.timezone().from_local_datetime(&month_start).earliest()?
            }
        };
        Some(CleanupCutoff {
            utc: instant
                .with_timezone(&Utc)
                .to_rfc3339_opts(SecondsFormat::Secs, true),
            local_date: instant.date_naive(),
        })
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml history::cleanup`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/history/cleanup.rs src-tauri/src/history/mod.rs
git commit -m "Add cleanup presets and cutoff computation"
```

---

### Task 2: Cleanup write connection and strict file-path resolver

**Files:**
- Modify: `src-tauri/src/history/queries.rs` (add `open_cleanup_connection` after `open_write_connection`, `src-tauri/src/history/queries.rs:37-43`)
- Modify: `src-tauri/src/history/files.rs` (add `resolve_cleanup_file_path`)

**Interfaces:**
- Consumes: `open_write_connection(database_path: &Path) -> Result<Connection, String>` (existing).
- Produces: `open_cleanup_connection(database_path: &Path) -> Result<Connection, String>` (write connection with `PRAGMA foreign_keys = ON`); `resolve_cleanup_file_path(root_dir: &Path, raw_path: &str) -> Option<PathBuf>` (returns `None` for empty/absolute paths, otherwise the traversal-safe join used by `resolve_data_file_path`).

- [ ] **Step 1: Write the failing tests**

Append to the existing `#[cfg(test)] mod tests` in `src-tauri/src/history/queries.rs`:

```rust
    #[test]
    fn cleanup_connection_enables_foreign_key_cascade() {
        let temp_dir = tempfile::tempdir().unwrap();
        let database_path = temp_dir.path().join("bazaarplusplus.db");
        {
            let conn = rusqlite::Connection::open(&database_path).unwrap();
            conn.execute_batch(
                "create table parents (id text primary key);
                 create table children (
                     id text primary key,
                     parent_id text not null,
                     foreign key (parent_id) references parents(id) on delete cascade
                 );
                 insert into parents values ('p1');
                 insert into children values ('c1', 'p1');",
            )
            .unwrap();
        }

        let conn = super::open_cleanup_connection(&database_path).unwrap();
        conn.execute("delete from parents where id = 'p1'", []).unwrap();

        let remaining: i64 = conn
            .query_row("select count(*) from children", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining, 0, "cascade must fire on the cleanup connection");
    }
```

Create a new test module at the bottom of `src-tauri/src/history/files.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::resolve_cleanup_file_path;

    #[test]
    fn cleanup_path_rejects_absolute_paths() {
        let root = std::path::Path::new("root");
        // is_absolute() is platform-specific: "/x" is not absolute on Windows.
        let absolute = if cfg!(windows) {
            r"C:\evil\shot.png"
        } else {
            "/evil/shot.png"
        };
        assert_eq!(resolve_cleanup_file_path(root, absolute), None);
        assert_eq!(resolve_cleanup_file_path(root, ""), None);
        assert_eq!(resolve_cleanup_file_path(root, "   "), None);
    }

    #[test]
    fn cleanup_path_normalizes_separators_and_strips_traversal() {
        let root = std::path::Path::new("root");
        assert_eq!(
            resolve_cleanup_file_path(root, "2026-06-15\\shot.png"),
            Some(root.join("2026-06-15").join("shot.png"))
        );
        assert_eq!(
            resolve_cleanup_file_path(root, "../../2026-06-15/shot.png"),
            Some(root.join("2026-06-15").join("shot.png"))
        );
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml history::queries history::files`
Expected: FAIL to compile with "cannot find function `open_cleanup_connection`" / "`resolve_cleanup_file_path`".

- [ ] **Step 3: Write the implementations**

In `src-tauri/src/history/queries.rs`, directly after `open_write_connection`:

```rust
/// Write connection for cleanup operations. Unlike `open_write_connection`,
/// this enables per-connection foreign-key enforcement so the mod schema's
/// ON DELETE CASCADE chains (runs -> run_events/battles/run_sync_state,
/// run_screenshots -> bazaardb_snapshot_uploads) fire on our deletes.
pub fn open_cleanup_connection(database_path: &Path) -> Result<Connection, String> {
    let conn = open_write_connection(database_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|err| err.to_string())?;
    Ok(conn)
}
```

In `src-tauri/src/history/files.rs`, after `resolve_data_file_path`:

```rust
/// Resolver for delete operations: unlike `resolve_screenshot_path`, absolute
/// paths stored in the DB are refused so a malformed row can never point a
/// deletion outside the data directory.
pub fn resolve_cleanup_file_path(root_dir: &Path, raw_path: &str) -> Option<PathBuf> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() || PathBuf::from(trimmed).is_absolute() {
        return None;
    }
    resolve_data_file_path(root_dir, trimmed)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml history::queries history::files`
Expected: PASS (new tests plus existing ones).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/history/queries.rs src-tauri/src/history/files.rs
git commit -m "Add FK-enabled cleanup connection and strict cleanup path resolver"
```

---

### Task 3: Screenshot cleanup planning (eligibility, pending gate, orphan scan)

**Files:**
- Modify: `src-tauri/src/history/cleanup.rs`

**Interfaces:**
- Consumes: `open_connection`, `table_exists` from `crate::history::queries`; `resolve_cleanup_file_path` from `crate::history::files`; `crate::services::paths::screenshots_dir`.
- Produces:
  - `ScreenshotCleanupItem { screenshot_id: String, image_relative_path: String }`
  - `ScreenshotCleanupPlan { items: Vec<ScreenshotCleanupItem>, orphan_files: Vec<PathBuf>, upload_cache_files: Vec<PathBuf>, estimated_bytes: i64, skipped_pending_uploads: i64 }` with `to_preview(&self) -> ScreenshotCleanupPreview`
  - `ScreenshotCleanupPreview { screenshots: i64, orphan_files: i64, estimated_bytes: i64, skipped_pending_uploads: i64 }` (ts-rs exported)
  - `plan_screenshot_cleanup(database_path: &Path, game_path: &Path, cutoff: Option<&CleanupCutoff>) -> Result<ScreenshotCleanupPlan, String>`

- [ ] **Step 1: Write the failing tests**

Replace the test module in `src-tauri/src/history/cleanup.rs` with (keeps the Task 1 tests, adds a schema helper reused by every later task):

```rust
#[cfg(test)]
mod tests {
    use super::{plan_screenshot_cleanup, CleanupCutoff, CleanupPreset};
    use chrono::{FixedOffset, NaiveDate, TimeZone};

    // -- Task 1 tests (unchanged) ------------------------------------------

    #[test]
    fn cutoff_for_all_preset_is_none() {
        let tz = FixedOffset::east_opt(8 * 3600).unwrap();
        let now = tz.with_ymd_and_hms(2026, 7, 15, 10, 0, 0).unwrap();
        assert!(CleanupCutoff::for_preset(CleanupPreset::All, now).is_none());
    }

    #[test]
    fn cutoff_older_than_7_days_subtracts_from_now() {
        let tz = FixedOffset::east_opt(8 * 3600).unwrap();
        let now = tz.with_ymd_and_hms(2026, 7, 15, 10, 0, 0).unwrap();
        let cutoff = CleanupCutoff::for_preset(CleanupPreset::OlderThan7Days, now).unwrap();
        assert_eq!(cutoff.utc, "2026-07-08T02:00:00Z");
        assert_eq!(cutoff.local_date, NaiveDate::from_ymd_opt(2026, 7, 8).unwrap());
    }

    #[test]
    fn cutoff_before_this_month_is_local_month_start_in_utc() {
        let tz = FixedOffset::east_opt(8 * 3600).unwrap();
        let now = tz.with_ymd_and_hms(2026, 7, 15, 10, 0, 0).unwrap();
        let cutoff = CleanupCutoff::for_preset(CleanupPreset::BeforeThisMonth, now).unwrap();
        assert_eq!(cutoff.utc, "2026-06-30T16:00:00Z");
        assert_eq!(cutoff.local_date, NaiveDate::from_ymd_opt(2026, 7, 1).unwrap());
    }

    // -- Shared fixtures ----------------------------------------------------

    /// Mirrors the mod's RunLogSchema BootstrapSql for the tables and FK
    /// relationships cleanup touches (subset of columns).
    pub(super) fn create_cleanup_schema(conn: &rusqlite::Connection) {
        conn.execute_batch(
            "
            pragma foreign_keys = on;
            create table runs (
                run_id text primary key,
                started_at_utc text not null,
                last_seen_at_utc text not null,
                status text not null,
                completed integer not null default 0,
                hero text not null,
                game_mode text not null,
                ended_at_utc text null
            );
            create table run_events (
                run_id text not null,
                seq integer not null,
                ts_utc text not null,
                kind text not null,
                payload_json text not null,
                primary key (run_id, seq),
                foreign key (run_id) references runs(run_id) on delete cascade
            );
            create table battles (
                battle_id text primary key,
                source text not null,
                run_id text null,
                recorded_at_utc text not null,
                replay_dirty integer not null default 0,
                deleted_at_utc text null,
                foreign key (run_id) references runs(run_id) on delete cascade,
                check ((source = 'LOCAL') or (source = 'GHOST' and run_id is null))
            );
            create table battle_snapshots (
                battle_id text primary key,
                player_hand_json text not null,
                foreign key (battle_id) references battles(battle_id) on delete cascade
            );
            create table run_sync_state (
                run_id text primary key,
                dirty integer not null,
                uploaded_seq integer null,
                foreign key (run_id) references runs(run_id) on delete cascade
            );
            create table run_screenshots (
                screenshot_id text primary key,
                run_id text null,
                hero_name text null,
                capture_source text not null,
                is_primary integer not null default 0,
                image_relative_path text not null,
                captured_at_utc text not null,
                captured_at_local text not null
            );
            create table bazaardb_snapshot_uploads (
                snapshot_id text primary key,
                status text not null,
                uploaded_at_utc text null,
                foreign key (snapshot_id) references run_screenshots(screenshot_id) on delete cascade
            );
            create table combat_replay_videos (
                video_id text primary key,
                battle_id text not null,
                video_relative_path text not null,
                started_at_utc text not null,
                file_size_bytes integer null,
                status text not null
            );
            ",
        )
        .unwrap();
    }

    pub(super) struct CleanupFixture {
        pub temp_dir: tempfile::TempDir,
        pub game_path: std::path::PathBuf,
        pub database_path: std::path::PathBuf,
        pub screenshots_dir: std::path::PathBuf,
    }

    pub(super) fn create_fixture() -> CleanupFixture {
        let temp_dir = tempfile::tempdir().unwrap();
        let game_path = temp_dir.path().to_path_buf();
        let data_dir = game_path.join("BazaarPlusPlusV4");
        let screenshots_dir = data_dir.join("Screenshots");
        std::fs::create_dir_all(&screenshots_dir).unwrap();
        let database_path = data_dir.join("bazaarplusplus.db");
        let conn = rusqlite::Connection::open(&database_path).unwrap();
        create_cleanup_schema(&conn);
        CleanupFixture {
            temp_dir,
            game_path,
            database_path,
            screenshots_dir,
        }
    }

    pub(super) fn write_screenshot_file(
        screenshots_dir: &std::path::Path,
        relative: &str,
        bytes: &[u8],
    ) -> std::path::PathBuf {
        let path = screenshots_dir.join(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, bytes).unwrap();
        path
    }

    fn cutoff(utc: &str, local_date: (i32, u32, u32)) -> CleanupCutoff {
        CleanupCutoff {
            utc: utc.to_string(),
            local_date: NaiveDate::from_ymd_opt(local_date.0, local_date.1, local_date.2).unwrap(),
        }
    }

    // -- Task 3 tests ---------------------------------------------------------

    #[test]
    fn plan_selects_old_screenshots_and_skips_pending_uploads() {
        let fixture = create_fixture();
        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        conn.execute_batch(
            "
            insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path,
                captured_at_utc, captured_at_local
            ) values
                ('shot-old', 'run-1', 'end_of_run_auto', '2026-06-15/old.png',
                 '2026-06-15T10:00:00+00:00', '2026-06-15T18:00:00+08:00'),
                ('shot-pending', 'run-2', 'end_of_run_auto', '2026-06-16/pending.png',
                 '2026-06-16T10:00:00Z', '2026-06-16T18:00:00+08:00'),
                ('shot-new', 'run-3', 'end_of_run_auto', '2026-07-02/new.png',
                 '2026-07-02T10:00:00Z', '2026-07-02T18:00:00+08:00');
            insert into bazaardb_snapshot_uploads (snapshot_id, status) values
                ('shot-old', 'uploaded'),
                ('shot-pending', 'pending');
            ",
        )
        .unwrap();
        drop(conn);
        write_screenshot_file(&fixture.screenshots_dir, "2026-06-15/old.png", b"12345");

        let plan = plan_screenshot_cleanup(
            &fixture.database_path,
            &fixture.game_path,
            Some(&cutoff("2026-07-01T00:00:00Z", (2026, 7, 1))),
        )
        .unwrap();

        let ids: Vec<&str> = plan.items.iter().map(|item| item.screenshot_id.as_str()).collect();
        assert_eq!(ids, vec!["shot-old"], "pending upload and this-month rows must survive");
        assert_eq!(plan.skipped_pending_uploads, 1);
        assert_eq!(plan.estimated_bytes, 5);
    }

    #[test]
    fn plan_detects_orphan_files_only_in_qualifying_dated_folders() {
        let fixture = create_fixture();
        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        conn.execute_batch(
            "
            insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path,
                captured_at_utc, captured_at_local
            ) values
                ('shot-kept', 'run-1', 'end_of_run_auto', '2026-06-15\\kept.png',
                 '2026-07-02T10:00:00Z', '2026-07-02T18:00:00+08:00');
            ",
        )
        .unwrap();
        drop(conn);
        // Referenced by a row (with a Windows separator) -> not an orphan.
        write_screenshot_file(&fixture.screenshots_dir, "2026-06-15/kept.png", b"k");
        // Unreferenced in an old dated folder -> orphan.
        let orphan = write_screenshot_file(&fixture.screenshots_dir, "2026-06-15/orphan.png", b"o");
        // Unreferenced but in a current-month folder -> kept (folder date >= cutoff local date).
        write_screenshot_file(&fixture.screenshots_dir, "2026-07-02/recent-orphan.png", b"r");
        // UploadCache copy whose id no longer exists in the db -> swept.
        let stale_cache =
            write_screenshot_file(&fixture.screenshots_dir, "UploadCache/shot-gone.png", b"c");
        // UploadCache copy for a surviving screenshot -> kept.
        write_screenshot_file(&fixture.screenshots_dir, "UploadCache/shot-kept.jpg", b"c2");

        let plan = plan_screenshot_cleanup(
            &fixture.database_path,
            &fixture.game_path,
            Some(&cutoff("2026-07-01T00:00:00Z", (2026, 7, 1))),
        )
        .unwrap();

        assert_eq!(plan.items.len(), 0, "the kept screenshot is newer than the cutoff");
        assert_eq!(plan.orphan_files, vec![orphan]);
        assert_eq!(plan.upload_cache_files, vec![stale_cache]);
    }

    #[test]
    fn plan_on_missing_database_is_empty() {
        let temp_dir = tempfile::tempdir().unwrap();
        let plan = plan_screenshot_cleanup(
            &temp_dir.path().join("BazaarPlusPlusV4/bazaarplusplus.db"),
            temp_dir.path(),
            None,
        )
        .unwrap();
        assert!(plan.items.is_empty());
        assert!(plan.orphan_files.is_empty());
        assert_eq!(plan.estimated_bytes, 0);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml history::cleanup`
Expected: FAIL to compile with "cannot find function `plan_screenshot_cleanup`".

- [ ] **Step 3: Write the implementation**

Add to `src-tauri/src/history/cleanup.rs` (below the `CleanupCutoff` impl, above the tests). Also extend the `use` block at the top of the file:

```rust
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};

use crate::history::files::resolve_cleanup_file_path;
use crate::history::queries::{open_connection, table_exists};
```

```rust
const UPLOAD_CACHE_DIRECTORY: &str = "UploadCache";

pub struct ScreenshotCleanupItem {
    pub screenshot_id: String,
    pub image_relative_path: String,
}

pub struct ScreenshotCleanupPlan {
    pub items: Vec<ScreenshotCleanupItem>,
    pub orphan_files: Vec<PathBuf>,
    pub upload_cache_files: Vec<PathBuf>,
    pub estimated_bytes: i64,
    pub skipped_pending_uploads: i64,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct ScreenshotCleanupPreview {
    pub screenshots: i64,
    pub orphan_files: i64,
    pub estimated_bytes: i64,
    pub skipped_pending_uploads: i64,
}

impl ScreenshotCleanupPlan {
    fn empty() -> ScreenshotCleanupPlan {
        ScreenshotCleanupPlan {
            items: Vec::new(),
            orphan_files: Vec::new(),
            upload_cache_files: Vec::new(),
            estimated_bytes: 0,
            skipped_pending_uploads: 0,
        }
    }

    pub fn to_preview(&self) -> ScreenshotCleanupPreview {
        ScreenshotCleanupPreview {
            screenshots: self.items.len() as i64,
            orphan_files: (self.orphan_files.len() + self.upload_cache_files.len()) as i64,
            estimated_bytes: self.estimated_bytes,
            skipped_pending_uploads: self.skipped_pending_uploads,
        }
    }
}

pub fn plan_screenshot_cleanup(
    database_path: &Path,
    game_path: &Path,
    cutoff: Option<&CleanupCutoff>,
) -> Result<ScreenshotCleanupPlan, String> {
    if !database_path.exists() {
        return Ok(ScreenshotCleanupPlan::empty());
    }
    let conn = open_connection(database_path)?;
    if !table_exists(&conn, "run_screenshots")? {
        return Ok(ScreenshotCleanupPlan::empty());
    }

    let has_uploads_table = table_exists(&conn, "bazaardb_snapshot_uploads")?;
    let cutoff_utc = cutoff.map(|value| value.utc.as_str());
    let items = eligible_screenshots(&conn, has_uploads_table, cutoff_utc)?;
    let skipped_pending_uploads = if has_uploads_table {
        pending_upload_count(&conn, cutoff_utc)?
    } else {
        0
    };

    let screenshots_dir = crate::services::paths::screenshots_dir(game_path);
    let referenced = all_screenshot_relative_paths(&conn)?;
    let orphan_files = scan_orphan_screenshot_files(
        &screenshots_dir,
        &referenced,
        cutoff.map(|value| value.local_date),
    );
    let keep_ids = remaining_screenshot_ids(&conn, &items)?;
    let upload_cache_files =
        scan_upload_cache_files(&screenshots_dir.join(UPLOAD_CACHE_DIRECTORY), &keep_ids);

    let mut estimated_bytes = 0i64;
    for item in &items {
        if let Some(path) = resolve_cleanup_file_path(&screenshots_dir, &item.image_relative_path) {
            estimated_bytes += file_size(&path);
        }
    }
    for path in orphan_files.iter().chain(upload_cache_files.iter()) {
        estimated_bytes += file_size(path);
    }

    Ok(ScreenshotCleanupPlan {
        items,
        orphan_files,
        upload_cache_files,
        estimated_bytes,
        skipped_pending_uploads,
    })
}

fn eligible_screenshots(
    conn: &Connection,
    has_uploads_table: bool,
    cutoff_utc: Option<&str>,
) -> Result<Vec<ScreenshotCleanupItem>, String> {
    let sql = if has_uploads_table {
        "
        select s.screenshot_id, s.image_relative_path
        from run_screenshots s
        left join bazaardb_snapshot_uploads u on u.snapshot_id = s.screenshot_id
        where s.capture_source = 'end_of_run_auto'
          and coalesce(u.status, '') <> 'pending'
          and (?1 is null or datetime(s.captured_at_utc) < datetime(?1))
        order by s.captured_at_utc asc, s.screenshot_id asc
        "
    } else {
        "
        select s.screenshot_id, s.image_relative_path
        from run_screenshots s
        where s.capture_source = 'end_of_run_auto'
          and (?1 is null or datetime(s.captured_at_utc) < datetime(?1))
        order by s.captured_at_utc asc, s.screenshot_id asc
        "
    };
    let mut stmt = conn.prepare(sql).map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![cutoff_utc], |row| {
            Ok(ScreenshotCleanupItem {
                screenshot_id: row.get(0)?,
                image_relative_path: row.get(1)?,
            })
        })
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())
}

fn pending_upload_count(conn: &Connection, cutoff_utc: Option<&str>) -> Result<i64, String> {
    conn.query_row(
        "
        select count(*)
        from run_screenshots s
        join bazaardb_snapshot_uploads u on u.snapshot_id = s.screenshot_id
        where s.capture_source = 'end_of_run_auto'
          and u.status = 'pending'
          and (?1 is null or datetime(s.captured_at_utc) < datetime(?1))
        ",
        params![cutoff_utc],
        |row| row.get(0),
    )
    .map_err(|err| err.to_string())
}

fn all_screenshot_relative_paths(conn: &Connection) -> Result<HashSet<String>, String> {
    let mut stmt = conn
        .prepare("select image_relative_path from run_screenshots")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|err| err.to_string())?;
    let mut set = HashSet::new();
    for row in rows {
        set.insert(normalize_relative_path(&row.map_err(|err| err.to_string())?));
    }
    Ok(set)
}

/// Normalizes both '/' and '\\' separators (the mod stores the OS-native one)
/// so on-disk paths can be compared against DB rows.
fn normalize_relative_path(raw: &str) -> String {
    raw.trim()
        .split(['/', '\\'])
        .map(str::trim)
        .filter(|segment| !segment.is_empty() && *segment != "." && *segment != "..")
        .collect::<Vec<_>>()
        .join("/")
}

fn scan_orphan_screenshot_files(
    screenshots_dir: &Path,
    referenced: &HashSet<String>,
    cutoff_local_date: Option<NaiveDate>,
) -> Vec<PathBuf> {
    let mut orphans = Vec::new();
    let Ok(entries) = std::fs::read_dir(screenshots_dir) else {
        return orphans;
    };
    for entry in entries.flatten() {
        let folder_path = entry.path();
        if !folder_path.is_dir() {
            continue;
        }
        let folder_name = entry.file_name().to_string_lossy().into_owned();
        // Only dated capture folders are swept; UploadCache and anything else
        // the user placed here is left alone.
        let Ok(folder_date) = NaiveDate::parse_from_str(&folder_name, "%Y-%m-%d") else {
            continue;
        };
        if let Some(cutoff_date) = cutoff_local_date {
            if folder_date >= cutoff_date {
                continue;
            }
        }
        let Ok(files) = std::fs::read_dir(&folder_path) else {
            continue;
        };
        for file in files.flatten() {
            let file_path = file.path();
            if !file_path.is_file() {
                continue;
            }
            let relative = format!("{folder_name}/{}", file.file_name().to_string_lossy());
            if !referenced.contains(&relative) {
                orphans.push(file_path);
            }
        }
    }
    orphans.sort();
    orphans
}

fn remaining_screenshot_ids(
    conn: &Connection,
    deleting: &[ScreenshotCleanupItem],
) -> Result<HashSet<String>, String> {
    let mut stmt = conn
        .prepare("select screenshot_id from run_screenshots")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|err| err.to_string())?;
    let mut ids = HashSet::new();
    for row in rows {
        ids.insert(row.map_err(|err| err.to_string())?);
    }
    for item in deleting {
        ids.remove(&item.screenshot_id);
    }
    Ok(ids)
}

/// UploadCache holds resized upload copies named `<screenshot_id>.png|.jpg`;
/// they are regenerable caches, so any copy without a surviving row is swept.
fn scan_upload_cache_files(upload_cache_dir: &Path, keep_ids: &HashSet<String>) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let Ok(entries) = std::fs::read_dir(upload_cache_dir) else {
        return files;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let stem = path
            .file_stem()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_default();
        if !keep_ids.contains(&stem) {
            files.push(path);
        }
    }
    files.sort();
    files
}

fn file_size(path: &Path) -> i64 {
    std::fs::metadata(path)
        .map(|meta| meta.len() as i64)
        .unwrap_or(0)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml history::cleanup`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/history/cleanup.rs
git commit -m "Add screenshot cleanup planning with upload gate and orphan scan"
```

---

### Task 4: Screenshot cleanup execution

**Files:**
- Modify: `src-tauri/src/history/cleanup.rs`

**Interfaces:**
- Consumes: `plan_screenshot_cleanup`, `open_cleanup_connection`, `resolve_cleanup_file_path`.
- Produces: `ScreenshotCleanupResult { deleted_rows: i64, deleted_files: i64, freed_bytes: i64, skipped_pending_uploads: i64 }` (ts-rs exported); `execute_screenshot_cleanup(database_path: &Path, game_path: &Path, cutoff: Option<&CleanupCutoff>) -> Result<ScreenshotCleanupResult, String>`.

- [ ] **Step 1: Write the failing test**

Append to the test module in `src-tauri/src/history/cleanup.rs`:

```rust
    #[test]
    fn execute_deletes_rows_files_orphans_and_cascades_upload_records() {
        let fixture = create_fixture();
        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        conn.execute_batch(
            "
            insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path,
                captured_at_utc, captured_at_local
            ) values
                ('shot-old', 'run-1', 'end_of_run_auto', '2026-06-15/old.png',
                 '2026-06-15T10:00:00Z', '2026-06-15T18:00:00+08:00'),
                ('shot-pending', 'run-2', 'end_of_run_auto', '2026-06-16/pending.png',
                 '2026-06-16T10:00:00Z', '2026-06-16T18:00:00+08:00');
            insert into bazaardb_snapshot_uploads (snapshot_id, status) values
                ('shot-old', 'uploaded'),
                ('shot-pending', 'pending');
            ",
        )
        .unwrap();
        drop(conn);
        let old_file =
            write_screenshot_file(&fixture.screenshots_dir, "2026-06-15/old.png", b"12345");
        let pending_file =
            write_screenshot_file(&fixture.screenshots_dir, "2026-06-16/pending.png", b"p");
        let orphan =
            write_screenshot_file(&fixture.screenshots_dir, "2026-06-14/orphan.png", b"ooo");
        let cache =
            write_screenshot_file(&fixture.screenshots_dir, "UploadCache/shot-old.png", b"cc");

        let result = super::execute_screenshot_cleanup(
            &fixture.database_path,
            &fixture.game_path,
            None, // preset "all"
        )
        .unwrap();

        assert_eq!(result.deleted_rows, 1);
        // old.png + orphan.png + UploadCache/shot-old.png
        assert_eq!(result.deleted_files, 3);
        assert_eq!(result.freed_bytes, 5 + 3 + 2);
        assert_eq!(result.skipped_pending_uploads, 1);

        assert!(!old_file.exists());
        assert!(!orphan.exists());
        assert!(!cache.exists());
        assert!(pending_file.exists(), "pending upload must survive");
        // Emptied dated folders are removed; the pending one stays.
        assert!(!fixture.screenshots_dir.join("2026-06-15").exists());
        assert!(!fixture.screenshots_dir.join("2026-06-14").exists());
        assert!(fixture.screenshots_dir.join("2026-06-16").exists());

        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        let rows: i64 = conn
            .query_row("select count(*) from run_screenshots", [], |row| row.get(0))
            .unwrap();
        assert_eq!(rows, 1);
        let uploads: i64 = conn
            .query_row("select count(*) from bazaardb_snapshot_uploads", [], |row| row.get(0))
            .unwrap();
        assert_eq!(uploads, 1, "cascade must remove the deleted screenshot's upload row");
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml history::cleanup`
Expected: FAIL to compile with "cannot find function `execute_screenshot_cleanup`".

- [ ] **Step 3: Write the implementation**

Add to `src-tauri/src/history/cleanup.rs` (extend the queries import with `open_cleanup_connection`):

```rust
use crate::history::queries::{open_cleanup_connection, open_connection, table_exists};
```

```rust
const CLEANUP_CHUNK_SIZE: usize = 200;

#[derive(Clone, Debug, PartialEq, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct ScreenshotCleanupResult {
    pub deleted_rows: i64,
    pub deleted_files: i64,
    pub freed_bytes: i64,
    pub skipped_pending_uploads: i64,
}

pub fn execute_screenshot_cleanup(
    database_path: &Path,
    game_path: &Path,
    cutoff: Option<&CleanupCutoff>,
) -> Result<ScreenshotCleanupResult, String> {
    let plan = plan_screenshot_cleanup(database_path, game_path, cutoff)?;
    let screenshots_dir = crate::services::paths::screenshots_dir(game_path);
    let mut deleted_rows = 0i64;
    let mut deleted_files = 0i64;
    let mut freed_bytes = 0i64;

    if !plan.items.is_empty() {
        let mut conn = open_cleanup_connection(database_path)?;
        for chunk in plan.items.chunks(CLEANUP_CHUNK_SIZE) {
            // Files first, then rows, mirroring the delete-video precedent:
            // a crash in between leaves a row whose 404 is handled by every
            // consumer, never a file that a fresh row can no longer describe.
            for item in chunk {
                if let Some(path) =
                    resolve_cleanup_file_path(&screenshots_dir, &item.image_relative_path)
                {
                    freed_bytes += file_size(&path);
                    if remove_file_if_exists(&path)? {
                        deleted_files += 1;
                    }
                }
            }
            let transaction = conn.transaction().map_err(|err| err.to_string())?;
            for item in chunk {
                deleted_rows += transaction
                    .execute(
                        "delete from run_screenshots where screenshot_id = ?1",
                        [&item.screenshot_id],
                    )
                    .map_err(|err| err.to_string())? as i64;
            }
            transaction.commit().map_err(|err| err.to_string())?;
        }
    }

    for path in plan.orphan_files.iter().chain(plan.upload_cache_files.iter()) {
        freed_bytes += file_size(path);
        if remove_file_if_exists(path)? {
            deleted_files += 1;
        }
    }

    remove_empty_dated_directories(&screenshots_dir);

    Ok(ScreenshotCleanupResult {
        deleted_rows,
        deleted_files,
        freed_bytes,
        skipped_pending_uploads: plan.skipped_pending_uploads,
    })
}

fn remove_file_if_exists(path: &Path) -> Result<bool, String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(err) => Err(format!("failed to remove {}: {err}", path.display())),
    }
}

fn remove_empty_dated_directories(screenshots_dir: &Path) {
    let Ok(entries) = std::fs::read_dir(screenshots_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if NaiveDate::parse_from_str(&name, "%Y-%m-%d").is_err() {
            continue;
        }
        let is_empty = std::fs::read_dir(&path)
            .map(|mut dir| dir.next().is_none())
            .unwrap_or(false);
        if is_empty {
            let _ = std::fs::remove_dir(&path);
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml history::cleanup`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/history/cleanup.rs
git commit -m "Add screenshot cleanup execution with chunked transactions"
```

---

### Task 5: Screenshot cleanup service + Tauri commands + registry

**Files:**
- Modify: `src-tauri/src/services/history.rs`
- Modify: `src-tauri/src/commands/history.rs`
- Modify: `src-tauri/src/commands/registry.rs`

**Interfaces:**
- Consumes: `plan_screenshot_cleanup`, `execute_screenshot_cleanup`, `CleanupCutoff`, `CleanupPreset`, `ScreenshotCleanupPreview`, `ScreenshotCleanupResult` from `crate::history::cleanup`; `require_history_paths` (existing).
- Produces: Tauri commands `preview_screenshot_cleanup` and `execute_screenshot_cleanup`, both taking `{ gamePath?: string, preset: CleanupPreset }`.

- [ ] **Step 1: Add service functions**

In `src-tauri/src/services/history.rs`, add below `delete_run_videos`:

```rust
pub fn preview_screenshot_cleanup(
    paths: &HistoryPaths,
    preset: crate::history::cleanup::CleanupPreset,
) -> Result<crate::history::cleanup::ScreenshotCleanupPreview, String> {
    let cutoff =
        crate::history::cleanup::CleanupCutoff::for_preset(preset, chrono::Local::now());
    let plan = crate::history::cleanup::plan_screenshot_cleanup(
        &paths.database_path,
        &paths.game_path,
        cutoff.as_ref(),
    )?;
    Ok(plan.to_preview())
}

pub fn execute_screenshot_cleanup(
    paths: &HistoryPaths,
    preset: crate::history::cleanup::CleanupPreset,
) -> Result<crate::history::cleanup::ScreenshotCleanupResult, String> {
    let cutoff =
        crate::history::cleanup::CleanupCutoff::for_preset(preset, chrono::Local::now());
    crate::history::cleanup::execute_screenshot_cleanup(
        &paths.database_path,
        &paths.game_path,
        cutoff.as_ref(),
    )
}
```

- [ ] **Step 2: Add Tauri commands**

In `src-tauri/src/commands/history.rs`, extend the service import list with the two new functions (aliased) and append:

```rust
use crate::services::history::{
    execute_screenshot_cleanup as execute_screenshot_cleanup_service,
    preview_screenshot_cleanup as preview_screenshot_cleanup_service,
    // ...existing imports stay...
};

#[tauri::command]
pub fn preview_screenshot_cleanup(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    preset: crate::history::cleanup::CleanupPreset,
) -> Result<crate::history::cleanup::ScreenshotCleanupPreview, String> {
    let paths = require_history_paths(&app, state.get_game_path(), game_path)?;
    preview_screenshot_cleanup_service(&paths, preset)
}

#[tauri::command]
pub fn execute_screenshot_cleanup(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    preset: crate::history::cleanup::CleanupPreset,
) -> Result<crate::history::cleanup::ScreenshotCleanupResult, String> {
    let paths = require_history_paths(&app, state.get_game_path(), game_path)?;
    execute_screenshot_cleanup_service(&paths, preset)
}
```

- [ ] **Step 3: Register the commands**

In `src-tauri/src/commands/registry.rs`, extend the `with_commands!` list after `(commands::history, delete_run_videos)`:

```rust
            (commands::history, delete_run_videos),
            (commands::history, preview_screenshot_cleanup),
            (commands::history, execute_screenshot_cleanup)
```

In the same file's test, change `assert_eq!(names.len(), 23);` to `assert_eq!(names.len(), 25);`.

- [ ] **Step 4: Run the Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, including `tauri_command_names_match_with_commands_list`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/services/history.rs src-tauri/src/commands/history.rs src-tauri/src/commands/registry.rs
git commit -m "Expose screenshot cleanup preview and execute commands"
```

---

### Task 6: Frontend bindings, API wrappers, byte formatter, i18n strings

**Files:**
- Modify: `src/api/tauri.ts`
- Modify: `src/features/history/historyApi.ts`
- Modify: `src/features/history/format.ts`
- Modify: `src/i18n/messages.ts`
- Generated (by `npm run check`): `src/types/generated/**`

**Interfaces:**
- Consumes: generated types `CleanupPreset`, `ScreenshotCleanupPreview`, `ScreenshotCleanupResult` (re-exported through `src/types/backend.ts`, which is `export type * from './generated'`).
- Produces: `previewScreenshotCleanup(preset)`, `executeScreenshotCleanup(preset)` API wrappers (return `null` without Tauri runtime); `formatBytes(bytes: number): string`; i18n keys listed below.

- [ ] **Step 1: Regenerate bindings**

Run: `npm run check`
Expected: bindings for `CleanupPreset`, `ScreenshotCleanupPreview`, `ScreenshotCleanupResult` appear under `src/types/generated/bindings/`, and `tauri-command-names.ts` includes the two new command names. tsc passes (no consumers yet).

- [ ] **Step 2: Add TauriCommandMap entries**

In `src/api/tauri.ts`, extend the type import list with `CleanupPreset`, `ScreenshotCleanupPreview`, `ScreenshotCleanupResult`, and append to `TauriCommandMap` after `delete_run_videos`:

```ts
  preview_screenshot_cleanup: {
    input: { gamePath?: string; preset: CleanupPreset };
    output: ScreenshotCleanupPreview;
  };
  execute_screenshot_cleanup: {
    input: { gamePath?: string; preset: CleanupPreset };
    output: ScreenshotCleanupResult;
  };
```

- [ ] **Step 3: Add API wrappers**

Append to `src/features/history/historyApi.ts`:

```ts
export async function previewScreenshotCleanup(preset: CleanupPreset) {
  if (!hasTauriRuntime()) {
    return null;
  }

  return invokeCommand('preview_screenshot_cleanup', { preset });
}

export async function executeScreenshotCleanup(preset: CleanupPreset) {
  if (!hasTauriRuntime()) {
    return null;
  }

  return invokeCommand('execute_screenshot_cleanup', { preset });
}
```

and extend the type import at the top: `import type { CleanupPreset, HistoryRunDetail, HistoryRunList } from '../../types/backend';`

- [ ] **Step 4: Add the byte formatter**

Append to `src/features/history/format.ts`:

```ts
export function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return '0 MB';
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
```

- [ ] **Step 5: Add i18n keys**

In `src/i18n/messages.ts`, add to the `zh` object (near the other History-page keys, after `deleteVideoConfirmAction`):

```ts
  // Storage cleanup (History page)
  storageCleanupTitle: '存储清理',
  storageCleanupScreenshotsLabel: '对局结算截图',
  storageCleanupPresetAll: '清理全部',
  storageCleanupPresetOlderThan7Days: '清理 7 天前',
  storageCleanupPresetBeforeThisMonth: '仅保留本月',
  storageCleanupConfirmTitle: '确认清理',
  storageCleanupScreenshotsConfirmBody:
    '将删除 {count} 张结算截图（约 {size}），删除后无法恢复。',
  storageCleanupSkippedPending: '另有 {count} 项尚未完成上传，将自动跳过。',
  storageCleanupNothingToClean: '没有符合条件的可清理数据。',
  storageCleanupConfirmAction: '确认清理',
  storageCleanupScreenshotsDone: '已删除 {files} 个文件，释放约 {size}。',
```

and the matching `en` entries:

```ts
  storageCleanupTitle: 'Storage Cleanup',
  storageCleanupScreenshotsLabel: 'End-of-run screenshots',
  storageCleanupPresetAll: 'Clean all',
  storageCleanupPresetOlderThan7Days: 'Older than 7 days',
  storageCleanupPresetBeforeThisMonth: 'Keep this month only',
  storageCleanupConfirmTitle: 'Confirm Cleanup',
  storageCleanupScreenshotsConfirmBody:
    'This will permanently delete {count} end-of-run screenshots (about {size}). This cannot be undone.',
  storageCleanupSkippedPending:
    '{count} items are still pending upload and will be skipped.',
  storageCleanupNothingToClean: 'Nothing matches the selected range.',
  storageCleanupConfirmAction: 'Clean Up',
  storageCleanupScreenshotsDone: 'Deleted {files} files, freed about {size}.',
```

- [ ] **Step 6: Verify**

Run: `npm run check && npx vitest run src/i18n/messages.test.ts`
Expected: PASS (en/zh key parity is enforced by both tsc and the test).

- [ ] **Step 7: Commit**

```bash
git add src/api/tauri.ts src/features/history/historyApi.ts src/features/history/format.ts src/i18n/messages.ts src/types/generated
git commit -m "Add screenshot cleanup frontend API, formatter, and strings"
```

---

### Task 7: Storage Cleanup card, confirm modal, and History page wiring

**Files:**
- Create: `src/features/history/useStorageCleanup.ts`
- Create: `src/features/history/CleanupConfirmModal.tsx`
- Create: `src/features/history/StorageCleanupCard.tsx`
- Modify: `src/pages/History.tsx`

**Interfaces:**
- Consumes: `previewScreenshotCleanup` / `executeScreenshotCleanup` (Task 6), `useAsyncAction` (`src/features/shared/useAsyncAction.ts:63`), `Dialog` (`src/components/ui/Dialog.tsx`), `formatBytes` (Task 6), `useI18n`.
- Produces: `<StorageCleanupCard onCompleted={...} />` rendered on the History page; cleanup completion triggers the page's existing `refresh()` so stale strip thumbnails and counts reload.

- [ ] **Step 1: Create the hook**

`src/features/history/useStorageCleanup.ts`:

```ts
import { useState } from 'react';
import type {
  CleanupPreset,
  ScreenshotCleanupPreview,
  ScreenshotCleanupResult
} from '../../types/backend';
import { useAsyncAction } from '../shared/useAsyncAction';
import {
  executeScreenshotCleanup,
  previewScreenshotCleanup
} from './historyApi';

type PendingCleanup = {
  preset: CleanupPreset;
  preview: ScreenshotCleanupPreview;
};

export function useStorageCleanup(onCompleted: () => Promise<void> | void) {
  const [pending, setPending] = useState<PendingCleanup | null>(null);
  const [result, setResult] = useState<ScreenshotCleanupResult | null>(null);
  const { busy, error, clearError, run } = useAsyncAction<'preview' | 'execute'>();

  const requestCleanup = (preset: CleanupPreset) =>
    run('preview', async () => {
      setResult(null);
      const preview = await previewScreenshotCleanup(preset);
      if (preview) {
        setPending({ preset, preview });
      }
    });

  const confirm = () => {
    const target = pending;
    if (!target) {
      return;
    }
    void run('execute', async () => {
      const outcome = await executeScreenshotCleanup(target.preset);
      setPending(null);
      if (outcome) {
        setResult(outcome);
      }
      await onCompleted();
    });
  };

  const cancel = () => setPending(null);

  return {
    pending,
    result,
    busy,
    error,
    clearError,
    requestCleanup,
    confirm,
    cancel
  };
}
```

- [ ] **Step 2: Create the confirm modal**

`src/features/history/CleanupConfirmModal.tsx` (visual pattern copied from `DeleteVideoConfirmModal.tsx`):

```tsx
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { useI18n } from '../../i18n/LocaleProvider';

export function CleanupConfirmModal({
  title,
  body,
  skippedNote,
  busy,
  confirmDisabled,
  onClose,
  onConfirm
}: {
  title: string;
  body: string;
  skippedNote: string | null;
  busy: boolean;
  confirmDisabled: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();

  return (
    <Dialog onClose={onClose} labelledBy="cleanup-confirm-modal-title">
      <div className="bg-[#0b0906] border border-[rgba(190,80,80,0.24)] rounded-[4px] shadow-[0_24px_64px_rgba(0,0,0,0.5)] w-full max-w-md mx-4 relative">
        <div className="flex justify-between items-center px-5 py-4 border-b border-[rgba(190,80,80,0.18)] bg-[rgba(160,50,50,0.06)]">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-[rgba(232,120,120,0.9)]" />
            <h2
              id="cleanup-confirm-modal-title"
              className="cinzel text-[1.1rem] text-[#f0d8d8] m-0 tracking-wider"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[rgba(232,190,190,0.72)] hover:text-[#f0d8d8] transition-colors"
            aria-label={t('close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          <p className="m-0 text-[13px] leading-relaxed text-[rgba(245,220,220,0.86)]">
            {body}
          </p>
          {skippedNote && (
            <p className="m-0 text-[12px] leading-relaxed text-[rgba(200,170,120,0.8)]">
              {skippedNote}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-[rgba(200,148,55,0.04)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.1)] transition-colors text-sm text-[#e8dcc8]"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={busy || confirmDisabled}
              onClick={onConfirm}
              className="px-5 py-2 rounded-sm text-sm cinzel font-bold tracking-wider transition-all bg-gradient-to-b from-[#d85d5d] to-[#9a2a2a] text-[#fff1f1] shadow-[0_0_15px_rgba(160,50,50,0.35)] hover:brightness-110 active:brightness-95 disabled:opacity-45 disabled:hover:brightness-100"
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  {t('storageCleanupConfirmAction')}
                </span>
              ) : (
                t('storageCleanupConfirmAction')
              )}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create the card**

`src/features/history/StorageCleanupCard.tsx`:

```tsx
import { Trash2 } from 'lucide-react';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useI18n } from '../../i18n/LocaleProvider';
import type { CleanupPreset } from '../../types/backend';
import { CleanupConfirmModal } from './CleanupConfirmModal';
import { formatBytes } from './format';
import { useStorageCleanup } from './useStorageCleanup';

const PRESETS: Array<{
  preset: CleanupPreset;
  labelKey:
    | 'storageCleanupPresetBeforeThisMonth'
    | 'storageCleanupPresetOlderThan7Days'
    | 'storageCleanupPresetAll';
}> = [
  { preset: 'before_this_month', labelKey: 'storageCleanupPresetBeforeThisMonth' },
  { preset: 'older_than_7_days', labelKey: 'storageCleanupPresetOlderThan7Days' },
  { preset: 'all', labelKey: 'storageCleanupPresetAll' }
];

export function StorageCleanupCard({
  onCompleted
}: {
  onCompleted: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const cleanup = useStorageCleanup(onCompleted);
  const pendingCount = cleanup.pending
    ? cleanup.pending.preview.screenshots + cleanup.pending.preview.orphan_files
    : 0;

  return (
    <div className="p-4 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Trash2 size={14} className="text-[rgba(200,170,120,0.8)]" />
        <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.8)] uppercase">
          {t('storageCleanupTitle')}
        </span>
      </div>

      {cleanup.error && <ErrorBanner message={cleanup.error} />}

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-[#e8dcc8]">
          {t('storageCleanupScreenshotsLabel')}
        </span>
        <div className="flex gap-2">
          {PRESETS.map(({ preset, labelKey }) => (
            <button
              key={preset}
              type="button"
              disabled={cleanup.busy}
              onClick={() => void cleanup.requestCleanup(preset)}
              className="px-3 py-1.5 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 transition-colors text-xs text-[#e8dcc8]"
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      {cleanup.result && (
        <p className="m-0 text-xs text-[rgba(200,170,120,0.8)]">
          {t('storageCleanupScreenshotsDone', {
            files: cleanup.result.deleted_files,
            size: formatBytes(cleanup.result.freed_bytes)
          })}
        </p>
      )}

      {cleanup.pending && (
        <CleanupConfirmModal
          title={t('storageCleanupConfirmTitle')}
          body={
            pendingCount === 0
              ? t('storageCleanupNothingToClean')
              : t('storageCleanupScreenshotsConfirmBody', {
                  count: pendingCount,
                  size: formatBytes(cleanup.pending.preview.estimated_bytes)
                })
          }
          skippedNote={
            cleanup.pending.preview.skipped_pending_uploads > 0
              ? t('storageCleanupSkippedPending', {
                  count: cleanup.pending.preview.skipped_pending_uploads
                })
              : null
          }
          busy={cleanup.busy}
          confirmDisabled={pendingCount === 0}
          onClose={cleanup.cancel}
          onConfirm={cleanup.confirm}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire into the History page**

In `src/pages/History.tsx`, import the card and render it between the summary grid and the run list (after the closing `</div>` of the `grid grid-cols-3` block, before `{page.error && ...}`):

```tsx
import { StorageCleanupCard } from '../features/history/StorageCleanupCard';
// ...
        <StorageCleanupCard onCompleted={page.refresh} />
```

- [ ] **Step 5: Verify**

Run: `npm run check && npm run test`
Expected: PASS (tsc, cargo tests, vitest).

Optional manual smoke: `./build.sh` (tauri dev), open History, click a preset, confirm the modal shows counts and the list refreshes after cleanup. Use port 14207 if a browser-only check is needed (buttons no-op without the Tauri runtime).

- [ ] **Step 6: Commit**

```bash
git add src/features/history/useStorageCleanup.ts src/features/history/CleanupConfirmModal.tsx src/features/history/StorageCleanupCard.tsx src/pages/History.tsx
git commit -m "Add storage cleanup card with preview confirm flow to History page"
```

---

# Phase 2 — Run data cleanup

### Task 8: Run-data cleanup planning (eligibility gates, per-run manifests)

**Files:**
- Modify: `src-tauri/src/config.rs` (add `COMBAT_REPLAYS_DIRECTORY`)
- Modify: `src-tauri/src/services/paths.rs` (add `combat_replays_dir`)
- Modify: `src-tauri/src/history/cleanup.rs`

**Interfaces:**
- Consumes: `VideoRef { video_id, relative_path }` from `crate::history::queries`; fixtures from Task 3's test module.
- Produces:
  - `paths::combat_replays_dir(game_path) -> PathBuf` (`<GameRoot>/BazaarPlusPlusV4/CombatReplays`)
  - `RunDataCleanupItem { run_id: String, battle_ids: Vec<String>, videos: Vec<VideoRef>, screenshots: Vec<ScreenshotCleanupItem> }`
  - `RunDataCleanupPlan { items: Vec<RunDataCleanupItem>, estimated_bytes: i64, skipped_pending_uploads: i64 }` with `to_preview()`
  - `RunDataCleanupPreview { runs: i64, battles: i64, videos: i64, estimated_bytes: i64, skipped_pending_uploads: i64 }` (ts-rs exported)
  - `plan_run_data_cleanup(database_path: &Path, game_path: &Path, cutoff: Option<&CleanupCutoff>) -> Result<RunDataCleanupPlan, String>`

- [ ] **Step 1: Write the failing tests**

Append to the test module in `src-tauri/src/history/cleanup.rs`:

```rust
    fn insert_run(
        conn: &rusqlite::Connection,
        run_id: &str,
        status: &str,
        completed: i64,
        game_mode: &str,
        ended_at_utc: &str,
    ) {
        conn.execute(
            "insert into runs (run_id, started_at_utc, last_seen_at_utc, status, completed, hero, game_mode, ended_at_utc)
             values (?1, ?2, ?2, ?3, ?4, 'Vanessa', ?5, ?2)",
            rusqlite::params![run_id, ended_at_utc, status, completed, game_mode],
        )
        .unwrap();
    }

    #[test]
    fn run_plan_applies_upload_and_activity_gates() {
        let fixture = create_fixture();
        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        insert_run(&conn, "run-safe", "completed", 1, "Ranked", "2026-06-10T10:00:00Z");
        insert_run(&conn, "run-dirty", "completed", 1, "Ranked", "2026-06-11T10:00:00Z");
        insert_run(&conn, "run-normal-dirty", "completed", 1, "Normal", "2026-06-12T10:00:00Z");
        insert_run(&conn, "run-active", "active", 0, "Ranked", "2026-06-13T10:00:00Z");
        insert_run(&conn, "run-replay-dirty", "completed", 1, "Ranked", "2026-06-14T10:00:00Z");
        insert_run(&conn, "run-recent", "completed", 1, "Ranked", "2026-07-02T10:00:00Z");
        conn.execute_batch(
            "
            insert into run_sync_state (run_id, dirty) values
                ('run-safe', 0),
                ('run-dirty', 1),
                ('run-normal-dirty', 1),
                ('run-replay-dirty', 0),
                ('run-recent', 0);
            insert into battles (battle_id, source, run_id, recorded_at_utc, replay_dirty) values
                ('battle-safe', 'LOCAL', 'run-safe', '2026-06-10T09:00:00Z', 0),
                ('battle-replay-dirty', 'LOCAL', 'run-replay-dirty', '2026-06-14T09:00:00Z', 1),
                ('battle-ghost', 'GHOST', null, '2026-06-10T09:00:00Z', 0);
            insert into combat_replay_videos (video_id, battle_id, video_relative_path, started_at_utc, status) values
                ('video-1', 'battle-safe', '2026-06-10/v1.mp4', '2026-06-10T09:05:00Z', 'COMPLETED');
            insert into run_screenshots (screenshot_id, run_id, capture_source, image_relative_path, captured_at_utc, captured_at_local) values
                ('shot-safe', 'run-safe', 'end_of_run_auto', '2026-06-10/safe.png',
                 '2026-06-10T10:00:00Z', '2026-06-10T18:00:00+08:00');
            ",
        )
        .unwrap();
        drop(conn);

        let plan = super::plan_run_data_cleanup(
            &fixture.database_path,
            &fixture.game_path,
            Some(&CleanupCutoff {
                utc: "2026-07-01T00:00:00Z".to_string(),
                local_date: NaiveDate::from_ymd_opt(2026, 7, 1).unwrap(),
            }),
        )
        .unwrap();

        let ids: Vec<&str> = plan.items.iter().map(|item| item.run_id.as_str()).collect();
        // run-dirty: pending Ranked upload -> skipped.
        // run-normal-dirty: dirty but Normal mode -> never uploads -> eligible.
        // run-active: still running -> skipped. run-recent: after cutoff -> skipped.
        // run-replay-dirty: battle replay pending upload -> skipped.
        assert_eq!(ids, vec!["run-safe", "run-normal-dirty"]);
        assert_eq!(plan.skipped_pending_uploads, 2, "run-dirty and run-replay-dirty");

        let safe = &plan.items[0];
        assert_eq!(safe.battle_ids, vec!["battle-safe"]);
        assert_eq!(safe.videos.len(), 1);
        assert_eq!(safe.screenshots.len(), 1);
    }

    #[test]
    fn run_plan_skips_runs_with_pending_screenshot_uploads() {
        let fixture = create_fixture();
        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        insert_run(&conn, "run-shot-pending", "completed", 1, "Ranked", "2026-06-10T10:00:00Z");
        conn.execute_batch(
            "
            insert into run_sync_state (run_id, dirty) values ('run-shot-pending', 0);
            insert into run_screenshots (screenshot_id, run_id, capture_source, image_relative_path, captured_at_utc, captured_at_local) values
                ('shot-p', 'run-shot-pending', 'end_of_run_auto', '2026-06-10/p.png',
                 '2026-06-10T10:00:00Z', '2026-06-10T18:00:00+08:00');
            insert into bazaardb_snapshot_uploads (snapshot_id, status) values ('shot-p', 'pending');
            ",
        )
        .unwrap();
        drop(conn);

        let plan = super::plan_run_data_cleanup(&fixture.database_path, &fixture.game_path, None).unwrap();
        assert!(plan.items.is_empty());
        assert_eq!(plan.skipped_pending_uploads, 1);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml history::cleanup`
Expected: FAIL to compile with "cannot find function `plan_run_data_cleanup`".

- [ ] **Step 3: Write the implementation**

In `src-tauri/src/config.rs` add:

```rust
pub const COMBAT_REPLAYS_DIRECTORY: &str = "CombatReplays";
```

In `src-tauri/src/services/paths.rs` extend the config import and add:

```rust
pub fn combat_replays_dir(game_path: &Path) -> PathBuf {
    bpp_data_dir(game_path).join(COMBAT_REPLAYS_DIRECTORY)
}
```

In `src-tauri/src/history/cleanup.rs`, extend the queries import with `VideoRef` (`use crate::history::queries::{open_cleanup_connection, open_connection, table_exists, VideoRef};` — `VideoRef` is `pub struct VideoRef { pub video_id: String, pub relative_path: String }` at `src-tauri/src/history/queries.rs:24-27`), then add:

```rust
pub struct RunDataCleanupItem {
    pub run_id: String,
    pub battle_ids: Vec<String>,
    pub videos: Vec<VideoRef>,
    pub screenshots: Vec<ScreenshotCleanupItem>,
}

pub struct RunDataCleanupPlan {
    pub items: Vec<RunDataCleanupItem>,
    pub estimated_bytes: i64,
    pub skipped_pending_uploads: i64,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct RunDataCleanupPreview {
    pub runs: i64,
    pub battles: i64,
    pub videos: i64,
    pub estimated_bytes: i64,
    pub skipped_pending_uploads: i64,
}

impl RunDataCleanupPlan {
    fn empty() -> RunDataCleanupPlan {
        RunDataCleanupPlan {
            items: Vec::new(),
            estimated_bytes: 0,
            skipped_pending_uploads: 0,
        }
    }

    pub fn to_preview(&self) -> RunDataCleanupPreview {
        RunDataCleanupPreview {
            runs: self.items.len() as i64,
            battles: self.items.iter().map(|item| item.battle_ids.len() as i64).sum(),
            videos: self.items.iter().map(|item| item.videos.len() as i64).sum(),
            estimated_bytes: self.estimated_bytes,
            skipped_pending_uploads: self.skipped_pending_uploads,
        }
    }
}

pub fn plan_run_data_cleanup(
    database_path: &Path,
    game_path: &Path,
    cutoff: Option<&CleanupCutoff>,
) -> Result<RunDataCleanupPlan, String> {
    if !database_path.exists() {
        return Ok(RunDataCleanupPlan::empty());
    }
    let conn = open_connection(database_path)?;
    if !table_exists(&conn, "runs")? {
        return Ok(RunDataCleanupPlan::empty());
    }

    let has_sync_table = table_exists(&conn, "run_sync_state")?;
    let has_uploads_table = table_exists(&conn, "bazaardb_snapshot_uploads")?;
    let cutoff_utc = cutoff.map(|value| value.utc.as_str());
    let run_ids = eligible_run_ids(&conn, has_sync_table, has_uploads_table, cutoff_utc)?;
    let skipped_pending_uploads =
        skipped_pending_run_count(&conn, has_sync_table, has_uploads_table, cutoff_utc)?;

    let screenshots_dir = crate::services::paths::screenshots_dir(game_path);
    let videos_dir = crate::services::paths::combat_replay_videos_dir(game_path);
    let replays_dir = crate::services::paths::combat_replays_dir(game_path);

    let mut items = Vec::new();
    let mut estimated_bytes = 0i64;
    for run_id in run_ids {
        let battle_ids = run_battle_ids(&conn, &run_id)?;
        let videos = run_video_refs(&conn, &run_id)?;
        let screenshots = run_screenshot_items(&conn, &run_id)?;
        for video in &videos {
            if let Some(path) = resolve_cleanup_file_path(&videos_dir, &video.relative_path) {
                estimated_bytes += file_size(&path);
            }
        }
        for battle_id in &battle_ids {
            if let Some(path) = replay_payload_path(&replays_dir, battle_id) {
                estimated_bytes += file_size(&path);
            }
        }
        for screenshot in &screenshots {
            if let Some(path) =
                resolve_cleanup_file_path(&screenshots_dir, &screenshot.image_relative_path)
            {
                estimated_bytes += file_size(&path);
            }
        }
        items.push(RunDataCleanupItem {
            run_id,
            battle_ids,
            videos,
            screenshots,
        });
    }

    Ok(RunDataCleanupPlan {
        items,
        estimated_bytes,
        skipped_pending_uploads,
    })
}

fn eligible_run_ids(
    conn: &Connection,
    has_sync_table: bool,
    has_uploads_table: bool,
    cutoff_utc: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut sql = String::from("select r.run_id from runs r ");
    if has_sync_table {
        sql.push_str("left join run_sync_state s on s.run_id = r.run_id ");
    }
    sql.push_str(
        "where r.status <> 'active' \
         and (?1 is null or datetime(coalesce(r.ended_at_utc, r.last_seen_at_utc, r.started_at_utc)) < datetime(?1)) \
         and not exists (select 1 from battles b where b.run_id = r.run_id and b.replay_dirty = 1) ",
    );
    if has_sync_table {
        // Only completed Ranked runs are ever uploaded (mod RunBundleUploadStore).
        sql.push_str(
            "and not (coalesce(s.dirty, 0) = 1 and r.completed = 1 and r.game_mode = 'Ranked') ",
        );
    }
    if has_uploads_table {
        sql.push_str(
            "and not exists (select 1 from run_screenshots rs \
             join bazaardb_snapshot_uploads u on u.snapshot_id = rs.screenshot_id \
             where rs.run_id = r.run_id and u.status = 'pending') ",
        );
    }
    sql.push_str(
        "order by coalesce(r.ended_at_utc, r.last_seen_at_utc, r.started_at_utc) asc, r.run_id asc",
    );

    let mut stmt = conn.prepare(&sql).map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![cutoff_utc], |row| row.get::<_, String>(0))
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())
}

fn skipped_pending_run_count(
    conn: &Connection,
    has_sync_table: bool,
    has_uploads_table: bool,
    cutoff_utc: Option<&str>,
) -> Result<i64, String> {
    let mut gates: Vec<&str> = vec![
        "exists (select 1 from battles b where b.run_id = r.run_id and b.replay_dirty = 1)",
    ];
    if has_sync_table {
        gates.push("(coalesce(s.dirty, 0) = 1 and r.completed = 1 and r.game_mode = 'Ranked')");
    }
    if has_uploads_table {
        gates.push(
            "exists (select 1 from run_screenshots rs \
             join bazaardb_snapshot_uploads u on u.snapshot_id = rs.screenshot_id \
             where rs.run_id = r.run_id and u.status = 'pending')",
        );
    }
    let mut sql = String::from("select count(*) from runs r ");
    if has_sync_table {
        sql.push_str("left join run_sync_state s on s.run_id = r.run_id ");
    }
    sql.push_str(
        "where r.status <> 'active' \
         and (?1 is null or datetime(coalesce(r.ended_at_utc, r.last_seen_at_utc, r.started_at_utc)) < datetime(?1)) \
         and (",
    );
    sql.push_str(&gates.join(" or "));
    sql.push(')');

    conn.query_row(&sql, params![cutoff_utc], |row| row.get(0))
        .map_err(|err| err.to_string())
}

fn run_battle_ids(conn: &Connection, run_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("select battle_id from battles where run_id = ?1 order by battle_id asc")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([run_id], |row| row.get::<_, String>(0))
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())
}

fn run_video_refs(conn: &Connection, run_id: &str) -> Result<Vec<VideoRef>, String> {
    if !table_exists(conn, "combat_replay_videos")? {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "select v.video_id, v.video_relative_path
             from combat_replay_videos v
             join battles b on b.battle_id = v.battle_id
             where b.run_id = ?1
             order by v.video_id asc",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([run_id], |row| {
            Ok(VideoRef {
                video_id: row.get(0)?,
                relative_path: row.get(1)?,
            })
        })
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())
}

fn run_screenshot_items(
    conn: &Connection,
    run_id: &str,
) -> Result<Vec<ScreenshotCleanupItem>, String> {
    if !table_exists(conn, "run_screenshots")? {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "select screenshot_id, image_relative_path
             from run_screenshots
             where run_id = ?1
             order by screenshot_id asc",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([run_id], |row| {
            Ok(ScreenshotCleanupItem {
                screenshot_id: row.get(0)?,
                image_relative_path: row.get(1)?,
            })
        })
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())
}

/// Replay payload path: <CombatReplays>/<battleId>.payload.mpack.gz
/// (mod CombatReplayPayloadStore). Battle ids are opaque; refuse anything
/// that could escape the directory.
fn replay_payload_path(replays_dir: &Path, battle_id: &str) -> Option<PathBuf> {
    let trimmed = battle_id.trim();
    if trimmed.is_empty() || trimmed.contains(['/', '\\']) || trimmed.contains("..") {
        return None;
    }
    Some(replays_dir.join(format!("{trimmed}.payload.mpack.gz")))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml history::cleanup`
Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/config.rs src-tauri/src/services/paths.rs src-tauri/src/history/cleanup.rs
git commit -m "Add run data cleanup planning with upload safety gates"
```

---

### Task 9: Run-data cleanup execution

**Files:**
- Modify: `src-tauri/src/history/cleanup.rs`

**Interfaces:**
- Consumes: `plan_run_data_cleanup`, `open_cleanup_connection`, `replay_payload_path`, `remove_file_if_exists`, `file_size`.
- Produces: `RunDataCleanupResult { deleted_runs: i64, deleted_files: i64, freed_bytes: i64, skipped_pending_uploads: i64 }` (ts-rs exported); `execute_run_data_cleanup(database_path: &Path, game_path: &Path, cutoff: Option<&CleanupCutoff>) -> Result<RunDataCleanupResult, String>`.

- [ ] **Step 1: Write the failing test**

Append to the test module in `src-tauri/src/history/cleanup.rs`:

```rust
    #[test]
    fn execute_run_cleanup_cascades_rows_deletes_files_and_spares_ghosts() {
        let fixture = create_fixture();
        let data_dir = fixture.game_path.join("BazaarPlusPlusV4");
        let videos_dir = data_dir.join("CombatReplayVideos");
        let replays_dir = data_dir.join("CombatReplays");
        std::fs::create_dir_all(videos_dir.join("2026-06-10")).unwrap();
        std::fs::create_dir_all(&replays_dir).unwrap();
        std::fs::write(videos_dir.join("2026-06-10/v1.mp4"), b"vvvv").unwrap();
        std::fs::write(replays_dir.join("battle-1.payload.mpack.gz"), b"ppp").unwrap();
        let ghost_payload = replays_dir.join("battle-ghost.payload.mpack.gz");
        std::fs::write(&ghost_payload, b"gg").unwrap();
        let shot_file =
            write_screenshot_file(&fixture.screenshots_dir, "2026-06-10/shot.png", b"ss");

        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        insert_run(&conn, "run-1", "completed", 1, "Ranked", "2026-06-10T10:00:00Z");
        conn.execute_batch(
            "
            insert into run_sync_state (run_id, dirty) values ('run-1', 0);
            insert into run_events (run_id, seq, ts_utc, kind, payload_json)
                values ('run-1', 1, '2026-06-10T09:00:00Z', 'test', '{}');
            insert into battles (battle_id, source, run_id, recorded_at_utc, replay_dirty) values
                ('battle-1', 'LOCAL', 'run-1', '2026-06-10T09:00:00Z', 0),
                ('battle-ghost', 'GHOST', null, '2026-06-10T09:00:00Z', 0);
            insert into battle_snapshots (battle_id, player_hand_json) values ('battle-1', '[]');
            insert into combat_replay_videos (video_id, battle_id, video_relative_path, started_at_utc, status)
                values ('video-1', 'battle-1', '2026-06-10/v1.mp4', '2026-06-10T09:05:00Z', 'COMPLETED');
            insert into run_screenshots (screenshot_id, run_id, capture_source, image_relative_path, captured_at_utc, captured_at_local)
                values ('shot-1', 'run-1', 'end_of_run_auto', '2026-06-10/shot.png',
                        '2026-06-10T10:00:00Z', '2026-06-10T18:00:00+08:00');
            insert into bazaardb_snapshot_uploads (snapshot_id, status) values ('shot-1', 'uploaded');
            ",
        )
        .unwrap();
        drop(conn);

        let result =
            super::execute_run_data_cleanup(&fixture.database_path, &fixture.game_path, None)
                .unwrap();

        assert_eq!(result.deleted_runs, 1);
        // v1.mp4 + battle-1 payload + shot.png
        assert_eq!(result.deleted_files, 3);
        assert_eq!(result.freed_bytes, 4 + 3 + 2);

        assert!(!videos_dir.join("2026-06-10/v1.mp4").exists());
        assert!(!replays_dir.join("battle-1.payload.mpack.gz").exists());
        assert!(!shot_file.exists());
        assert!(ghost_payload.exists(), "ghost payloads are never touched");

        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        let count = |sql: &str| -> i64 { conn.query_row(sql, [], |row| row.get(0)).unwrap() };
        assert_eq!(count("select count(*) from runs"), 0);
        assert_eq!(count("select count(*) from run_events"), 0, "cascade");
        assert_eq!(count("select count(*) from battle_snapshots"), 0, "cascade");
        assert_eq!(count("select count(*) from run_sync_state"), 0, "cascade");
        assert_eq!(count("select count(*) from run_screenshots"), 0);
        assert_eq!(count("select count(*) from bazaardb_snapshot_uploads"), 0, "cascade");
        assert_eq!(count("select count(*) from combat_replay_videos"), 0);
        assert_eq!(
            count("select count(*) from battles"),
            1,
            "only the ghost battle survives"
        );
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml history::cleanup`
Expected: FAIL to compile with "cannot find function `execute_run_data_cleanup`".

- [ ] **Step 3: Write the implementation**

Add to `src-tauri/src/history/cleanup.rs`:

```rust
/// Runs are heavier than screenshots (multiple tables + cascade per row),
/// so chunks are smaller to keep each write transaction well under the mod's
/// 2s busy_timeout while the game is running.
const RUN_CLEANUP_CHUNK_SIZE: usize = 25;

#[derive(Clone, Debug, PartialEq, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct RunDataCleanupResult {
    pub deleted_runs: i64,
    pub deleted_files: i64,
    pub freed_bytes: i64,
    pub skipped_pending_uploads: i64,
}

pub fn execute_run_data_cleanup(
    database_path: &Path,
    game_path: &Path,
    cutoff: Option<&CleanupCutoff>,
) -> Result<RunDataCleanupResult, String> {
    let plan = plan_run_data_cleanup(database_path, game_path, cutoff)?;
    let screenshots_dir = crate::services::paths::screenshots_dir(game_path);
    let videos_dir = crate::services::paths::combat_replay_videos_dir(game_path);
    let replays_dir = crate::services::paths::combat_replays_dir(game_path);
    let mut deleted_runs = 0i64;
    let mut deleted_files = 0i64;
    let mut freed_bytes = 0i64;

    if !plan.items.is_empty() {
        let mut conn = open_cleanup_connection(database_path)?;
        for chunk in plan.items.chunks(RUN_CLEANUP_CHUNK_SIZE) {
            for item in chunk {
                for video in &item.videos {
                    if let Some(path) =
                        resolve_cleanup_file_path(&videos_dir, &video.relative_path)
                    {
                        freed_bytes += file_size(&path);
                        if remove_file_if_exists(&path)? {
                            deleted_files += 1;
                        }
                    }
                }
                for battle_id in &item.battle_ids {
                    if let Some(path) = replay_payload_path(&replays_dir, battle_id) {
                        freed_bytes += file_size(&path);
                        if remove_file_if_exists(&path)? {
                            deleted_files += 1;
                        }
                    }
                }
                for screenshot in &item.screenshots {
                    if let Some(path) =
                        resolve_cleanup_file_path(&screenshots_dir, &screenshot.image_relative_path)
                    {
                        freed_bytes += file_size(&path);
                        if remove_file_if_exists(&path)? {
                            deleted_files += 1;
                        }
                    }
                }
            }
            let transaction = conn.transaction().map_err(|err| err.to_string())?;
            for item in chunk {
                // combat_replay_videos and run_screenshots have no FK to
                // runs/battles — delete them explicitly. Everything else
                // (run_events, battles, battle_snapshots, run_sync_state,
                // bazaardb_snapshot_uploads) cascades from these deletes.
                for video in &item.videos {
                    transaction
                        .execute(
                            "delete from combat_replay_videos where video_id = ?1",
                            [&video.video_id],
                        )
                        .map_err(|err| err.to_string())?;
                }
                for screenshot in &item.screenshots {
                    transaction
                        .execute(
                            "delete from run_screenshots where screenshot_id = ?1",
                            [&screenshot.screenshot_id],
                        )
                        .map_err(|err| err.to_string())?;
                }
                deleted_runs += transaction
                    .execute("delete from runs where run_id = ?1", [&item.run_id])
                    .map_err(|err| err.to_string())? as i64;
            }
            transaction.commit().map_err(|err| err.to_string())?;
        }
    }

    remove_empty_dated_directories(&screenshots_dir);

    Ok(RunDataCleanupResult {
        deleted_runs,
        deleted_files,
        freed_bytes,
        skipped_pending_uploads: plan.skipped_pending_uploads,
    })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml history::cleanup`
Expected: 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/history/cleanup.rs
git commit -m "Add run data cleanup execution with cascade and ghost safety"
```

---

### Task 10: Run-data service + Tauri commands + registry

**Files:**
- Modify: `src-tauri/src/services/history.rs`
- Modify: `src-tauri/src/commands/history.rs`
- Modify: `src-tauri/src/commands/registry.rs`

**Interfaces:**
- Produces: Tauri commands `preview_run_data_cleanup` and `execute_run_data_cleanup`, both taking `{ gamePath?: string, preset: CleanupPreset }`.

- [ ] **Step 1: Add service functions**

In `src-tauri/src/services/history.rs`, below the Phase 1 cleanup functions:

```rust
pub fn preview_run_data_cleanup(
    paths: &HistoryPaths,
    preset: crate::history::cleanup::CleanupPreset,
) -> Result<crate::history::cleanup::RunDataCleanupPreview, String> {
    let cutoff =
        crate::history::cleanup::CleanupCutoff::for_preset(preset, chrono::Local::now());
    let plan = crate::history::cleanup::plan_run_data_cleanup(
        &paths.database_path,
        &paths.game_path,
        cutoff.as_ref(),
    )?;
    Ok(plan.to_preview())
}

pub fn execute_run_data_cleanup(
    paths: &HistoryPaths,
    preset: crate::history::cleanup::CleanupPreset,
) -> Result<crate::history::cleanup::RunDataCleanupResult, String> {
    let cutoff =
        crate::history::cleanup::CleanupCutoff::for_preset(preset, chrono::Local::now());
    crate::history::cleanup::execute_run_data_cleanup(
        &paths.database_path,
        &paths.game_path,
        cutoff.as_ref(),
    )
}
```

- [ ] **Step 2: Add Tauri commands**

In `src-tauri/src/commands/history.rs` (extend the aliased service imports the same way as Task 5):

```rust
#[tauri::command]
pub fn preview_run_data_cleanup(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    preset: crate::history::cleanup::CleanupPreset,
) -> Result<crate::history::cleanup::RunDataCleanupPreview, String> {
    let paths = require_history_paths(&app, state.get_game_path(), game_path)?;
    preview_run_data_cleanup_service(&paths, preset)
}

#[tauri::command]
pub fn execute_run_data_cleanup(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    preset: crate::history::cleanup::CleanupPreset,
) -> Result<crate::history::cleanup::RunDataCleanupResult, String> {
    let paths = require_history_paths(&app, state.get_game_path(), game_path)?;
    execute_run_data_cleanup_service(&paths, preset)
}
```

- [ ] **Step 3: Register**

In `src-tauri/src/commands/registry.rs`, append after `(commands::history, execute_screenshot_cleanup)`:

```rust
            (commands::history, preview_run_data_cleanup),
            (commands::history, execute_run_data_cleanup)
```

Bump the count assert from `25` to `27`.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/services/history.rs src-tauri/src/commands/history.rs src-tauri/src/commands/registry.rs
git commit -m "Expose run data cleanup preview and execute commands"
```

---

### Task 11: Frontend run-data cleanup (bindings, API, hook, card row, i18n)

**Files:**
- Modify: `src/api/tauri.ts`
- Modify: `src/features/history/historyApi.ts`
- Modify: `src/features/history/useStorageCleanup.ts` (full replacement below)
- Modify: `src/features/history/StorageCleanupCard.tsx` (full replacement below)
- Modify: `src/i18n/messages.ts`

- [ ] **Step 1: Regenerate bindings and add command map entries**

Run `npm run check`, then in `src/api/tauri.ts` import `RunDataCleanupPreview`, `RunDataCleanupResult` and append:

```ts
  preview_run_data_cleanup: {
    input: { gamePath?: string; preset: CleanupPreset };
    output: RunDataCleanupPreview;
  };
  execute_run_data_cleanup: {
    input: { gamePath?: string; preset: CleanupPreset };
    output: RunDataCleanupResult;
  };
```

- [ ] **Step 2: Add API wrappers**

Append to `src/features/history/historyApi.ts`:

```ts
export async function previewRunDataCleanup(preset: CleanupPreset) {
  if (!hasTauriRuntime()) {
    return null;
  }

  return invokeCommand('preview_run_data_cleanup', { preset });
}

export async function executeRunDataCleanup(preset: CleanupPreset) {
  if (!hasTauriRuntime()) {
    return null;
  }

  return invokeCommand('execute_run_data_cleanup', { preset });
}
```

- [ ] **Step 3: Generalize the hook to two scopes**

Replace `src/features/history/useStorageCleanup.ts` with:

```ts
import { useState } from 'react';
import type {
  CleanupPreset,
  RunDataCleanupPreview,
  RunDataCleanupResult,
  ScreenshotCleanupPreview,
  ScreenshotCleanupResult
} from '../../types/backend';
import { useAsyncAction } from '../shared/useAsyncAction';
import {
  executeRunDataCleanup,
  executeScreenshotCleanup,
  previewRunDataCleanup,
  previewScreenshotCleanup
} from './historyApi';

export type CleanupScope = 'screenshots' | 'run_data';

export type PendingCleanup =
  | { scope: 'screenshots'; preset: CleanupPreset; preview: ScreenshotCleanupPreview }
  | { scope: 'run_data'; preset: CleanupPreset; preview: RunDataCleanupPreview };

export type CleanupOutcome =
  | { scope: 'screenshots'; result: ScreenshotCleanupResult }
  | { scope: 'run_data'; result: RunDataCleanupResult };

export function useStorageCleanup(onCompleted: () => Promise<void> | void) {
  const [pending, setPending] = useState<PendingCleanup | null>(null);
  const [outcome, setOutcome] = useState<CleanupOutcome | null>(null);
  const { busy, error, clearError, run } = useAsyncAction<'preview' | 'execute'>();

  const requestCleanup = (scope: CleanupScope, preset: CleanupPreset) =>
    run('preview', async () => {
      setOutcome(null);
      if (scope === 'screenshots') {
        const preview = await previewScreenshotCleanup(preset);
        if (preview) {
          setPending({ scope, preset, preview });
        }
        return;
      }
      const preview = await previewRunDataCleanup(preset);
      if (preview) {
        setPending({ scope, preset, preview });
      }
    });

  const confirm = () => {
    const target = pending;
    if (!target) {
      return;
    }
    void run('execute', async () => {
      if (target.scope === 'screenshots') {
        const result = await executeScreenshotCleanup(target.preset);
        setPending(null);
        if (result) {
          setOutcome({ scope: 'screenshots', result });
        }
      } else {
        const result = await executeRunDataCleanup(target.preset);
        setPending(null);
        if (result) {
          setOutcome({ scope: 'run_data', result });
        }
      }
      await onCompleted();
    });
  };

  const cancel = () => setPending(null);

  return {
    pending,
    outcome,
    busy,
    error,
    clearError,
    requestCleanup,
    confirm,
    cancel
  };
}
```

- [ ] **Step 4: Extend the card with the run-data row**

Replace `src/features/history/StorageCleanupCard.tsx` with:

```tsx
import { Trash2 } from 'lucide-react';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useI18n } from '../../i18n/LocaleProvider';
import type { CleanupPreset } from '../../types/backend';
import { CleanupConfirmModal } from './CleanupConfirmModal';
import { formatBytes } from './format';
import {
  useStorageCleanup,
  type CleanupOutcome,
  type CleanupScope,
  type PendingCleanup
} from './useStorageCleanup';

const PRESETS: Array<{
  preset: CleanupPreset;
  labelKey:
    | 'storageCleanupPresetBeforeThisMonth'
    | 'storageCleanupPresetOlderThan7Days'
    | 'storageCleanupPresetAll';
}> = [
  { preset: 'before_this_month', labelKey: 'storageCleanupPresetBeforeThisMonth' },
  { preset: 'older_than_7_days', labelKey: 'storageCleanupPresetOlderThan7Days' },
  { preset: 'all', labelKey: 'storageCleanupPresetAll' }
];

function pendingItemCount(pending: PendingCleanup): number {
  if (pending.scope === 'screenshots') {
    return pending.preview.screenshots + pending.preview.orphan_files;
  }
  return pending.preview.runs;
}

export function StorageCleanupCard({
  onCompleted
}: {
  onCompleted: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const cleanup = useStorageCleanup(onCompleted);

  const pendingBody = (pending: PendingCleanup): string => {
    if (pendingItemCount(pending) === 0) {
      return t('storageCleanupNothingToClean');
    }
    if (pending.scope === 'screenshots') {
      return t('storageCleanupScreenshotsConfirmBody', {
        count: pending.preview.screenshots + pending.preview.orphan_files,
        size: formatBytes(pending.preview.estimated_bytes)
      });
    }
    return t('storageCleanupRunDataConfirmBody', {
      runs: pending.preview.runs,
      battles: pending.preview.battles,
      videos: pending.preview.videos,
      size: formatBytes(pending.preview.estimated_bytes)
    });
  };

  const outcomeText = (outcome: CleanupOutcome): string => {
    if (outcome.scope === 'screenshots') {
      return t('storageCleanupScreenshotsDone', {
        files: outcome.result.deleted_files,
        size: formatBytes(outcome.result.freed_bytes)
      });
    }
    return t('storageCleanupRunDataDone', {
      runs: outcome.result.deleted_runs,
      files: outcome.result.deleted_files,
      size: formatBytes(outcome.result.freed_bytes)
    });
  };

  return (
    <div className="p-4 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Trash2 size={14} className="text-[rgba(200,170,120,0.8)]" />
        <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.8)] uppercase">
          {t('storageCleanupTitle')}
        </span>
      </div>

      {cleanup.error && <ErrorBanner message={cleanup.error} />}

      <CleanupRow
        label={t('storageCleanupScreenshotsLabel')}
        scope="screenshots"
        busy={cleanup.busy}
        onSelect={cleanup.requestCleanup}
      />
      <CleanupRow
        label={t('storageCleanupRunDataLabel')}
        scope="run_data"
        busy={cleanup.busy}
        onSelect={cleanup.requestCleanup}
      />

      {cleanup.outcome && (
        <p className="m-0 text-xs text-[rgba(200,170,120,0.8)]">
          {outcomeText(cleanup.outcome)}
        </p>
      )}

      {cleanup.pending && (
        <CleanupConfirmModal
          title={t('storageCleanupConfirmTitle')}
          body={pendingBody(cleanup.pending)}
          skippedNote={
            cleanup.pending.preview.skipped_pending_uploads > 0
              ? t('storageCleanupSkippedPending', {
                  count: cleanup.pending.preview.skipped_pending_uploads
                })
              : null
          }
          busy={cleanup.busy}
          confirmDisabled={pendingItemCount(cleanup.pending) === 0}
          onClose={cleanup.cancel}
          onConfirm={cleanup.confirm}
        />
      )}
    </div>
  );
}

function CleanupRow({
  label,
  scope,
  busy,
  onSelect
}: {
  label: string;
  scope: CleanupScope;
  busy: boolean;
  onSelect: (scope: CleanupScope, preset: CleanupPreset) => Promise<boolean> | void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-[#e8dcc8]">{label}</span>
      <div className="flex gap-2">
        {PRESETS.map(({ preset, labelKey }) => (
          <button
            key={preset}
            type="button"
            disabled={busy}
            onClick={() => void onSelect(scope, preset)}
            className="px-3 py-1.5 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 transition-colors text-xs text-[#e8dcc8]"
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add the Phase 2 i18n keys**

In `src/i18n/messages.ts` add to `zh` (next to the Phase 1 cleanup keys):

```ts
  storageCleanupRunDataLabel: '对局数据',
  storageCleanupRunDataConfirmBody:
    '将删除 {runs} 局对局记录，包括 {battles} 场战斗、{videos} 个回放视频及相关截图（约 {size}），删除后无法恢复。',
  storageCleanupRunDataDone: '已删除 {runs} 局对局和 {files} 个文件，释放约 {size}。',
```

and to `en`:

```ts
  storageCleanupRunDataLabel: 'Run data',
  storageCleanupRunDataConfirmBody:
    'This will permanently delete {runs} runs, including {battles} battles, {videos} replay videos and related screenshots (about {size}). This cannot be undone.',
  storageCleanupRunDataDone: 'Deleted {runs} runs and {files} files, freed about {size}.',
```

- [ ] **Step 6: Verify**

Run: `npm run check && npm run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/api/tauri.ts src/features/history/historyApi.ts src/features/history/useStorageCleanup.ts src/features/history/StorageCleanupCard.tsx src/i18n/messages.ts src/types/generated
git commit -m "Add run data cleanup row to the storage cleanup card"
```

---

### Task 12: Truth doc update and final verification

**Files:**
- Modify: `docs/truth/history-stream.md`

- [ ] **Step 1: Document the feature**

Read `docs/truth/history-stream.md` and add a `## Storage cleanup` section following the file's existing style and citation conventions, covering:

- Commands: `preview_screenshot_cleanup` / `execute_screenshot_cleanup` / `preview_run_data_cleanup` / `execute_run_data_cleanup` (`src-tauri/src/commands/history.rs`), backed by `src-tauri/src/history/cleanup.rs`.
- Presets `all` / `older_than_7_days` / `before_this_month`; cutoffs computed from local time (`CleanupCutoff::for_preset`), compared in SQL via `datetime()`.
- Safety gates: pending BazaarDB screenshot uploads and un-uploaded Ranked run bundles (`run_sync_state.dirty`) are skipped; battles are never deleted directly (ghost data shares the table); deletes run on an FK-enabled connection (`open_cleanup_connection`) so mod-schema cascades fire.
- Files removed together with rows: screenshot PNGs (+ `UploadCache` copies + orphan sweep of dated folders), replay payloads (`CombatReplays/<battleId>.payload.mpack.gz`), replay videos.

Update the file's `last-verified` frontmatter per its existing convention.

- [ ] **Step 2: Full verification with forced recompile**

Rust warnings hide behind cargo's cache — force a recompile so they surface:

```bash
touch src-tauri/src/lib.rs
cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tee /dev/stderr | grep -c "^warning" || true
```

Expected: 0 warnings, all tests pass. Then:

```bash
npm run check && npm run test
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/truth/history-stream.md
git commit -m "Document storage cleanup in history truth doc"
```

---

## PR notes (when opening the PR)

- Title: `Add storage cleanup for end-of-run screenshots and run data`
- Body ends with:

```text
Release Notes:

- Added: History page storage cleanup — delete end-of-run screenshots and old run data (all / older than 7 days / keep current month), with upload-safe skipping of not-yet-uploaded items.
```
