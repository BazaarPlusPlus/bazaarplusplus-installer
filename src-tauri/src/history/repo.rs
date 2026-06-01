use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::Serialize;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    time::Duration,
};

#[derive(Clone, Debug, PartialEq, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct HistoryRunList {
    pub summary: HistorySummary,
    pub runs: Vec<HistoryRunRow>,
    pub next_cursor: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct HistorySummary {
    pub runs: i64,
    pub videos: i64,
    pub last_run_at_utc: Option<String>,
    pub win_rate: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct HistoryRunRow {
    pub run_id: String,
    pub hero: String,
    pub game_mode: String,
    pub started_at_utc: String,
    pub ended_at_utc: Option<String>,
    pub last_seen_at_utc: String,
    pub result: String,
    pub victories: Option<i64>,
    pub losses: Option<i64>,
    pub final_day: Option<i64>,
    pub final_player_rank: Option<String>,
    pub final_player_rating: Option<i64>,
    pub screenshot_id: Option<String>,
    pub strip_url: Option<String>,
    pub video_count: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct HistoryRunDetail {
    pub run: HistoryRunDetailRow,
    pub battles: Vec<HistoryBattleRow>,
}

#[derive(Clone, Debug, PartialEq, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct HistoryRunDetailRow {
    pub run_id: String,
    pub hero: String,
    pub game_mode: String,
    pub started_at_utc: String,
    pub ended_at_utc: Option<String>,
    pub last_seen_at_utc: String,
    pub status: String,
    pub result: String,
    pub victories: Option<i64>,
    pub losses: Option<i64>,
    pub final_day: Option<i64>,
    pub final_hour: Option<i64>,
    pub final_player_rank: Option<String>,
    pub final_player_rating: Option<i64>,
    pub screenshot_id: Option<String>,
    pub strip_url: Option<String>,
    pub video_count: i64,
    pub player_name: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct HistoryBattleRow {
    pub battle_id: String,
    pub day: Option<i64>,
    pub hour: Option<i64>,
    pub result: String,
    pub opponent_hero: Option<String>,
    pub opponent_name: Option<String>,
    pub opponent_rank: Option<String>,
    pub opponent_rating: Option<i64>,
    pub video: Option<HistoryBattleVideo>,
}

#[derive(Clone, Debug, PartialEq, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct HistoryBattleVideo {
    pub video_id: String,
    pub status: String,
    pub file_size_bytes: Option<i64>,
    pub duration_ms: Option<i64>,
}

struct RunRow {
    run_id: String,
    hero: String,
    game_mode: String,
    started_at_utc: String,
    ended_at_utc: Option<String>,
    last_seen_at_utc: String,
    status: String,
    victories: Option<i64>,
    losses: Option<i64>,
    final_day: Option<i64>,
    final_hour: Option<i64>,
    final_player_rank: Option<String>,
    final_player_rating: Option<i64>,
}

pub fn list_history_runs(database_path: &Path, limit: usize) -> Result<HistoryRunList, String> {
    if !database_path.exists() {
        return Ok(HistoryRunList {
            summary: HistorySummary {
                runs: 0,
                videos: 0,
                last_run_at_utc: None,
                win_rate: None,
            },
            runs: Vec::new(),
            next_cursor: None,
        });
    }

    let conn = open_connection(database_path)?;
    if !table_exists(&conn, "runs")? {
        return Ok(HistoryRunList {
            summary: HistorySummary {
                runs: 0,
                videos: 0,
                last_run_at_utc: None,
                win_rate: None,
            },
            runs: Vec::new(),
            next_cursor: None,
        });
    }

    let summary = load_summary(&conn)?;
    let effective_limit = i64::try_from(limit.max(1)).map_err(|err| err.to_string())?;
    let mut stmt = conn
        .prepare(
            "
            select
              run_id, hero, game_mode, started_at_utc, ended_at_utc, last_seen_at_utc,
              status, victories, losses, final_day, final_hour, final_player_rank, final_player_rating
            from runs
            order by coalesce(ended_at_utc, last_seen_at_utc, started_at_utc) desc, run_id desc
            limit ?1
            ",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([effective_limit], |row| {
            Ok(RunRow {
                run_id: row.get(0)?,
                hero: row.get(1)?,
                game_mode: row.get(2)?,
                started_at_utc: row.get(3)?,
                ended_at_utc: row.get(4)?,
                last_seen_at_utc: row.get(5)?,
                status: row.get(6)?,
                victories: row.get(7)?,
                losses: row.get(8)?,
                final_day: row.get(9)?,
                final_hour: row.get(10)?,
                final_player_rank: row.get(11)?,
                final_player_rating: row.get(12)?,
            })
        })
        .map_err(|err| err.to_string())?;

    let rows = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    let run_ids = rows
        .iter()
        .map(|row| row.run_id.clone())
        .collect::<Vec<_>>();
    let screenshot_ids = primary_screenshot_ids(&conn, &run_ids)?;
    let video_counts = completed_video_counts(&conn, &run_ids)?;

    let mut runs = Vec::new();
    for row in rows {
        let screenshot_id = screenshot_ids.get(&row.run_id).cloned();
        let strip_url = screenshot_id
            .as_ref()
            .map(|id| format!("/images/{id}/strip"));
        let video_count = video_counts.get(&row.run_id).copied().unwrap_or(0);
        runs.push(HistoryRunRow {
            result: derive_run_result(&row.status, row.victories),
            run_id: row.run_id,
            hero: row.hero,
            game_mode: row.game_mode,
            started_at_utc: row.started_at_utc,
            ended_at_utc: row.ended_at_utc,
            last_seen_at_utc: row.last_seen_at_utc,
            victories: row.victories,
            losses: row.losses,
            final_day: row.final_day,
            final_player_rank: row.final_player_rank,
            final_player_rating: row.final_player_rating,
            screenshot_id,
            strip_url,
            video_count,
        });
    }

    Ok(HistoryRunList {
        summary,
        runs,
        next_cursor: None,
    })
}

