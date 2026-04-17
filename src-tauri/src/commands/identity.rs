use reqwest::blocking::Client;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;

const IDENTITY_ROOT_RELATIVE_PATH: &str = "BazaarPlusPlus/Identity";
const IDENTITY_DATABASE_FILE_NAME: &str = "identity.db";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct IdentityHttpResponse {
    pub status: u16,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct PlayerObservationRow {
    player_account_id: String,
    player_username: String,
    observed_at_utc: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct AuthRecordRow {
    token: String,
    player_account_id: String,
    player_username: String,
    issued_at_utc: String,
}

fn identity_directory(game_root: &Path) -> PathBuf {
    game_root.join(IDENTITY_ROOT_RELATIVE_PATH)
}

fn identity_database_path(game_root: &Path) -> PathBuf {
    identity_directory(game_root).join(IDENTITY_DATABASE_FILE_NAME)
}

#[cfg(unix)]
fn harden_identity_db_permissions(path: &Path) -> Result<(), String> {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    let permissions = fs::Permissions::from_mode(0o600);
    fs::set_permissions(path, permissions)
        .map_err(|err| format!("Cannot set permissions on {}: {err}", path.display()))
}

#[cfg(not(unix))]
fn harden_identity_db_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn ensure_identity_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS auth (
          id                INTEGER PRIMARY KEY CHECK (id = 1),
          token             TEXT    NOT NULL,
          player_account_id TEXT    NOT NULL,
          player_username   TEXT    NOT NULL,
          issued_at_utc     TEXT    NOT NULL
        );
        CREATE TABLE IF NOT EXISTS player_observation (
          id                INTEGER PRIMARY KEY CHECK (id = 1),
          player_account_id TEXT    NOT NULL,
          player_username   TEXT    NOT NULL,
          observed_at_utc   TEXT    NOT NULL
        );
        PRAGMA user_version = 1;
        ",
    )
    .map_err(|err| format!("Cannot ensure identity schema: {err}"))
}

fn open_identity_connection(game_root: &Path) -> Result<Connection, String> {
    let directory = identity_directory(game_root);
    std::fs::create_dir_all(&directory)
        .map_err(|err| format!("Cannot create {}: {err}", directory.display()))?;

    let database_path = identity_database_path(game_root);
    let database_existed = database_path.exists();
    let conn = Connection::open(&database_path)
        .map_err(|err| format!("Cannot open {}: {err}", database_path.display()))?;

    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|err| format!("Cannot configure busy timeout: {err}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|err| format!("Cannot enable WAL mode: {err}"))?;
    ensure_identity_schema(&conn)?;

    if !database_existed {
        harden_identity_db_permissions(&database_path)?;
    }

    Ok(conn)
}

fn serialize_row<T: Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|err| format!("Cannot serialize identity row: {err}"))
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
    let game_root_path = Path::new(&game_root);
    let conn = open_identity_connection(game_root_path)?;
    let row = conn
        .query_row(
            "SELECT player_account_id, player_username, observed_at_utc FROM player_observation WHERE id = 1",
            [],
            |row| {
                Ok(PlayerObservationRow {
                    player_account_id: row.get(0)?,
                    player_username: row.get(1)?,
                    observed_at_utc: row.get(2)?,
                })
            },
        )
        .optional()
        .map_err(|err| format!("Cannot read player_observation: {err}"))?;

    row.map(|value| serialize_row(&value)).transpose()
}

#[tauri::command]
pub fn read_auth_record(game_root: String) -> Result<Option<String>, String> {
    let conn = open_identity_connection(Path::new(&game_root))?;
    let row = conn
        .query_row(
            "SELECT token, player_account_id, player_username, issued_at_utc FROM auth WHERE id = 1",
            [],
            |row| {
                Ok(AuthRecordRow {
                    token: row.get(0)?,
                    player_account_id: row.get(1)?,
                    player_username: row.get(2)?,
                    issued_at_utc: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(|err| format!("Cannot read auth row: {err}"))?;

    row.map(|value| serialize_row(&value)).transpose()
}

#[tauri::command]
pub fn write_auth_record(game_root: String, payload_json: String) -> Result<(), String> {
    let payload: AuthRecordRow = serde_json::from_str(payload_json.trim())
        .map_err(|err| format!("Cannot parse auth payload JSON: {err}"))?;
    let conn = open_identity_connection(Path::new(&game_root))?;
    conn.execute(
        "
        INSERT INTO auth (id, token, player_account_id, player_username, issued_at_utc)
        VALUES (1, ?1, ?2, ?3, ?4)
        ON CONFLICT(id) DO UPDATE SET
          token = excluded.token,
          player_account_id = excluded.player_account_id,
          player_username = excluded.player_username,
          issued_at_utc = excluded.issued_at_utc
        ",
        params![
            payload.token,
            payload.player_account_id,
            payload.player_username,
            payload.issued_at_utc
        ],
    )
    .map_err(|err| format!("Cannot write auth row: {err}"))?;

    Ok(())
}

#[tauri::command]
pub fn delete_auth_record(game_root: String) -> Result<(), String> {
    let conn = open_identity_connection(Path::new(&game_root))?;
    conn.execute("DELETE FROM auth WHERE id = 1", [])
        .map_err(|err| format!("Cannot delete auth row: {err}"))?;
    Ok(())
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
