pub mod path;

use rusqlite::Connection;
use std::path::Path;

pub fn open_and_bootstrap(database_path: &Path) -> Result<Connection, String> {
    if let Some(parent) = database_path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let conn = Connection::open(database_path).map_err(|err| err.to_string())?;
    conn.execute_batch(BOOTSTRAP_SQL)
        .map_err(|err| err.to_string())?;
    Ok(conn)
}

const BOOTSTRAP_SQL: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pending_uploads (
    screenshot_id TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    last_error TEXT,
    next_attempt_at TEXT,
    source TEXT NOT NULL CHECK (source IN ('auto', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_pending_uploads_next_attempt
    ON pending_uploads(next_attempt_at);
"#;

#[cfg(test)]
mod tests {
    use super::open_and_bootstrap;
    use tempfile::tempdir;

    #[test]
    fn bootstrap_creates_pending_uploads_table() {
        let dir = tempdir().unwrap();
        let db = dir.path().join("installer.db");
        let conn = open_and_bootstrap(&db).unwrap();

        let count: i64 = conn
            .query_row(
                "select count(*) from sqlite_master where type='table' and name='pending_uploads'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn bootstrap_creates_parent_dirs() {
        let dir = tempdir().unwrap();
        let nested = dir.path().join("a/b/c").join("installer.db");
        open_and_bootstrap(&nested).unwrap();
        assert!(nested.exists());
    }
}
