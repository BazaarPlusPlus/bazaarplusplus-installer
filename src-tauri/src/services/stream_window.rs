use crate::services::game_path::GamePathAcceptance;
use crate::services::selected_game_installation::SelectedGameInstallationState;
use crate::stream::{
    records::OverlayRecordRepository,
    state::{StreamRuntimeState, StreamServiceStatus},
};
use tauri::Manager;

pub fn apply_stream_window_offset(
    app: &tauri::AppHandle,
    state: &StreamRuntimeState,
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
    let resolved_game_path = app
        .state::<SelectedGameInstallationState>()
        .resolve(app, game_path, GamePathAcceptance::DatabaseExists)
        .map(|resolution| resolution.game_path);
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
