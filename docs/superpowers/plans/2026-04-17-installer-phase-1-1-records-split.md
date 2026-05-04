# Installer Phase 1.1 — Records Module Split Implementation Plan

> Status: historical implementation record. The records module is already split in the current codebase.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 970-line `src-tauri/src/stream/records.rs` into a `stream/records/` module directory with one file per concern, keeping behavior and public API identical.

**Architecture:** Convert `records.rs` into a directory module with five files: `mod.rs` (facade + repository), `repo.rs` (SQL I/O), `image.rs` (path resolution), `mapper.rs` (row → DTO), `locator.rs` (DB path discovery). Public symbols (`OverlayRecord`, `OverlayRecordRepository`, `resolve_database_path`, `resolve_overlay_image_path`) continue to resolve via `crate::stream::records::…` so no caller in `stream/http.rs`, `stream/server.rs`, or `commands/stream.rs` needs to change.

**Tech Stack:** Rust 2021 (Tauri 2), `rusqlite` bundled SQLite, `tempfile` for test fixtures. Verified with `cargo test --manifest-path src-tauri/Cargo.toml -p bppinstaller` (default target).

**Parent spec:** [2026-04-17-installer-cohesion-refactor-design.md](../specs/2026-04-17-installer-cohesion-refactor-design.md) — Phase 1.1.

---

## File Structure

All paths are relative to the project root `bazaarplusplus-installer/`.

- Create `src-tauri/src/stream/records/mod.rs` — public facade. Re-exports `OverlayRecord`, `OverlayRecordRepository`, `resolve_database_path`, `resolve_overlay_image_path`. Hosts the `OverlayRecordRepository` impl since it is the composition point.
- Create `src-tauri/src/stream/records/repo.rs` — pure SQLite reads/writes: `OverlayRecordRow` (pub(crate)), `load_latest_overlay_record`, `load_overlay_record_count`, `load_overlay_record_list`, `load_overlay_record_by_id`, `delete_overlay_record_row`, plus the private helpers `table_exists` and `map_overlay_record_row`.
- Create `src-tauri/src/stream/records/image.rs` — pure path functions: `resolve_overlay_image_path`, `normalized_relative_image_path`.
- Create `src-tauri/src/stream/records/mapper.rs` — pure `OverlayRecordRow → OverlayRecord` translation including title/subtitle rules and `image_url` formatting.
- Create `src-tauri/src/stream/records/locator.rs` — DB path discovery: `resolve_database_path`, `find_database_path_anywhere`, plus the three directory/file name constants (`DATA_DIRECTORY`, `SCREENSHOTS_DIRECTORY`, `DATABASE_FILE_NAME`) that are shared across `image.rs`, `repo.rs`, and `mod.rs`.
- Delete `src-tauri/src/stream/records.rs` — replaced by the directory module.
- Modify `src-tauri/src/stream/mod.rs` — no line change required; `pub mod records;` already resolves to a directory module once `records.rs` is removed and `records/mod.rs` exists.

### Symbol ownership

| Symbol | Visibility | Home |
|---|---|---|
| `DATA_DIRECTORY`, `SCREENSHOTS_DIRECTORY`, `DATABASE_FILE_NAME` | `pub(crate)` | `locator.rs` |
| `OverlayRecord` | `pub` | `mod.rs` (re-export from `mapper.rs`) |
| `OverlayRecordRow` | `pub(crate)` | `repo.rs` |
| `OverlayRecordRepository` | `pub` | `mod.rs` |
| `resolve_database_path` | `pub` | `locator.rs` (re-export in `mod.rs`) |
| `resolve_overlay_image_path` | `pub` | `image.rs` (re-export in `mod.rs`) |
| `normalized_relative_image_path` | private | `image.rs` |
| `load_*` / `delete_overlay_record_row` | `pub(super)` | `repo.rs` |
| `table_exists`, `map_overlay_record_row` | private | `repo.rs` |
| `to_overlay_record`, `build_subtitle` | `pub(super)` | `mapper.rs` |

### Test ownership

Each submodule keeps its own `#[cfg(test)] mod tests` with the tests that exercise only its own symbols. `locator.rs` gets no test module because `find_database_path_anywhere` is OS-conditional and its behavior is already exercised by `repository_*` integration tests in `mod.rs`.

- `repo.rs::tests` — the 10 SQL-focused tests (`latest_overlay_record_*`, `overlay_record_count_*`, `load_overlay_record_by_id_*`, `overlay_record_list_*`).
- `image.rs::tests` — the 3 `resolve_overlay_image_path_*` tests.
- `mapper.rs::tests` — a new, small test for the `build_subtitle` rule extracted from `to_overlay_record`.
- `mod.rs::tests` — the 3 `repository_*` tests that exercise the full pipeline (DB + filesystem + repository).

