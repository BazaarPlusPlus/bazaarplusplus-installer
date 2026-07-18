use crate::services::path::normalize_requested_game_path;
use crate::stream::{
    overlay_settings::{
        OverlayCropSettings, OverlayCropSettingsPayload, OverlaySettingsStore,
        StreamOverlayDisplayMode,
    },
    runtime::StreamRuntime,
    state::StreamServiceStatus,
};

#[tauri::command]
#[specta::specta]
pub fn get_stream_status(
    runtime: tauri::State<'_, StreamRuntime>,
) -> Result<StreamServiceStatus, String> {
    Ok(runtime.snapshot())
}

#[tauri::command]
#[specta::specta]
pub async fn ensure_stream_session(
    app: tauri::AppHandle,
    runtime: tauri::State<'_, StreamRuntime>,
    game_path: Option<String>,
) -> Result<StreamServiceStatus, String> {
    runtime
        .ensure(app, normalize_requested_game_path(game_path))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn restart_stream_session(
    app: tauri::AppHandle,
    runtime: tauri::State<'_, StreamRuntime>,
    game_path: Option<String>,
) -> Result<StreamServiceStatus, String> {
    runtime
        .restart(app, normalize_requested_game_path(game_path))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn set_stream_window(
    runtime: tauri::State<'_, StreamRuntime>,
    offset: usize,
) -> Result<StreamServiceStatus, String> {
    runtime.set_window(offset).await
}

#[tauri::command]
#[specta::specta]
pub fn get_overlay_settings() -> Result<OverlayCropSettingsPayload, String> {
    OverlaySettingsStore::default().load_payload()
}

#[tauri::command]
#[specta::specta]
pub fn apply_overlay_crop_code(code: String) -> Result<OverlayCropSettingsPayload, String> {
    OverlaySettingsStore::default().import_code(&code)
}

#[tauri::command]
#[specta::specta]
pub fn save_overlay_display_mode(
    display_mode: StreamOverlayDisplayMode,
) -> Result<OverlayCropSettingsPayload, String> {
    OverlaySettingsStore::default().save_display_mode(display_mode)
}

#[tauri::command]
#[specta::specta]
pub fn reset_overlay_crop() -> Result<OverlayCropSettingsPayload, String> {
    OverlaySettingsStore::default().save(OverlayCropSettings::default())
}
