use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use uuid::Uuid;

const IDENTITY_ROOT_RELATIVE_PATH: &str = "BazaarPlusPlus/Identity";
const IDENTITY_DATABASE_FILE_NAME: &str = "identity.db";
const IDENTITY_AUTH_FILE_NAME: &str = "auth.v1.json";
const IDENTITY_OBSERVATION_FILE_NAME: &str = "observation.v1.json";
const IDENTITY_SCHEMA_VERSION: u8 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct IdentityHttpResponse {
    pub status: u16,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct IdentitySnapshotResponse {
    pub player_observation_json: Option<String>,
    pub auth_record_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct AuthRecordPayload {
    token: String,
    player_account_id: String,
    player_username: String,
    issued_at_utc: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct AuthRecordFile {
    schema_version: u8,
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

fn identity_auth_path(game_root: &Path) -> PathBuf {
    identity_directory(game_root).join(IDENTITY_AUTH_FILE_NAME)
}

fn identity_observation_path(game_root: &Path) -> PathBuf {
    identity_directory(game_root).join(IDENTITY_OBSERVATION_FILE_NAME)
}

fn legacy_identity_database_paths(game_root: &Path) -> Vec<PathBuf> {
    let database_path = identity_database_path(game_root);
    vec![
        database_path.clone(),
        database_path.with_file_name(format!("{IDENTITY_DATABASE_FILE_NAME}-wal")),
        database_path.with_file_name(format!("{IDENTITY_DATABASE_FILE_NAME}-shm")),
    ]
}

#[cfg(unix)]
fn harden_identity_file_permissions(path: &Path) -> Result<(), String> {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    let permissions = fs::Permissions::from_mode(0o600);
    fs::set_permissions(path, permissions)
        .map_err(|err| format!("Cannot set permissions on {}: {err}", path.display()))
}

#[cfg(windows)]
fn harden_identity_file_permissions(path: &Path) -> Result<(), String> {
    use std::process::Command;

    let username =
        std::env::var("USERNAME").map_err(|err| format!("Cannot read USERNAME env: {err}"))?;
    // Break inheritance and grant full access only to the current user.
    let output = Command::new("icacls")
        .arg(path)
        .arg("/inheritance:r")
        .arg("/grant:r")
        .arg(format!("{username}:F"))
        .output()
        .map_err(|err| format!("Cannot invoke icacls on {}: {err}", path.display()))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!(
            "[identity] icacls hardening failed for {}: {}",
            path.display(),
            stderr.trim()
        );
    }
    Ok(())
}

#[cfg(not(any(unix, windows)))]
fn harden_identity_file_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn read_optional_string(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(value) => Ok(Some(value)),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("Cannot read {}: {err}", path.display())),
    }
}

fn replace_file_atomically(source: &Path, destination: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        };

        let source_wide = source
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let destination_wide = destination
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();

        let ok = unsafe {
            MoveFileExW(
                source_wide.as_ptr(),
                destination_wide.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        };
        if ok == 0 {
            return Err(format!(
                "Cannot replace {} with {}: {}",
                destination.display(),
                source.display(),
                std::io::Error::last_os_error()
            ));
        }
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        fs::rename(source, destination).map_err(|err| {
            format!(
                "Cannot replace {} with {}: {err}",
                destination.display(),
                source.display()
            )
        })
    }
}

fn write_string_atomically(path: &Path, contents: &str) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| format!("Identity file path has no parent: {}", path.display()))?;
    fs::create_dir_all(directory)
        .map_err(|err| format!("Cannot create {}: {err}", directory.display()))?;

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            format!(
                "Identity file path has invalid file name: {}",
                path.display()
            )
        })?;
    let temp_path = directory.join(format!("{file_name}.{}.tmp", Uuid::new_v4()));

    let mut temp_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_path)
        .map_err(|err| format!("Cannot create {}: {err}", temp_path.display()))?;
    temp_file
        .write_all(contents.as_bytes())
        .map_err(|err| format!("Cannot write {}: {err}", temp_path.display()))?;
    temp_file
        .sync_all()
        .map_err(|err| format!("Cannot sync {}: {err}", temp_path.display()))?;
    drop(temp_file);

    let replace_result = replace_file_atomically(&temp_path, path);
    if replace_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    replace_result?;

    if let Ok(directory_file) = File::open(directory) {
        let _ = directory_file.sync_all();
    }

    Ok(())
}

fn cleanup_legacy_identity_database_files(game_root: &Path) {
    for path in legacy_identity_database_paths(game_root) {
        match fs::remove_file(&path) {
            Ok(()) => {}
            Err(err) if err.kind() == ErrorKind::NotFound => {}
            Err(err) => eprintln!(
                "[identity] failed to remove legacy identity database file {}: {err}",
                path.display()
            ),
        }
    }
}