---

## Pre-flight

- [ ] **Step 0.1: Confirm baseline tests pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib stream::records`
Expected: all 13 existing tests in `stream::records::tests` pass. If any fail on your machine, stop and investigate before refactoring — do not move forward with a red baseline.

- [ ] **Step 0.2: Confirm svelte/typescript side is untouched**

Run: `git status`
Expected: no changes to any files under `src/`. This phase is backend-only.

---

## Task 1: Carve out `image.rs` (pure path functions)

This is the smallest, purest piece to extract first. It has no SQLite dependency and already has three focused tests.

**Files:**
- Create: `src-tauri/src/stream/records/mod.rs` (scaffold only in this task)
- Create: `src-tauri/src/stream/records/image.rs`
- Create: `src-tauri/src/stream/records/locator.rs` (constants only in this task — full content in Task 5)
- Modify: `src-tauri/src/stream/records.rs` — remove the three functions moved out, re-import them from the new module to keep the old file compiling for this single task. Deleted in Task 5.

- [ ] **Step 1.1: Add `#[path]`-referenced submodule declarations inside `records.rs`**

Rust does NOT allow both `records.rs` and `records/mod.rs` to coexist — whichever one exists first wins, and the other is ignored. To split the file incrementally while keeping external imports of `crate::stream::records::…` resolving at every commit, leave `records.rs` in place and use `#[path]`-referenced submodule declarations that physically live under `records/`. In Task 5 the attributes go away and the directory form becomes canonical.

In `src-tauri/src/stream/records.rs`, at the top of the file (line 1), add:

```rust
#[path = "records/image.rs"]
mod image;
#[path = "records/locator.rs"]
mod locator;
```

Then create `src-tauri/src/stream/records/` directory and the two files. This lets us split the file incrementally without touching external imports.

- [ ] **Step 1.2: Create `records/locator.rs` with the three constants**

Create `src-tauri/src/stream/records/locator.rs`:

```rust
pub(crate) const DATA_DIRECTORY: &str = "BazaarPlusPlus";
pub(crate) const SCREENSHOTS_DIRECTORY: &str = "Screenshots";
pub(crate) const DATABASE_FILE_NAME: &str = "bazaarplusplus.db";
```

- [ ] **Step 1.3: Write the failing image tests at the new home**

Create `src-tauri/src/stream/records/image.rs` with only a `#[cfg(test)] mod tests` block and the three tests copied verbatim from `records.rs` tests. Do NOT yet define `resolve_overlay_image_path` or `normalized_relative_image_path` — the test file should fail to compile.

```rust
// src-tauri/src/stream/records/image.rs
#[cfg(test)]
mod tests {
    use super::resolve_overlay_image_path;
    use std::path::PathBuf;

    #[test]
    fn resolve_overlay_image_path_supports_relative_and_absolute_inputs() {
        let game_path = Some(PathBuf::from("/tmp/TheBazaar"));
        let relative = resolve_overlay_image_path(game_path.clone(), Some("match-1.png")).unwrap();
        let absolute = resolve_overlay_image_path(
            game_path,
            Some("/tmp/BazaarPlusPlus/Screenshots/match-2.png"),
        )
        .unwrap();

        assert_eq!(
            relative,
            PathBuf::from("/tmp/TheBazaar/BazaarPlusPlus/Screenshots/match-1.png")
        );
        assert_eq!(
            absolute,
            PathBuf::from("/tmp/BazaarPlusPlus/Screenshots/match-2.png")
        );
    }

    #[test]
    fn resolve_overlay_image_path_supports_bazaarplusplus_screenshots_directory() {
        let temp_dir = tempfile::tempdir().unwrap();
        let game_path = temp_dir.path().join("TheBazaar");
        let screenshots_dir = game_path.join("BazaarPlusPlus").join("Screenshots");
        std::fs::create_dir_all(&screenshots_dir).unwrap();
        std::fs::write(screenshots_dir.join("match-1.png"), b"png").unwrap();

        let resolved = resolve_overlay_image_path(Some(game_path), Some("match-1.png")).unwrap();

        assert_eq!(resolved, screenshots_dir.join("match-1.png"));
    }

    #[test]
    fn resolve_overlay_image_path_normalizes_nested_backslash_relative_paths() {
        let temp_dir = tempfile::tempdir().unwrap();
        let game_path = temp_dir.path().join("TheBazaar");
        let screenshots_dir = game_path.join("BazaarPlusPlus").join("Screenshots");
        let dated_dir = screenshots_dir.join("2026-04-16");
        std::fs::create_dir_all(&dated_dir).unwrap();
        std::fs::write(dated_dir.join("match-1.png"), b"png").unwrap();

        let resolved = resolve_overlay_image_path(
            Some(game_path),
            Some(r"2026-04-16\match-1.png"),
        )
        .unwrap();

        assert_eq!(resolved, dated_dir.join("match-1.png"));
    }
}
```

