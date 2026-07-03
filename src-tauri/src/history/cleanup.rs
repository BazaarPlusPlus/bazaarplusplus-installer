use chrono::{DateTime, Datelike, Duration, NaiveDate, SecondsFormat, TimeZone, Utc};
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::history::files::resolve_cleanup_file_path;
use crate::history::queries::{open_cleanup_connection, open_connection, table_exists};

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
    pub fn for_preset<Tz: TimeZone>(
        preset: CleanupPreset,
        now: DateTime<Tz>,
    ) -> Option<CleanupCutoff> {
        let instant = match preset {
            CleanupPreset::All => return None,
            CleanupPreset::OlderThan7Days => now.clone() - Duration::days(7),
            CleanupPreset::BeforeThisMonth => {
                let first_of_month = now
                    .date_naive()
                    .with_day(1)
                    .expect("day 1 is always a valid day");
                let month_start = first_of_month
                    .and_hms_opt(0, 0, 0)
                    .expect("midnight is always a valid time");
                // A spring-forward DST gap can make local midnight on the 1st
                // not exist, so `earliest()` returns None. That must NOT collapse
                // to `None` here — `None` is the wire meaning of preset `All`
                // (delete everything). Fall back to local noon (no timezone skips
                // noon) so a bounded preset always yields a real cutoff.
                now.timezone()
                    .from_local_datetime(&month_start)
                    .earliest()
                    .or_else(|| {
                        now.timezone()
                            .from_local_datetime(
                                &first_of_month
                                    .and_hms_opt(12, 0, 0)
                                    .expect("noon is always a valid time"),
                            )
                            .earliest()
                    })
                    .unwrap_or_else(|| now.clone() - Duration::days(31))
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

const UPLOAD_CACHE_DIRECTORY: &str = "UploadCache";

#[derive(Clone, Debug, PartialEq)]
pub struct ScreenshotCleanupItem {
    pub screenshot_id: String,
    pub image_relative_path: String,
    delete_image_file: bool,
}

#[derive(Clone, Debug, PartialEq)]
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
    pub fn empty() -> ScreenshotCleanupPlan {
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
    today_local_date: NaiveDate,
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
    let screenshots_dir = crate::services::paths::screenshots_dir(game_path);
    let items = eligible_screenshots(&conn, has_uploads_table, cutoff_utc)?;
    let remaining_referenced_paths =
        remaining_screenshot_relative_paths_after_cleanup(&conn, &items)?;
    let items = mark_screenshot_file_deletions(items, &remaining_referenced_paths);
    let skipped_pending_uploads = pending_upload_count(&conn, has_uploads_table, cutoff_utc)?;
    let referenced_paths = all_screenshot_relative_paths(&conn)?;
    let orphan_files = scan_orphan_screenshot_files(
        &screenshots_dir,
        &referenced_paths,
        cutoff.map(|c| c.local_date),
        today_local_date,
    );

    let mut remaining_screenshot_ids = all_screenshot_ids(&conn)?;
    for item in &items {
        remaining_screenshot_ids.remove(&item.screenshot_id);
    }
    let upload_cache_files = scan_upload_cache_files(&screenshots_dir, &remaining_screenshot_ids);

    let estimated_bytes = estimate_screenshot_bytes(&screenshots_dir, &items)
        + orphan_files.iter().map(|path| file_size(path)).sum::<i64>()
        + upload_cache_files
            .iter()
            .map(|path| file_size(path))
            .sum::<i64>();

    Ok(ScreenshotCleanupPlan {
        items,
        orphan_files,
        upload_cache_files,
        estimated_bytes,
        skipped_pending_uploads,
    })
}

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
    today_local_date: NaiveDate,
) -> Result<ScreenshotCleanupResult, String> {
    let plan = plan_screenshot_cleanup(database_path, game_path, cutoff, today_local_date)?;
    let screenshots_dir = crate::services::paths::screenshots_dir(game_path);
    let mut deleted_rows = 0i64;
    let mut deleted_files = 0i64;
    let mut freed_bytes = 0i64;
    let mut deleted_screenshot_paths = HashSet::new();

    if !plan.items.is_empty() {
        let mut conn = open_cleanup_connection(database_path)?;
        for chunk in plan.items.chunks(CLEANUP_CHUNK_SIZE) {
            // Files first, then rows, mirroring the delete-video precedent:
            // a crash in between leaves a row whose 404 is handled by every
            // consumer, never a file that a fresh row can no longer describe.
            for item in chunk {
                if !item.delete_image_file {
                    continue;
                }
                if let Some(path) =
                    resolve_cleanup_file_path(&screenshots_dir, &item.image_relative_path)
                {
                    let normalized = normalize_relative_path(&item.image_relative_path);
                    if !deleted_screenshot_paths.insert(normalized) {
                        continue;
                    }
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

    for path in plan
        .orphan_files
        .iter()
        .chain(plan.upload_cache_files.iter())
    {
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

#[derive(Clone, Debug, PartialEq)]
pub struct RunDataVideoCleanupItem {
    pub video_id: String,
    pub relative_path: String,
    delete_video_file: bool,
}

pub struct RunDataCleanupItem {
    pub run_id: String,
    pub battle_ids: Vec<String>,
    pub videos: Vec<RunDataVideoCleanupItem>,
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
    pub fn empty() -> RunDataCleanupPlan {
        RunDataCleanupPlan {
            items: Vec::new(),
            estimated_bytes: 0,
            skipped_pending_uploads: 0,
        }
    }

    pub fn to_preview(&self) -> RunDataCleanupPreview {
        RunDataCleanupPreview {
            runs: self.items.len() as i64,
            battles: self
                .items
                .iter()
                .map(|item| item.battle_ids.len() as i64)
                .sum(),
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

    let has_battles_table = table_exists(&conn, "battles")?;
    let has_replay_dirty_column =
        has_battles_table && column_exists(&conn, "battles", "replay_dirty")?;
    let has_sync_table = table_exists(&conn, "run_sync_state")?;
    let has_screenshots_table = table_exists(&conn, "run_screenshots")?;
    let has_uploads_table =
        has_screenshots_table && table_exists(&conn, "bazaardb_snapshot_uploads")?;
    let cutoff_utc = cutoff.map(|value| value.utc.as_str());
    let run_ids = eligible_run_ids(
        &conn,
        has_replay_dirty_column,
        has_sync_table,
        has_uploads_table,
        cutoff_utc,
    )?;
    let skipped_pending_uploads = skipped_pending_run_count(
        &conn,
        has_replay_dirty_column,
        has_sync_table,
        has_uploads_table,
        cutoff_utc,
    )?;
    let remaining_screenshot_paths = remaining_screenshot_relative_paths_after_run_cleanup(
        &conn,
        has_screenshots_table,
        &run_ids,
    )?;
    let remaining_video_paths =
        remaining_video_relative_paths_after_run_cleanup(&conn, has_battles_table, &run_ids)?;

    let screenshots_dir = crate::services::paths::screenshots_dir(game_path);
    let videos_dir = crate::services::paths::combat_replay_videos_dir(game_path);
    let replays_dir = crate::services::paths::combat_replays_dir(game_path);

    let mut items = Vec::new();
    let mut screenshot_items_for_estimate = Vec::new();
    let mut video_items_for_estimate = Vec::new();
    let mut estimated_bytes = 0i64;
    for run_id in run_ids {
        let battle_ids = run_battle_ids(&conn, has_battles_table, &run_id)?;
        let videos = mark_video_file_deletions(
            run_video_refs(&conn, has_battles_table, &run_id)?,
            &remaining_video_paths,
        );
        let screenshots = mark_screenshot_file_deletions(
            run_screenshot_items(&conn, has_screenshots_table, &run_id)?,
            &remaining_screenshot_paths,
        );

        for battle_id in &battle_ids {
            if let Some(path) = replay_payload_path(&replays_dir, battle_id) {
                estimated_bytes += file_size(&path);
            }
        }
        video_items_for_estimate.extend(videos.iter().cloned());
        screenshot_items_for_estimate.extend(screenshots.iter().cloned());

        items.push(RunDataCleanupItem {
            run_id,
            battle_ids,
            videos,
            screenshots,
        });
    }

    estimated_bytes += estimate_video_bytes(&videos_dir, &video_items_for_estimate);
    estimated_bytes += estimate_screenshot_bytes(&screenshots_dir, &screenshot_items_for_estimate);

    Ok(RunDataCleanupPlan {
        items,
        estimated_bytes,
        skipped_pending_uploads,
    })
}

/// Runs are heavier than screenshots (multiple tables + cascade per row),
/// so chunks are smaller to keep each write transaction short while the game
/// may also be writing to the WAL database.
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
    let mut deleted_video_paths = HashSet::new();
    let mut deleted_replay_payloads = HashSet::new();
    let mut deleted_screenshot_paths = HashSet::new();

    if !plan.items.is_empty() {
        let mut conn = open_cleanup_connection(database_path)?;
        validate_run_cleanup_cascade_fks(&conn)?;
        for chunk in plan.items.chunks(RUN_CLEANUP_CHUNK_SIZE) {
            for item in chunk {
                for video in &item.videos {
                    if !video.delete_video_file {
                        continue;
                    }
                    let Some(path) = resolve_cleanup_file_path(&videos_dir, &video.relative_path)
                    else {
                        continue;
                    };
                    let normalized = normalize_relative_path(&video.relative_path);
                    if normalized.is_empty() {
                        continue;
                    }
                    if !deleted_video_paths.insert(normalized) {
                        continue;
                    }
                    freed_bytes += file_size(&path);
                    if remove_file_if_exists(&path)? {
                        deleted_files += 1;
                    }
                }

                for battle_id in &item.battle_ids {
                    let Some(path) = replay_payload_path(&replays_dir, battle_id) else {
                        continue;
                    };
                    if !deleted_replay_payloads.insert(battle_id.trim().to_string()) {
                        continue;
                    }
                    freed_bytes += file_size(&path);
                    if remove_file_if_exists(&path)? {
                        deleted_files += 1;
                    }
                }

                for screenshot in &item.screenshots {
                    if !screenshot.delete_image_file {
                        continue;
                    }
                    let Some(path) = resolve_cleanup_file_path(
                        &screenshots_dir,
                        &screenshot.image_relative_path,
                    ) else {
                        continue;
                    };
                    let normalized = normalize_relative_path(&screenshot.image_relative_path);
                    if !deleted_screenshot_paths.insert(normalized) {
                        continue;
                    }
                    freed_bytes += file_size(&path);
                    if remove_file_if_exists(&path)? {
                        deleted_files += 1;
                    }
                }
            }

            let transaction = conn.transaction().map_err(|err| err.to_string())?;
            for item in chunk {
                // These tables do not cascade from runs in the mod schema.
                // All other run-owned tables are deleted through the runs FK.
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

fn eligible_run_ids(
    conn: &Connection,
    has_replay_dirty_column: bool,
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
         and (?1 is null or datetime(coalesce(r.ended_at_utc, r.last_seen_at_utc, r.started_at_utc)) < datetime(?1)) ",
    );
    if has_replay_dirty_column {
        sql.push_str(
            "and not exists (
                select 1 from battles b where b.run_id = r.run_id and b.replay_dirty = 1
             ) ",
        );
    }
    if has_sync_table {
        sql.push_str(
            "and not (
                coalesce(s.dirty, 0) = 1 and r.completed = 1 and r.game_mode = 'Ranked'
             ) ",
        );
    }
    if has_uploads_table {
        sql.push_str(
            "and not exists (
                select 1
                from run_screenshots rs
                join bazaardb_snapshot_uploads u on u.snapshot_id = rs.screenshot_id
                where rs.run_id = r.run_id and u.status = 'pending'
             ) ",
        );
    }
    sql.push_str(
        "order by datetime(coalesce(r.ended_at_utc, r.last_seen_at_utc, r.started_at_utc)) asc, r.run_id asc",
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
    has_replay_dirty_column: bool,
    has_sync_table: bool,
    has_uploads_table: bool,
    cutoff_utc: Option<&str>,
) -> Result<i64, String> {
    let mut gates = Vec::new();
    if has_replay_dirty_column {
        gates.push(
            "exists (
                select 1 from battles b where b.run_id = r.run_id and b.replay_dirty = 1
             )",
        );
    }
    if has_sync_table {
        gates.push("(coalesce(s.dirty, 0) = 1 and r.completed = 1 and r.game_mode = 'Ranked')");
    }
    if has_uploads_table {
        gates.push(
            "exists (
                select 1
                from run_screenshots rs
                join bazaardb_snapshot_uploads u on u.snapshot_id = rs.screenshot_id
                where rs.run_id = r.run_id and u.status = 'pending'
             )",
        );
    }
    if gates.is_empty() {
        return Ok(0);
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

fn run_battle_ids(
    conn: &Connection,
    has_battles_table: bool,
    run_id: &str,
) -> Result<Vec<String>, String> {
    if !has_battles_table {
        return Ok(Vec::new());
    }

    let mut stmt = conn
        .prepare("select battle_id from battles where run_id = ?1 order by battle_id asc")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([run_id], |row| row.get::<_, String>(0))
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())
}

fn run_video_refs(
    conn: &Connection,
    has_battles_table: bool,
    run_id: &str,
) -> Result<Vec<RunDataVideoCleanupItem>, String> {
    if !has_battles_table || !table_exists(conn, "combat_replay_videos")? {
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
            Ok(RunDataVideoCleanupItem {
                video_id: row.get(0)?,
                relative_path: row.get(1)?,
                delete_video_file: false,
            })
        })
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())
}

fn run_screenshot_items(
    conn: &Connection,
    has_screenshots_table: bool,
    run_id: &str,
) -> Result<Vec<ScreenshotCleanupItem>, String> {
    if !has_screenshots_table {
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
                delete_image_file: false,
            })
        })
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())
}

fn remaining_screenshot_relative_paths_after_run_cleanup(
    conn: &Connection,
    has_screenshots_table: bool,
    planned_run_ids: &[String],
) -> Result<HashSet<String>, String> {
    if !has_screenshots_table || planned_run_ids.is_empty() {
        return Ok(HashSet::new());
    }

    let planned_run_ids = planned_run_ids
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let mut stmt = conn
        .prepare("select run_id, image_relative_path from run_screenshots")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, Option<String>>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|err| err.to_string())?;

    let mut paths = HashSet::new();
    for row in rows {
        let (run_id, image_relative_path) = row.map_err(|err| err.to_string())?;
        if run_id
            .as_deref()
            .is_some_and(|run_id| planned_run_ids.contains(run_id))
        {
            continue;
        }
        let normalized = normalize_relative_path(&image_relative_path);
        if !normalized.is_empty() {
            paths.insert(normalized);
        }
    }
    Ok(paths)
}

fn remaining_video_relative_paths_after_run_cleanup(
    conn: &Connection,
    has_battles_table: bool,
    planned_run_ids: &[String],
) -> Result<HashSet<String>, String> {
    if !has_battles_table
        || planned_run_ids.is_empty()
        || !table_exists(conn, "combat_replay_videos")?
    {
        return Ok(HashSet::new());
    }

    let planned_run_ids = planned_run_ids
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let mut stmt = conn
        .prepare(
            "select b.run_id, v.video_relative_path
             from combat_replay_videos v
             left join battles b on b.battle_id = v.battle_id",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, Option<String>>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|err| err.to_string())?;

    let mut paths = HashSet::new();
    for row in rows {
        let (run_id, video_relative_path) = row.map_err(|err| err.to_string())?;
        if run_id
            .as_deref()
            .is_some_and(|run_id| planned_run_ids.contains(run_id))
        {
            continue;
        }
        let normalized = normalize_relative_path(&video_relative_path);
        if !normalized.is_empty() {
            paths.insert(normalized);
        }
    }
    Ok(paths)
}

/// Replay payload path: <CombatReplays>/<battleId>.payload.mpack.gz.
fn replay_payload_path(replays_dir: &Path, battle_id: &str) -> Option<PathBuf> {
    let trimmed = battle_id.trim();
    // `:` guards against a Windows drive-relative id like `C:target`, which has
    // no `/`/`\\` yet escapes `replays_dir` when joined via its drive prefix.
    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains(':')
        || trimmed.contains("..")
    {
        return None;
    }
    let path = replays_dir.join(format!("{trimmed}.payload.mpack.gz"));
    path.starts_with(replays_dir).then_some(path)
}

fn column_exists(conn: &Connection, table_name: &str, column_name: &str) -> Result<bool, String> {
    conn.query_row(
        "select exists(select 1 from pragma_table_info(?1) where name = ?2)",
        params![table_name, column_name],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value != 0)
    .map_err(|err| err.to_string())
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
          and (?1 is null or datetime(s.captured_at_utc) < datetime(?1))
          and (u.status is null or u.status <> 'pending')
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
                delete_image_file: false,
            })
        })
        .map_err(|err| err.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())
}

