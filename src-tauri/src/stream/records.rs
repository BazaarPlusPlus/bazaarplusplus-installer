use rusqlite::Connection;
use serde::Serialize;
use std::path::{Path, PathBuf};

const DATA_DIRECTORY: &str = "BazaarPlusPlus";
const SCREENSHOTS_DIRECTORY: &str = "Screenshots";
const DATABASE_FILE_NAME: &str = "bazaarplusplus.db";

#[derive(Clone, Debug, Serialize)]
pub struct OverlayRecord {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub captured_at: String,
    pub captured_at_utc: String,
    pub image_url: Option<String>,
    pub wins: Option<i64>,
    pub position: Option<i64>,
    pub battle_count: Option<i64>,
    pub rank: Option<String>,
    pub rating: Option<i64>,
}

#[derive(Clone, Debug)]
pub(crate) struct OverlayRecordRow {
    id: String,
    hero: String,
    game_mode: String,
    captured_at: String,
    captured_at_utc: String,
    image_path: Option<String>,
    wins: Option<i64>,
    position: Option<i64>,
    battle_count: Option<i64>,
    rank: Option<String>,
    rating: Option<i64>,
}

#[derive(Clone, Debug)]
pub struct OverlayRecordRepository {
    game_path: Option<PathBuf>,
}

impl OverlayRecordRepository {
    pub fn new(game_path: Option<PathBuf>) -> Self {
        Self { game_path }
    }

    pub fn load_record_at_offset(&self, from: Option<&str>, offset: usize) -> Result<Option<OverlayRecord>, String> {
        let database_path = self.database_path()?;
        Ok(load_latest_overlay_record(&database_path, from, offset)?
            .map(|row| self.to_overlay_record(row)))
    }

    pub fn count_since(&self, from: Option<&str>) -> Result<usize, String> {
        let database_path = self.database_path()?;
        load_overlay_record_count(&database_path, from)
    }

    pub fn load_record_list(&self, from: Option<&str>, limit: Option<usize>) -> Result<Vec<OverlayRecord>, String> {
        let database_path = self.database_path()?;
        Ok(load_overlay_record_list(&database_path, from, limit)?
            .into_iter()
            .map(|row| self.to_overlay_record(row))
            .collect())
    }

    pub fn load_image(&self, record_id: &str) -> Result<Option<(PathBuf, Vec<u8>)>, String> {
        let Some(image_path) = self.load_image_path(record_id)? else {
            return Ok(None);
        };
        let bytes = std::fs::read(&image_path).map_err(|err| err.to_string())?;

        Ok(Some((image_path, bytes)))
    }

    pub fn load_image_path(&self, record_id: &str) -> Result<Option<PathBuf>, String> {
        let database_path = self.database_path()?;
        let Some(row) = load_overlay_record_by_id(&database_path, record_id)? else {
            return Ok(None);
        };

        Ok(self
            .resolve_image_path(row.image_path.as_deref())
            .filter(|path| path.exists()))
    }

    fn database_path(&self) -> Result<PathBuf, String> {
        if let Some(game_path) = &self.game_path {
            return resolve_database_path(game_path);
        }
        find_database_path_anywhere()
    }

    fn resolve_image_path(&self, raw_path: Option<&str>) -> Option<PathBuf> {
        resolve_overlay_image_path(self.game_path.clone(), raw_path)
    }

    fn to_overlay_record(&self, row: OverlayRecordRow) -> OverlayRecord {
        let image_url = self
            .resolve_image_path(row.image_path.as_deref())
            .filter(|path| path.exists())
            .map(|_| format!("/images/{}", row.id));

        let title = row.hero;
        let subtitle = match (row.wins, row.battle_count) {
            (Some(wins), Some(battles)) => {
                format!("{} · {}W · {} battles", row.game_mode, wins, battles)
            }
            (Some(wins), None) => format!("{} · {}W", row.game_mode, wins),
            (None, Some(battles)) => format!("{} · {} battles", row.game_mode, battles),
            (None, None) => row.game_mode,
        };

        OverlayRecord {
            id: row.id,
            title,
            subtitle,
            captured_at: row.captured_at,
            captured_at_utc: row.captured_at_utc,
            image_url,
            wins: row.wins,
            position: row.position,
            battle_count: row.battle_count,
            rank: row.rank,
            rating: row.rating,
        }
    }
}

