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
                let month_start = now
                    .date_naive()
                    .with_day(1)
                    .expect("day 1 is always a valid day")
                    .and_hms_opt(0, 0, 0)
                    .expect("midnight is always a valid time");
                now.timezone()
                    .from_local_datetime(&month_start)
                    .earliest()?
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
    let skipped_pending_uploads = pending_upload_count(&conn, has_uploads_table, cutoff_utc)?;
    let referenced_paths = all_screenshot_relative_paths(&conn)?;
    let orphan_files = scan_orphan_screenshot_files(
        &screenshots_dir,
        &referenced_paths,
        cutoff.map(|c| c.local_date),
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

fn scan_orphan_screenshot_files(
    screenshots_dir: &Path,
    referenced_paths: &HashSet<String>,
    cutoff_local_date: Option<NaiveDate>,
) -> Vec<PathBuf> {
    if !screenshots_dir.exists() {
        return Vec::new();
    }

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
        if cutoff_local_date.is_some_and(|cutoff_date| folder_date >= cutoff_date) {
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
    items
        .iter()
        .filter_map(|item| resolve_cleanup_file_path(screenshots_dir, &item.image_relative_path))
        .map(|path| file_size(&path))
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
        let plan =
            plan_screenshot_cleanup(&fixture.database_path, &fixture.game_path, Some(&cutoff))
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
        let plan =
            plan_screenshot_cleanup(&fixture.database_path, &fixture.game_path, Some(&cutoff))
                .unwrap();

        assert!(plan.items.is_empty());
        assert_eq!(plan.orphan_files, vec![orphan]);
        assert_eq!(
            plan.upload_cache_files,
            vec![stale_extensionless_cache, stale_cache]
        );
    }

    #[test]
    fn plan_skips_screenshot_root_read_errors() {
        let fixture = create_fixture();
        fs::remove_dir(&fixture.screenshots_dir).unwrap();
        fs::write(&fixture.screenshots_dir, b"not a directory").unwrap();

        let cutoff = cutoff("2026-07-01T00:00:00Z", (2026, 7, 1));
        let plan =
            plan_screenshot_cleanup(&fixture.database_path, &fixture.game_path, Some(&cutoff))
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
        let plan =
            plan_screenshot_cleanup(&fixture.database_path, &fixture.game_path, Some(&cutoff))
                .unwrap();

        assert_eq!(plan.orphan_files, vec![orphan]);
        assert!(plan.upload_cache_files.is_empty());
    }

    #[test]
    fn plan_on_missing_database_is_empty() {
        let temp_dir = TempDir::new().unwrap();
        let game_path = temp_dir.path().to_path_buf();
        let database_path = game_path.join("BazaarPlusPlusV4").join("bazaarplusplus.db");

        let plan = plan_screenshot_cleanup(&database_path, &game_path, None).unwrap();

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

        let plan = plan_screenshot_cleanup(&database_path, &game_path, None).unwrap();

        assert!(plan.items.is_empty());
        assert!(plan.orphan_files.is_empty());
        assert!(plan.upload_cache_files.is_empty());
        assert_eq!(plan.estimated_bytes, 0);
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
}