fn sql_placeholders(count: usize) -> String {
    std::iter::repeat("?")
        .take(count)
        .collect::<Vec<_>>()
        .join(", ")
}

fn primary_screenshot_ids(
    conn: &Connection,
    run_ids: &[String],
) -> Result<HashMap<String, String>, String> {
    if run_ids.is_empty() || !table_exists(conn, "run_screenshots")? {
        return Ok(HashMap::new());
    }

    let mut selected = HashMap::new();
    let placeholders = sql_placeholders(run_ids.len());
    let primary_sql = format!(
        "
        select run_id, screenshot_id
        from run_screenshots
        where run_id in ({placeholders}) and is_primary = 1
        "
    );
    let mut stmt = conn.prepare(&primary_sql).map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(run_ids.iter()), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|err| err.to_string())?;

    for row in rows {
        let (run_id, screenshot_id) = row.map_err(|err| err.to_string())?;
        selected.entry(run_id).or_insert(screenshot_id);
    }

    let missing_run_ids = run_ids
        .iter()
        .filter(|run_id| !selected.contains_key(*run_id))
        .collect::<Vec<_>>();
    if missing_run_ids.is_empty() {
        return Ok(selected);
    }

    let placeholders = sql_placeholders(missing_run_ids.len());
    let fallback_sql = format!(
        "
        select run_id, screenshot_id
        from run_screenshots
        where run_id in ({placeholders}) and capture_source = 'end_of_run_auto'
        order by run_id asc, captured_at_utc desc, screenshot_id desc
        "
    );
    let mut stmt = conn.prepare(&fallback_sql).map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(missing_run_ids), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|err| err.to_string())?;

    for row in rows {
        let (run_id, screenshot_id) = row.map_err(|err| err.to_string())?;
        selected.entry(run_id).or_insert(screenshot_id);
    }

    Ok(selected)
}

fn completed_video_counts(
    conn: &Connection,
    run_ids: &[String],
) -> Result<HashMap<String, i64>, String> {
    if run_ids.is_empty()
        || !table_exists(conn, "combat_replay_videos")?
        || !table_exists(conn, "battles")?
    {
        return Ok(HashMap::new());
    }

    let placeholders = sql_placeholders(run_ids.len());
    let sql = format!(
        "
        select b.run_id, count(*)
        from combat_replay_videos cv
        join battles b on b.battle_id = cv.battle_id
        where b.run_id in ({placeholders})
          and b.deleted_at_utc is null
          and cv.status = 'COMPLETED'
        group by b.run_id
        "
    );
    let mut stmt = conn.prepare(&sql).map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(run_ids.iter()), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|err| err.to_string())?;

    let mut counts = HashMap::new();
    for row in rows {
        let (run_id, count) = row.map_err(|err| err.to_string())?;
        counts.insert(run_id, count);
    }

    Ok(counts)
}