fn find_database_path_anywhere() -> Result<PathBuf, String> {
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
    let from_screenshots = Some(screenshots_directory.join(&candidate));
    if let Some(path) = from_screenshots.as_ref().filter(|path| path.exists()) {
        return Some(path.clone());
    }

    from_screenshots
}

pub(crate) fn load_latest_overlay_record(
    database_path: &Path,
    from: Option<&str>,
    offset: usize,
) -> Result<Option<OverlayRecordRow>, String> {
    if !database_path.exists() {
        return Ok(None);
    }

    let conn = Connection::open(database_path).map_err(|err| err.to_string())?;
    if !table_exists(&conn, "run_screenshots")? {
        return Ok(None);
    }

    let offset_value = i64::try_from(offset).map_err(|err| err.to_string())?;
    let mut stmt = if from.is_some() {
        conn.prepare(
            "
select
  rs.screenshot_id,
  coalesce(nullif(trim(rs.hero_name), ''), 'Unknown') as hero,
  'End of run' as game_mode,
  coalesce(nullif(trim(rs.captured_at_local), ''), rs.captured_at_utc) as captured_at,
  rs.image_relative_path as image_path,
  rs.victories_at_capture as wins,
  rs.player_position,
  rs.day as battle_count,
  nullif(trim(rs.player_rank), '') as player_rank,
  rs.player_rating as player_rating,
  rs.captured_at_utc
from run_screenshots rs
where rs.capture_source = 'end_of_run_auto'
  and datetime(rs.captured_at_utc) >= datetime(?1)
order by datetime(rs.captured_at_utc) desc, rs.screenshot_id desc
limit 1 offset ?2
",
        )
    } else {
        conn.prepare(
            "
select
  rs.screenshot_id,
  coalesce(nullif(trim(rs.hero_name), ''), 'Unknown') as hero,
  'End of run' as game_mode,
  coalesce(nullif(trim(rs.captured_at_local), ''), rs.captured_at_utc) as captured_at,
  rs.image_relative_path as image_path,
  rs.victories_at_capture as wins,
  rs.player_position,
  rs.day as battle_count,
  nullif(trim(rs.player_rank), '') as player_rank,
  rs.player_rating as player_rating,
  rs.captured_at_utc
from run_screenshots rs
where rs.capture_source = 'end_of_run_auto'
order by datetime(rs.captured_at_utc) desc, rs.screenshot_id desc
limit 1 offset ?1
",
        )
    }
    .map_err(|err| err.to_string())?;
    let mut rows = if let Some(from) = from {
        stmt.query((from, offset_value))
            .map_err(|err| err.to_string())?
    } else {
        stmt.query([offset_value]).map_err(|err| err.to_string())?
    };
    let Some(row) = rows.next().map_err(|err| err.to_string())? else {
        return Ok(None);
    };

    Ok(Some(map_overlay_record_row(row)?))
}

pub(crate) fn load_overlay_record_count(
    database_path: &Path,
    from: Option<&str>,
) -> Result<usize, String> {
    if !database_path.exists() {
        return Ok(0);
    }

    let conn = Connection::open(database_path).map_err(|err| err.to_string())?;
    if !table_exists(&conn, "run_screenshots")? {
        return Ok(0);
    }

    let count: i64 = if let Some(from) = from {
        conn.query_row(
            "
select count(*)
from run_screenshots rs
where rs.capture_source = 'end_of_run_auto'
  and datetime(rs.captured_at_utc) >= datetime(?1)
",
            [from],
            |row| row.get(0),
        )
        .map_err(|err| err.to_string())?
    } else {
        conn.query_row(
            "
select count(*)
from run_screenshots rs
where rs.capture_source = 'end_of_run_auto'
",
            [],
            |row| row.get(0),
        )
        .map_err(|err| err.to_string())?
    };

    usize::try_from(count).map_err(|err| err.to_string())
}

