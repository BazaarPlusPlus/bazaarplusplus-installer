use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::path::{Path, PathBuf};

const IDENTITY_ROOT_RELATIVE_PATH: &str = "BazaarPlusPlus/Identity";
const PLAYER_OBSERVATION_FILE_NAME: &str = "player-observation.bpp";
const INSTALLATION_RECORD_FILE_NAME: &str = "installation.bpp";
const INSTALLATION_PRIVATE_KEY_FILE_NAME: &str = "installation.key";

fn identity_directory(game_root: &Path) -> PathBuf {
    game_root.join(IDENTITY_ROOT_RELATIVE_PATH)
}

fn optional_base64_file(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let bytes = std::fs::read(path).map_err(|err| format!("Cannot read {}: {err}", path.display()))?;
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
