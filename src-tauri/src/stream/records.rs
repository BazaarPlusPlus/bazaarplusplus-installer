use rusqlite::Connection;
use rusqlite::{params_from_iter, types::Value};
use serde::Serialize;
use std::path::{Path, PathBuf};

const DATA_DIRECTORY: &str = "BazaarPlusPlus";
const SCREENSHOTS_DIRECTORY: &str = "Screenshots";
const DATABASE_FILE_NAME: &str = "bazaarplusplus.db";

#[derive(Clone, Debug, Serialize)]
pub struct StreamRecord {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub captured_at: String,
    pub image_url: Option<String>,
    pub wins: Option<i64>,
    pub position: Option<i64>,
    pub battle_count: Option<i64>,
    pub rank: Option<String>,
    pub rating: Option<i64>,
}

#[derive(Clone, Debug)]
pub(crate) struct DatabaseRecord {
    id: String,
    hero: String,
    game_mode: String,
    captured_at: String,
    image_path: Option<String>,
    wins: Option<i64>,
    position: Option<i64>,
    battle_count: Option<i64>,
    rank: Option<String>,
    rating: Option<i64>,
}

#[derive(Clone, Debug)]
pub struct RecordRepository {
    game_path: Option<PathBuf>,
}

impl RecordRepository {
    pub fn new(game_path: Option<PathBuf>) -> Self {
        Self { game_path }
    }

    pub fn load_latest(&self) -> Result<Option<StreamRecord>, String> {
        self.load_latest_filtered(None, &[])
    }

    pub fn load_latest_filtered(
        &self,
        from: Option<&str>,
        excluded_record_ids: &[String],
    ) -> Result<Option<StreamRecord>, String> {
        let database_path = self.database_path()?;

        Ok(load_latest_record_filtered(&database_path, from, excluded_record_ids)?
            .map(|record| self.to_stream_record(record)))
    }

    pub fn load_recent(&self, limit: usize) -> Result<Vec<StreamRecord>, String> {
        self.load_recent_filtered(None, limit, &[])
    }

    pub fn load_recent_filtered(
        &self,
        from: Option<&str>,
        limit: usize,
        excluded_record_ids: &[String],
    ) -> Result<Vec<StreamRecord>, String> {
        let database_path = self.database_path()?;

        Ok(load_recent_records_filtered(&database_path, from, limit, excluded_record_ids)?
            .into_iter()
            .map(|record| self.to_stream_record(record))
            .collect())
    }

