use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::bazaardb::{
    client::{upload_screenshot, validate_token, ValidateOutcome},
    endpoints::BAZAARDB_BASE_URL,
    image_pipeline::encode_for_upload,
    keyring::KeyringStore,
    payload::ScreenshotMetadata,
    queue,
    worker::{decide_after_attempt, AttemptDecision},
};
use crate::commands::startup::InstallerContextState;
use crate::installer_db::{self, path::default_installer_db_path};
use crate::stream::records::OverlayRecordRepository;
use chrono::{Duration as ChronoDuration, Utc};
use rusqlite::Connection;

#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct BazaardbStatus {
    pub connected: bool,
    pub account_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ConnectBazaardbRequest {
    pub token: String,
}

#[tauri::command]
pub async fn connect_bazaardb(
    request: ConnectBazaardbRequest,
) -> Result<BazaardbStatus, String> {
    let outcome = validate_token(BAZAARDB_BASE_URL, &request.token).await?;
    match outcome {
        ValidateOutcome::Ok { account_name } => {
            KeyringStore::os().save(&request.token)?;
            Ok(BazaardbStatus { connected: true, account_name: Some(account_name) })
        }
        ValidateOutcome::Unauthorized => Err("unauthorized".to_string()),
    }
}

#[tauri::command]
pub fn disconnect_bazaardb() -> Result<(), String> {
    KeyringStore::os().delete()
}

#[tauri::command]
pub async fn get_bazaardb_status() -> Result<BazaardbStatus, String> {
    let store = KeyringStore::os();
    let Some(pat) = store.load()? else {
        return Ok(BazaardbStatus { connected: false, account_name: None });
    };

    match validate_token(BAZAARDB_BASE_URL, &pat).await? {
        ValidateOutcome::Ok { account_name } => {
            Ok(BazaardbStatus { connected: true, account_name: Some(account_name) })
        }
        ValidateOutcome::Unauthorized => {
            store.delete().ok();
            Ok(BazaardbStatus { connected: false, account_name: None })
        }
    }
}

#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export)]
pub enum UploadResult {
    Uploaded { remote_id: String },
    Queued { reason: String },
}

#[derive(Debug)]
pub enum AttemptResult {
    Uploaded { remote_id: String },
    Queued { reason: String },
}

pub fn handle_attempt_outcome(
    conn: &Connection,
    screenshot_id: &str,
    outcome: Result<String, String>,
    auto: bool,
) -> Result<AttemptResult, String> {
    match decide_after_attempt(outcome, 0) {
        AttemptDecision::Done { remote_id } => Ok(AttemptResult::Uploaded { remote_id }),
        AttemptDecision::Retry { delay_seconds, message } => {
            queue::enqueue(
                conn,
                screenshot_id,
                if auto { queue::UploadSource::Auto } else { queue::UploadSource::Manual },
            )?;
            let next = Utc::now() + ChronoDuration::seconds(delay_seconds as i64);
            queue::mark_failure(conn, screenshot_id, &next, &message)?;
            Ok(AttemptResult::Queued { reason: message })
        }
        AttemptDecision::PauseUntilReconnect { message } => {
            queue::enqueue(
                conn,
                screenshot_id,
                if auto { queue::UploadSource::Auto } else { queue::UploadSource::Manual },
            )?;
            let next = Utc::now() + ChronoDuration::days(365);
            queue::mark_failure(conn, screenshot_id, &next, &message)?;
            Err(message)
        }
        AttemptDecision::Drop { message } => Err(message),
    }
}

#[derive(Debug, Deserialize)]
pub struct UploadScreenshotRequest {
    pub screenshot_id: String,
}