pub(crate) fn load_overlay_record_list(
    database_path: &Path,
    from: Option<&str>,
    limit: Option<usize>,
) -> Result<Vec<OverlayRecordRow>, String> {
    if !database_path.exists() {
        return Ok(Vec::new());
    }

    let conn = Connection::open(database_path).map_err(|err| err.to_string())?;
    if !table_exists(&conn, "run_screenshots")? {
        return Ok(Vec::new());
    }

    let effective_limit = limit.unwrap_or(20);
    if effective_limit == 0 {
        return Ok(Vec::new());
    }
    let limit_value = i64::try_from(effective_limit).map_err(|err| err.to_string())?;

    let mut records = Vec::new();
    if let Some(from) = from {
        let mut stmt = conn
            .prepare(
                "
select
  rs.screenshot_id,
  coalesce(nullif(trim(rs.hero_name), ''), 'Unknown') as hero,
  'End of run' as game_mode,
  coalesce(nullif(trim(rs.captured_at_local), ''), rs.captured_at_utc) as captured_at,
  rs.image_relative_path as image_path,
  rs.victories_at_capture as wins,
  rs.player_position,
  rs.day as battle_count,
  nullif(trim(rs.player_rank), '') as player_rank,
  rs.player_rating as player_rating,
  rs.captured_at_utc
from run_screenshots rs
where rs.capture_source = 'end_of_run_auto'
  and datetime(rs.captured_at_utc) >= datetime(?1)
order by datetime(rs.captured_at_utc) desc, rs.screenshot_id desc
limit ?2
",
            )
            .map_err(|err| err.to_string())?;
        let mut rows = stmt.query((from, limit_value)).map_err(|err| err.to_string())?;
        while let Some(row) = rows.next().map_err(|err| err.to_string())? {
            records.push(map_overlay_record_row(row)?);
        }
    } else {
        let mut stmt = conn
            .prepare(
                "
select
  rs.screenshot_id,
  coalesce(nullif(trim(rs.hero_name), ''), 'Unknown') as hero,
  'End of run' as game_mode,
  coalesce(nullif(trim(rs.captured_at_local), ''), rs.captured_at_utc) as captured_at,
  rs.image_relative_path as image_path,
  rs.victories_at_capture as wins,
  rs.player_position,
  rs.day as battle_count,
  nullif(trim(rs.player_rank), '') as player_rank,
  rs.player_rating as player_rating,
  rs.captured_at_utc
from run_screenshots rs
where rs.capture_source = 'end_of_run_auto'
order by datetime(rs.captured_at_utc) desc, rs.screenshot_id desc
limit ?1
",
            )
            .map_err(|err| err.to_string())?;
        let mut rows = stmt.query([limit_value]).map_err(|err| err.to_string())?;
        while let Some(row) = rows.next().map_err(|err| err.to_string())? {
            records.push(map_overlay_record_row(row)?);
        }
    }

    Ok(records)
}

pub(crate) fn load_overlay_record_by_id(
    database_path: &Path,
    record_id: &str,
) -> Result<Option<OverlayRecordRow>, String> {
    if !database_path.exists() {
        return Ok(None);
    }

    let conn = Connection::open(database_path).map_err(|err| err.to_string())?;
    if !table_exists(&conn, "run_screenshots")? {
        return Ok(None);
    }

    let mut stmt = conn
        .prepare(
            "
select
  rs.screenshot_id,
  coalesce(nullif(trim(rs.hero_name), ''), 'Unknown') as hero,
  'End of run' as game_mode,
  coalesce(nullif(trim(rs.captured_at_local), ''), rs.captured_at_utc) as captured_at,
  rs.image_relative_path as image_path,
  rs.victories_at_capture as wins,
  rs.player_position,
  rs.day as battle_count,
  nullif(trim(rs.player_rank), '') as player_rank,
  rs.player_rating as player_rating,
  rs.captured_at_utc
from run_screenshots rs
where rs.capture_source = 'end_of_run_auto'
  and rs.screenshot_id = ?1
limit 1
",
        )
        .map_err(|err| err.to_string())?;

    let mut rows = stmt.query([record_id]).map_err(|err| err.to_string())?;
    let Some(row) = rows.next().map_err(|err| err.to_string())? else {
        return Ok(None);
    };

    Ok(Some(map_overlay_record_row(row)?))
}

fn table_exists(conn: &Connection, table_name: &str) -> Result<bool, String> {
    let exists = conn
        .query_row(
            "select exists(
                select 1
                from sqlite_master
                where type = 'table' and name = ?1
            )",
            [table_name],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|err| err.to_string())?;

    Ok(exists != 0)
}