pub fn get_history_run_detail(
    database_path: &Path,
    run_id: &str,
) -> Result<Option<HistoryRunDetail>, String> {
    if !database_path.exists() {
        return Ok(None);
    }

    let conn = open_connection(database_path)?;
    if !table_exists(&conn, "runs")? {
        return Ok(None);
    }

    let Some(row) = load_run_row(&conn, run_id)? else {
        return Ok(None);
    };
    let screenshot_id = primary_screenshot(&conn, run_id)?.map(|screenshot| screenshot.id);
    let strip_url = screenshot_id
        .as_ref()
        .map(|id| format!("/images/{id}/strip"));
    let video_count = completed_video_count(&conn, run_id)?;
    let player_name = local_player_name(&conn, run_id)?;
    let battles = load_battle_rows(&conn, run_id)?;

    Ok(Some(HistoryRunDetail {
        run: HistoryRunDetailRow {
            result: derive_run_result(&row.status, row.victories),
            run_id: row.run_id,
            hero: row.hero,
            game_mode: row.game_mode,
            started_at_utc: row.started_at_utc,
            ended_at_utc: row.ended_at_utc,
            last_seen_at_utc: row.last_seen_at_utc,
            status: row.status,
            victories: row.victories,
            losses: row.losses,
            final_day: row.final_day,
            final_hour: row.final_hour,
            final_player_rank: row.final_player_rank,
            final_player_rating: row.final_player_rating,
            screenshot_id,
            strip_url,
            video_count,
            player_name,
        },
        battles,
    }))
}

pub fn load_run_screenshot_path(
    database_path: &Path,
    game_path: &Path,
    run_id: &str,
) -> Result<Option<PathBuf>, String> {
    let conn = open_connection(database_path)?;
    let path = primary_screenshot(&conn, run_id)?
        .and_then(|screenshot| resolve_screenshot_path(game_path, &screenshot.image_relative_path));
    Ok(path)
}

pub fn load_battle_video_path(
    database_path: &Path,
    data_dir: &Path,
    battle_id: &str,
    video_id: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    let conn = open_connection(database_path)?;
    let row = load_battle_video_ref(&conn, battle_id, video_id)?;
    Ok(row.and_then(|video| resolve_data_file_path(data_dir, &video.relative_path)))
}