- [ ] **Step 1.4: Run cargo check — expect failure**

Run: `cargo check --manifest-path src-tauri/Cargo.toml --tests`
Expected: compile error `cannot find function 'resolve_overlay_image_path' in module 'super'`. This confirms the test scaffold is wired into the module tree.

- [ ] **Step 1.5: Move the implementation into `image.rs`**

Replace the body of `src-tauri/src/stream/records/image.rs` (above the `#[cfg(test)]` block) with:

```rust
use std::path::PathBuf;

use super::locator::{DATA_DIRECTORY, SCREENSHOTS_DIRECTORY};

pub fn resolve_overlay_image_path(
    game_path: Option<PathBuf>,
    raw_path: Option<&str>,
) -> Option<PathBuf> {
    let raw_path = raw_path?.trim();
    if raw_path.is_empty() {
        return None;
    }

    let candidate = PathBuf::from(raw_path);
    if candidate.is_absolute() {
        return Some(candidate);
    }

    let game_path = game_path?;
    let screenshots_directory = game_path.join(DATA_DIRECTORY).join(SCREENSHOTS_DIRECTORY);
    let normalized_relative_path = normalized_relative_image_path(raw_path);
    let from_screenshots = Some(screenshots_directory.join(normalized_relative_path));
    if let Some(path) = from_screenshots.as_ref().filter(|path| path.exists()) {
        return Some(path.clone());
    }

    from_screenshots
}

fn normalized_relative_image_path(raw_path: &str) -> PathBuf {
    let mut normalized = PathBuf::new();
    for segment in raw_path.split(['/', '\\']) {
        let trimmed = segment.trim();
        if !trimmed.is_empty() {
            normalized.push(trimmed);
        }
    }

    normalized
}
```

- [ ] **Step 1.6: Remove the old image functions from `records.rs`**

In `src-tauri/src/stream/records.rs`, delete the definitions of `resolve_overlay_image_path` (lines 236–259) and `normalized_relative_image_path` (lines 261–271). Replace the `impl OverlayRecordRepository::resolve_image_path` body that used to call the free function with a call to `image::resolve_overlay_image_path`. Also remove the three `resolve_overlay_image_path_*` tests from the `#[cfg(test)] mod tests` block in `records.rs` since they now live in `image.rs`. Remove any `resolve_overlay_image_path` entry from the `use super::{...}` line at the top of the test module.

Keep the constants `DATA_DIRECTORY` and `DATABASE_FILE_NAME` in `records.rs` for now; they will move in Task 5 when `locator.rs` absorbs them in full. `SCREENSHOTS_DIRECTORY` is no longer referenced from `records.rs` after this step (only `image.rs` uses it, via `super::locator::SCREENSHOTS_DIRECTORY`), so remove it from `records.rs` instead of leaving a dead constant.

Replace the inline `resolve_image_path` method (currently at records.rs:150–152) with:

```rust
fn resolve_image_path(&self, raw_path: Option<&str>) -> Option<PathBuf> {
    image::resolve_overlay_image_path(self.game_path.clone(), raw_path)
}
```

- [ ] **Step 1.7: Skip the `pub use` re-export until Task 5**

Do NOT add `pub use image::resolve_overlay_image_path;` to `records.rs` now. No caller outside the module references `stream::records::resolve_overlay_image_path`, so the re-export would emit an unused-import warning. Adding `#[allow(unused_imports)]` to silence it would be a warning-suppression hack, which violates the anti-suppression spirit of this plan. Task 5 will re-introduce the re-export from `records/mod.rs` at the correct time (when `mod.rs` is the canonical module surface).

- [ ] **Step 1.8: Run tests — expect all green**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib stream::records`
Expected: 17 tests pass (3 in `image::tests`, 14 in `records::tests`). The three image tests now live under `stream::records::image::tests`.

- [ ] **Step 1.9: Commit**

```bash
git add src-tauri/src/stream/records.rs src-tauri/src/stream/records/image.rs src-tauri/src/stream/records/locator.rs
git commit -m "Extract overlay image path resolution into stream::records::image"
```

---

## Task 2: Carve out `repo.rs` (pure SQL reads)

**Files:**
- Create: `src-tauri/src/stream/records/repo.rs`
- Modify: `src-tauri/src/stream/records.rs` — add `#[path]` declaration for `repo`, re-export, remove moved functions/types/tests.

