use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use std::path::{Path, PathBuf};

const DATA_DIRECTORY: &str = "BazaarPlusPlus";
const SCREENSHOTS_DIRECTORY: &str = "ScreenShots";
const PREFERRED_DATABASE_NAMES: [&str; 3] =
    ["records.sqlite", "records.db", "BazaarPlusPlus.sqlite"];

#[derive(Clone, Debug, Serialize)]
pub struct StreamRecord {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub captured_at: String,
    pub image_url: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct DatabaseRecord {
    id: String,
    title: String,
    subtitle: String,
    captured_at: String,
    image_path: Option<String>,
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
        self.load_latest_filtered(None)
    }

    pub fn load_latest_filtered(&self, from: Option<&str>) -> Result<Option<StreamRecord>, String> {
        let Some(database_path) = self.database_path() else {
            return Ok(None);
        };

        Ok(load_latest_record_filtered(&database_path, from)?
            .map(|record| self.to_stream_record(record)))
    }

    pub fn load_recent(&self, limit: usize) -> Result<Vec<StreamRecord>, String> {
        self.load_recent_filtered(None, limit)
    }

    pub fn load_recent_filtered(
        &self,
        from: Option<&str>,
        limit: usize,
    ) -> Result<Vec<StreamRecord>, String> {
        let Some(database_path) = self.database_path() else {
            return Ok(Vec::new());
        };

        Ok(load_recent_records_filtered(&database_path, from, limit)?
            .into_iter()
            .map(|record| self.to_stream_record(record))
            .collect())
    }

    pub fn load_image(&self, record_id: &str) -> Result<Option<(PathBuf, Vec<u8>)>, String> {
        let Some(database_path) = self.database_path() else {
            return Ok(None);
        };

        let Some(record) = load_record_by_id(&database_path, record_id)? else {
            return Ok(None);
        };
        let Some(image_path) = self.resolve_image_path(record.image_path.as_deref()) else {
            return Ok(None);
        };
        let bytes = std::fs::read(&image_path).map_err(|err| err.to_string())?;

        Ok(Some((image_path, bytes)))
    }

    fn database_path(&self) -> Option<PathBuf> {
        let game_path = self.game_path.as_ref()?;
        resolve_database_path(game_path)
    }

    fn screenshots_directory(&self) -> Option<PathBuf> {
        let game_path = self.game_path.as_ref()?;
        Some(game_path.join(DATA_DIRECTORY).join(SCREENSHOTS_DIRECTORY))
    }

    fn resolve_image_path(&self, raw_path: Option<&str>) -> Option<PathBuf> {
        resolve_record_image_path(self.screenshots_directory(), raw_path)
    }

    fn to_stream_record(&self, record: DatabaseRecord) -> StreamRecord {
        let image_url = self
            .resolve_image_path(record.image_path.as_deref())
            .filter(|path| path.exists())
            .map(|_| format!("/images/{}", record.id));

        StreamRecord {
            id: record.id,
            title: record.title,
            subtitle: record.subtitle,
            captured_at: record.captured_at,
            image_url,
        }
    }
}

