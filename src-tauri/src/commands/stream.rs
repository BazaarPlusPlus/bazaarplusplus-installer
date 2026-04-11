use crate::stream::{
    overlay_settings::{OverlayCropSettings, OverlayCropSettingsPayload, OverlaySettingsStore},
    state::{StreamRuntimeState, StreamServiceStatus},
};

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
    state: tauri::State<'_, StreamRuntimeState>,
) -> StreamServiceStatus {
    state.update_filters(manual_from, max_records)
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
pub fn import_stream_overlay_crop_code(
    code: String,
) -> Result<OverlayCropSettingsPayload, String> {
    OverlaySettingsStore::default().import_code(&code)
}