fn read_identity_snapshot_blocking(game_root: &Path) -> Result<IdentitySnapshotResponse, String> {
    Ok(IdentitySnapshotResponse {
        player_observation_json: read_optional_string(&identity_observation_path(game_root))?,
        auth_record_json: read_optional_string(&identity_auth_path(game_root))?,
    })
}

fn write_auth_record_blocking(game_root: &Path, payload_json: &str) -> Result<(), String> {
    let payload: AuthRecordPayload = serde_json::from_str(payload_json.trim())
        .map_err(|err| format!("Cannot parse auth payload JSON: {err}"))?;
    let auth_file = AuthRecordFile {
        schema_version: IDENTITY_SCHEMA_VERSION,
        token: payload.token,
        player_account_id: payload.player_account_id,
        player_username: payload.player_username,
        issued_at_utc: payload.issued_at_utc,
    };
    let auth_json = serde_json::to_string(&auth_file)
        .map_err(|err| format!("Cannot serialize auth JSON: {err}"))?;
    let auth_path = identity_auth_path(game_root);

    write_string_atomically(&auth_path, &auth_json)?;
    harden_identity_file_permissions(&auth_path)?;
    cleanup_legacy_identity_database_files(game_root);

    Ok(())
}

fn delete_auth_record_blocking(game_root: &Path) -> Result<(), String> {
    let auth_path = identity_auth_path(game_root);
    match fs::remove_file(&auth_path) {
        Ok(()) => {}
        Err(err) if err.kind() == ErrorKind::NotFound => {}
        Err(err) => return Err(format!("Cannot delete {}: {err}", auth_path.display())),
    }
    cleanup_legacy_identity_database_files(game_root);
    Ok(())
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
pub async fn read_identity_snapshot(game_root: String) -> Result<IdentitySnapshotResponse, String> {
    let game_root_path = PathBuf::from(game_root);
    tauri::async_runtime::spawn_blocking(move || read_identity_snapshot_blocking(&game_root_path))
        .await
        .map_err(|err| format!("failed to join identity snapshot read: {err}"))?
}

#[tauri::command]
pub async fn write_auth_record(game_root: String, payload_json: String) -> Result<(), String> {
    let game_root_path = PathBuf::from(game_root);
    tauri::async_runtime::spawn_blocking(move || {
        write_auth_record_blocking(&game_root_path, &payload_json)
    })
    .await
    .map_err(|err| format!("failed to join auth write: {err}"))?
}

#[tauri::command]
pub async fn delete_auth_record(game_root: String) -> Result<(), String> {
    let game_root_path = PathBuf::from(game_root);
    tauri::async_runtime::spawn_blocking(move || delete_auth_record_blocking(&game_root_path))
        .await
        .map_err(|err| format!("failed to join auth delete: {err}"))?
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn read_identity_snapshot_reads_json_files() {
        let temp = tempfile::tempdir().unwrap();
        let game_root = temp.path();
        fs::create_dir_all(identity_directory(game_root)).unwrap();

        let observation_json = r#"{"player_account_id":"player-1","player_username":"Tester","observed_at_utc":"2026-04-24T00:00:00Z"}"#;
        let auth_json = r#"{"token":"token-1","player_account_id":"player-1","player_username":"Tester","issued_at_utc":"2026-04-24T00:00:00Z"}"#;
        fs::write(identity_observation_path(game_root), observation_json).unwrap();
        fs::write(identity_auth_path(game_root), auth_json).unwrap();

        let snapshot = read_identity_snapshot_blocking(game_root).unwrap();

        assert_eq!(
            snapshot.player_observation_json.as_deref(),
            Some(observation_json)
        );
        assert_eq!(snapshot.auth_record_json.as_deref(), Some(auth_json));
    }

    #[test]
    fn write_auth_record_file_writes_json_and_removes_legacy_database_files() {
        let temp = tempfile::tempdir().unwrap();
        let game_root = temp.path();
        fs::create_dir_all(identity_directory(game_root)).unwrap();
        for path in legacy_identity_database_paths(game_root) {
            fs::write(path, "legacy").unwrap();
        }

        write_auth_record_blocking(
            game_root,
            r#"{"token":"token-2","player_account_id":"player-2","player_username":"Other","issued_at_utc":"2026-04-24T01:00:00Z"}"#,
        )
        .unwrap();

        let auth_json = fs::read_to_string(identity_auth_path(game_root)).unwrap();
        assert!(auth_json.contains(r#""token":"token-2""#));
        for path in legacy_identity_database_paths(game_root) {
            assert!(
                !path.exists(),
                "{} should have been removed",
                path.display()
            );
        }
    }
}
