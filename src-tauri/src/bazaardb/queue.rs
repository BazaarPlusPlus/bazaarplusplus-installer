use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UploadSource {
    Manual,
    Auto,
}

impl UploadSource {
    fn as_str(self) -> &'static str {
        match self {
            UploadSource::Manual => "manual",
            UploadSource::Auto => "auto",
        }
    }

    fn parse(s: &str) -> Result<Self, String> {
        match s {
            "manual" => Ok(UploadSource::Manual),
            "auto" => Ok(UploadSource::Auto),
            other => Err(format!("unknown upload source: {other}")),
        }
    }
}

#[derive(Debug, Clone)]
pub struct PendingRow {
    pub screenshot_id: String,
    pub attempts: i64,
    pub last_attempt_at: Option<String>,
    pub last_error: Option<String>,
    pub next_attempt_at: Option<String>,
    pub source: UploadSource,
}

pub fn enqueue(conn: &Connection, screenshot_id: &str, source: UploadSource) -> Result<(), String> {
    conn.execute(
        "insert or ignore into pending_uploads
            (screenshot_id, attempts, source) values (?1, 0, ?2)",
        params![screenshot_id, source.as_str()],
    )
    .map(|_| ())
    .map_err(|err| err.to_string())
}

pub fn list_due(conn: &Connection, now: &DateTime<Utc>) -> Result<Vec<PendingRow>, String> {
    let now_str = now.to_rfc3339();
    let mut stmt = conn
        .prepare(
            "select screenshot_id, attempts, last_attempt_at, last_error, next_attempt_at, source
             from pending_uploads
             where next_attempt_at is null or next_attempt_at <= ?1
             order by coalesce(next_attempt_at, '0') asc",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([now_str], |row| {
            Ok(PendingRow {
                screenshot_id: row.get(0)?,
                attempts: row.get(1)?,
                last_attempt_at: row.get(2)?,
                last_error: row.get(3)?,
                next_attempt_at: row.get(4)?,
                source: UploadSource::parse(&row.get::<_, String>(5)?).unwrap_or(UploadSource::Manual),
            })
        })
        .map_err(|err| err.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|err| err.to_string())?);
    }
    Ok(out)
}

pub fn mark_success(conn: &Connection, screenshot_id: &str) -> Result<(), String> {
    conn.execute(
        "delete from pending_uploads where screenshot_id = ?1",
        params![screenshot_id],
    )
    .map(|_| ())
    .map_err(|err| err.to_string())
}

pub fn mark_failure(
    conn: &Connection,
    screenshot_id: &str,
    next_attempt_at: &DateTime<Utc>,
    last_error: &str,
) -> Result<(), String> {
    conn.execute(
        "update pending_uploads
            set attempts = attempts + 1,
                last_attempt_at = ?2,
                last_error = ?3,
                next_attempt_at = ?4
            where screenshot_id = ?1",
        params![
            screenshot_id,
            Utc::now().to_rfc3339(),
            last_error,
            next_attempt_at.to_rfc3339(),
        ],
    )
    .map(|_| ())
    .map_err(|err| err.to_string())
}

pub fn count_pending(conn: &Connection) -> Result<i64, String> {
    conn.query_row(
        "select count(*) from pending_uploads",
        [],
        |row| row.get(0),
    )
    .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::{enqueue, list_due, mark_failure, mark_success, UploadSource};
    use crate::installer_db::open_and_bootstrap;
    use chrono::{Duration, Utc};
    use tempfile::tempdir;

    fn fresh_db() -> (rusqlite::Connection, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("installer.db");
        let conn = open_and_bootstrap(&db_path).unwrap();
        (conn, dir)
    }

    #[test]
    fn enqueue_stores_a_pending_row_with_zero_attempts() {
        let (conn, _dir) = fresh_db();
        enqueue(&conn, "snap-1", UploadSource::Manual).unwrap();
        let rows = list_due(&conn, &Utc::now()).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].screenshot_id, "snap-1");
        assert_eq!(rows[0].attempts, 0);
        assert_eq!(rows[0].source, UploadSource::Manual);
    }

    #[test]
    fn list_due_excludes_rows_whose_next_attempt_is_in_the_future() {
        let (conn, _dir) = fresh_db();
        enqueue(&conn, "snap-1", UploadSource::Auto).unwrap();
        let now = Utc::now();
        let later = now + Duration::hours(1);
        mark_failure(&conn, "snap-1", &later, "transient").unwrap();

        let rows_now = list_due(&conn, &now).unwrap();
        assert!(rows_now.is_empty(), "row should not be due yet");

        let rows_after = list_due(&conn, &(later + Duration::seconds(1))).unwrap();
        assert_eq!(rows_after.len(), 1);
        assert_eq!(rows_after[0].attempts, 1);
        assert_eq!(rows_after[0].last_error.as_deref(), Some("transient"));
    }

    #[test]
    fn mark_success_removes_the_row() {
        let (conn, _dir) = fresh_db();
        enqueue(&conn, "snap-1", UploadSource::Manual).unwrap();
        mark_success(&conn, "snap-1").unwrap();
        assert!(list_due(&conn, &Utc::now()).unwrap().is_empty());
    }
}
