use crate::stream::{
    overlay_settings::{
        OverlayCropSettings, OverlayCropSettingsPayload, OverlayDisplayMode, OverlaySettingsStore,
    },
    records::{OverlayRecord, OverlayRecordRepository},
    state::{StreamRuntimeState, StreamServiceStatus},
};
use std::{path::PathBuf, process::Command};

fn normalize_requested_game_path(game_path: Option<String>) -> Option<PathBuf> {
    game_path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
}

fn resolve_game_path_with_fallback(
    app: &tauri::AppHandle,
    state: &StreamRuntimeState,
    requested_game_path: Option<String>,
) -> Option<PathBuf> {
    // 1. Try full Steam detection (registry + VDF)
    if let Ok(env) = crate::commands::detect::detect_environment(
        app.clone(),
        requested_game_path.clone(),
    ) {
        if let Some(path) = env.game_path.map(PathBuf::from) {
            return Some(path);
        }
    }

    if let Some(path) = normalize_requested_game_path(requested_game_path) {
        return Some(path);
    }

    // 2. Use path cached when service last started
    if let Some(path) = state.get_game_path() {
        return Some(path);
    }

    // 3. Last resort: scan well-known Windows Steam library paths directly.
    //    We only need BazaarPlusPlus/bazaarplusplus.db to exist — no need for TheBazaar.exe.
    #[cfg(target_os = "windows")]
    {
        let candidates = [
            r"C:\Program Files (x86)\Steam\steamapps\common\The Bazaar",
            r"C:\Program Files\Steam\steamapps\common\The Bazaar",
            r"D:\Steam\steamapps\common\The Bazaar",
            r"D:\SteamLibrary\steamapps\common\The Bazaar",
            r"E:\Steam\steamapps\common\The Bazaar",
            r"E:\SteamLibrary\steamapps\common\The Bazaar",
        ];
        for candidate in &candidates {
            let path = PathBuf::from(candidate);
            let db = path.join("BazaarPlusPlus").join("bazaarplusplus.db");
            if db.exists() {
                return Some(path);
            }
        }
    }

    None
}

#[tauri::command]
pub async fn start_stream_service(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
) -> Result<StreamServiceStatus, String> {
    crate::stream::server::start(app, state.inner(), normalize_requested_game_path(game_path)).await
}

#[tauri::command]
pub async fn stop_stream_service(
    state: tauri::State<'_, StreamRuntimeState>,
) -> Result<StreamServiceStatus, String> {
    crate::stream::server::stop(state.inner()).await
}

#[tauri::command]
pub fn get_stream_service_status(
    state: tauri::State<'_, StreamRuntimeState>,
) -> StreamServiceStatus {
    state.snapshot()
}

#[tauri::command]
pub fn get_stream_overlay_crop_settings() -> Result<OverlayCropSettingsPayload, String> {
    OverlaySettingsStore::default().load_payload()
}

#[tauri::command]
pub fn save_stream_overlay_crop_settings(
    crop: OverlayCropSettings,
) -> Result<OverlayCropSettingsPayload, String> {
    OverlaySettingsStore::default().save(crop)
}

#[tauri::command]
pub fn import_stream_overlay_crop_code(code: String) -> Result<OverlayCropSettingsPayload, String> {
    OverlaySettingsStore::default().import_code(&code)
}

#[tauri::command]
pub fn save_stream_overlay_display_mode(
    display_mode: OverlayDisplayMode,
) -> Result<OverlayCropSettingsPayload, String> {
    OverlaySettingsStore::default().save_display_mode(display_mode)
}

/// Returns the resolved DB path for display/debug purposes.
/// `found` = DB file exists at that path.
/// `path` = full path to bazaarplusplus.db (or None if not located at all).
#[tauri::command]
pub fn detect_stream_db_path(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
) -> StreamDbPathInfo {
    let game_path = resolve_game_path_with_fallback(&app, &state, game_path);
    match game_path {
        None => StreamDbPathInfo {
            found: false,
            path: None,
        },
        Some(game_path) => {
            let db = game_path.join("BazaarPlusPlus").join("bazaarplusplus.db");
            let found = db.exists();
            StreamDbPathInfo {
                found,
                path: Some(db.to_string_lossy().into_owned()),
            }
        }
    }
}

#[derive(serde::Serialize)]
pub struct StreamDbPathInfo {
    pub found: bool,
    pub path: Option<String>,
}

#[tauri::command]
pub fn list_stream_overlay_records(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<OverlayRecord>, String> {
    let game_path = resolve_game_path_with_fallback(&app, &state, game_path);
    let repository = OverlayRecordRepository::new(game_path);
    repository.load_record_list(None, limit)
}

#[tauri::command]
pub fn reveal_stream_record_image(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    record_id: String,
) -> Result<(), String> {
    let requested_game_path = game_path.clone();
    let game_path = resolve_game_path_with_fallback(&app, &state, game_path);
    let repository = OverlayRecordRepository::new(game_path.clone());
    let path = repository
        .load_image_path(&record_id)?
        .ok_or_else(|| {
            let message = format!(
                "Stream image not found for record {record_id}. requested_game_path={requested_game_path:?}, resolved_game_path={game_path:?}"
            );
            eprintln!("{message}");
            message
        })?;

    reveal_in_file_browser(&path)
}

fn reveal_in_file_browser(path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &path.to_string_lossy()])
            .spawn()
            .map_err(|err| format!("failed to reveal image in Explorer: {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path.to_string_lossy()])
            .spawn()
            .map_err(|err| format!("failed to reveal image in Finder: {err}"))?;
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let parent = path
            .parent()
            .ok_or_else(|| "image parent directory is missing".to_string())?;
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|err| format!("failed to open image directory: {err}"))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_requested_game_path;
    use std::path::PathBuf;

    #[test]
    fn normalize_requested_game_path_trims_blank_input() {
        assert_eq!(
            normalize_requested_game_path(Some("  D:\\Games\\The Bazaar  ".to_string())),
            Some(PathBuf::from("D:\\Games\\The Bazaar"))
        );
        assert_eq!(normalize_requested_game_path(Some("   ".to_string())), None);
        assert_eq!(normalize_requested_game_path(None), None);
    }
}