fn pending_upload_count(
    conn: &Connection,
    has_uploads_table: bool,
    cutoff_utc: Option<&str>,
) -> Result<i64, String> {
    if !has_uploads_table {
        return Ok(0);
    }

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

    let mut paths = HashSet::new();
    for row in rows {
        let normalized = normalize_relative_path(&row.map_err(|err| err.to_string())?);
        if !normalized.is_empty() {
            paths.insert(normalized);
        }
    }
    Ok(paths)
}

fn remaining_screenshot_relative_paths_after_cleanup(
    conn: &Connection,
    items: &[ScreenshotCleanupItem],
) -> Result<HashSet<String>, String> {
    let planned_ids = items
        .iter()
        .map(|item| item.screenshot_id.as_str())
        .collect::<HashSet<_>>();
    let mut stmt = conn
        .prepare("select screenshot_id, image_relative_path from run_screenshots")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|err| err.to_string())?;

    let mut paths = HashSet::new();
    for row in rows {
        let (screenshot_id, image_relative_path) = row.map_err(|err| err.to_string())?;
        if planned_ids.contains(screenshot_id.as_str()) {
            continue;
        }
        let normalized = normalize_relative_path(&image_relative_path);
        if !normalized.is_empty() {
            paths.insert(normalized);
        }
    }
    Ok(paths)
}

