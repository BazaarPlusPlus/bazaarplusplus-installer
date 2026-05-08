use crate::bazaardb::{
    auto_watcher::find_new_screenshots,
    backoff::next_delay_seconds, client::upload_screenshot,
    endpoints::BAZAARDB_BASE_URL, image_pipeline::encode_for_upload,
    keyring::KeyringStore, payload::ScreenshotMetadata, queue,
};
use crate::installer_db::{self, path::default_installer_db_path};
use crate::stream::records::{find_database_path_anywhere, resolve_database_path, OverlayRecordRepository};
use chrono::{Duration, Utc};
use std::path::PathBuf;
use std::time::Duration as StdDuration;

#[derive(Debug)]
pub enum AttemptDecision {
    Done { remote_id: String },
    Retry { delay_seconds: u64, message: String },
    PauseUntilReconnect { message: String },
    Drop { message: String },
}

pub fn decide_after_attempt(
    outcome: Result<String, String>,
    attempts_so_far: u32,
) -> AttemptDecision {
    match outcome {
        Ok(remote_id) => AttemptDecision::Done { remote_id },
        Err(err) => {
            if let Some(rest) = err.strip_prefix("rate_limited:") {
                let parsed = rest.trim().parse::<u64>().ok();
                let delay = parsed.unwrap_or_else(|| next_delay_seconds(attempts_so_far));
                AttemptDecision::Retry { delay_seconds: delay, message: err }
            } else if let Some(rest) = err.strip_prefix("client_error:") {
                if rest.trim() == "401" {
                    AttemptDecision::PauseUntilReconnect { message: err }
                } else {
                    AttemptDecision::Drop { message: err }
                }
            } else if err.starts_with("server_error:") || err.contains("network") {
                AttemptDecision::Retry {
                    delay_seconds: next_delay_seconds(attempts_so_far),
                    message: err,
                }
            } else {
                AttemptDecision::Retry {
                    delay_seconds: next_delay_seconds(attempts_so_far),
                    message: err,
                }
            }
        }
    }
}

pub fn spawn_worker(game_path: Option<PathBuf>) {
    tokio::spawn(async move {
        loop {
            if let Err(err) = drain_once(game_path.clone()).await {
                eprintln!("upload worker tick failed: {err}");
            }
            tokio::time::sleep(StdDuration::from_secs(60)).await;
        }
    });
}