#[tauri::command]
pub async fn upload_screenshot_to_bazaardb(
    request: UploadScreenshotRequest,
    context: State<'_, InstallerContextState>,
) -> Result<UploadResult, String> {
    let pat = KeyringStore::os()
        .load()?
        .ok_or_else(|| "not_connected".to_string())?;

    let game_path = context.game_path();
    let repo = OverlayRecordRepository::new(game_path.map(PathBuf::from));

    let record = repo
        .load_record_by_id(&request.screenshot_id)?
        .ok_or_else(|| "record_not_found".to_string())?;

    let player_account_id = record
        .player_account_id
        .clone()
        .ok_or_else(|| "missing_player_account_id".to_string())?;

    let (_image_path, raw_bytes) = repo
        .load_image(&request.screenshot_id)?
        .ok_or_else(|| "image_missing".to_string())?;
    let encoded = encode_for_upload(&raw_bytes)?;

    let metadata = ScreenshotMetadata {
        screenshot_id: request.screenshot_id.clone(),
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
        auto_uploaded: false,
        ..Default::default()
    };

    let outcome =
        upload_screenshot(BAZAARDB_BASE_URL, &pat, &metadata, &encoded.bytes).await;

    let db_path = default_installer_db_path().ok_or_else(|| "no_data_dir".to_string())?;
    let conn = installer_db::open_and_bootstrap(&db_path)?;

    match handle_attempt_outcome(&conn, &request.screenshot_id, outcome, false)? {
        AttemptResult::Uploaded { remote_id } => Ok(UploadResult::Uploaded { remote_id }),
        AttemptResult::Queued { reason } => Ok(UploadResult::Queued { reason }),
    }
}

#[tauri::command]
pub fn set_auto_upload_enabled(enabled: bool) -> Result<(), String> {
    let db_path = default_installer_db_path().ok_or_else(|| "no_data_dir".to_string())?;
    let conn = installer_db::open_and_bootstrap(&db_path)?;
    installer_db::set_setting(&conn, "auto_upload_enabled", if enabled { "1" } else { "0" })
}

#[tauri::command]
pub fn get_auto_upload_enabled() -> Result<bool, String> {
    let db_path = default_installer_db_path().ok_or_else(|| "no_data_dir".to_string())?;
    let conn = installer_db::open_and_bootstrap(&db_path)?;
    Ok(installer_db::get_setting(&conn, "auto_upload_enabled")?.as_deref() == Some("1"))
}

#[cfg(test)]
mod tests {
    use super::{handle_attempt_outcome, AttemptResult};
    use crate::installer_db::open_and_bootstrap;
    use tempfile::tempdir;

    fn fresh_db() -> (rusqlite::Connection, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let conn = open_and_bootstrap(&dir.path().join("installer.db")).unwrap();
        (conn, dir)
    }

    #[test]
    fn handle_outcome_returns_remote_id_on_success_without_enqueueing() {
        let (conn, _dir) = fresh_db();
        let result = handle_attempt_outcome(&conn, "snap-1", Ok("remote-1".into()), false).unwrap();
        assert!(matches!(result, AttemptResult::Uploaded { .. }));
        let count: i64 = conn
            .query_row("select count(*) from pending_uploads", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn handle_outcome_enqueues_on_transient_failure() {
        let (conn, _dir) = fresh_db();
        let result =
            handle_attempt_outcome(&conn, "snap-1", Err("server_error:503".into()), false).unwrap();
        assert!(matches!(result, AttemptResult::Queued { .. }));
        let count: i64 = conn
            .query_row("select count(*) from pending_uploads", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn handle_outcome_drops_on_permanent_4xx() {
        let (conn, _dir) = fresh_db();
        let result =
            handle_attempt_outcome(&conn, "snap-1", Err("client_error:422".into()), false)
                .unwrap_err();
        assert!(result.contains("client_error:422"));
        let count: i64 = conn
            .query_row("select count(*) from pending_uploads", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn handle_outcome_enqueues_on_pause_until_reconnect() {
        let (conn, _dir) = fresh_db();
        let result =
            handle_attempt_outcome(&conn, "snap-1", Err("client_error:401".into()), false)
                .unwrap_err();
        assert!(result.contains("client_error:401"));
        let count: i64 = conn
            .query_row("select count(*) from pending_uploads", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}