    pub fn load_screenshots(&self) -> Result<Vec<StreamRecord>, String> {
        let database_path = self.database_path()?;

        Ok(load_screenshot_records(&database_path)?
            .into_iter()
            .map(|record| self.to_stream_record(record))
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

        let Some(record) = load_record_by_id(&database_path, record_id)? else {
            return Ok(None);
        };
        Ok(self
            .resolve_image_path(record.image_path.as_deref())
            .filter(|path| path.exists()))
    }

    fn database_path(&self) -> Result<PathBuf, String> {
        let game_path = self.game_path.as_ref().ok_or_else(|| {
            "Game path is not configured; expected BazaarPlusPlus/bazaarplusplus.db under the resolved game root."
                .to_string()
        })?;
        resolve_database_path(game_path)
    }

    fn resolve_image_path(&self, raw_path: Option<&str>) -> Option<PathBuf> {
        resolve_record_image_path(self.game_path.clone(), raw_path)
    }

    fn to_stream_record(&self, record: DatabaseRecord) -> StreamRecord {
        let image_url = self
            .resolve_image_path(record.image_path.as_deref())
            .filter(|path| path.exists())
            .map(|_| format!("/images/{}", record.id));

        let title = record.hero;
        let subtitle = match (record.wins, record.battle_count) {
            (Some(wins), Some(battles)) => {
                format!("{} · {}W · {} battles", record.game_mode, wins, battles)
            }
            (Some(wins), None) => format!("{} · {}W", record.game_mode, wins),
            (None, Some(battles)) => format!("{} · {} battles", record.game_mode, battles),
            (None, None) => record.game_mode,
        };

        StreamRecord {
            id: record.id,
            title,
            subtitle,
            captured_at: record.captured_at,
            image_url,
            wins: record.wins,
            position: record.position,
            battle_count: record.battle_count,
            rank: record.rank,
            rating: record.rating,
        }
    }
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

pub fn resolve_record_image_path(
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

pub(crate) fn load_latest_record(database_path: &Path) -> Result<Option<DatabaseRecord>, String> {
    load_latest_record_filtered(database_path, None, &[])
}

pub(crate) fn load_latest_record_filtered(
    database_path: &Path,
    from: Option<&str>,
    excluded_record_ids: &[String],
) -> Result<Option<DatabaseRecord>, String> {
    let records = load_run_records(
        database_path,
        from,
        Some(1),
        false,
        None,
        excluded_record_ids,
    )?;
    Ok(records.into_iter().next())
}

pub(crate) fn load_recent_records(
    database_path: &Path,
    limit: usize,
) -> Result<Vec<DatabaseRecord>, String> {
    load_recent_records_filtered(database_path, None, limit, &[])
}

pub(crate) fn load_recent_records_filtered(
    database_path: &Path,
    from: Option<&str>,
    limit: usize,
    excluded_record_ids: &[String],
) -> Result<Vec<DatabaseRecord>, String> {
    load_run_records(database_path, from, Some(limit), false, None, excluded_record_ids)
}

pub(crate) fn load_screenshot_records(database_path: &Path) -> Result<Vec<DatabaseRecord>, String> {
    load_run_records(database_path, None, None, true, None, &[])
}

pub(crate) fn load_record_by_id(
    database_path: &Path,
    record_id: &str,
) -> Result<Option<DatabaseRecord>, String> {
    let records = load_run_records(database_path, None, Some(1), false, Some(record_id), &[])?;
    Ok(records.into_iter().next())
}

fn load_run_records(
    database_path: &Path,
    from: Option<&str>,
    limit: Option<usize>,
    require_image: bool,
    record_id: Option<&str>,
    excluded_record_ids: &[String],
) -> Result<Vec<DatabaseRecord>, String> {
    if !database_path.exists() {
        return Ok(Vec::new());
    }

    let conn = Connection::open(database_path).map_err(|err| err.to_string())?;
    let query = build_run_records_query(
        from.is_some(),
        record_id.is_some(),
        require_image,
        excluded_record_ids.len(),
    );
    let mut stmt = conn.prepare(&query).map_err(|err| err.to_string())?;
    let limit_value = limit
        .map(|value| value.min(i64::MAX as usize) as i64)
        .unwrap_or(-1);
    let mut params: Vec<Value> = Vec::new();

    if let Some(from) = from {
      params.push(Value::Text(from.to_string()));
    }
    if let Some(record_id) = record_id {
      params.push(Value::Text(record_id.to_string()));
    }
    for record_id in excluded_record_ids {
      params.push(Value::Text(record_id.clone()));
    }
    params.push(Value::Integer(limit_value));

    let mut records = Vec::new();
    let rows = stmt
        .query_map(params_from_iter(params.iter()), map_database_record)
        .map_err(|err| err.to_string())?;
    for row in rows {
        records.push(row.map_err(|err| err.to_string())?);
    }

    Ok(records)
}

fn build_run_records_query(
    has_from: bool,
    has_record_id: bool,
    require_image: bool,
    excluded_count: usize,
) -> String {
    let mut filters = vec![
        "r.completed = 1".to_string(),
        "r.status = 'completed'".to_string(),
    ];
    if has_from {
        filters.push("datetime(coalesce(ds.captured_at_utc, fs.captured_at_utc, r.ended_at_utc, r.last_seen_at_utc, r.started_at_utc)) >= datetime(?1)".to_string());
    }
    if has_record_id {
        let record_index = if has_from { 2 } else { 1 };
        filters.push(format!("r.run_id = ?{record_index}"));
    }
    if require_image {
        filters.push(
            "coalesce(ds.image_relative_path, fs.image_relative_path) is not null".to_string(),
        );
    }
    if excluded_count > 0 {
        let start_index = usize::from(has_from) + usize::from(has_record_id) + 1;
        let placeholders = (0..excluded_count)
            .map(|offset| format!("?{}", start_index + offset))
            .collect::<Vec<_>>()
            .join(", ");
        filters.push(format!("r.run_id not in ({placeholders})"));
    }

    let where_clause = filters.join(" and ");
    let limit_index = usize::from(has_from) + usize::from(has_record_id) + excluded_count + 1;

    format!(
        "
with direct_screenshots as (
  select
    rs.run_id,
    rs.image_relative_path,
    rs.captured_at_local,
    rs.captured_at_utc,
    rs.day,
    rs.victories_at_capture,
    row_number() over (
      partition by rs.run_id
      order by rs.captured_at_utc desc, rs.screenshot_id desc
    ) as rn
  from run_screenshots rs
  where rs.run_id is not null
    and rs.capture_source = 'end_of_run_auto'
),
fallback_screenshots as (
  select
    r.run_id,
    rs.image_relative_path,
    rs.captured_at_local,
    rs.captured_at_utc,
    rs.day,
    rs.victories_at_capture,
    row_number() over (
      partition by r.run_id
      order by abs(strftime('%s', rs.captured_at_utc) - strftime('%s', r.ended_at_utc)) asc,
               rs.captured_at_utc desc,
               rs.screenshot_id desc
    ) as rn
  from runs r
  join run_screenshots rs
    on rs.run_id is null
   and rs.capture_source = 'end_of_run_auto'
   and r.ended_at_utc is not null
   and abs(strftime('%s', rs.captured_at_utc) - strftime('%s', r.ended_at_utc)) <= 120
   and (r.victories is null or rs.victories_at_capture = r.victories)
   and (r.final_player_rank is null or rs.player_rank = r.final_player_rank)
   and (r.final_player_rating is null or rs.player_rating = r.final_player_rating)
  where r.completed = 1 and r.status = 'completed'
)
select
  r.run_id,
  coalesce(r.hero, 'Unknown') as hero,
  coalesce(r.game_mode, 'Unknown') as game_mode,
  coalesce(ds.captured_at_local, fs.captured_at_local, r.ended_at_utc, r.last_seen_at_utc, r.started_at_utc) as captured_at,
  coalesce(ds.image_relative_path, fs.image_relative_path) as image_path,
  coalesce(ds.victories_at_capture, fs.victories_at_capture, r.victories) as wins,
  null as position,
  coalesce(ds.day, fs.day) as battle_count,
  r.final_player_rank,
  r.final_player_rating
from runs r
left join direct_screenshots ds on ds.run_id = r.run_id and ds.rn = 1
left join fallback_screenshots fs on fs.run_id = r.run_id and fs.rn = 1
where {where_clause}
order by datetime(coalesce(ds.captured_at_utc, fs.captured_at_utc, r.ended_at_utc, r.last_seen_at_utc, r.started_at_utc)) desc
limit ?{limit_index}
"
    )
}

fn map_database_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<DatabaseRecord> {
    Ok(DatabaseRecord {
        id: row.get(0)?,
        hero: row.get(1)?,
        game_mode: row.get(2)?,
        captured_at: row.get(3)?,
        image_path: row.get(4)?,
        wins: row.get(5)?,
        position: row.get(6)?,
        battle_count: row.get(7)?,
        rank: row.get(8)?,
        rating: row.get(9)?,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        load_latest_record, load_recent_records_filtered, load_screenshot_records,
        resolve_record_image_path, RecordRepository, DATABASE_FILE_NAME,
    };
    use std::path::PathBuf;

    fn create_stream_tables(conn: &rusqlite::Connection) {
        conn.execute(
            "create table runs (
                run_id text primary key,
                started_at_utc text not null,
                last_seen_at_utc text not null,
                status text not null,
                completed integer not null default 0,
                hero text not null,
                game_mode text not null,
                victories integer,
                losses integer,
                ended_at_utc text,
                final_player_rank text,
                final_player_rating integer
            )",
            [],
        )
        .unwrap();
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
                victories_at_capture integer
            )",
            [],
        )
        .unwrap();
    }

    #[test]
    fn latest_record_returns_none_when_database_has_no_rows() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_stream_tables(&conn);

        let latest = load_latest_record(temp.path()).unwrap();
        assert!(latest.is_none());
    }

