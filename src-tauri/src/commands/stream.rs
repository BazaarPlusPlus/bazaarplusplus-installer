use crate::stream::{
    overlay_settings::{
        OverlayCropSettings, OverlayCropSettingsPayload, OverlayDisplayMode, OverlaySettingsStore,
    },
    path_resolution::{normalize_requested_game_path, resolve_game_path_with_fallback},
    records::OverlayRecordRepository,
    state::{StreamRuntimeState, StreamServiceStatus},
};

#[tauri::command]
pub async fn ensure_stream_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    reason: Option<String>,
) -> Result<StreamServiceStatus, String> {
    let _ = reason;
    crate::stream::server::start(app, state.inner(), normalize_requested_game_path(game_path)).await
}

#[tauri::command]
pub async fn restart_stream_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    reason: Option<String>,
) -> Result<StreamServiceStatus, String> {
    let _ = reason;
    crate::stream::server::restart(app, state.inner(), normalize_requested_game_path(game_path))
        .await
}

#[tauri::command]
pub fn get_stream_session(state: tauri::State<'_, StreamRuntimeState>) -> StreamServiceStatus {
    state.snapshot()
}

#[tauri::command]
pub fn set_stream_window(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    offset: usize,
) -> Result<StreamServiceStatus, String> {
    let snapshot = state.snapshot();
    if !snapshot.running {
        return Ok(snapshot);
    }

    let started_at = snapshot
        .started_at
        .clone()
        .ok_or_else(|| "Stream start time is unavailable.".to_string())?;
    let resolved_game_path = resolve_game_path_with_fallback(&app, Some(&state), game_path);
    let repository = OverlayRecordRepository::new(resolved_game_path);

    if offset == 0 {
        return Ok(state.set_active_window(Some(started_at), 0));
    }

    let captured_since_start = repository.count_since(Some(started_at.as_str()))?;
    let total = repository.count_since(None)?;
    let existing_before_start = total.saturating_sub(captured_since_start);
    if offset > existing_before_start {
        return Err(format!(
            "Requested stream window offset {offset} exceeds the available {existing_before_start} earlier record(s)."
        ));
    }

    let record_offset = captured_since_start + offset - 1;
    let record = repository
        .load_record_at_offset(None, record_offset)?
        .ok_or_else(|| {
            format!("No end-of-run record is available for stream window offset {offset}.")
        })?;

    Ok(state.set_active_window(Some(record.captured_at_utc), offset))
}

#[tauri::command]
pub fn get_overlay_settings() -> Result<OverlayCropSettingsPayload, String> {
    OverlaySettingsStore::default().load_payload()
}

#[tauri::command]
pub fn apply_overlay_crop_code(code: String) -> Result<OverlayCropSettingsPayload, String> {
    OverlaySettingsStore::default().import_code(&code)
}

#[tauri::command]
pub fn save_overlay_display_mode(
    display_mode: OverlayDisplayMode,
) -> Result<OverlayCropSettingsPayload, String> {
    OverlaySettingsStore::default().save_display_mode(display_mode)
}

#[tauri::command]
pub fn reset_overlay_crop() -> Result<OverlayCropSettingsPayload, String> {
    OverlaySettingsStore::default().save(OverlayCropSettings::default())
}
