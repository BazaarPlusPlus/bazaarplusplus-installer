use crate::stream::state::{StreamRuntimeState, StreamServiceStatus};

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