pub fn resolve_database_path(game_path: &Path) -> Option<PathBuf> {
    let data_dir = game_path.join(DATA_DIRECTORY);
    if !data_dir.exists() {
        return None;
    }

    for name in PREFERRED_DATABASE_NAMES {
        let candidate = data_dir.join(name);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    let entries = std::fs::read_dir(&data_dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(extension) = path.extension().and_then(|ext| ext.to_str()) else {
            continue;
        };
        if matches!(extension, "sqlite" | "db" | "db3") {
            return Some(path);
        }
    }

    None
}

pub fn resolve_record_image_path(
    screenshots_directory: Option<PathBuf>,
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

    let screenshots_directory = screenshots_directory?;
    Some(screenshots_directory.join(candidate))
}

pub(crate) fn load_latest_record(database_path: &Path) -> Result<Option<DatabaseRecord>, String> {
    load_latest_record_filtered(database_path, None)
}

pub(crate) fn load_latest_record_filtered(
    database_path: &Path,
    from: Option<&str>,
) -> Result<Option<DatabaseRecord>, String> {
    if !database_path.exists() {
        return Ok(None);
    }

    let conn = Connection::open(database_path).map_err(|err| err.to_string())?;
    let template = "select id, title, subtitle, captured_at{image_column} from records{where_clause} order by datetime(captured_at) desc limit 1";
    let mut stmt = prepare_record_statement_with_where(
        &conn,
        template,
        if from.is_some() {
            " where datetime(captured_at) >= datetime(?1)"
        } else {
            ""
        },
    )?;

    if let Some(from) = from {
        stmt.query_row([from], map_database_record)
            .optional()
            .map_err(|err| err.to_string())
    } else {
        stmt.query_row([], map_database_record)
            .optional()
            .map_err(|err| err.to_string())
    }
}

pub(crate) fn load_recent_records(
    database_path: &Path,
    limit: usize,
) -> Result<Vec<DatabaseRecord>, String> {
    load_recent_records_filtered(database_path, None, limit)
}

pub(crate) fn load_recent_records_filtered(
    database_path: &Path,
    from: Option<&str>,
    limit: usize,
) -> Result<Vec<DatabaseRecord>, String> {
    if !database_path.exists() {
        return Ok(Vec::new());
    }

    let conn = Connection::open(database_path).map_err(|err| err.to_string())?;
    let template = "select id, title, subtitle, captured_at{image_column} from records{where_clause} order by datetime(captured_at) desc limit ?1";
    let mut stmt = prepare_record_statement_with_where(
        &conn,
        template,
        if from.is_some() {
            " where datetime(captured_at) >= datetime(?2)"
        } else {
            ""
        },
    )?;
    let rows = if let Some(from) = from {
        stmt.query_map((limit as i64, from), map_database_record)
    } else {
        stmt.query_map([limit as i64], map_database_record)
    }
    .map_err(|err| err.to_string())?;

    let mut records = Vec::new();
    for row in rows {
        records.push(row.map_err(|err| err.to_string())?);
    }

    Ok(records)
}

pub(crate) fn load_record_by_id(
    database_path: &Path,
    record_id: &str,
) -> Result<Option<DatabaseRecord>, String> {
    if !database_path.exists() {
        return Ok(None);
    }

    let conn = Connection::open(database_path).map_err(|err| err.to_string())?;
    let mut stmt = prepare_record_statement(
        &conn,
        "select id, title, subtitle, captured_at{image_column} from records where id = ?1 limit 1",
    )?;

    stmt.query_row([record_id], map_database_record)
        .optional()
        .map_err(|err| err.to_string())
}

fn prepare_record_statement<'conn>(
    conn: &'conn Connection,
    template: &str,
) -> Result<rusqlite::Statement<'conn>, String> {
    prepare_record_statement_with_where(conn, template, "")
}

fn prepare_record_statement_with_where<'conn>(
    conn: &'conn Connection,
    template: &str,
    where_clause: &str,
) -> Result<rusqlite::Statement<'conn>, String> {
    let query = if records_table_has_column(conn, "image_path")? {
        template.replace("{image_column}", ", image_path")
    } else {
        template.replace("{image_column}", ", null as image_path")
    }
    .replace("{where_clause}", where_clause);

    conn.prepare(&query).map_err(|err| err.to_string())
}

fn records_table_has_column(conn: &Connection, column_name: &str) -> Result<bool, String> {
    let mut stmt = conn
        .prepare("select 1 from pragma_table_info('records') where name = ?1 limit 1")
        .map_err(|err| err.to_string())?;

    stmt.query_row([column_name], |_| Ok(()))
        .optional()
        .map(|value| value.is_some())
        .map_err(|err| err.to_string())
}

