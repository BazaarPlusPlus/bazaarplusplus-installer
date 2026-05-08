use rusqlite::Connection;

#[derive(Debug, Clone)]
pub struct NewScreenshot {
    pub screenshot_id: String,
    pub captured_at_utc: String,
}

pub fn find_new_screenshots(
    conn: &Connection,
    cursor_utc_exclusive: &str,
) -> Result<Vec<NewScreenshot>, String> {
    let mut stmt = conn
        .prepare(
            "select screenshot_id, captured_at_utc
             from run_screenshots
             where capture_source = 'end_of_run_auto'
               and datetime(captured_at_utc) > datetime(?1)
             order by datetime(captured_at_utc) asc",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([cursor_utc_exclusive], |row| {
            Ok(NewScreenshot {
                screenshot_id: row.get(0)?,
                captured_at_utc: row.get(1)?,
            })
        })
        .map_err(|err| err.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|err| err.to_string())?);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::{find_new_screenshots, NewScreenshot};
    use rusqlite::Connection;

    fn make_db(rows: &[(&str, &str, &str, &str)]) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "create table run_screenshots (
                screenshot_id text primary key,
                run_id text,
                capture_source text not null,
                image_relative_path text not null,
                captured_at_local text not null,
                captured_at_utc text not null
            )",
            [],
        )
        .unwrap();
        for (id, run_id, source, captured_at_utc) in rows {
            conn.execute(
                "insert into run_screenshots
                    (screenshot_id, run_id, capture_source, image_relative_path,
                     captured_at_local, captured_at_utc)
                 values (?1, ?2, ?3, 'x.png', ?4, ?4)",
                rusqlite::params![id, run_id, source, captured_at_utc],
            )
            .unwrap();
        }
        conn
    }

    #[test]
    fn finds_only_end_of_run_auto_after_cursor() {
        let conn = make_db(&[
            ("snap-old", "r1", "end_of_run_auto", "2026-04-10T10:00:00+00:00"),
            ("snap-pvp", "r2", "pvp_battle_start", "2026-04-10T11:00:00+00:00"),
            ("snap-new", "r3", "end_of_run_auto", "2026-04-10T12:00:00+00:00"),
        ]);
        let new_rows = find_new_screenshots(&conn, "2026-04-10T10:30:00+00:00").unwrap();
        let ids: Vec<&str> = new_rows.iter().map(|r| r.screenshot_id.as_str()).collect();
        assert_eq!(ids, vec!["snap-new"]);
    }

    #[test]
    fn returns_empty_when_cursor_matches_latest() {
        let conn = make_db(&[
            ("snap-old", "r1", "end_of_run_auto", "2026-04-10T10:00:00+00:00"),
        ]);
        let new_rows = find_new_screenshots(&conn, "2026-04-10T10:00:00+00:00").unwrap();
        assert!(new_rows.is_empty());
    }
}