fn mark_video_file_deletions(
    items: Vec<RunDataVideoCleanupItem>,
    remaining_referenced_paths: &HashSet<String>,
) -> Vec<RunDataVideoCleanupItem> {
    items
        .into_iter()
        .map(|mut item| {
            let normalized = normalize_relative_path(&item.relative_path);
            item.delete_video_file =
                !normalized.is_empty() && !remaining_referenced_paths.contains(&normalized);
            item
        })
        .collect()
}

fn mark_screenshot_file_deletions(
    items: Vec<ScreenshotCleanupItem>,
    remaining_referenced_paths: &HashSet<String>,
) -> Vec<ScreenshotCleanupItem> {
    items
        .into_iter()
        .map(|mut item| {
            let normalized = normalize_relative_path(&item.image_relative_path);
            item.delete_image_file =
                !normalized.is_empty() && !remaining_referenced_paths.contains(&normalized);
            item
        })
        .collect()
}

fn all_screenshot_ids(conn: &Connection) -> Result<HashSet<String>, String> {
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
    Ok(ids)
}

fn estimate_video_bytes(videos_dir: &Path, items: &[RunDataVideoCleanupItem]) -> i64 {
    let mut estimated_paths = HashSet::new();
    items
        .iter()
        .filter(|item| item.delete_video_file)
        .filter_map(|item| {
            let path = resolve_cleanup_file_path(videos_dir, &item.relative_path)?;
            let normalized = normalize_relative_path(&item.relative_path);
            estimated_paths
                .insert(normalized)
                .then_some(file_size(&path))
        })
        .sum()
}

fn scan_orphan_screenshot_files(
    screenshots_dir: &Path,
    referenced_paths: &HashSet<String>,
    cutoff_local_date: Option<NaiveDate>,
    today_local_date: NaiveDate,
) -> Vec<PathBuf> {
    if !screenshots_dir.exists() {
        return Vec::new();
    }

    // Folders whose date is at or after this floor are never swept for orphans.
    // Today's local-date folder is ALWAYS protected — that is why the floor is
    // `today_local_date` even under preset `all` (cutoff `None`). The mod writes
    // a screenshot's PNG to disk (via an atomic `<name>.png.<guid>.tmp` rename)
    // BEFORE it inserts the matching `run_screenshots` row, and it names the
    // dated folder from local capture time. So a file captured "now" briefly has
    // no row; sweeping today's folder would classify that in-flight file (or its
    // transient `.tmp` sibling) as an orphan and delete it, leaving the mod to
    // insert a row pointing at a missing file. A bounded preset's cutoff is
    // always <= today, so `min` keeps its existing, stricter protection. (Known
    // residual: a capture straddling local midnight can land in yesterday's
    // folder; that sub-second window is left open by design rather than
    // injecting a clock for an mtime grace check.)
    let protect_from = cutoff_local_date.map_or(today_local_date, |cutoff_date| {
        cutoff_date.min(today_local_date)
    });

    let mut orphan_files = Vec::new();
    let Ok(entries) = std::fs::read_dir(screenshots_dir) else {
        return orphan_files;
    };

    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }

        let folder_name = entry.file_name();
        let Some(folder_name) = folder_name.to_str() else {
            continue;
        };
        let Ok(folder_date) = NaiveDate::parse_from_str(folder_name, "%Y-%m-%d") else {
            continue;
        };
        if folder_date >= protect_from {
            continue;
        }

        collect_dated_folder_orphan_files(
            screenshots_dir,
            &entry.path(),
            referenced_paths,
            &mut orphan_files,
        );
    }

    orphan_files.sort();
    orphan_files
}

fn collect_dated_folder_orphan_files(
    screenshots_dir: &Path,
    directory: &Path,
    referenced_paths: &HashSet<String>,
    orphan_files: &mut Vec<PathBuf>,
) {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };

    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_file() {
            continue;
        }

        let path = entry.path();
        let Ok(relative) = path.strip_prefix(screenshots_dir) else {
            continue;
        };
        let relative = relative.to_string_lossy();
        if !referenced_paths.contains(&normalize_relative_path(&relative)) {
            orphan_files.push(path);
        }
    }
}

fn scan_upload_cache_files(screenshots_dir: &Path, keep_ids: &HashSet<String>) -> Vec<PathBuf> {
    let cache_dir = screenshots_dir.join(UPLOAD_CACHE_DIRECTORY);
    if !cache_dir.exists() {
        return Vec::new();
    }

    let mut stale_files = Vec::new();
    let Ok(entries) = std::fs::read_dir(cache_dir) else {
        return stale_files;
    };

    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_file() {
            continue;
        }

        let path = entry.path();
        let Some(stem) = path.file_stem().map(|value| value.to_string_lossy()) else {
            continue;
        };
        if !keep_ids.contains(stem.as_ref()) {
            stale_files.push(path);
        }
    }

    stale_files.sort();
    stale_files
}

fn estimate_screenshot_bytes(screenshots_dir: &Path, items: &[ScreenshotCleanupItem]) -> i64 {
    let mut estimated_paths = HashSet::new();
    items
        .iter()
        .filter(|item| item.delete_image_file)
        .filter_map(|item| {
            let path = resolve_cleanup_file_path(screenshots_dir, &item.image_relative_path)?;
            let normalized = normalize_relative_path(&item.image_relative_path);
            estimated_paths
                .insert(normalized)
                .then_some(file_size(&path))
        })
        .sum()
}

