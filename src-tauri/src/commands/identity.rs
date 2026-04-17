use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;

const IDENTITY_ROOT_RELATIVE_PATH: &str = "BazaarPlusPlus/Identity";
const PLAYER_OBSERVATION_FILE_NAME: &str = "player-observation.bpp";
const INSTALLATION_RECORD_FILE_NAME: &str = "installation.bpp";
const INSTALLATION_PRIVATE_KEY_FILE_NAME: &str = "installation.key";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct IdentityHttpResponse {
    pub status: u16,
    pub body: String,
}

fn identity_directory(game_root: &Path) -> PathBuf {
    game_root.join(IDENTITY_ROOT_RELATIVE_PATH)
}

fn optional_base64_file(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let bytes =
        std::fs::read(path).map_err(|err| format!("Cannot read {}: {err}", path.display()))?;
    Ok(Some(STANDARD.encode(bytes)))
}

fn write_base64_file(path: &Path, payload_b64: &str) -> Result<(), String> {
    let bytes = STANDARD
        .decode(payload_b64.trim())
        .map_err(|err| format!("Cannot decode payload for {}: {err}", path.display()))?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Cannot create {}: {err}", parent.display()))?;
    }

    std::fs::write(path, bytes).map_err(|err| format!("Cannot write {}: {err}", path.display()))
}

fn send_identity_post_request(
    url: &str,
    body_json: &str,
    authorization: Option<&str>,
) -> Result<IdentityHttpResponse, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|err| format!("failed to build identity client: {err}"))?;

    let mut request = client
        .post(url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body_json.to_owned());

    if let Some(token) = authorization {
        request = request.bearer_auth(token);
    }

    let response = request
        .send()
        .map_err(|err| format!("failed to call identity endpoint: {err}"))?;
    let status = response.status().as_u16();
    let body = response
        .text()
        .map_err(|err| format!("failed to read identity response body: {err}"))?;

    Ok(IdentityHttpResponse { status, body })
}

#[tauri::command]
pub fn read_player_observation(game_root: String) -> Result<Option<String>, String> {
    let path = identity_directory(Path::new(&game_root)).join(PLAYER_OBSERVATION_FILE_NAME);
    optional_base64_file(&path)
}

#[tauri::command]
pub fn read_installation_record(game_root: String) -> Result<Option<String>, String> {
    let path = identity_directory(Path::new(&game_root)).join(INSTALLATION_RECORD_FILE_NAME);
    optional_base64_file(&path)
}

#[tauri::command]
pub fn read_installation_private_key(game_root: String) -> Result<Option<String>, String> {
    let path = identity_directory(Path::new(&game_root)).join(INSTALLATION_PRIVATE_KEY_FILE_NAME);
    optional_base64_file(&path)
}

#[tauri::command]
pub fn write_installation_record(game_root: String, payload_b64: String) -> Result<(), String> {
    let path = identity_directory(Path::new(&game_root)).join(INSTALLATION_RECORD_FILE_NAME);
    write_base64_file(&path, &payload_b64)
}

#[tauri::command]
pub fn write_installation_private_key(
    game_root: String,
    private_key_b64: String,
) -> Result<(), String> {
    let path = identity_directory(Path::new(&game_root)).join(INSTALLATION_PRIVATE_KEY_FILE_NAME);
    write_base64_file(&path, &private_key_b64)
}

#[tauri::command]
pub async fn post_identity_json(
    url: String,
    body_json: String,
    authorization: Option<String>,
) -> Result<IdentityHttpResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        send_identity_post_request(&url, &body_json, authorization.as_deref())
    })
    .await
    .map_err(|err| format!("failed to join identity request: {err}"))?
}