fn map_overlay_record_row(row: &rusqlite::Row<'_>) -> Result<OverlayRecordRow, String> {
    Ok(OverlayRecordRow {
        id: row.get(0).map_err(|err| err.to_string())?,
        hero: row.get(1).map_err(|err| err.to_string())?,
        game_mode: row.get(2).map_err(|err| err.to_string())?,
        captured_at: row.get(3).map_err(|err| err.to_string())?,
        image_path: row.get(4).map_err(|err| err.to_string())?,
        wins: row.get(5).map_err(|err| err.to_string())?,
        position: row.get(6).map_err(|err| err.to_string())?,
        battle_count: row.get(7).map_err(|err| err.to_string())?,
        rank: row.get(8).map_err(|err| err.to_string())?,
        rating: row.get(9).map_err(|err| err.to_string())?,
        captured_at_utc: row.get(10).map_err(|err| err.to_string())?,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        load_latest_overlay_record, load_overlay_record_by_id, load_overlay_record_count,
        load_overlay_record_list, resolve_overlay_image_path, OverlayRecordRepository,
        DATABASE_FILE_NAME,
    };
    use std::path::PathBuf;

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

    #[test]
    fn latest_overlay_record_returns_none_when_database_has_no_rows() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_run_screenshots_table(&conn);

        let latest = load_latest_overlay_record(temp.path(), None, 0).unwrap();
        assert!(latest.is_none());
    }

    #[test]
    fn latest_overlay_record_reads_latest_end_of_run_snapshot() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_run_screenshots_table(&conn);
        conn.execute(
            "insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_local,
                captured_at_utc, day, player_rank, player_rating, player_position, victories_at_capture, hero_name
             ) values (
                'snap-1', 'run-1', 'end_of_run_auto', '2026-04-10\\shot-1.png',
                '2026-04-11T04:30:05+08:00', '2026-04-10T20:30:05+00:00',
                14, 'Diamond', 1942, 1, 10, 'Mak'
             )",
            [],
        )
        .unwrap();

        let latest = load_latest_overlay_record(temp.path(), None, 0)
            .unwrap()
            .unwrap();
        assert_eq!(latest.id, "snap-1");
        assert_eq!(latest.hero, "Mak");
        assert_eq!(latest.game_mode, "End of run");
        assert_eq!(latest.image_path.as_deref(), Some("2026-04-10\\shot-1.png"));
        assert_eq!(latest.wins, Some(10));
        assert_eq!(latest.position, Some(1));
        assert_eq!(latest.battle_count, Some(14));
        assert_eq!(latest.rank.as_deref(), Some("Diamond"));
        assert_eq!(latest.rating, Some(1942));
    }

    #[test]
    fn latest_overlay_record_ignores_other_snapshot_types() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_run_screenshots_table(&conn);
        conn.execute(
            "insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_local, captured_at_utc
             ) values
             ('snap-1', 'run-1', 'pvp_battle_start', 'battle-1.png', '2026-04-10T20:30:05+00:00', '2026-04-10T20:30:05+00:00'),
             ('snap-2', 'run-2', 'end_of_run_auto', 'final-2.png', '2026-04-10T21:30:05+00:00', '2026-04-10T21:30:05+00:00')",
            [],
        )
        .unwrap();

        let latest = load_latest_overlay_record(temp.path(), None, 0)
            .unwrap()
            .unwrap();
        assert_eq!(latest.id, "snap-2");
    }

    #[test]
    fn latest_overlay_record_returns_none_when_database_file_is_missing() {
        let temp_dir = tempfile::tempdir().unwrap();
        let missing = temp_dir.path().join("missing-bazaarplusplus.db");
        let latest = load_latest_overlay_record(&missing, None, 0).unwrap();

        assert!(latest.is_none());
    }

    #[test]
    fn latest_overlay_record_supports_backtracking_from_latest() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_run_screenshots_table(&conn);
        conn.execute(
            "insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_local, captured_at_utc, hero_name
             ) values
             ('snap-1', 'run-1', 'end_of_run_auto', 'final-1.png', '2026-04-10T20:30:05+00:00', '2026-04-10T20:30:05+00:00', 'Mak'),
             ('snap-2', 'run-2', 'end_of_run_auto', 'final-2.png', '2026-04-10T21:30:05+00:00', '2026-04-10T21:30:05+00:00', 'Pygmalien'),
             ('snap-3', 'run-3', 'end_of_run_auto', 'final-3.png', '2026-04-10T22:30:05+00:00', '2026-04-10T22:30:05+00:00', 'Vanessa')",
            [],
        )
        .unwrap();

        let latest = load_latest_overlay_record(temp.path(), None, 0)
            .unwrap()
            .unwrap();
        let previous = load_latest_overlay_record(temp.path(), None, 1)
            .unwrap()
            .unwrap();
        let oldest = load_latest_overlay_record(temp.path(), None, 2)
            .unwrap()
            .unwrap();
        let beyond = load_latest_overlay_record(temp.path(), None, 3).unwrap();

        assert_eq!(latest.id, "snap-3");
        assert_eq!(previous.id, "snap-2");
        assert_eq!(oldest.id, "snap-1");
        assert_eq!(latest.hero, "Vanessa");
        assert_eq!(previous.hero, "Pygmalien");
        assert!(beyond.is_none());
    }

    #[test]
    fn latest_overlay_record_filters_from_stream_start_time() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_run_screenshots_table(&conn);
        conn.execute(
            "insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_local, captured_at_utc, hero_name
             ) values
             ('snap-before', 'run-1', 'end_of_run_auto', 'before.png', '2026-04-10T19:30:05+00:00', '2026-04-10T19:30:05+00:00', 'Mak'),
             ('snap-after', 'run-2', 'end_of_run_auto', 'after.png', '2026-04-10T21:30:05+00:00', '2026-04-10T21:30:05+00:00', 'Pygmalien')",
            [],
        )
        .unwrap();

        let latest = load_latest_overlay_record(temp.path(), Some("2026-04-10T20:00:00+00:00"), 0)
            .unwrap()
            .unwrap();

        assert_eq!(latest.id, "snap-after");
    }

    #[test]
    fn overlay_record_count_only_counts_records_after_stream_start() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_run_screenshots_table(&conn);
        conn.execute(
            "insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_local, captured_at_utc
             ) values
             ('snap-before', 'run-1', 'end_of_run_auto', 'before.png', '2026-04-10T19:30:05+00:00', '2026-04-10T19:30:05+00:00'),
             ('snap-after-1', 'run-2', 'end_of_run_auto', 'after-1.png', '2026-04-10T21:30:05+00:00', '2026-04-10T21:30:05+00:00'),
             ('snap-after-2', 'run-3', 'end_of_run_auto', 'after-2.png', '2026-04-10T22:30:05+00:00', '2026-04-10T22:30:05+00:00'),
             ('snap-mid', 'run-4', 'pvp_battle_start', 'mid.png', '2026-04-10T23:30:05+00:00', '2026-04-10T23:30:05+00:00')",
            [],
        )
        .unwrap();

        let count =
            load_overlay_record_count(temp.path(), Some("2026-04-10T20:00:00+00:00")).unwrap();

        assert_eq!(count, 2);
    }

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
    fn repository_sets_image_url_when_relative_image_exists() {
        let temp_dir = tempfile::tempdir().unwrap();
        let game_path = temp_dir.path().join("TheBazaar");
        let data_dir = game_path.join("BazaarPlusPlus");
        let screenshots_dir = data_dir.join("Screenshots");
        std::fs::create_dir_all(&screenshots_dir).unwrap();
        std::fs::write(screenshots_dir.join("match-1.png"), b"png").unwrap();

        let database_path = data_dir.join(DATABASE_FILE_NAME);
        let conn = rusqlite::Connection::open(&database_path).unwrap();
        create_run_screenshots_table(&conn);
        conn.execute(
            "insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_local,
                captured_at_utc, victories_at_capture
             ) values (
                'snap-1', 'run-1', 'end_of_run_auto', 'match-1.png',
                '2026-04-10T20:30:05+00:00', '2026-04-10T20:30:05+00:00', 10
             )",
            [],
        )
        .unwrap();

        let repository = OverlayRecordRepository::new(Some(game_path));
        let latest = repository.load_record_at_offset(0).unwrap().unwrap();

        assert_eq!(latest.image_url.as_deref(), Some("/images/snap-1"));
    }

    #[test]
    fn repository_preserves_optional_snapshot_metrics() {
        let temp_dir = tempfile::tempdir().unwrap();
        let game_path = temp_dir.path().join("TheBazaar");
        let data_dir = game_path.join("BazaarPlusPlus");
        std::fs::create_dir_all(&data_dir).unwrap();

        let database_path = data_dir.join(DATABASE_FILE_NAME);
        let conn = rusqlite::Connection::open(&database_path).unwrap();
        create_run_screenshots_table(&conn);
        conn.execute(
            "insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_local,
                captured_at_utc, day, victories_at_capture, player_position, player_rank, player_rating, hero_name
             ) values (
                'snap-1', 'run-1', 'end_of_run_auto', 'match-1.png',
                '2026-04-10T20:30:05+00:00', '2026-04-10T20:30:05+00:00',
                14, 10, 1, 'Diamond', 500, 'Mak'
             )",
            [],
        )
        .unwrap();

        let repository = OverlayRecordRepository::new(Some(game_path));
        let latest = repository.load_record_at_offset(0).unwrap().unwrap();

        assert_eq!(latest.wins, Some(10));
        assert_eq!(latest.position, Some(1));
        assert_eq!(latest.battle_count, Some(14));
        assert_eq!(latest.rank.as_deref(), Some("Diamond"));
        assert_eq!(latest.rating, Some(500));
    }

    #[test]
    fn load_overlay_record_by_id_reads_matching_snapshot() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_run_screenshots_table(&conn);
        conn.execute(
            "insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_local, captured_at_utc, hero_name
             ) values ('snap-1', 'run-1', 'end_of_run_auto', 'match-1.png', '2026-04-10T20:30:05+00:00', '2026-04-10T20:30:05+00:00', 'Mak')",
            [],
        )
        .unwrap();

        let record = load_overlay_record_by_id(temp.path(), "snap-1")
            .unwrap()
            .unwrap();

        assert_eq!(record.id, "snap-1");
    }

    #[test]
    fn latest_overlay_record_uses_unknown_hero_when_screenshot_is_anonymous() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_run_screenshots_table(&conn);
        conn.execute(
            "insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_local, captured_at_utc
             ) values (
                'snap-1', null, 'end_of_run_auto', 'anon.png', '2026-04-10T20:30:05+00:00', '2026-04-10T20:30:05+00:00'
             )",
            [],
        )
        .unwrap();

        let latest = load_latest_overlay_record(temp.path(), None, 0)
            .unwrap()
            .unwrap();

        assert_eq!(latest.hero, "Unknown");
        assert_eq!(latest.game_mode, "End of run");
    }

    #[test]
    fn overlay_record_list_returns_latest_records_in_descending_order() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_run_screenshots_table(&conn);
        conn.execute(
            "insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_local,
                captured_at_utc, victories_at_capture, hero_name
             ) values
             ('snap-1', 'run-1', 'end_of_run_auto', 'first.png', '2026-04-10T20:30:05+00:00', '2026-04-10T20:30:05+00:00', 7, 'Mak'),
             ('snap-2', 'run-2', 'end_of_run_auto', 'second.png', '2026-04-10T21:30:05+00:00', '2026-04-10T21:30:05+00:00', 10, 'Pygmalien'),
             ('snap-3', 'run-3', 'end_of_run_auto', 'third.png', '2026-04-10T22:30:05+00:00', '2026-04-10T22:30:05+00:00', 4, 'Vanessa')",
            [],
        )
        .unwrap();

        let records = load_overlay_record_list(temp.path(), Some(2)).unwrap();

        assert_eq!(records.len(), 2);
        assert_eq!(records[0].id, "snap-3");
        assert_eq!(records[1].id, "snap-2");
    }

    #[test]
    fn overlay_record_list_without_limit_returns_all_records() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_run_screenshots_table(&conn);
        conn.execute(
            "insert into run_screenshots (
                screenshot_id, run_id, capture_source, image_relative_path, captured_at_local,
                captured_at_utc, hero_name
             ) values
             ('snap-1', 'run-1', 'end_of_run_auto', 'first.png', '2026-04-10T20:30:05+00:00', '2026-04-10T20:30:05+00:00', 'Mak'),
             ('snap-2', 'run-2', 'end_of_run_auto', 'second.png', '2026-04-10T21:30:05+00:00', '2026-04-10T21:30:05+00:00', 'Pygmalien'),
             ('snap-3', 'run-3', 'end_of_run_auto', 'third.png', '2026-04-10T22:30:05+00:00', '2026-04-10T22:30:05+00:00', 'Vanessa')",
            [],
        )
        .unwrap();

        let records = load_overlay_record_list(temp.path(), None).unwrap();

        assert_eq!(records.len(), 3);
        assert_eq!(records[0].id, "snap-3");
        assert_eq!(records[2].id, "snap-1");
    }
}