async fn drain_once(game_path: Option<PathBuf>) -> Result<(), String> {
    let Some(db_path) = default_installer_db_path() else { return Ok(()); };
    let conn = installer_db::open_and_bootstrap(&db_path)?;

    // Auto-watcher: enqueue new end-of-run screenshots if auto-upload is enabled.
    let auto_enabled = installer_db::get_setting(&conn, "auto_upload_enabled")?
        .as_deref() == Some("1");
    if auto_enabled {
        let mod_db_path = if let Some(ref gp) = game_path {
            resolve_database_path(gp)
        } else {
            find_database_path_anywhere()
        };
        match mod_db_path {
            Err(err) => {
                eprintln!("auto-watcher: cannot locate mod DB: {err}");
            }
            Ok(mod_db_path) => {
                match rusqlite::Connection::open_with_flags(
                    &mod_db_path,
                    rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
                ) {
                    Err(err) => {
                        eprintln!("auto-watcher: cannot open mod DB: {err}");
                    }
                    Ok(mod_conn) => {
                        let cursor = installer_db::get_setting(&conn, "auto_upload_cursor")?
                            .unwrap_or_else(|| "1970-01-01T00:00:00+00:00".to_string());
                        match find_new_screenshots(&mod_conn, &cursor) {
                            Err(err) => {
                                eprintln!("auto-watcher: query failed: {err}");
                            }
                            Ok(new_shots) => {
                                let mut max_cursor = cursor.clone();
                                for shot in &new_shots {
                                    if let Err(err) = queue::enqueue(
                                        &conn,
                                        &shot.screenshot_id,
                                        queue::UploadSource::Auto,
                                    ) {
                                        eprintln!(
                                            "auto-watcher: failed to enqueue {}: {err}",
                                            shot.screenshot_id
                                        );
                                    }
                                    if shot.captured_at_utc > max_cursor {
                                        max_cursor = shot.captured_at_utc.clone();
                                    }
                                }
                                if max_cursor != cursor {
                                    if let Err(err) = installer_db::set_setting(
                                        &conn,
                                        "auto_upload_cursor",
                                        &max_cursor,
                                    ) {
                                        eprintln!(
                                            "auto-watcher: failed to update cursor: {err}"
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let pat = match KeyringStore::os().load()? {
        Some(token) => token,
        None => return Ok(()),
    };

    let now = Utc::now();
    let due = queue::list_due(&conn, &now)?;
    if due.is_empty() {
        return Ok(());
    }

    let repo = OverlayRecordRepository::new(game_path);

    for row in due {
        let Some(record) = repo.load_record_by_id(&row.screenshot_id)? else {
            queue::mark_success(&conn, &row.screenshot_id).ok();
            continue;
        };

        let Some(player_account_id) = record.player_account_id.clone() else {
            queue::mark_failure(
                &conn,
                &row.screenshot_id,
                &(now + Duration::hours(24)),
                "missing_player_account_id",
            )?;
            continue;
        };

        let Some((_path, raw)) = repo.load_image(&row.screenshot_id)? else {
            queue::mark_success(&conn, &row.screenshot_id).ok();
            continue;
        };
        let encoded = match encode_for_upload(&raw) {
            Ok(e) => e,
            Err(err) => {
                queue::mark_failure(
                    &conn,
                    &row.screenshot_id,
                    &(now + Duration::hours(24)),
                    &err,
                )?;
                continue;
            }
        };

        let metadata = ScreenshotMetadata {
            screenshot_id: row.screenshot_id.clone(),
            run_id: record.run_id.clone(),
            hero_name: Some(record.title.clone()),
            final_days: record.battle_count,
            final_victories: record.wins,
            player_name: record.player_name.clone(),
            player_account_id,
            player_rank: record.rank.clone(),
            player_rating: record.rating,
            player_position: record.position,
            captured_at_utc: record.captured_at_utc.clone(),
            auto_uploaded: matches!(row.source, queue::UploadSource::Auto),
            ..Default::default()
        };

        let outcome =
            upload_screenshot(BAZAARDB_BASE_URL, &pat, &metadata, &encoded.bytes).await;

        match decide_after_attempt(outcome, row.attempts as u32) {
            AttemptDecision::Done { .. } => {
                queue::mark_success(&conn, &row.screenshot_id)?;
            }
            AttemptDecision::Retry { delay_seconds, message } => {
                let next = now + Duration::seconds(delay_seconds as i64);
                queue::mark_failure(&conn, &row.screenshot_id, &next, &message)?;
            }
            AttemptDecision::PauseUntilReconnect { message } => {
                let next = now + Duration::days(365);
                queue::mark_failure(&conn, &row.screenshot_id, &next, &message)?;
            }
            AttemptDecision::Drop { message } => {
                let next = now + Duration::days(365);
                queue::mark_failure(&conn, &row.screenshot_id, &next, &message)?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{decide_after_attempt, AttemptDecision};

    #[test]
    fn ok_outcome_drops_the_row() {
        let decision = decide_after_attempt(Ok("remote-id".to_string()), 0);
        assert!(matches!(decision, AttemptDecision::Done { .. }));
    }

    #[test]
    fn server_error_schedules_retry() {
        let decision = decide_after_attempt(Err("server_error:503".to_string()), 0);
        assert!(matches!(decision, AttemptDecision::Retry { .. }));
    }

    #[test]
    fn rate_limited_uses_retry_after_when_present() {
        let decision = decide_after_attempt(Err("rate_limited:120".to_string()), 0);
        match decision {
            AttemptDecision::Retry { delay_seconds, .. } => assert_eq!(delay_seconds, 120),
            _ => panic!("expected retry"),
        }
    }

    #[test]
    fn rate_limited_falls_back_to_schedule_when_retry_after_missing() {
        let decision = decide_after_attempt(Err("rate_limited:".to_string()), 1);
        match decision {
            AttemptDecision::Retry { delay_seconds, .. } => assert_eq!(delay_seconds, 5 * 60),
            _ => panic!("expected retry"),
        }
    }

    #[test]
    fn client_error_401_pauses_pending_pat_reconnect() {
        let decision = decide_after_attempt(Err("client_error:401".to_string()), 0);
        assert!(matches!(decision, AttemptDecision::PauseUntilReconnect { .. }));
    }

    #[test]
    fn other_client_errors_drop_the_row_with_message() {
        let decision = decide_after_attempt(Err("client_error:422".to_string()), 0);
        assert!(matches!(decision, AttemptDecision::Drop { .. }));
    }
}