    #[test]
    fn latest_record_reads_completed_run_with_linked_screenshot() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_stream_tables(&conn);
        conn.execute(
            "insert into runs (run_id, started_at_utc, last_seen_at_utc, status, completed, hero, game_mode, victories, losses, ended_at_utc, final_player_rank, final_player_rating)
             values ('run-1', '2026-04-10T20:00:00+00:00', '2026-04-10T20:30:00+00:00', 'completed', 1, 'Mak', 'Ranked', 10, 4, '2026-04-10T20:31:00+00:00', 'Diamond', 1942)",
            [],
        )
        .unwrap();
        conn.execute(
            "insert into run_screenshots (screenshot_id, run_id, battle_id, capture_source, is_primary, image_relative_path, captured_at_local, captured_at_utc, day, player_rank, player_rating, victories_at_capture)
             values ('shot-1', 'run-1', null, 'end_of_run_auto', 1, '2026-04-10\\shot-1.png', '2026-04-11T04:30:05+08:00', '2026-04-10T20:30:05+00:00', 14, 'Diamond', 1942, 10)",
            [],
        )
        .unwrap();

        let latest = load_latest_record(temp.path()).unwrap().unwrap();
        assert_eq!(latest.id, "run-1");
        assert_eq!(latest.hero, "Mak");
        assert_eq!(latest.game_mode, "Ranked");
        assert_eq!(latest.image_path.as_deref(), Some("2026-04-10\\shot-1.png"));
        assert_eq!(latest.wins, Some(10));
        assert_eq!(latest.battle_count, Some(14));
        assert_eq!(latest.rank.as_deref(), Some("Diamond"));
        assert_eq!(latest.rating, Some(1942));
    }

    #[test]
    fn latest_record_uses_anonymous_end_of_run_screenshot_as_fallback() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_stream_tables(&conn);
        conn.execute(
            "insert into runs (run_id, started_at_utc, last_seen_at_utc, status, completed, hero, game_mode, victories, losses, ended_at_utc, final_player_rank, final_player_rating)
             values ('run-1', '2026-04-10T20:00:00+00:00', '2026-04-10T20:37:00+00:00', 'completed', 1, 'Mak', 'Ranked', 7, 4, '2026-04-10T20:37:05+00:00', 'Diamond', 500)",
            [],
        )
        .unwrap();
        conn.execute(
            "insert into run_screenshots (screenshot_id, run_id, battle_id, capture_source, is_primary, image_relative_path, captured_at_local, captured_at_utc, day, player_rank, player_rating, victories_at_capture)
             values ('shot-1', null, null, 'end_of_run_auto', 1, '2026-04-10\\shot-1.png', '2026-04-11T04:37:14+08:00', '2026-04-10T20:37:14+00:00', 11, 'Diamond', 500, 7)",
            [],
        )
        .unwrap();

        let latest = load_latest_record(temp.path()).unwrap().unwrap();
        assert_eq!(latest.id, "run-1");
        assert_eq!(latest.image_path.as_deref(), Some("2026-04-10\\shot-1.png"));
        assert_eq!(latest.wins, Some(7));
        assert_eq!(latest.battle_count, Some(11));
    }

    #[test]
    fn latest_record_ignores_non_completed_runs() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_stream_tables(&conn);
        conn.execute(
            "insert into runs (run_id, started_at_utc, last_seen_at_utc, status, completed, hero, game_mode, victories, losses, ended_at_utc)
             values
             ('run-1', '2026-04-10T20:00:00+00:00', '2026-04-10T20:30:00+00:00', 'abandoned', 1, 'Mak', 'Ranked', null, null, '2026-04-10T20:31:00+00:00'),
             ('run-2', '2026-04-10T21:00:00+00:00', '2026-04-10T21:30:00+00:00', 'completed', 1, 'Pygmalien', 'Ranked', 3, 5, '2026-04-10T21:31:00+00:00')",
            [],
        )
        .unwrap();

        let latest = load_latest_record(temp.path()).unwrap().unwrap();
        assert_eq!(latest.id, "run-2");
    }

    #[test]
    fn latest_record_returns_none_when_database_file_is_missing() {
        let temp_dir = tempfile::tempdir().unwrap();
        let missing = temp_dir.path().join("missing-bazaarplusplus.db");
        let latest = load_latest_record(&missing).unwrap();

        assert!(latest.is_none());
    }

    #[test]
    fn resolve_record_image_path_supports_relative_and_absolute_inputs() {
        let game_path = Some(PathBuf::from("/tmp/TheBazaar"));
        let relative = resolve_record_image_path(game_path.clone(), Some("match-1.png")).unwrap();
        let absolute = resolve_record_image_path(
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
    fn resolve_record_image_path_supports_bazaarplusplus_screenshots_directory() {
        let temp_dir = tempfile::tempdir().unwrap();
        let game_path = temp_dir.path().join("TheBazaar");
        let screenshots_dir = game_path.join("BazaarPlusPlus").join("Screenshots");
        std::fs::create_dir_all(&screenshots_dir).unwrap();
        std::fs::write(screenshots_dir.join("match-1.png"), b"png").unwrap();

        let resolved = resolve_record_image_path(Some(game_path), Some("match-1.png")).unwrap();

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
        create_stream_tables(&conn);
        conn.execute(
            "insert into runs (run_id, started_at_utc, last_seen_at_utc, status, completed, hero, game_mode, victories, losses, ended_at_utc)
             values ('run-1', '2026-04-10T20:00:00+00:00', '2026-04-10T20:30:00+00:00', 'completed', 1, 'Mak', 'Ranked', 10, 4, '2026-04-10T20:31:00+00:00')",
            [],
        )
        .unwrap();
        conn.execute(
            "insert into run_screenshots (screenshot_id, run_id, battle_id, capture_source, is_primary, image_relative_path, captured_at_local, captured_at_utc, day, victories_at_capture)
             values ('shot-1', 'run-1', null, 'end_of_run_auto', 1, 'match-1.png', '2026-04-11T04:30:05+08:00', '2026-04-10T20:30:05+00:00', 14, 10)",
            [],
        )
        .unwrap();

        let repository = RecordRepository::new(Some(game_path));
        let latest = repository.load_latest().unwrap().unwrap();

        assert_eq!(latest.image_url.as_deref(), Some("/images/run-1"));
    }

    #[test]
    fn repository_preserves_optional_run_metrics_in_stream_record() {
        let temp_dir = tempfile::tempdir().unwrap();
        let game_path = temp_dir.path().join("TheBazaar");
        let data_dir = game_path.join("BazaarPlusPlus");
        std::fs::create_dir_all(&data_dir).unwrap();

        let database_path = data_dir.join(DATABASE_FILE_NAME);
        let conn = rusqlite::Connection::open(&database_path).unwrap();
        create_stream_tables(&conn);
        conn.execute(
            "insert into runs (run_id, started_at_utc, last_seen_at_utc, status, completed, hero, game_mode, victories, losses, ended_at_utc, final_player_rank, final_player_rating)
             values ('run-1', '2026-04-10T20:00:00+00:00', '2026-04-10T20:30:00+00:00', 'completed', 1, 'Mak', 'Ranked', 10, 3, '2026-04-10T20:31:00+00:00', 'Diamond', 500)",
            [],
        )
        .unwrap();

        let repository = RecordRepository::new(Some(game_path));
        let latest = repository.load_latest().unwrap().unwrap();

        assert_eq!(latest.wins, Some(10));
        assert_eq!(latest.position, None);
        assert_eq!(latest.battle_count, None);
        assert_eq!(latest.rank.as_deref(), Some("Diamond"));
        assert_eq!(latest.rating, Some(500));
    }

    #[test]
    fn recent_records_apply_limit_in_descending_capture_order() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_stream_tables(&conn);
        conn.execute(
            "insert into runs (run_id, started_at_utc, last_seen_at_utc, status, completed, hero, game_mode, victories, losses, ended_at_utc)
             values
              ('run-1', '2026-04-11T18:00:00+00:00', '2026-04-11T19:00:00+00:00', 'completed', 1, 'Mak', 'Ranked', 1, 1, '2026-04-11T19:00:00+00:00'),
              ('run-2', '2026-04-11T19:00:00+00:00', '2026-04-11T20:00:00+00:00', 'completed', 1, 'Mak', 'Ranked', 2, 2, '2026-04-11T20:00:00+00:00'),
              ('run-3', '2026-04-11T20:00:00+00:00', '2026-04-11T21:00:00+00:00', 'completed', 1, 'Mak', 'Ranked', 3, 3, '2026-04-11T21:00:00+00:00')",
            [],
        )
        .unwrap();

        let records = super::load_recent_records(temp.path(), 2).unwrap();

        assert_eq!(records.len(), 2);
        assert_eq!(records[0].id, "run-3");
        assert_eq!(records[1].id, "run-2");
    }

    #[test]
    fn recent_records_can_filter_out_older_rows() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_stream_tables(&conn);
        conn.execute(
            "insert into runs (run_id, started_at_utc, last_seen_at_utc, status, completed, hero, game_mode, victories, losses, ended_at_utc)
             values
              ('run-1', '2026-04-11T18:00:00+00:00', '2026-04-11T19:00:00+00:00', 'completed', 1, 'Mak', 'Ranked', 1, 1, '2026-04-11T19:00:00+00:00'),
              ('run-2', '2026-04-11T19:00:00+00:00', '2026-04-11T20:00:00+00:00', 'completed', 1, 'Mak', 'Ranked', 2, 2, '2026-04-11T20:00:00+00:00'),
              ('run-3', '2026-04-11T20:00:00+00:00', '2026-04-11T21:00:00+00:00', 'completed', 1, 'Mak', 'Ranked', 3, 3, '2026-04-11T21:00:00+00:00')",
            [],
        )
        .unwrap();

        let records =
            load_recent_records_filtered(temp.path(), Some("2026-04-11T20:30:00+00:00"), 5, &[])
                .unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].id, "run-3");
    }

    #[test]
    fn recent_records_can_exclude_selected_run_ids() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_stream_tables(&conn);
        conn.execute(
            "insert into runs (run_id, started_at_utc, last_seen_at_utc, status, completed, hero, game_mode, victories, losses, ended_at_utc)
             values
              ('run-1', '2026-04-11T18:00:00+00:00', '2026-04-11T19:00:00+00:00', 'completed', 1, 'Mak', 'Ranked', 1, 1, '2026-04-11T19:00:00+00:00'),
              ('run-2', '2026-04-11T19:00:00+00:00', '2026-04-11T20:00:00+00:00', 'completed', 1, 'Vanessa', 'Ranked', 2, 2, '2026-04-11T20:00:00+00:00'),
              ('run-3', '2026-04-11T20:00:00+00:00', '2026-04-11T21:00:00+00:00', 'completed', 1, 'Pygmalien', 'Ranked', 3, 3, '2026-04-11T21:00:00+00:00')",
            [],
        )
        .unwrap();

        let records = load_recent_records_filtered(
            temp.path(),
            None,
            5,
            &["run-2".to_string()],
        )
        .unwrap();

        assert_eq!(records.len(), 2);
        assert_eq!(records[0].id, "run-3");
        assert_eq!(records[1].id, "run-1");
    }

    #[test]
    fn screenshot_records_only_include_rows_with_images() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        create_stream_tables(&conn);
        conn.execute(
            "insert into runs (run_id, started_at_utc, last_seen_at_utc, status, completed, hero, game_mode, victories, losses, ended_at_utc)
             values
              ('run-1', '2026-04-11T18:00:00+00:00', '2026-04-11T19:00:00+00:00', 'completed', 1, 'Mak', 'Ranked', 1, 1, '2026-04-11T19:00:00+00:00'),
              ('run-2', '2026-04-11T19:00:00+00:00', '2026-04-11T20:00:00+00:00', 'completed', 1, 'Vanessa', 'Ranked', 2, 2, '2026-04-11T20:00:00+00:00')",
            [],
        )
        .unwrap();
        conn.execute(
            "insert into run_screenshots (screenshot_id, run_id, battle_id, capture_source, is_primary, image_relative_path, captured_at_local, captured_at_utc, day, victories_at_capture)
             values ('shot-1', 'run-1', null, 'end_of_run_auto', 1, 'match-1.png', '2026-04-12T03:00:00+08:00', '2026-04-11T19:00:00+00:00', 10, 1)",
            [],
        )
        .unwrap();

        let records = load_screenshot_records(temp.path()).unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].id, "run-1");
    }
}
