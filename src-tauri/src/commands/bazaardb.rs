use serde::{Deserialize, Serialize};

use crate::bazaardb::{
    client::{validate_token, ValidateOutcome},
    endpoints::BAZAARDB_BASE_URL,
    keyring::KeyringStore,
};

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
