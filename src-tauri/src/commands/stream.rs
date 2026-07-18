use crate::services::{
    path::normalize_requested_game_path, stream_window::apply_stream_window_offset,
};
use crate::stream::{
    overlay_settings::{
        OverlayCropSettings, OverlayCropSettingsPayload, OverlaySettingsStore,
        StreamOverlayDisplayMode,
    },
    state::{StreamRuntimeState, StreamServiceStatus},
};

#[tauri::command]
#[specta::specta]
pub fn get_stream_status(
    state: tauri::State<'_, StreamRuntimeState>,
) -> Result<StreamServiceStatus, String> {
    Ok(state.snapshot())
}

#[tauri::command]
#[specta::specta]
pub async fn ensure_stream_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
) -> Result<StreamServiceStatus, String> {
    crate::stream::server::start(app, state.inner(), normalize_requested_game_path(game_path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn restart_stream_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
) -> Result<StreamServiceStatus, String> {
    crate::stream::server::restart(app, state.inner(), normalize_requested_game_path(game_path))
        .await
}

#[tauri::command]
#[specta::specta]
pub fn set_stream_window(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    offset: usize,
) -> Result<StreamServiceStatus, String> {
    apply_stream_window_offset(&app, state.inner(), game_path, offset)
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