- [ ] **Step 2.1: Add the submodule declaration**

Append to the top-of-file declarations in `src-tauri/src/stream/records.rs`:

```rust
#[path = "records/repo.rs"]
mod repo;
```

- [ ] **Step 2.2: Write the failing repo tests at the new home**

Create `src-tauri/src/stream/records/repo.rs` with ONLY a `#[cfg(test)] mod tests` block. The test bodies already exist verbatim inside `src-tauri/src/stream/records.rs::tests` — copy them from the working tree (or from `git show HEAD:src-tauri/src/stream/records.rs`). Move these 11 functions as-is, changing nothing inside each test body:

- `latest_overlay_record_returns_none_when_database_has_no_rows`
- `latest_overlay_record_reads_latest_end_of_run_snapshot`
- `latest_overlay_record_ignores_other_snapshot_types`
- `latest_overlay_record_returns_none_when_database_file_is_missing`
- `latest_overlay_record_supports_backtracking_from_latest`
- `latest_overlay_record_filters_from_stream_start_time`
- `overlay_record_count_only_counts_records_after_stream_start`
- `load_overlay_record_by_id_reads_matching_snapshot`
- `latest_overlay_record_uses_unknown_hero_when_screenshot_is_anonymous`
- `overlay_record_list_returns_latest_records_in_descending_order`
- `overlay_record_list_without_limit_returns_all_records`

Use this scaffolding (the ten tests fill in the `...` — do not abbreviate in your actual commit; copy each test body in full):

```rust
// src-tauri/src/stream/records/repo.rs
#[cfg(test)]
mod tests {
    use super::{
        load_latest_overlay_record, load_overlay_record_by_id, load_overlay_record_count,
        load_overlay_record_list,
    };

    fn create_run_screenshots_table(conn: &rusqlite::Connection) {
        conn.execute(
            "create table run_screenshots (
                screenshot_id text primary key,
                run_id text,
                battle_id text,
                capture_source text not null,
                is_primary integer not null default 0,
                image_relative_path text not null,
                captured_at_local text not null,
                captured_at_utc text not null,
                day integer,
                player_rank text,
                player_rating integer,
                player_position integer,
                victories_at_capture integer,
                hero_name text
            )",
            [],
        )
        .unwrap();
    }

    // Paste the 11 repo-focused tests listed above, verbatim from records.rs::tests.
    // Do NOT abbreviate in the actual commit. Each test body stays identical, including
    // the exact SQL insert strings and assertions.
}
```

- [ ] **Step 2.3: Run cargo check — expect failure**

Run: `cargo check --manifest-path src-tauri/Cargo.toml --tests`
Expected: `cannot find function 'load_latest_overlay_record' in module 'super'` (and similar for the other four `load_*` functions).

- [ ] **Step 2.4: Move implementations into `repo.rs`**

Copy the following definitions verbatim from `src-tauri/src/stream/records.rs` into the top of `src-tauri/src/stream/records/repo.rs` (above the test module):

- `pub(crate) struct OverlayRecordRow { ... }` with all fields
- `pub(crate) fn load_latest_overlay_record(...)` (the version at lines 273–344)
- `pub(crate) fn load_overlay_record_count(...)` (lines 346–385)
- `pub(crate) fn load_overlay_record_list(...)` (lines 387–468)
- `pub(crate) fn load_overlay_record_by_id(...)` (lines 470–512)
- `fn table_exists(...)` (lines 514–528)
- `fn map_overlay_record_row(row: &rusqlite::Row<'_>) -> Result<OverlayRecordRow, String>` (lines 530–544)

Add imports at the top:

```rust
use rusqlite::Connection;
use std::path::Path;
```

Adjust visibility: keep `OverlayRecordRow` as `pub(crate)` and the `load_*` functions as `pub(super)` (changed from `pub(crate)`). They are only called by the facade in `mod.rs`/`records.rs` and by the repo's own tests.

Export helpers for deletion:

Add a new `pub(super) fn delete_overlay_record_row(database_path: &Path, record_id: &str) -> Result<(bool, Option<String>), String>` that encapsulates the SQL DELETE logic currently inlined in `OverlayRecordRepository::delete_record`. Return `(rows_deleted > 0, image_relative_path_before_delete)`. See Task 5 for how the facade consumes this; for this task, just define it.

```rust
pub(super) fn delete_overlay_record_row(
    database_path: &Path,
    record_id: &str,
) -> Result<(bool, Option<String>), String> {
    if !database_path.exists() {
        return Ok((false, None));
    }

    let conn = Connection::open(database_path).map_err(|err| err.to_string())?;
    if !table_exists(&conn, "run_screenshots")? {
        return Ok((false, None));
    }

    let image_relative_path = load_overlay_record_by_id(database_path, record_id)?
        .and_then(|row| row.image_path);

    let deleted = conn
        .execute(
            "
delete from run_screenshots
where capture_source = 'end_of_run_auto'
  and screenshot_id = ?1
",
            [record_id],
        )
        .map_err(|err| err.to_string())?;

    Ok((deleted > 0, image_relative_path))
}
```

