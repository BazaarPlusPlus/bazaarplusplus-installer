use crate::stream::{
    overlay_settings::{OverlayCropSettings, OverlayCropSettingsPayload, OverlaySettingsStore},
    records::{OverlayRecord, OverlayRecordRepository},
    state::{StreamRuntimeState, StreamServiceStatus},
};
use std::{path::PathBuf, process::Command};

#[tauri::command]
pub async fn start_stream_service(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
) -> Result<StreamServiceStatus, String> {
    crate::stream::server::start(app, state.inner()).await
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
pub fn list_stream_overlay_records(
    app: tauri::AppHandle,
    limit: Option<usize>,
) -> Result<Vec<OverlayRecord>, String> {
    let env = crate::commands::detect::detect_environment(app, None)?;
    let repository = OverlayRecordRepository::new(env.game_path.map(PathBuf::from));
    repository.load_record_list(limit)
}

#[tauri::command]
pub fn reveal_stream_record_image(app: tauri::AppHandle, record_id: String) -> Result<(), String> {
    let env = crate::commands::detect::detect_environment(app, None)?;
    let repository = OverlayRecordRepository::new(env.game_path.map(PathBuf::from));
    let path = repository
        .load_image_path(&record_id)?
        .ok_or_else(|| format!("Stream image not found for record {record_id}"))?;

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
