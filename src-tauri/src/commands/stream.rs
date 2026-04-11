use crate::stream::{
    overlay_settings::{OverlayCropSettings, OverlayCropSettingsPayload, OverlaySettingsStore},
    records::RecordRepository,
    state::{StreamRuntimeState, StreamServiceStatus},
};
use std::path::Path;
use std::process::Command;

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
pub fn update_stream_service_filters(
    manual_from: Option<String>,
    max_records: usize,
    excluded_record_ids: Vec<String>,
    state: tauri::State<'_, StreamRuntimeState>,
) -> StreamServiceStatus {
    state.update_filters(manual_from, max_records, excluded_record_ids)
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
pub fn list_stream_screenshot_records(
    app: tauri::AppHandle,
) -> Result<Vec<crate::stream::records::StreamRecord>, String> {
    let repository = RecordRepository::new(resolve_game_path(&app)?);
    repository.load_screenshots()
}

#[tauri::command]
pub fn reveal_stream_record_image(app: tauri::AppHandle, record_id: String) -> Result<(), String> {
    let repository = RecordRepository::new(resolve_game_path(&app)?);
    let Some(image_path) = repository.load_image_path(&record_id)? else {
        return Err("Screenshot file not found for this run.".to_string());
    };

    reveal_in_file_explorer(&image_path)
}

fn resolve_game_path(app: &tauri::AppHandle) -> Result<Option<std::path::PathBuf>, String> {
    let env = crate::commands::detect::detect_environment(app.clone(), None)?;
    Ok(env.game_path.map(Into::into))
}

fn reveal_in_file_explorer(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        let canonical_path = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let select_arg = format!(r#"/select,"{}""#, canonical_path.display());
        Command::new("explorer")
            .raw_arg(select_arg)
            .spawn()
            .map_err(|err| format!("Failed to open Explorer: {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path.display().to_string()])
            .spawn()
            .map_err(|err| format!("Failed to reveal screenshot in Finder: {err}"))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let target = path.parent().unwrap_or(path);
        Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|err| format!("Failed to open the screenshot folder: {err}"))?;
        Ok(())
    }
}