fn normalize_relative_path(path: &str) -> String {
    path.trim()
        .split(['/', '\\'])
        .filter_map(|segment| {
            let segment = segment.trim();
            (!segment.is_empty() && segment != "." && segment != "..").then_some(segment)
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn file_size(path: &Path) -> i64 {
    std::fs::metadata(path)
        .map(|metadata| metadata.len() as i64)
        .unwrap_or(0)
}

fn remove_file_if_exists(path: &Path) -> Result<bool, String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(err) => Err(format!("failed to remove {}: {err}", path.display())),
    }
}

fn validate_run_cleanup_cascade_fks(conn: &Connection) -> Result<(), String> {
    for (child_table, child_column, parent_table) in [
        ("battles", "run_id", "runs"),
        ("run_events", "run_id", "runs"),
        ("run_sync_state", "run_id", "runs"),
        ("battle_snapshots", "battle_id", "battles"),
        (
            "bazaardb_snapshot_uploads",
            "snapshot_id",
            "run_screenshots",
        ),
    ] {
        if !table_exists(conn, child_table)? {
            continue;
        }
        if !has_on_delete_cascade_fk(conn, child_table, child_column, parent_table)? {
            return Err(format!(
                "run cleanup requires {child_table}.{child_column} -> {parent_table} ON DELETE CASCADE before deleting files"
            ));
        }
    }
    Ok(())
}

fn has_on_delete_cascade_fk(
    conn: &Connection,
    child_table: &str,
    child_column: &str,
    parent_table: &str,
) -> Result<bool, String> {
    conn.query_row(
        "select exists(
            select 1
            from pragma_foreign_key_list(?1)
            where \"table\" = ?2
              and \"from\" = ?3
              and upper(on_delete) = 'CASCADE'
        )",
        params![child_table, parent_table, child_column],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value != 0)
    .map_err(|err| err.to_string())
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

#[cfg(test)]
mod tests {
    use super::{plan_screenshot_cleanup, CleanupCutoff, CleanupPreset};
    use chrono::{FixedOffset, NaiveDate, TimeZone};
    use rusqlite::Connection;
    use std::fs;
    use std::path::{Path, PathBuf};
    use tempfile::TempDir;

    struct CleanupFixture {
        #[allow(dead_code)]
        temp_dir: TempDir,
        game_path: PathBuf,
        database_path: PathBuf,
        screenshots_dir: PathBuf,
    }

    fn create_cleanup_schema(conn: &Connection) {
        conn.execute_batch(
            "
            pragma foreign_keys = on;
            create table runs (run_id text primary key, started_at_utc text not null, last_seen_at_utc text not null, status text not null, completed integer not null default 0, hero text not null, game_mode text not null, ended_at_utc text null);
            create table run_events (run_id text not null, seq integer not null, ts_utc text not null, kind text not null, payload_json text not null, primary key (run_id, seq), foreign key (run_id) references runs(run_id) on delete cascade);
            create table battles (battle_id text primary key, source text not null, run_id text null, recorded_at_utc text not null, replay_dirty integer not null default 0, deleted_at_utc text null, foreign key (run_id) references runs(run_id) on delete cascade, check ((source = 'LOCAL') or (source = 'GHOST' and run_id is null)));
            create table battle_snapshots (battle_id text primary key, player_hand_json text not null, foreign key (battle_id) references battles(battle_id) on delete cascade);
            create table run_sync_state (run_id text primary key, dirty integer not null, uploaded_seq integer null, foreign key (run_id) references runs(run_id) on delete cascade);
            create table run_screenshots (screenshot_id text primary key, run_id text null, hero_name text null, capture_source text not null, is_primary integer not null default 0, image_relative_path text not null, captured_at_utc text not null, captured_at_local text not null);
            create table bazaardb_snapshot_uploads (snapshot_id text primary key, status text not null, uploaded_at_utc text null, foreign key (snapshot_id) references run_screenshots(screenshot_id) on delete cascade);
            create table combat_replay_videos (video_id text primary key, battle_id text not null, video_relative_path text not null, started_at_utc text not null, file_size_bytes integer null, status text not null);
            ",
        )
        .unwrap();
    }

    fn create_fixture() -> CleanupFixture {
        let temp_dir = TempDir::new().unwrap();
        let game_path = temp_dir.path().to_path_buf();
        let data_dir = game_path.join("BazaarPlusPlusV4");
        let screenshots_dir = data_dir.join("Screenshots");
        let database_path = data_dir.join("bazaarplusplus.db");
        fs::create_dir_all(&screenshots_dir).unwrap();
        let conn = Connection::open(&database_path).unwrap();
        create_cleanup_schema(&conn);
        drop(conn);
        CleanupFixture {
            temp_dir,
            game_path,
            database_path,
            screenshots_dir,
        }
    }

    fn write_screenshot_file(screenshots_dir: &Path, relative: &str, bytes: &[u8]) -> PathBuf {
        let path = screenshots_dir.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, bytes).unwrap();
        path
    }

    fn cutoff(utc: &str, local_date_tuple: (i32, u32, u32)) -> CleanupCutoff {
        CleanupCutoff {
            utc: utc.to_string(),
            local_date: NaiveDate::from_ymd_opt(
                local_date_tuple.0,
                local_date_tuple.1,
                local_date_tuple.2,
            )
            .unwrap(),
        }
    }

    /// A fixed "today" for the generic cleanup tests. It sits strictly after
    /// every dated folder those tests create, so the today-folder orphan guard
    /// never masks the past-folder sweeps they assert. The guard itself is
    /// exercised by the dedicated all-preset tests below.
    fn test_today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 7, 15).unwrap()
    }

    fn insert_run(
        conn: &rusqlite::Connection,
        run_id: &str,
        status: &str,
        completed: i64,
        game_mode: &str,
        ended_at_utc: &str,
    ) {
        conn.execute(
            "insert into runs (
                run_id, started_at_utc, last_seen_at_utc, status, completed, hero, game_mode, ended_at_utc
             ) values (?1, ?2, ?2, ?3, ?4, 'Vanessa', ?5, ?2)",
            rusqlite::params![run_id, ended_at_utc, status, completed, game_mode],
        )
        .unwrap();
    }

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
        assert_eq!(
            cutoff.local_date,
            NaiveDate::from_ymd_opt(2026, 7, 8).unwrap()
        );
    }

    #[test]
    fn cutoff_before_this_month_is_local_month_start_in_utc() {
        let tz = FixedOffset::east_opt(8 * 3600).unwrap();
        let now = tz.with_ymd_and_hms(2026, 7, 15, 10, 0, 0).unwrap();
        let cutoff = CleanupCutoff::for_preset(CleanupPreset::BeforeThisMonth, now).unwrap();
        // Local 2026-07-01T00:00:00+08:00 == 2026-06-30T16:00:00Z
        assert_eq!(cutoff.utc, "2026-06-30T16:00:00Z");
        assert_eq!(
            cutoff.local_date,
            NaiveDate::from_ymd_opt(2026, 7, 1).unwrap()
        );
    }

    #[test]
    fn plan_selects_old_screenshots_and_skips_pending_uploads() {
        let fixture = create_fixture();
        let conn = Connection::open(&fixture.database_path).unwrap();
        conn.execute(
            "insert into run_screenshots (
                screenshot_id, capture_source, image_relative_path, captured_at_utc, captured_at_local
            ) values
                ('shot-old', 'end_of_run_auto', '2026-06-15/old.png', '2026-06-15T10:00:00+00:00', '2026-06-15T18:00:00+08:00'),
                ('shot-pending', 'end_of_run_auto', '2026-06-16/pending.png', '2026-06-16T10:00:00Z', '2026-06-16T18:00:00+08:00'),
                ('shot-new', 'end_of_run_auto', '2026-07-02/new.png', '2026-07-02T10:00:00Z', '2026-07-02T18:00:00+08:00')",
            [],
        )
        .unwrap();
        conn.execute(
            "insert into bazaardb_snapshot_uploads (snapshot_id, status, uploaded_at_utc) values
                ('shot-old', 'uploaded', '2026-06-15T11:00:00Z'),
                ('shot-pending', 'pending', null)",
            [],
        )
        .unwrap();
        drop(conn);

        write_screenshot_file(&fixture.screenshots_dir, "2026-06-15/old.png", b"12345");

        let cutoff = cutoff("2026-07-01T00:00:00Z", (2026, 7, 1));
        let plan = plan_screenshot_cleanup(
            &fixture.database_path,
            &fixture.game_path,
            Some(&cutoff),
            test_today(),
        )
        .unwrap();

        let item_ids = plan
            .items
            .iter()
            .map(|item| item.screenshot_id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(item_ids, vec!["shot-old"]);
        assert_eq!(plan.skipped_pending_uploads, 1);
        assert_eq!(plan.estimated_bytes, 5);
    }

    #[test]
    fn plan_detects_orphan_files_only_in_qualifying_dated_folders() {
        let fixture = create_fixture();
        let conn = Connection::open(&fixture.database_path).unwrap();
        conn.execute(
            "insert into run_screenshots (
                screenshot_id, capture_source, image_relative_path, captured_at_utc, captured_at_local
            ) values (
                'shot-kept', 'end_of_run_auto', '2026-06-15\\kept.png', '2026-07-02T10:00:00Z', '2026-07-02T18:00:00+08:00'
            )",
            [],
        )
        .unwrap();
        drop(conn);

        let _kept = write_screenshot_file(&fixture.screenshots_dir, "2026-06-15/kept.png", b"kept");
        let orphan =
            write_screenshot_file(&fixture.screenshots_dir, "2026-06-15/orphan.png", b"orphan");
        let _nested_user_file = write_screenshot_file(
            &fixture.screenshots_dir,
            "2026-06-15/nested/user-file.txt",
            b"user",
        );
        let _recent_orphan = write_screenshot_file(
            &fixture.screenshots_dir,
            "2026-07-02/recent-orphan.png",
            b"recent",
        );
        let stale_cache = write_screenshot_file(
            &fixture.screenshots_dir,
            "UploadCache/shot-gone.png",
            b"gone",
        );
        let stale_extensionless_cache =
            write_screenshot_file(&fixture.screenshots_dir, "UploadCache/shot-extra", b"extra");
        let _kept_cache = write_screenshot_file(
            &fixture.screenshots_dir,
            "UploadCache/shot-kept.jpg",
            b"kept",
        );

        let cutoff = cutoff("2026-07-01T00:00:00Z", (2026, 7, 1));
        let plan = plan_screenshot_cleanup(
            &fixture.database_path,
            &fixture.game_path,
            Some(&cutoff),
            test_today(),
        )
        .unwrap();

        assert!(plan.items.is_empty());
        assert_eq!(plan.orphan_files, vec![orphan]);
        assert_eq!(
            plan.upload_cache_files,
            vec![stale_extensionless_cache, stale_cache]
        );
    }

    #[test]
    fn plan_all_preset_skips_todays_and_future_local_folders() {
        // Under preset `all` (cutoff `None`) the orphan sweep must still protect
        // today's local-date folder: the mod writes a screenshot's PNG (and a
        // transient `<name>.png.<guid>.tmp`) to disk BEFORE inserting its
        // run_screenshots row, so a just-captured file in today's folder has no
        // row yet and must not be classified as an orphan.
        let fixture = create_fixture();
        let today = NaiveDate::from_ymd_opt(2026, 7, 3).unwrap();

        let past_orphan =
            write_screenshot_file(&fixture.screenshots_dir, "2026-06-15/past.png", b"stale");
        // Today's in-flight capture: the final PNG and its atomic temp sibling.
        let _today_png = write_screenshot_file(
            &fixture.screenshots_dir,
            "2026-07-03/2026-07-03_14-32-15-427_final_run-abc.png",
            b"live",
        );
        let _today_tmp = write_screenshot_file(
            &fixture.screenshots_dir,
            "2026-07-03/2026-07-03_14-32-15-427_final_run-abc.png.deadbeef.tmp",
            b"tmp",
        );
        // A future-dated folder (installer clock behind the mod's) is protected too.
        let _future =
            write_screenshot_file(&fixture.screenshots_dir, "2026-07-04/ahead.png", b"ahead");

        let plan = plan_screenshot_cleanup(&fixture.database_path, &fixture.game_path, None, today)
            .unwrap();

        assert!(plan.items.is_empty());
        assert_eq!(
            plan.orphan_files,
            vec![past_orphan],
            "only the past-day folder is swept; today and future are protected"
        );
        assert_eq!(plan.estimated_bytes, 5);
    }

    #[test]
    fn execute_all_preset_keeps_todays_inflight_files() {
        let fixture = create_fixture();
        let today = NaiveDate::from_ymd_opt(2026, 7, 3).unwrap();

        let past_orphan =
            write_screenshot_file(&fixture.screenshots_dir, "2026-06-15/past.png", b"stale");
        let today_png = write_screenshot_file(
            &fixture.screenshots_dir,
            "2026-07-03/2026-07-03_14-32-15-427_final_run-abc.png",
            b"live",
        );
        let today_tmp = write_screenshot_file(
            &fixture.screenshots_dir,
            "2026-07-03/2026-07-03_14-32-15-427_final_run-abc.png.deadbeef.tmp",
            b"tmp",
        );

        let result = super::execute_screenshot_cleanup(
            &fixture.database_path,
            &fixture.game_path,
            None, // preset "all"
            today,
        )
        .unwrap();

        assert_eq!(
            result.deleted_files, 1,
            "only the past-day orphan is deleted"
        );
        assert_eq!(result.freed_bytes, 5);
        assert!(!past_orphan.exists());
        assert!(
            today_png.exists(),
            "a just-captured file with no row yet must survive"
        );
        assert!(
            today_tmp.exists(),
            "the atomic .tmp sibling must survive too"
        );
        assert!(fixture.screenshots_dir.join("2026-07-03").exists());
        assert!(!fixture.screenshots_dir.join("2026-06-15").exists());
    }

    #[test]
    fn plan_skips_screenshot_root_read_errors() {
        let fixture = create_fixture();
        fs::remove_dir(&fixture.screenshots_dir).unwrap();
        fs::write(&fixture.screenshots_dir, b"not a directory").unwrap();

        let cutoff = cutoff("2026-07-01T00:00:00Z", (2026, 7, 1));
        let plan = plan_screenshot_cleanup(
            &fixture.database_path,
            &fixture.game_path,
            Some(&cutoff),
            test_today(),
        )
        .unwrap();

        assert!(plan.items.is_empty());
        assert!(plan.orphan_files.is_empty());
        assert!(plan.upload_cache_files.is_empty());
        assert_eq!(plan.estimated_bytes, 0);
    }

    #[test]
    fn plan_skips_upload_cache_read_errors() {
        let fixture = create_fixture();
        let orphan =
            write_screenshot_file(&fixture.screenshots_dir, "2026-06-15/orphan.png", b"orphan");
        fs::write(
            fixture.screenshots_dir.join("UploadCache"),
            b"not a directory",
        )
        .unwrap();

        let cutoff = cutoff("2026-07-01T00:00:00Z", (2026, 7, 1));
        let plan = plan_screenshot_cleanup(
            &fixture.database_path,
            &fixture.game_path,
            Some(&cutoff),
            test_today(),
        )
        .unwrap();

        assert_eq!(plan.orphan_files, vec![orphan]);
        assert!(plan.upload_cache_files.is_empty());
    }

    #[test]
    fn plan_on_missing_database_is_empty() {
        let temp_dir = TempDir::new().unwrap();
        let game_path = temp_dir.path().to_path_buf();
        let database_path = game_path.join("BazaarPlusPlusV4").join("bazaarplusplus.db");

        let plan = plan_screenshot_cleanup(&database_path, &game_path, None, test_today()).unwrap();

        assert!(plan.items.is_empty());
        assert!(plan.orphan_files.is_empty());
        assert_eq!(plan.estimated_bytes, 0);
    }

    #[test]
    fn plan_on_missing_screenshot_table_is_empty() {
        let temp_dir = TempDir::new().unwrap();
        let game_path = temp_dir.path().to_path_buf();
        let data_dir = game_path.join("BazaarPlusPlusV4");
        let database_path = data_dir.join("bazaarplusplus.db");
        fs::create_dir_all(&data_dir).unwrap();
        drop(Connection::open(&database_path).unwrap());

        let plan = plan_screenshot_cleanup(&database_path, &game_path, None, test_today()).unwrap();

        assert!(plan.items.is_empty());
        assert!(plan.orphan_files.is_empty());
        assert!(plan.upload_cache_files.is_empty());
        assert_eq!(plan.estimated_bytes, 0);
    }

    #[test]
    fn run_plan_applies_upload_and_activity_gates() {
        let fixture = create_fixture();
        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        insert_run(
            &conn,
            "run-safe",
            "completed",
            1,
            "Ranked",
            "2026-06-10T10:00:00Z",
        );
        insert_run(
            &conn,
            "run-dirty",
            "completed",
            1,
            "Ranked",
            "2026-06-11T10:00:00Z",
        );
        insert_run(
            &conn,
            "run-normal-dirty",
            "completed",
            1,
            "Normal",
            "2026-06-12T10:00:00Z",
        );
        insert_run(
            &conn,
            "run-active",
            "active",
            0,
            "Ranked",
            "2026-06-13T10:00:00Z",
        );
        insert_run(
            &conn,
            "run-replay-dirty",
            "completed",
            1,
            "Ranked",
            "2026-06-14T10:00:00Z",
        );
        insert_run(
            &conn,
            "run-recent",
            "completed",
            1,
            "Ranked",
            "2026-07-02T10:00:00Z",
        );
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
            insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_utc, captured_at_local
            ) values
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

        let ids = plan
            .items
            .iter()
            .map(|item| item.run_id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(ids, vec!["run-safe", "run-normal-dirty"]);
        assert_eq!(
            plan.skipped_pending_uploads, 2,
            "run-dirty and run-replay-dirty"
        );

        let safe = &plan.items[0];
        assert_eq!(safe.battle_ids, vec!["battle-safe"]);
        assert_eq!(safe.videos.len(), 1);
        assert_eq!(safe.screenshots.len(), 1);
    }

    #[test]
    fn run_plan_skips_runs_with_pending_screenshot_uploads() {
        let fixture = create_fixture();
        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        insert_run(
            &conn,
            "run-shot-pending",
            "completed",
            1,
            "Ranked",
            "2026-06-10T10:00:00Z",
        );
        conn.execute_batch(
            "
            insert into run_sync_state (run_id, dirty) values ('run-shot-pending', 0);
            insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_utc, captured_at_local
            ) values
                ('shot-p', 'run-shot-pending', 'end_of_run_auto', '2026-06-10/p.png',
                 '2026-06-10T10:00:00Z', '2026-06-10T18:00:00+08:00');
            insert into bazaardb_snapshot_uploads (snapshot_id, status) values ('shot-p', 'pending');
            ",
        )
        .unwrap();
        drop(conn);

        let plan =
            super::plan_run_data_cleanup(&fixture.database_path, &fixture.game_path, None).unwrap();
        assert!(plan.items.is_empty());
        assert_eq!(plan.skipped_pending_uploads, 1);
    }

    #[test]
    fn run_plan_preserves_shared_screenshot_file_referenced_by_skipped_run() {
        let fixture = create_fixture();
        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        insert_run(
            &conn,
            "run-clean",
            "completed",
            1,
            "Ranked",
            "2026-06-10T10:00:00Z",
        );
        insert_run(
            &conn,
            "run-shot-pending",
            "completed",
            1,
            "Ranked",
            "2026-06-10T10:05:00Z",
        );
        conn.execute_batch(
            "
            insert into run_sync_state (run_id, dirty) values
                ('run-clean', 0),
                ('run-shot-pending', 0);
            insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_utc, captured_at_local
            ) values
                ('shot-clean', 'run-clean', 'end_of_run_auto', '2026-06-10\\shared.png',
                 '2026-06-10T10:00:00Z', '2026-06-10T18:00:00+08:00'),
                ('shot-pending', 'run-shot-pending', 'end_of_run_auto', '2026-06-10/shared.png',
                 '2026-06-10T10:05:00Z', '2026-06-10T18:05:00+08:00');
            insert into bazaardb_snapshot_uploads (snapshot_id, status) values ('shot-pending', 'pending');
            ",
        )
        .unwrap();
        drop(conn);
        write_screenshot_file(&fixture.screenshots_dir, "2026-06-10/shared.png", b"shared");

        let plan =
            super::plan_run_data_cleanup(&fixture.database_path, &fixture.game_path, None).unwrap();

        assert_eq!(plan.items.len(), 1);
        assert_eq!(plan.items[0].run_id, "run-clean");
        assert_eq!(plan.items[0].screenshots.len(), 1);
        assert_eq!(plan.items[0].screenshots[0].screenshot_id, "shot-clean");
        assert!(
            !plan.items[0].screenshots[0].delete_image_file,
            "pending run still references the normalized screenshot path"
        );
        assert_eq!(plan.estimated_bytes, 0);
        assert_eq!(plan.skipped_pending_uploads, 1);
    }

    #[test]
    fn run_cleanup_preserves_shared_video_file_referenced_by_skipped_run() {
        let fixture = create_fixture();
        let videos_dir = crate::services::paths::combat_replay_videos_dir(&fixture.game_path);
        fs::create_dir_all(videos_dir.join("2026-06-10")).unwrap();
        let shared_video = videos_dir.join("2026-06-10/shared.mp4");
        fs::write(&shared_video, b"shared-video").unwrap();

        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        insert_run(
            &conn,
            "run-clean",
            "completed",
            1,
            "Ranked",
            "2026-06-10T10:00:00Z",
        );
        insert_run(
            &conn,
            "run-shot-pending",
            "completed",
            1,
            "Ranked",
            "2026-06-10T10:05:00Z",
        );
        conn.execute_batch(
            "
            insert into run_sync_state (run_id, dirty) values
                ('run-clean', 0),
                ('run-shot-pending', 0);
            insert into battles (battle_id, source, run_id, recorded_at_utc, replay_dirty) values
                ('battle-clean', 'LOCAL', 'run-clean', '2026-06-10T09:00:00Z', 0),
                ('battle-pending', 'LOCAL', 'run-shot-pending', '2026-06-10T09:05:00Z', 0);
            insert into combat_replay_videos (video_id, battle_id, video_relative_path, started_at_utc, status) values
                ('video-clean', 'battle-clean', '2026-06-10\\shared.mp4', '2026-06-10T09:01:00Z', 'COMPLETED'),
                ('video-pending', 'battle-pending', '2026-06-10/shared.mp4', '2026-06-10T09:06:00Z', 'COMPLETED');
            insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_utc, captured_at_local
            ) values
                ('shot-pending', 'run-shot-pending', 'end_of_run_auto', '2026-06-10/pending.png',
                 '2026-06-10T10:05:00Z', '2026-06-10T18:05:00+08:00');
            insert into bazaardb_snapshot_uploads (snapshot_id, status) values ('shot-pending', 'pending');
            ",
        )
        .unwrap();
        drop(conn);

        let plan =
            super::plan_run_data_cleanup(&fixture.database_path, &fixture.game_path, None).unwrap();

        assert_eq!(plan.items.len(), 1);
        assert_eq!(plan.items[0].run_id, "run-clean");
        assert_eq!(plan.items[0].videos.len(), 1);
        assert_eq!(plan.items[0].videos[0].video_id, "video-clean");
        assert_eq!(
            plan.estimated_bytes, 0,
            "skipped run still references the normalized video path"
        );

        let result =
            super::execute_run_data_cleanup(&fixture.database_path, &fixture.game_path, None)
                .unwrap();

        assert_eq!(result.deleted_runs, 1);
        assert_eq!(result.deleted_files, 0);
        assert_eq!(result.freed_bytes, 0);
        assert!(shared_video.exists(), "skipped run must keep shared video");

        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        let count = |sql: &str| -> i64 { conn.query_row(sql, [], |row| row.get(0)).unwrap() };
        assert_eq!(
            count("select count(*) from combat_replay_videos where video_id = 'video-clean'"),
            0
        );
        assert_eq!(
            count("select count(*) from combat_replay_videos where video_id = 'video-pending'"),
            1
        );
    }

    #[test]
    fn run_plan_handles_battles_table_without_replay_dirty() {
        let temp_dir = TempDir::new().unwrap();
        let game_path = temp_dir.path().to_path_buf();
        let data_dir = game_path.join("BazaarPlusPlusV4");
        let database_path = data_dir.join("bazaarplusplus.db");
        fs::create_dir_all(&data_dir).unwrap();
        let conn = rusqlite::Connection::open(&database_path).unwrap();
        conn.execute_batch(
            "
            pragma foreign_keys = on;
            create table runs (run_id text primary key, started_at_utc text not null, last_seen_at_utc text not null, status text not null, completed integer not null default 0, hero text not null, game_mode text not null, ended_at_utc text null);
            create table battles (battle_id text primary key, source text not null, run_id text null, recorded_at_utc text not null, deleted_at_utc text null, foreign key (run_id) references runs(run_id) on delete cascade, check ((source = 'LOCAL') or (source = 'GHOST' and run_id is null)));
            ",
        )
        .unwrap();
        insert_run(
            &conn,
            "legacy-run",
            "completed",
            1,
            "Ranked",
            "2026-06-10T10:00:00Z",
        );
        conn.execute(
            "insert into battles (battle_id, source, run_id, recorded_at_utc) values
                ('legacy-battle', 'LOCAL', 'legacy-run', '2026-06-10T09:00:00Z')",
            [],
        )
        .unwrap();
        drop(conn);

        let plan = super::plan_run_data_cleanup(&database_path, &game_path, None).unwrap();

        assert_eq!(plan.items.len(), 1);
        assert_eq!(plan.items[0].run_id, "legacy-run");
        assert_eq!(plan.items[0].battle_ids, vec!["legacy-battle"]);
        assert_eq!(plan.skipped_pending_uploads, 0);
    }

    #[test]
    fn run_plan_estimates_run_owned_files_with_safe_paths() {
        let fixture = create_fixture();
        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        insert_run(
            &conn,
            "run-files",
            "completed",
            1,
            "Normal",
            "2026-06-10T10:00:00Z",
        );
        conn.execute_batch(
            "
            insert into battles (battle_id, source, run_id, recorded_at_utc, replay_dirty) values
                ('battle-files', 'LOCAL', 'run-files', '2026-06-10T09:00:00Z', 0),
                ('../battle-escape', 'LOCAL', 'run-files', '2026-06-10T09:30:00Z', 0);
            insert into combat_replay_videos (
                video_id, battle_id, video_relative_path, started_at_utc, status
            ) values
                ('video-safe', 'battle-files', '2026-06-10/video.mp4', '2026-06-10T09:05:00Z', 'COMPLETED'),
                ('video-absolute', 'battle-files', '/tmp/outside.mp4', '2026-06-10T09:06:00Z', 'COMPLETED');
            insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_utc, captured_at_local
            ) values
                ('shot-files', 'run-files', 'end_of_run_auto', '2026-06-10/shot.png',
                 '2026-06-10T10:00:00Z', '2026-06-10T18:00:00+08:00'),
                ('shot-absolute', 'run-files', 'end_of_run_auto', '/tmp/outside.png',
                 '2026-06-10T10:01:00Z', '2026-06-10T18:01:00+08:00');
            ",
        )
        .unwrap();
        drop(conn);

        let videos_dir = crate::services::paths::combat_replay_videos_dir(&fixture.game_path);
        let replays_dir = crate::services::paths::combat_replays_dir(&fixture.game_path);
        fs::create_dir_all(videos_dir.join("2026-06-10")).unwrap();
        fs::create_dir_all(&replays_dir).unwrap();
        fs::write(videos_dir.join("2026-06-10/video.mp4"), b"video").unwrap();
        fs::write(
            replays_dir.join("battle-files.payload.mpack.gz"),
            b"payload",
        )
        .unwrap();
        write_screenshot_file(&fixture.screenshots_dir, "2026-06-10/shot.png", b"shot");

        let plan =
            super::plan_run_data_cleanup(&fixture.database_path, &fixture.game_path, None).unwrap();

        assert_eq!(plan.items.len(), 1);
        assert_eq!(
            plan.items[0].battle_ids,
            vec!["../battle-escape", "battle-files"]
        );
        assert_eq!(plan.items[0].videos.len(), 2);
        assert_eq!(plan.items[0].screenshots.len(), 2);
        assert_eq!(plan.estimated_bytes, 5 + 7 + 4);
    }

    #[test]
    fn execute_run_cleanup_cascades_rows_deletes_files_and_spares_ghosts() {
        let fixture = create_fixture();
        let data_dir = fixture.game_path.join("BazaarPlusPlusV4");
        let videos_dir = data_dir.join("CombatReplayVideos");
        let replays_dir = data_dir.join("CombatReplays");
        fs::create_dir_all(videos_dir.join("2026-06-10")).unwrap();
        fs::create_dir_all(&replays_dir).unwrap();
        fs::write(videos_dir.join("2026-06-10/v1.mp4"), b"vvvv").unwrap();
        fs::write(replays_dir.join("battle-1.payload.mpack.gz"), b"ppp").unwrap();
        let ghost_payload = replays_dir.join("battle-ghost.payload.mpack.gz");
        fs::write(&ghost_payload, b"gg").unwrap();
        let shot_file =
            write_screenshot_file(&fixture.screenshots_dir, "2026-06-10/shot.png", b"ss");
        let shared_shot =
            write_screenshot_file(&fixture.screenshots_dir, "2026-06-10/shared.png", b"shared");

        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        insert_run(
            &conn,
            "run-1",
            "completed",
            1,
            "Ranked",
            "2026-06-10T10:00:00Z",
        );
        insert_run(
            &conn,
            "run-pending",
            "completed",
            1,
            "Ranked",
            "2026-06-10T10:05:00Z",
        );
        conn.execute_batch(
            "
            insert into run_sync_state (run_id, dirty) values
                ('run-1', 0),
                ('run-pending', 0);
            insert into run_events (run_id, seq, ts_utc, kind, payload_json)
                values ('run-1', 1, '2026-06-10T09:00:00Z', 'test', '{}');
            insert into battles (battle_id, source, run_id, recorded_at_utc, replay_dirty) values
                ('battle-1', 'LOCAL', 'run-1', '2026-06-10T09:00:00Z', 0),
                ('battle-ghost', 'GHOST', null, '2026-06-10T09:00:00Z', 0);
            insert into battle_snapshots (battle_id, player_hand_json) values ('battle-1', '[]');
            insert into combat_replay_videos (video_id, battle_id, video_relative_path, started_at_utc, status)
                values ('video-1', 'battle-1', '2026-06-10/v1.mp4', '2026-06-10T09:05:00Z', 'COMPLETED');
            insert into run_screenshots (screenshot_id, run_id, capture_source, image_relative_path, captured_at_utc, captured_at_local)
                values
                    ('shot-1', 'run-1', 'end_of_run_auto', '2026-06-10/shot.png',
                     '2026-06-10T10:00:00Z', '2026-06-10T18:00:00+08:00'),
                    ('shot-shared', 'run-1', 'end_of_run_auto', '2026-06-10\\shared.png',
                     '2026-06-10T10:01:00Z', '2026-06-10T18:01:00+08:00'),
                    ('shot-pending', 'run-pending', 'end_of_run_auto', '2026-06-10/shared.png',
                     '2026-06-10T10:05:00Z', '2026-06-10T18:05:00+08:00');
            insert into bazaardb_snapshot_uploads (snapshot_id, status) values
                ('shot-1', 'uploaded'),
                ('shot-shared', 'uploaded'),
                ('shot-pending', 'pending');
            ",
        )
        .unwrap();
        drop(conn);

        let result =
            super::execute_run_data_cleanup(&fixture.database_path, &fixture.game_path, None)
                .unwrap();

        assert_eq!(result.deleted_runs, 1);
        // v1.mp4 + battle-1 payload + shot.png; shared.png stays for the pending run.
        assert_eq!(result.deleted_files, 3);
        assert_eq!(result.freed_bytes, 4 + 3 + 2);
        assert_eq!(result.skipped_pending_uploads, 1);

        assert!(!videos_dir.join("2026-06-10/v1.mp4").exists());
        assert!(!replays_dir.join("battle-1.payload.mpack.gz").exists());
        assert!(!shot_file.exists());
        assert!(
            shared_shot.exists(),
            "pending run must keep shared screenshot"
        );
        assert!(ghost_payload.exists(), "ghost payloads are never touched");

        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        let count = |sql: &str| -> i64 { conn.query_row(sql, [], |row| row.get(0)).unwrap() };
        assert_eq!(count("select count(*) from runs where run_id = 'run-1'"), 0);
        assert_eq!(
            count("select count(*) from run_events where run_id = 'run-1'"),
            0,
            "cascade"
        );
        assert_eq!(
            count("select count(*) from battle_snapshots where battle_id = 'battle-1'"),
            0,
            "cascade"
        );
        assert_eq!(
            count("select count(*) from run_sync_state where run_id = 'run-1'"),
            0,
            "cascade"
        );
        assert_eq!(
            count("select count(*) from run_screenshots where run_id = 'run-1'"),
            0
        );
        assert_eq!(
            count("select count(*) from bazaardb_snapshot_uploads where snapshot_id in ('shot-1', 'shot-shared')"),
            0,
            "cascade"
        );
        assert_eq!(count("select count(*) from combat_replay_videos"), 0);
        assert_eq!(
            count("select count(*) from battles where source = 'GHOST'"),
            1,
            "ghost battle survives"
        );
        assert_eq!(
            count("select count(*) from runs where run_id = 'run-pending'"),
            1
        );
        assert_eq!(
            count("select count(*) from run_screenshots where screenshot_id = 'shot-pending'"),
            1
        );
    }

    #[test]
    fn execute_run_cleanup_fails_before_file_deletion_when_battles_lacks_run_cascade() {
        let temp_dir = TempDir::new().unwrap();
        let game_path = temp_dir.path().to_path_buf();
        let data_dir = game_path.join("BazaarPlusPlusV4");
        let database_path = data_dir.join("bazaarplusplus.db");
        let videos_dir = data_dir.join("CombatReplayVideos");
        let replays_dir = data_dir.join("CombatReplays");
        fs::create_dir_all(videos_dir.join("2026-06-10")).unwrap();
        fs::create_dir_all(&replays_dir).unwrap();
        let video_file = videos_dir.join("2026-06-10/v1.mp4");
        let replay_file = replays_dir.join("battle-1.payload.mpack.gz");
        fs::write(&video_file, b"video").unwrap();
        fs::write(&replay_file, b"replay").unwrap();

        let conn = rusqlite::Connection::open(&database_path).unwrap();
        conn.execute_batch(
            "
            pragma foreign_keys = on;
            create table runs (run_id text primary key, started_at_utc text not null, last_seen_at_utc text not null, status text not null, completed integer not null default 0, hero text not null, game_mode text not null, ended_at_utc text null);
            create table battles (battle_id text primary key, source text not null, run_id text null, recorded_at_utc text not null, replay_dirty integer not null default 0, deleted_at_utc text null);
            create table combat_replay_videos (video_id text primary key, battle_id text not null, video_relative_path text not null, started_at_utc text not null, file_size_bytes integer null, status text not null);
            ",
        )
        .unwrap();
        insert_run(
            &conn,
            "run-legacy",
            "completed",
            1,
            "Ranked",
            "2026-06-10T10:00:00Z",
        );
        conn.execute_batch(
            "
            insert into battles (battle_id, source, run_id, recorded_at_utc, replay_dirty)
                values ('battle-1', 'LOCAL', 'run-legacy', '2026-06-10T09:00:00Z', 0);
            insert into combat_replay_videos (video_id, battle_id, video_relative_path, started_at_utc, status)
                values ('video-1', 'battle-1', '2026-06-10/v1.mp4', '2026-06-10T09:05:00Z', 'COMPLETED');
            ",
        )
        .unwrap();
        drop(conn);

        let error = super::execute_run_data_cleanup(&database_path, &game_path, None).unwrap_err();

        assert!(
            error.contains("battles.run_id") && error.contains("ON DELETE CASCADE"),
            "{error}"
        );
        assert!(
            video_file.exists(),
            "validation must happen before video deletion"
        );
        assert!(
            replay_file.exists(),
            "validation must happen before replay deletion"
        );

        let conn = rusqlite::Connection::open(&database_path).unwrap();
        let count = |sql: &str| -> i64 { conn.query_row(sql, [], |row| row.get(0)).unwrap() };
        assert_eq!(
            count("select count(*) from runs where run_id = 'run-legacy'"),
            1
        );
        assert_eq!(
            count("select count(*) from battles where battle_id = 'battle-1'"),
            1
        );
        assert_eq!(
            count("select count(*) from combat_replay_videos where video_id = 'video-1'"),
            1
        );
    }

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
            test_today(),
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
            .query_row(
                "select count(*) from bazaardb_snapshot_uploads",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            uploads, 1,
            "cascade must remove the deleted screenshot's upload row"
        );
    }

    #[test]
    fn execute_preserves_shared_file_referenced_by_pending_upload() {
        let fixture = create_fixture();
        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        conn.execute_batch(
            "
            insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path,
                captured_at_utc, captured_at_local
            ) values
                ('shot-old', 'run-1', 'end_of_run_auto', '2026-06-15/shared.png',
                 '2026-06-15T10:00:00Z', '2026-06-15T18:00:00+08:00'),
                ('shot-pending', 'run-2', 'end_of_run_auto', '2026-06-15/shared.png',
                 '2026-06-15T10:05:00Z', '2026-06-15T18:05:00+08:00');
            insert into bazaardb_snapshot_uploads (snapshot_id, status) values
                ('shot-old', 'uploaded'),
                ('shot-pending', 'pending');
            ",
        )
        .unwrap();
        drop(conn);
        let shared_file =
            write_screenshot_file(&fixture.screenshots_dir, "2026-06-15/shared.png", b"shared");

        let plan = plan_screenshot_cleanup(
            &fixture.database_path,
            &fixture.game_path,
            None,
            test_today(),
        )
        .unwrap();

        assert_eq!(plan.items.len(), 1);
        assert_eq!(plan.items[0].screenshot_id, "shot-old");
        assert_eq!(plan.estimated_bytes, 0);

        let result = super::execute_screenshot_cleanup(
            &fixture.database_path,
            &fixture.game_path,
            None, // preset "all"
            test_today(),
        )
        .unwrap();

        assert_eq!(result.deleted_rows, 1);
        assert_eq!(result.deleted_files, 0);
        assert_eq!(result.freed_bytes, 0);
        assert_eq!(result.skipped_pending_uploads, 1);
        assert!(shared_file.exists(), "pending upload must keep shared file");

        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        let old_rows: i64 = conn
            .query_row(
                "select count(*) from run_screenshots where screenshot_id = 'shot-old'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(old_rows, 0);
        let pending_rows: i64 = conn
            .query_row(
                "select count(*) from run_screenshots where screenshot_id = 'shot-pending'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pending_rows, 1);
    }

    #[test]
    fn execute_dedupes_duplicate_planned_rows_sharing_one_file() {
        let fixture = create_fixture();
        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        conn.execute_batch(
            "
            insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path,
                captured_at_utc, captured_at_local
            ) values
                ('shot-duplicate-a', 'run-1', 'end_of_run_auto', '2026-06-15/duplicate.png',
                 '2026-06-15T10:00:00Z', '2026-06-15T18:00:00+08:00'),
                ('shot-duplicate-b', 'run-2', 'end_of_run_auto', '2026-06-15/duplicate.png',
                 '2026-06-15T10:05:00Z', '2026-06-15T18:05:00+08:00');
            insert into bazaardb_snapshot_uploads (snapshot_id, status) values
                ('shot-duplicate-a', 'uploaded'),
                ('shot-duplicate-b', 'uploaded');
            ",
        )
        .unwrap();
        drop(conn);
        let duplicate_file = write_screenshot_file(
            &fixture.screenshots_dir,
            "2026-06-15/duplicate.png",
            b"1234",
        );

        let plan = plan_screenshot_cleanup(
            &fixture.database_path,
            &fixture.game_path,
            None,
            test_today(),
        )
        .unwrap();

        assert_eq!(plan.items.len(), 2);
        assert_eq!(plan.estimated_bytes, 4);

        let result = super::execute_screenshot_cleanup(
            &fixture.database_path,
            &fixture.game_path,
            None, // preset "all"
            test_today(),
        )
        .unwrap();

        assert_eq!(result.deleted_rows, 2);
        assert_eq!(result.deleted_files, 1);
        assert_eq!(result.freed_bytes, 4);
        assert_eq!(result.skipped_pending_uploads, 0);
        assert!(!duplicate_file.exists());

        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        let rows: i64 = conn
            .query_row("select count(*) from run_screenshots", [], |row| row.get(0))
            .unwrap();
        assert_eq!(rows, 0);
    }

    #[test]
    fn execute_deletes_planned_row_when_db_file_is_missing() {
        let fixture = create_fixture();
        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        conn.execute_batch(
            "
            insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path,
                captured_at_utc, captured_at_local
            ) values (
                'shot-missing-file', 'run-1', 'end_of_run_auto', '2026-06-15/missing.png',
                '2026-06-15T10:00:00Z', '2026-06-15T18:00:00+08:00'
            );
            insert into bazaardb_snapshot_uploads (snapshot_id, status) values
                ('shot-missing-file', 'uploaded');
            ",
        )
        .unwrap();
        drop(conn);

        let plan = plan_screenshot_cleanup(
            &fixture.database_path,
            &fixture.game_path,
            None,
            test_today(),
        )
        .unwrap();

        assert_eq!(plan.items.len(), 1);
        assert_eq!(plan.estimated_bytes, 0);

        let result = super::execute_screenshot_cleanup(
            &fixture.database_path,
            &fixture.game_path,
            None, // preset "all"
            test_today(),
        )
        .unwrap();

        assert_eq!(result.deleted_rows, 1);
        assert_eq!(result.deleted_files, 0);
        assert_eq!(result.freed_bytes, 0);

        let conn = rusqlite::Connection::open(&fixture.database_path).unwrap();
        let rows: i64 = conn
            .query_row("select count(*) from run_screenshots", [], |row| row.get(0))
            .unwrap();
        assert_eq!(rows, 0);
    }
}