fn map_database_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<DatabaseRecord> {
    Ok(DatabaseRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        subtitle: row.get(2)?,
        captured_at: row.get(3)?,
        image_path: row.get(4)?,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        load_latest_record, load_recent_records_filtered, resolve_record_image_path,
        RecordRepository,
    };
    use std::path::PathBuf;

    #[test]
    fn latest_record_returns_none_when_database_has_no_rows() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        conn.execute(
            "create table records (id text primary key, title text not null, subtitle text not null, captured_at text not null)",
            [],
        )
        .unwrap();

        let latest = load_latest_record(temp.path()).unwrap();
        assert!(latest.is_none());
    }

    #[test]
    fn latest_record_reads_optional_image_path_when_present() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        conn.execute(
            "create table records (id text primary key, title text not null, subtitle text not null, captured_at text not null, image_path text)",
            [],
        )
        .unwrap();
        conn.execute(
            "insert into records (id, title, subtitle, captured_at, image_path) values ('record-1', 'Title', 'Subtitle', '2026-04-10T23:10:00+08:00', 'match-1.png')",
            [],
        )
        .unwrap();

        let latest = load_latest_record(temp.path()).unwrap().unwrap();
        assert_eq!(latest.id, "record-1");
        assert_eq!(latest.image_path.as_deref(), Some("match-1.png"));
    }

    #[test]
    fn latest_record_returns_none_when_database_file_is_missing() {
        let temp_dir = tempfile::tempdir().unwrap();
        let missing = temp_dir.path().join("missing-records.sqlite");
        let latest = load_latest_record(&missing).unwrap();

        assert!(latest.is_none());
    }

    #[test]
    fn resolve_record_image_path_supports_relative_and_absolute_inputs() {
        let screenshots_dir = Some(PathBuf::from("/tmp/BazaarPlusPlus/ScreenShots"));

        let relative =
            resolve_record_image_path(screenshots_dir.clone(), Some("match-1.png")).unwrap();
        let absolute = resolve_record_image_path(
            screenshots_dir,
            Some("/tmp/BazaarPlusPlus/ScreenShots/match-2.png"),
        )
        .unwrap();

        assert_eq!(relative, PathBuf::from("/tmp/BazaarPlusPlus/ScreenShots/match-1.png"));
        assert_eq!(absolute, PathBuf::from("/tmp/BazaarPlusPlus/ScreenShots/match-2.png"));
    }

    #[test]
    fn repository_sets_image_url_when_relative_image_exists() {
        let temp_dir = tempfile::tempdir().unwrap();
        let game_path = temp_dir.path().join("TheBazaar");
        let data_dir = game_path.join("BazaarPlusPlus");
        let screenshots_dir = data_dir.join("ScreenShots");
        std::fs::create_dir_all(&screenshots_dir).unwrap();
        std::fs::write(screenshots_dir.join("match-1.png"), b"png").unwrap();

        let database_path = data_dir.join("records.sqlite");
        let conn = rusqlite::Connection::open(&database_path).unwrap();
        conn.execute(
            "create table records (id text primary key, title text not null, subtitle text not null, captured_at text not null, image_path text)",
            [],
        )
        .unwrap();
        conn.execute(
            "insert into records (id, title, subtitle, captured_at, image_path) values ('record-1', 'Title', 'Subtitle', '2026-04-10T23:10:00+08:00', 'match-1.png')",
            [],
        )
        .unwrap();

        let repository = RecordRepository::new(Some(game_path));
        let latest = repository.load_latest().unwrap().unwrap();

        assert_eq!(latest.image_url.as_deref(), Some("/images/record-1"));
    }

    #[test]
    fn recent_records_apply_limit_in_descending_capture_order() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        conn.execute(
            "create table records (id text primary key, title text not null, subtitle text not null, captured_at text not null, image_path text)",
            [],
        )
        .unwrap();
        conn.execute(
            "insert into records (id, title, subtitle, captured_at, image_path) values
              ('record-1', 'Title 1', 'Subtitle 1', '2026-04-11T19:00:00+08:00', null),
              ('record-2', 'Title 2', 'Subtitle 2', '2026-04-11T20:00:00+08:00', null),
              ('record-3', 'Title 3', 'Subtitle 3', '2026-04-11T21:00:00+08:00', null)",
            [],
        )
        .unwrap();

        let records = super::load_recent_records(temp.path(), 2).unwrap();

        assert_eq!(records.len(), 2);
        assert_eq!(records[0].id, "record-3");
        assert_eq!(records[1].id, "record-2");
    }

    #[test]
    fn recent_records_can_filter_out_older_rows() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(temp.path()).unwrap();
        conn.execute(
            "create table records (id text primary key, title text not null, subtitle text not null, captured_at text not null, image_path text)",
            [],
        )
        .unwrap();
        conn.execute(
            "insert into records (id, title, subtitle, captured_at, image_path) values
              ('record-1', 'Title 1', 'Subtitle 1', '2026-04-11T19:00:00+08:00', null),
              ('record-2', 'Title 2', 'Subtitle 2', '2026-04-11T20:00:00+08:00', null),
              ('record-3', 'Title 3', 'Subtitle 3', '2026-04-11T21:00:00+08:00', null)",
            [],
        )
        .unwrap();

        let records = load_recent_records_filtered(
            temp.path(),
            Some("2026-04-11T20:30:00+08:00"),
            5,
        )
        .unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].id, "record-3");
    }
}