pub fn load_run_id_for_battle(
    database_path: &Path,
    battle_id: &str,
) -> Result<Option<String>, String> {
    let conn = open_connection(database_path)?;
    if !table_exists(&conn, "battles")? {
        return Ok(None);
    }

    conn.query_row(
        "select run_id from battles where battle_id = ?1",
        [battle_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(|err| err.to_string())
}

pub fn delete_battle_video(
    database_path: &Path,
    data_dir: &Path,
    battle_id: &str,
    video_id: &str,
) -> Result<bool, String> {
    let mut conn = open_connection(database_path)?;
    let Some(video) = load_battle_video_ref(&conn, battle_id, Some(video_id))? else {
        return Ok(false);
    };
    remove_video_file(data_dir, &video.relative_path)?;
    let transaction = conn.transaction().map_err(|err| err.to_string())?;
    let deleted = transaction
        .execute(
            "delete from combat_replay_videos where battle_id = ?1 and video_id = ?2",
            params![battle_id, video_id],
        )
        .map_err(|err| err.to_string())?;
    transaction.commit().map_err(|err| err.to_string())?;
    Ok(deleted > 0)
}

pub fn delete_run_videos(
    database_path: &Path,
    data_dir: &Path,
    run_id: &str,
) -> Result<usize, String> {
    let mut conn = open_connection(database_path)?;
    let videos = load_run_video_refs(&conn, run_id)?;
    for video in &videos {
        remove_video_file(data_dir, &video.relative_path)?;
    }
    let transaction = conn.transaction().map_err(|err| err.to_string())?;
    for video in &videos {
        transaction
            .execute(
                "delete from combat_replay_videos where video_id = ?1",
                [&video.video_id],
            )
            .map_err(|err| err.to_string())?;
    }
    transaction.commit().map_err(|err| err.to_string())?;
    Ok(videos.len())
}

fn open_connection(database_path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(database_path).map_err(|err| err.to_string())?;
    conn.busy_timeout(Duration::from_secs(2))
        .map_err(|err| err.to_string())?;
    Ok(conn)
}

fn load_summary(conn: &Connection) -> Result<HistorySummary, String> {
    let (runs, completed_runs, win_runs, last_run_at_utc): (i64, i64, i64, Option<String>) = conn
        .query_row(
            "
            select
              count(*) as runs,
              sum(case when status = 'completed' then 1 else 0 end) as completed_runs,
              sum(case when status = 'completed' and coalesce(victories, 0) >= 10 then 1 else 0 end) as win_runs,
              max(coalesce(ended_at_utc, last_seen_at_utc, started_at_utc)) as last_run_at_utc
            from runs
            ",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|err| err.to_string())?;
    let videos = if table_exists(conn, "combat_replay_videos")? {
        conn.query_row(
            "select count(*) from combat_replay_videos where status = 'COMPLETED'",
            [],
            |row| row.get(0),
        )
        .map_err(|err| err.to_string())?
    } else {
        0
    };

    Ok(HistorySummary {
        runs,
        videos,
        last_run_at_utc,
        win_rate: if completed_runs > 0 {
            Some(win_runs as f64 / completed_runs as f64)
        } else {
            None
        },
    })
}

fn load_run_row(conn: &Connection, run_id: &str) -> Result<Option<RunRow>, String> {
    conn.query_row(
        "
        select
          run_id, hero, game_mode, started_at_utc, ended_at_utc, last_seen_at_utc,
          status, victories, losses, final_day, final_hour, final_player_rank, final_player_rating
        from runs
        where run_id = ?1
        ",
        [run_id],
        |row| {
            Ok(RunRow {
                run_id: row.get(0)?,
                hero: row.get(1)?,
                game_mode: row.get(2)?,
                started_at_utc: row.get(3)?,
                ended_at_utc: row.get(4)?,
                last_seen_at_utc: row.get(5)?,
                status: row.get(6)?,
                victories: row.get(7)?,
                losses: row.get(8)?,
                final_day: row.get(9)?,
                final_hour: row.get(10)?,
                final_player_rank: row.get(11)?,
                final_player_rating: row.get(12)?,
            })
        },
    )
    .optional()
    .map_err(|err| err.to_string())
}

struct ScreenshotRef {
    id: String,
    image_relative_path: String,
}

fn primary_screenshot(conn: &Connection, run_id: &str) -> Result<Option<ScreenshotRef>, String> {
    if !table_exists(conn, "run_screenshots")? {
        return Ok(None);
    }

    let primary = conn
        .query_row(
            "
            select screenshot_id, image_relative_path
            from run_screenshots
            where run_id = ?1 and is_primary = 1
            limit 1
            ",
            [run_id],
            |row| {
                Ok(ScreenshotRef {
                    id: row.get(0)?,
                    image_relative_path: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(|err| err.to_string())?;
    if primary.is_some() {
        return Ok(primary);
    }

    conn.query_row(
        "
        select screenshot_id, image_relative_path
        from run_screenshots
        where run_id = ?1 and capture_source = 'end_of_run_auto'
        order by captured_at_utc desc, screenshot_id desc
        limit 1
        ",
        [run_id],
        |row| {
            Ok(ScreenshotRef {
                id: row.get(0)?,
                image_relative_path: row.get(1)?,
            })
        },
    )
    .optional()
    .map_err(|err| err.to_string())
}

fn completed_video_count(conn: &Connection, run_id: &str) -> Result<i64, String> {
    if !table_exists(conn, "combat_replay_videos")? || !table_exists(conn, "battles")? {
        return Ok(0);
    }

    conn.query_row(
        "
        select count(*)
        from combat_replay_videos cv
        join battles b on b.battle_id = cv.battle_id
        where b.run_id = ?1 and cv.status = 'COMPLETED' and b.deleted_at_utc is null
        ",
        [run_id],
        |row| row.get(0),
    )
    .map_err(|err| err.to_string())
}

fn local_player_name(conn: &Connection, run_id: &str) -> Result<Option<String>, String> {
    if !table_exists(conn, "battles")? {
        return Ok(None);
    }

    conn.query_row(
        "
        select player_name
        from battles
        where run_id = ?1 and source = 'LOCAL' and player_name is not null and deleted_at_utc is null
        order by recorded_at_utc desc, battle_id desc
        limit 1
        ",
        [run_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(|err| err.to_string())
}

fn load_battle_rows(conn: &Connection, run_id: &str) -> Result<Vec<HistoryBattleRow>, String> {
    if !table_exists(conn, "battles")? {
        return Ok(Vec::new());
    }

    if table_exists(conn, "combat_replay_videos")? {
        let mut stmt = conn
            .prepare(
                "
                select
                  b.battle_id, b.day, b.hour, b.result,
                  b.opponent_hero, b.opponent_name, b.opponent_rank, b.opponent_rating,
                  cv.video_id, cv.status, cv.file_size_bytes, cv.duration_ms
                from battles b
                left join combat_replay_videos cv on cv.video_id = (
                  select video_id
                  from combat_replay_videos
                  where battle_id = b.battle_id and status = 'COMPLETED'
                  order by started_at_utc desc, video_id desc
                  limit 1
                )
                where b.run_id = ?1 and b.source = 'LOCAL' and b.deleted_at_utc is null
                order by b.recorded_at_utc desc, b.battle_id desc
                ",
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([run_id], |row| {
                let video_id: Option<String> = row.get(8)?;
                Ok(HistoryBattleRow {
                    battle_id: row.get(0)?,
                    day: row.get(1)?,
                    hour: row.get(2)?,
                    result: map_battle_result(row.get::<_, Option<String>>(3)?.as_deref()),
                    opponent_hero: row.get(4)?,
                    opponent_name: row.get(5)?,
                    opponent_rank: row.get(6)?,
                    opponent_rating: row.get(7)?,
                    video: video_id.map(|video_id| HistoryBattleVideo {
                        video_id,
                        status: row.get(9).unwrap_or_else(|_| "COMPLETED".to_string()),
                        file_size_bytes: row.get(10).ok().flatten(),
                        duration_ms: row.get(11).ok().flatten(),
                    }),
                })
            })
            .map_err(|err| err.to_string())?;
        return rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string());
    }

    let mut stmt = conn
        .prepare(
            "
            select
              battle_id, day, hour, result,
              opponent_hero, opponent_name, opponent_rank, opponent_rating
            from battles
            where run_id = ?1 and source = 'LOCAL' and deleted_at_utc is null
            order by recorded_at_utc desc, battle_id desc
            ",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([run_id], |row| {
            Ok(HistoryBattleRow {
                battle_id: row.get(0)?,
                day: row.get(1)?,
                hour: row.get(2)?,
                result: map_battle_result(row.get::<_, Option<String>>(3)?.as_deref()),
                opponent_hero: row.get(4)?,
                opponent_name: row.get(5)?,
                opponent_rank: row.get(6)?,
                opponent_rating: row.get(7)?,
                video: None,
            })
        })
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())
}

fn derive_run_result(status: &str, victories: Option<i64>) -> String {
    match status {
        "abandoned" => "abandoned".to_string(),
        "completed" if victories.unwrap_or(0) >= 10 => "win".to_string(),
        "completed" => "loss".to_string(),
        value if value != "completed" && value != "abandoned" => "in_progress".to_string(),
        _ => "unknown".to_string(),
    }
}

fn map_battle_result(result: Option<&str>) -> String {
    match result {
        Some("Win" | "Won") => "win".to_string(),
        Some("Loss" | "Lost") => "loss".to_string(),
        _ => "unknown".to_string(),
    }
}

struct VideoRef {
    video_id: String,
    relative_path: String,
}

fn load_battle_video_ref(
    conn: &Connection,
    battle_id: &str,
    video_id: Option<&str>,
) -> Result<Option<VideoRef>, String> {
    if !table_exists(conn, "combat_replay_videos")? {
        return Ok(None);
    }

    if let Some(video_id) = video_id {
        return conn
            .query_row(
                "
                select video_id, video_relative_path
                from combat_replay_videos
                where battle_id = ?1 and video_id = ?2 and status = 'COMPLETED'
                ",
                params![battle_id, video_id],
                |row| {
                    Ok(VideoRef {
                        video_id: row.get(0)?,
                        relative_path: row.get(1)?,
                    })
                },
            )
            .optional()
            .map_err(|err| err.to_string());
    }

    conn.query_row(
        "
        select video_id, video_relative_path
        from combat_replay_videos
        where battle_id = ?1 and status = 'COMPLETED'
        order by started_at_utc desc, video_id desc
        limit 1
        ",
        [battle_id],
        |row| {
            Ok(VideoRef {
                video_id: row.get(0)?,
                relative_path: row.get(1)?,
            })
        },
    )
    .optional()
    .map_err(|err| err.to_string())
}

fn load_run_video_refs(conn: &Connection, run_id: &str) -> Result<Vec<VideoRef>, String> {
    if !table_exists(conn, "combat_replay_videos")? || !table_exists(conn, "battles")? {
        return Ok(Vec::new());
    }

    let mut stmt = conn
        .prepare(
            "
            select cv.video_id, cv.video_relative_path
            from combat_replay_videos cv
            join battles b on b.battle_id = cv.battle_id
            where b.run_id = ?1 and b.deleted_at_utc is null and cv.status = 'COMPLETED'
            ",
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

fn remove_video_file(data_dir: &Path, relative_path: &str) -> Result<(), String> {
    let Some(path) = resolve_data_file_path(data_dir, relative_path) else {
        return Ok(());
    };
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("failed to remove video {}: {err}", path.display())),
    }
}

fn resolve_data_file_path(data_dir: &Path, raw_path: &str) -> Option<PathBuf> {
    let raw_path = raw_path.trim();
    if raw_path.is_empty() {
        return None;
    }

    let candidate = PathBuf::from(raw_path);
    if candidate.is_absolute() {
        return Some(candidate);
    }

    let mut normalized = PathBuf::new();
    for segment in raw_path.split(['/', '\\']) {
        let trimmed = segment.trim();
        if !trimmed.is_empty() && trimmed != "." && trimmed != ".." {
            normalized.push(trimmed);
        }
    }
    Some(data_dir.join(normalized))
}

fn resolve_screenshot_path(game_path: &Path, raw_path: &str) -> Option<PathBuf> {
    let raw_path = raw_path.trim();
    if raw_path.is_empty() {
        return None;
    }
    let candidate = PathBuf::from(raw_path);
    if candidate.is_absolute() {
        return Some(candidate);
    }
    resolve_data_file_path(
        &game_path
            .join(crate::config::BAZAAR_DATA_DIRECTORY)
            .join(crate::config::SCREENSHOTS_DIRECTORY),
        raw_path,
    )
}

fn table_exists(conn: &Connection, table_name: &str) -> Result<bool, String> {
    conn.query_row(
        "select exists(select 1 from sqlite_master where type = 'table' and name = ?1)",
        [table_name],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value != 0)
    .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        delete_battle_video, delete_run_videos, get_history_run_detail, list_history_runs,
    };

    fn create_history_schema(conn: &rusqlite::Connection) {
        conn.execute_batch(
            "
            create table runs (
                run_id text primary key,
                started_at_utc text not null,
                last_seen_at_utc text not null,
                status text not null,
                completed integer not null default 0,
                hero text not null,
                game_mode text not null,
                ended_at_utc text null,
                final_day integer null,
                final_hour integer null,
                victories integer null,
                losses integer null,
                final_player_rank text null,
                final_player_rating integer null,
                final_player_rating_delta integer null
            );
            create table battles (
                battle_id text primary key,
                source text not null,
                run_id text null,
                recorded_at_utc text not null,
                day integer null,
                hour integer null,
                player_name text null,
                player_hero text null,
                opponent_hero text null,
                opponent_name text null,
                opponent_rank text null,
                opponent_rating integer null,
                result text null,
                deleted_at_utc text null
            );
            create table run_screenshots (
                screenshot_id text primary key,
                run_id text null,
                hero_name text null,
                capture_source text not null,
                is_primary integer not null default 0,
                image_relative_path text not null,
                captured_at_utc text not null,
                captured_at_local text not null,
                player_rank text null,
                player_rating integer null,
                victories_at_capture integer null
            );
            create table combat_replay_videos (
                video_id text primary key,
                battle_id text not null,
                video_relative_path text not null,
                started_at_utc text not null,
                duration_ms integer null,
                file_size_bytes integer null,
                status text not null
            );
            ",
        )
        .unwrap();
    }

    #[test]
    fn list_history_runs_derives_summary_results_video_counts_and_strip_urls() {
        let temp_dir = tempfile::tempdir().unwrap();
        let database_path = temp_dir.path().join("bazaarplusplus.db");
        let conn = rusqlite::Connection::open(&database_path).unwrap();
        create_history_schema(&conn);
        conn.execute_batch(
            "
            insert into runs (
                run_id, started_at_utc, last_seen_at_utc, status, completed,
                hero, game_mode, ended_at_utc, final_day, victories, losses,
                final_player_rank, final_player_rating
            ) values
                ('run-win', '2026-05-20T10:00:00Z', '2026-05-20T11:00:00Z', 'completed', 1,
                 'Vanessa', 'Ranked', '2026-05-20T11:00:00Z', 10, 10, 2, 'Diamond II', 1450),
                ('run-loss', '2026-05-19T10:00:00Z', '2026-05-19T10:40:00Z', 'completed', 1,
                 'Dooley', 'Ranked', '2026-05-19T10:40:00Z', 6, 4, 3, 'Gold I', 1100),
                ('run-live', '2026-05-21T10:00:00Z', '2026-05-21T10:20:00Z', 'active', 0,
                 'Mak', 'Normal', null, null, null, null, null, null);

            insert into run_screenshots (
                screenshot_id, run_id, hero_name, capture_source, is_primary,
                image_relative_path, captured_at_utc, captured_at_local
            ) values
                ('shot-win', 'run-win', 'Vanessa', 'end_of_run_auto', 1,
                 'win.png', '2026-05-20T11:00:00Z', '2026-05-20T19:00:00+08:00');

            insert into battles (
                battle_id, source, run_id, recorded_at_utc, opponent_name
            ) values
                ('battle-1', 'LOCAL', 'run-win', '2026-05-20T10:30:00Z', 'Opponent');

            insert into combat_replay_videos (
                video_id, battle_id, video_relative_path, started_at_utc,
                duration_ms, file_size_bytes, status
            ) values
                ('video-1', 'battle-1', 'Videos/video-1.mp4', '2026-05-20T10:31:00Z',
                 1000, 2000, 'COMPLETED');
            ",
        )
        .unwrap();

        let payload = list_history_runs(&database_path, 20).unwrap();

        assert_eq!(payload.summary.runs, 3);
        assert_eq!(payload.summary.videos, 1);
        assert_eq!(
            payload.summary.last_run_at_utc.as_deref(),
            Some("2026-05-21T10:20:00Z")
        );
        assert_eq!(payload.summary.win_rate, Some(0.5));
        assert_eq!(payload.runs.len(), 3);
        assert_eq!(payload.runs[0].run_id, "run-live");
        assert_eq!(payload.runs[0].result, "in_progress");
        assert_eq!(payload.runs[1].run_id, "run-win");
        assert_eq!(payload.runs[1].result, "win");
        assert_eq!(
            payload.runs[1].strip_url.as_deref(),
            Some("/images/shot-win/strip")
        );
        assert_eq!(payload.runs[1].video_count, 1);
        assert_eq!(payload.runs[2].run_id, "run-loss");
        assert_eq!(payload.runs[2].result, "loss");
    }

    #[test]
    fn run_detail_maps_local_battles_latest_completed_video_and_deletes_video_rows() {
        let temp_dir = tempfile::tempdir().unwrap();
        let data_dir = temp_dir.path().join("BazaarPlusPlusV4");
        let videos_dir = data_dir.join("Videos");
        std::fs::create_dir_all(&videos_dir).unwrap();
        std::fs::write(videos_dir.join("new.mp4"), b"new-video").unwrap();
        std::fs::write(videos_dir.join("old.mp4"), b"old-video").unwrap();

        let database_path = data_dir.join("bazaarplusplus.db");
        let conn = rusqlite::Connection::open(&database_path).unwrap();
        create_history_schema(&conn);
        conn.execute_batch(
            "
            insert into runs (
                run_id, started_at_utc, last_seen_at_utc, status, completed,
                hero, game_mode, ended_at_utc, final_day, final_hour, victories, losses,
                final_player_rank, final_player_rating
            ) values (
                'run-win', '2026-05-20T10:00:00Z', '2026-05-20T11:00:00Z', 'completed', 1,
                'Vanessa', 'Ranked', '2026-05-20T11:00:00Z', 10, 7, 10, 2,
                'Diamond II', 1450
            );

            insert into run_screenshots (
                screenshot_id, run_id, hero_name, capture_source, is_primary,
                image_relative_path, captured_at_utc, captured_at_local
            ) values (
                'shot-win', 'run-win', 'Vanessa', 'end_of_run_auto', 1,
                'win.png', '2026-05-20T11:00:00Z', '2026-05-20T19:00:00+08:00'
            );

            insert into battles (
                battle_id, source, run_id, recorded_at_utc, day, hour,
                player_name, opponent_hero, opponent_name, opponent_rank, opponent_rating, result
            ) values
                ('battle-1', 'LOCAL', 'run-win', '2026-05-20T10:30:00Z', 8, 1,
                 'cauyxy', 'Dooley', 'Opponent A', 'Diamond III', 1410, 'Won'),
                ('battle-2', 'LOCAL', 'run-win', '2026-05-20T10:10:00Z', 7, 0,
                 'cauyxy', 'Pygmalien', 'Opponent B', 'Diamond IV', 1360, 'Lost'),
                ('battle-ghost', 'GHOST', 'run-win', '2026-05-20T10:40:00Z', 9, 0,
                 'cauyxy', 'Mak', 'Ghost', 'Diamond I', 1500, 'Won');

            insert into combat_replay_videos (
                video_id, battle_id, video_relative_path, started_at_utc,
                duration_ms, file_size_bytes, status
            ) values
                ('video-old', 'battle-1', 'Videos/old.mp4', '2026-05-20T10:31:00Z',
                 1000, 2000, 'COMPLETED'),
                ('video-new', 'battle-1', 'Videos/new.mp4', '2026-05-20T10:32:00Z',
                 1200, 2200, 'COMPLETED'),
                ('video-failed', 'battle-2', 'Videos/failed.mp4', '2026-05-20T10:11:00Z',
                 null, null, 'FAILED');
            ",
        )
        .unwrap();
        drop(conn);

        let detail = get_history_run_detail(&database_path, "run-win")
            .unwrap()
            .unwrap();
        assert_eq!(detail.run.player_name.as_deref(), Some("cauyxy"));
        assert_eq!(detail.run.final_hour, Some(7));
        assert_eq!(
            detail.run.strip_url.as_deref(),
            Some("/images/shot-win/strip")
        );
        assert_eq!(detail.battles.len(), 2);
        assert_eq!(detail.battles[0].battle_id, "battle-1");
        assert_eq!(detail.battles[0].result, "win");
        assert_eq!(
            detail.battles[0]
                .video
                .as_ref()
                .map(|video| video.video_id.as_str()),
            Some("video-new")
        );
        assert_eq!(detail.battles[1].battle_id, "battle-2");
        assert_eq!(detail.battles[1].result, "loss");
        assert_eq!(detail.battles[1].video, None);

        assert!(delete_battle_video(&database_path, &data_dir, "battle-1", "video-new").unwrap());
        assert!(!videos_dir.join("new.mp4").exists());

        let detail = get_history_run_detail(&database_path, "run-win")
            .unwrap()
            .unwrap();
        assert_eq!(
            detail.battles[0]
                .video
                .as_ref()
                .map(|video| video.video_id.as_str()),
            Some("video-old")
        );

        assert_eq!(
            delete_run_videos(&database_path, &data_dir, "run-win").unwrap(),
            1
        );
        assert!(!videos_dir.join("old.mp4").exists());
        let detail = get_history_run_detail(&database_path, "run-win")
            .unwrap()
            .unwrap();
        assert_eq!(detail.battles[0].video, None);
    }
}