Make `OverlayRecordRow` fields `pub(super)` so `mapper.rs` (Task 3) can read them. Update the struct definition:

```rust
#[derive(Clone, Debug)]
pub(crate) struct OverlayRecordRow {
    pub(super) id: String,
    pub(super) hero: String,
    pub(super) game_mode: String,
    pub(super) captured_at: String,
    pub(super) captured_at_utc: String,
    pub(super) image_path: Option<String>,
    pub(super) wins: Option<i64>,
    pub(super) position: Option<i64>,
    pub(super) battle_count: Option<i64>,
    pub(super) rank: Option<String>,
    pub(super) rating: Option<i64>,
}
```

- [ ] **Step 2.5: Remove moved items from `records.rs`**

In `src-tauri/src/stream/records.rs`:

1. Delete the `OverlayRecordRow` struct definition (lines 25–38).
2. Delete `load_latest_overlay_record`, `load_overlay_record_count`, `load_overlay_record_list`, `load_overlay_record_by_id`, `table_exists`, `map_overlay_record_row` (lines 273–544 inclusive, except keep the inline `fn` that became `delete_overlay_record_row` — that was never here, it's new in repo.rs).
3. Remove the 11 relocated tests from the `#[cfg(test)] mod tests` block in `records.rs`. Keep only the tests that exercise the facade (`repository_*`) and the three image tests are already gone.
4. Update the `use super::{...}` line inside `records.rs::tests` to remove the `load_*` imports that no longer live here.
5. Add at the top of `records.rs`, right after the existing `#[path]` declarations:

```rust
pub(crate) use repo::OverlayRecordRow;
use repo::{
    delete_overlay_record_row, load_latest_overlay_record, load_overlay_record_by_id,
    load_overlay_record_count, load_overlay_record_list,
};
```

6. In `OverlayRecordRepository`, keep the method bodies working by calling the newly imported `load_*` functions (names unchanged).

- [ ] **Step 2.6: Run tests — expect all green**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib stream::records`
Expected: all 13 tests pass. The 11 SQL tests now run under `stream::records::repo::tests`; 2 `repository_*` tests + 1 setup-smoke test remain under `stream::records::tests`.

- [ ] **Step 2.7: Commit**

```bash
git add src-tauri/src/stream/records.rs src-tauri/src/stream/records/repo.rs
git commit -m "Extract overlay record SQL reads into stream::records::repo"
```

---

## Task 3: Carve out `mapper.rs` (pure row → DTO translation)

The `OverlayRecord` DTO and the row-to-DTO translation rule (title / subtitle composition, image URL formatting) are pure logic that has been embedded as a method on `OverlayRecordRepository`. Extract them so the subtitle rule is unit-testable in isolation.

**Files:**
- Create: `src-tauri/src/stream/records/mapper.rs`
- Modify: `src-tauri/src/stream/records.rs`

- [ ] **Step 3.1: Add the submodule declaration**

Append to the top of `src-tauri/src/stream/records.rs`:

```rust
#[path = "records/mapper.rs"]
mod mapper;
```

- [ ] **Step 3.2: Write the failing mapper tests**

Create `src-tauri/src/stream/records/mapper.rs` with only the test module first:

```rust
// src-tauri/src/stream/records/mapper.rs
#[cfg(test)]
mod tests {
    use super::build_subtitle;

    #[test]
    fn subtitle_includes_wins_and_battles_when_both_present() {
        assert_eq!(
            build_subtitle("End of run", Some(10), Some(14)),
            "End of run · 10W · 14 battles"
        );
    }

    #[test]
    fn subtitle_omits_battles_when_only_wins_are_present() {
        assert_eq!(
            build_subtitle("End of run", Some(7), None),
            "End of run · 7W"
        );
    }

    #[test]
    fn subtitle_omits_wins_when_only_battles_are_present() {
        assert_eq!(
            build_subtitle("End of run", None, Some(3)),
            "End of run · 3 battles"
        );
    }

    #[test]
    fn subtitle_is_bare_mode_when_no_metrics_are_present() {
        assert_eq!(build_subtitle("End of run", None, None), "End of run");
    }
}
```

- [ ] **Step 3.3: Run cargo check — expect failure**

Run: `cargo check --manifest-path src-tauri/Cargo.toml --tests`
Expected: `cannot find function 'build_subtitle' in module 'super'`.

- [ ] **Step 3.4: Add `build_subtitle`, `OverlayRecord`, and `to_overlay_record`**

Prepend to `src-tauri/src/stream/records/mapper.rs`, above the test module:

```rust
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::image::resolve_overlay_image_path;
use super::repo::OverlayRecordRow;

#[derive(Clone, Debug, Serialize)]
pub struct OverlayRecord {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub captured_at: String,
    pub captured_at_utc: String,
    pub image_url: Option<String>,
    pub image_path: Option<String>,
    pub wins: Option<i64>,
    pub position: Option<i64>,
    pub battle_count: Option<i64>,
    pub rank: Option<String>,
    pub rating: Option<i64>,
}

pub(super) fn to_overlay_record(
    game_path: Option<&Path>,
    row: OverlayRecordRow,
) -> OverlayRecord {
    let image_path = resolve_overlay_image_path(
        game_path.map(PathBuf::from),
        row.image_path.as_deref(),
    )
    .filter(|path| path.exists());
    let image_url = image_path
        .as_ref()
        .map(|_| format!("/images/{}", row.id));
    let image_path = image_path.map(|path| path.to_string_lossy().into_owned());

    OverlayRecord {
        id: row.id,
        title: row.hero.clone(),
        subtitle: build_subtitle(&row.game_mode, row.wins, row.battle_count),
        captured_at: row.captured_at,
        captured_at_utc: row.captured_at_utc,
        image_url,
        image_path,
        wins: row.wins,
        position: row.position,
        battle_count: row.battle_count,
        rank: row.rank,
        rating: row.rating,
    }
}

fn build_subtitle(game_mode: &str, wins: Option<i64>, battle_count: Option<i64>) -> String {
    match (wins, battle_count) {
        (Some(wins), Some(battles)) => {
            format!("{game_mode} · {wins}W · {battles} battles")
        }
        (Some(wins), None) => format!("{game_mode} · {wins}W"),
        (None, Some(battles)) => format!("{game_mode} · {battles} battles"),
        (None, None) => game_mode.to_owned(),
    }
}
```

- [ ] **Step 3.5: Remove the old mapping from `records.rs` and delegate to the mapper**

In `src-tauri/src/stream/records.rs`:

1. Delete the `OverlayRecord` struct definition (lines 9–23).
2. Delete the `fn to_overlay_record(&self, row: OverlayRecordRow) -> OverlayRecord { ... }` method (around lines 154–187). Keep the `fn resolve_image_path(&self, raw_path: Option<&str>) -> Option<PathBuf>` helper — `OverlayRecordRepository::delete_record` still uses it to locate the on-disk image before deleting, and `mapper.rs` does not replace that usage.
3. Add at the top-of-file imports (no `pub use` for `resolve_overlay_image_path` yet — that re-export lands in Task 5 when `mod.rs` becomes the module surface):

```rust
pub use mapper::OverlayRecord;
use mapper::to_overlay_record;
```

4. Update every call site of `self.to_overlay_record(row)` inside `OverlayRecordRepository` (grep for the method name; at time of writing there are two occurrences — one in `load_record_at_offset`, one in `load_record_list`) to `to_overlay_record(self.game_path.as_deref(), row)`.

- [ ] **Step 3.6: Run tests — expect all green**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib stream::records`
Expected: 17 tests pass (4 new subtitle tests + 11 repo tests + 3 image tests + 3 facade tests). Confirm by looking at the per-module summary in the cargo test output.

- [ ] **Step 3.7: Commit**

```bash
git add src-tauri/src/stream/records.rs src-tauri/src/stream/records/mapper.rs
git commit -m "Extract overlay record mapping and subtitle rule into stream::records::mapper"
```

---

## Task 4: Flesh out `locator.rs` (DB path discovery)

Move `resolve_database_path` and `find_database_path_anywhere` — plus the three directory/file-name constants they own — into `locator.rs`. After this task, `records.rs` no longer owns any business logic.

**Files:**
- Modify: `src-tauri/src/stream/records/locator.rs`
- Modify: `src-tauri/src/stream/records.rs`

- [ ] **Step 4.1: Move the path-discovery functions**

Append to `src-tauri/src/stream/records/locator.rs`:

```rust
use std::path::{Path, PathBuf};

pub fn resolve_database_path(game_path: &Path) -> Result<PathBuf, String> {
    let data_dir = game_path.join(DATA_DIRECTORY);
    if !data_dir.exists() {
        return Err(format!(
            "BazaarPlusPlus data directory not found: {}",
            data_dir.display()
        ));
    }

    let candidate = data_dir.join(DATABASE_FILE_NAME);
    if candidate.exists() {
        return Ok(candidate);
    }

    Err(format!(
        "Expected stream database at {}, but bazaarplusplus.db was not found.",
        candidate.display()
    ))
}

pub(super) fn find_database_path_anywhere() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let candidates = [
            r"C:\Program Files (x86)\Steam\steamapps\common\The Bazaar",
            r"C:\Program Files\Steam\steamapps\common\The Bazaar",
            r"D:\Steam\steamapps\common\The Bazaar",
            r"D:\SteamLibrary\steamapps\common\The Bazaar",
            r"E:\Steam\steamapps\common\The Bazaar",
            r"E:\SteamLibrary\steamapps\common\The Bazaar",
        ];
        for candidate in &candidates {
            let db = PathBuf::from(candidate)
                .join(DATA_DIRECTORY)
                .join(DATABASE_FILE_NAME);
            if db.exists() {
                return Ok(db);
            }
        }
    }
    Err(
        "bazaarplusplus.db not found: game path is not configured and no known Steam library path contains it."
            .to_string(),
    )
}
```

- [ ] **Step 4.2: Remove the same functions from `records.rs`**

In `src-tauri/src/stream/records.rs`:

1. Delete `fn find_database_path_anywhere()` (currently around lines 190–214 of the original file).
2. Delete `pub fn resolve_database_path(game_path: &Path) -> Result<PathBuf, String>` (currently around lines 216–234).
3. Delete the three `const` declarations at the top (`DATA_DIRECTORY`, `SCREENSHOTS_DIRECTORY`, `DATABASE_FILE_NAME` — lines 5–7).
4. Replace the `impl OverlayRecordRepository::database_path` body (lines 143–148) with:

```rust
fn database_path(&self) -> Result<PathBuf, String> {
    if let Some(game_path) = &self.game_path {
        return locator::resolve_database_path(game_path);
    }
    locator::find_database_path_anywhere()
}
```

5. Ensure the existing top-of-file `pub use locator::{resolve_database_path, ...};` declaration from Task 1 still re-exports the constants. If it does not yet include them, update to:

```rust
pub use locator::{resolve_database_path, DATABASE_FILE_NAME, DATA_DIRECTORY, SCREENSHOTS_DIRECTORY};
```

- [ ] **Step 4.3: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib stream::records`
Expected: 17 tests pass. No test reorganization needed — the facade-level tests still drive through `OverlayRecordRepository`.

- [ ] **Step 4.4: Commit**

```bash
git add src-tauri/src/stream/records.rs src-tauri/src/stream/records/locator.rs
git commit -m "Move stream records database path discovery into locator submodule"
```

---

## Task 5: Collapse `records.rs` into `records/mod.rs`

Now that `records.rs` holds only the facade (`OverlayRecordRepository`, re-exports, and a few facade tests), rename it to the canonical directory-module form.

**Files:**
- Create: `src-tauri/src/stream/records/mod.rs`
- Delete: `src-tauri/src/stream/records.rs`

- [ ] **Step 5.1: Copy `records.rs` content to `records/mod.rs`**

```bash
git mv src-tauri/src/stream/records.rs src-tauri/src/stream/records/mod.rs
```

- [ ] **Step 5.2: Remove `#[path = "records/..."]` declarations**

In `src-tauri/src/stream/records/mod.rs`, replace the `#[path]`-decorated `mod` lines at the top with plain `mod` lines (no `#[path]` attribute needed once the file lives inside the directory):

```rust
mod image;
mod locator;
mod mapper;
mod repo;

pub use image::resolve_overlay_image_path;
pub use locator::{resolve_database_path, DATABASE_FILE_NAME, DATA_DIRECTORY, SCREENSHOTS_DIRECTORY};
pub use mapper::OverlayRecord;
use mapper::to_overlay_record;
pub(crate) use repo::OverlayRecordRow;
use repo::{
    delete_overlay_record_row, load_latest_overlay_record, load_overlay_record_by_id,
    load_overlay_record_count, load_overlay_record_list,
};
```

- [ ] **Step 5.3: Refactor `OverlayRecordRepository::delete_record` to use `delete_overlay_record_row`**

Inside `src-tauri/src/stream/records/mod.rs`, replace the body of `delete_record` (now that repo.rs owns the SQL) with:

```rust
pub fn delete_record(&self, record_id: &str) -> Result<bool, String> {
    let database_path = self.database_path()?;
    let (deleted, image_relative_path) = delete_overlay_record_row(&database_path, record_id)?;
    if !deleted {
        return Ok(false);
    }

    if let Some(relative) = image_relative_path {
        let image_path = self.resolve_image_path(Some(&relative));
        if let Some(path) = image_path {
            match std::fs::remove_file(&path) {
                Ok(()) => {}
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
                Err(err) => {
                    eprintln!(
                        "failed to remove deleted stream image {}: {err}",
                        path.display()
                    );
                }
            }
        }
    }

    Ok(true)
}
```

Confirm that the `resolve_image_path` helper from Task 1 Step 1.6 is still present on `OverlayRecordRepository` — `delete_record` depends on it. Its body should already be:

```rust
fn resolve_image_path(&self, raw_path: Option<&str>) -> Option<PathBuf> {
    resolve_overlay_image_path(self.game_path.clone(), raw_path)
}
```

If it was accidentally deleted during Task 3, re-add it here.

- [ ] **Step 5.4: Run the full test matrix**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: full crate test suite green, including the 17 tests under `stream::records::*` and all unrelated tests that were already passing. Confirm output contains `test result: ok` for every module listed.

- [ ] **Step 5.5: Confirm no external call sites broke**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: zero warnings/errors. The facade re-exports (`OverlayRecord`, `OverlayRecordRepository`, `resolve_database_path`) resolve for callers in:

- `src-tauri/src/commands/stream.rs:6` (`records::{OverlayRecord, OverlayRecordRepository}`)
- `src-tauri/src/stream/http.rs:2` (`super::records::OverlayRecordRepository`)
- `src-tauri/src/stream/server.rs:4` (`records::OverlayRecordRepository`)

- [ ] **Step 5.6: Run `npm run check` on the frontend as a sanity pass**

Run: `npm run check`
Expected: zero errors. This phase should not touch frontend type resolution, but the check takes under a minute and catches any accidental editor-side regression on `src/lib/types.ts` if the Rust-side serde names drifted. If any error appears, stop and re-read `commands/stream.rs` to ensure no struct field was renamed.

- [ ] **Step 5.7: Commit**

```bash
git add src-tauri/src/stream/records/mod.rs
git commit -m "Collapse stream records facade into records/mod.rs"
```

---

## Task 6: Final audit and PR

- [ ] **Step 6.1: Confirm the directory layout**

Run: `ls -la src-tauri/src/stream/records`
Expected:

```
image.rs
locator.rs
mapper.rs
mod.rs
repo.rs
```

And: `ls src-tauri/src/stream/records.rs 2>/dev/null`
Expected: no such file (file does not exist).

- [ ] **Step 6.2: Confirm per-file line counts**

Run: `wc -l src-tauri/src/stream/records/*.rs`
Expected: no file exceeds ~350 lines. If `mod.rs` is still over 350 lines, look for facade logic that should have migrated to `repo.rs` or `mapper.rs` and surface it in the PR description rather than leaving it mixed.

- [ ] **Step 6.3: Open the PR**

Branch: `phase-1-1-records-split`
Title: `Split stream records module by concern`
Body:

```
## Summary
- Split src-tauri/src/stream/records.rs (970 lines) into a records/ directory module with five focused files: mod.rs (facade), repo.rs (SQL), image.rs (path resolution), mapper.rs (row → DTO), locator.rs (DB path discovery).
- No behavior change. Public API (OverlayRecord, OverlayRecordRepository, resolve_database_path) is preserved via re-exports.
- Subtitle composition now has direct unit tests in mapper.rs.

## Test plan
- [x] cargo test --manifest-path src-tauri/Cargo.toml (17 stream::records tests + full crate suite)
- [x] cargo check --manifest-path src-tauri/Cargo.toml
- [x] npm run check

Parent spec: docs/superpowers/specs/2026-04-17-installer-cohesion-refactor-design.md

Release Notes:

- N/A
```

- [ ] **Step 6.4: Wait for review**

Do not start Phase 1.2 (`detect.rs` split) before this PR lands. Per the parent spec, Phase 1 sub-PRs must merge within one week to avoid prolonged half-done splits.

---

## Self-Review Notes (completed while writing this plan)

- Every task produces a working crate state: `cargo test` passes after each commit.
- No placeholders, no "similar to above". The repo.rs test scaffold explicitly calls out to paste the 11 tests verbatim because repeating them here would bloat the plan and they already exist in the source.
- Symbol visibility is traced end-to-end: `pub(super)` for cross-file-but-in-module helpers, `pub(crate)` for types used by other crates only if needed (none are here), `pub` only for the facade surface.
- The `#[path]` trick in Tasks 1–4 avoids the Rust constraint that `records.rs` and `records/` cannot coexist; Task 5 removes the `#[path]` attributes once the legacy file is gone.
- The facade tests in `mod.rs` cover the image-url-on-real-filesystem path, which is the integration point between `image.rs`, `repo.rs`, and `mapper.rs` — verifies the composition actually works.
