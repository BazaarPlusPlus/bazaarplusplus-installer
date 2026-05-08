use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::bazaardb::{
    client::{upload_screenshot, validate_token, ValidateOutcome},
    endpoints::BAZAARDB_BASE_URL,
    image_pipeline::encode_for_upload,
    keyring::KeyringStore,
    payload::ScreenshotMetadata,
};
use crate::commands::startup::InstallerContextState;
use crate::stream::records::OverlayRecordRepository;

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
pub struct UploadResult {
    pub remote_id: String,
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

    let remote_id =
        upload_screenshot(BAZAARDB_BASE_URL, &pat, &metadata, &encoded.bytes).await?;
    Ok(UploadResult { remote_id })
}
