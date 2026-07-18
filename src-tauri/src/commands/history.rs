use crate::history::HistoryRunDetail;
use crate::services::history::{
    delete_battle_video as delete_battle_video_service,
    delete_run_videos as delete_run_videos_service, empty_history_list,
    execute_run_data_cleanup as execute_run_data_cleanup_service,
    execute_screenshot_cleanup as execute_screenshot_cleanup_service, get_run_detail, list_runs,
    preview_run_data_cleanup as preview_run_data_cleanup_service,
    preview_screenshot_cleanup as preview_screenshot_cleanup_service, require_history_paths,
    reveal_battle_video as reveal_battle_video_file,
    reveal_run_screenshot as reveal_run_screenshot_file,
};

#[tauri::command]
#[specta::specta]
pub fn list_history_runs(
    app: tauri::AppHandle,
    game_path: Option<String>,
    limit: Option<usize>,
) -> Result<crate::history::HistoryRunList, String> {
    let Some(paths) = crate::services::history::resolve_history_paths(&app, game_path) else {
        return Ok(empty_history_list());
    };

    list_runs(&paths.database_path, limit.unwrap_or(50).clamp(1, 200))
}

#[tauri::command]
#[specta::specta]
pub fn get_history_run_detail(
    app: tauri::AppHandle,
    game_path: Option<String>,
    run_id: String,
) -> Result<HistoryRunDetail, String> {
    let paths = require_history_paths(&app, game_path)?;
    get_run_detail(&paths.database_path, &run_id)
}

#[tauri::command]
#[specta::specta]
pub fn reveal_run_screenshot(
    app: tauri::AppHandle,
    game_path: Option<String>,
    run_id: String,
) -> Result<(), String> {
    let paths = require_history_paths(&app, game_path)?;
    reveal_run_screenshot_file(&paths.database_path, &paths.game_path, &run_id)
}

#[tauri::command]
#[specta::specta]
pub fn reveal_battle_video(
    app: tauri::AppHandle,
    game_path: Option<String>,
    battle_id: String,
    video_id: Option<String>,
) -> Result<(), String> {
    let paths = require_history_paths(&app, game_path)?;
    reveal_battle_video_file(
        &paths.database_path,
        &paths.combat_replay_videos_dir,
        &battle_id,
        video_id.as_deref(),
    )
}

#[tauri::command]
#[specta::specta]
pub fn delete_battle_video(
    app: tauri::AppHandle,
    game_path: Option<String>,
    battle_id: String,
    video_id: String,
) -> Result<HistoryRunDetail, String> {
    let paths = require_history_paths(&app, game_path)?;
    delete_battle_video_service(
        &paths.database_path,
        &paths.combat_replay_videos_dir,
        &battle_id,
        &video_id,
    )
}

#[tauri::command]
#[specta::specta]
pub fn delete_run_videos(
    app: tauri::AppHandle,
    game_path: Option<String>,
    run_id: String,
    limit: Option<usize>,
) -> Result<crate::history::HistoryRunList, String> {
    let paths = require_history_paths(&app, game_path)?;
    delete_run_videos_service(
        &paths.database_path,
        &paths.combat_replay_videos_dir,
        &run_id,
        limit.unwrap_or(50).clamp(1, 200),
    )
}

#[tauri::command]
#[specta::specta]
pub fn preview_screenshot_cleanup(
    app: tauri::AppHandle,
    game_path: Option<String>,
    preset: crate::history::cleanup::CleanupPreset,
) -> Result<crate::history::cleanup::ScreenshotCleanupPreview, String> {
    let paths = require_history_paths(&app, game_path)?;
    preview_screenshot_cleanup_service(&paths, preset)
}

#[tauri::command]
#[specta::specta]
pub fn execute_screenshot_cleanup(
    app: tauri::AppHandle,
    game_path: Option<String>,
    preset: crate::history::cleanup::CleanupPreset,
) -> Result<crate::history::cleanup::ScreenshotCleanupResult, String> {
    let paths = require_history_paths(&app, game_path)?;
    execute_screenshot_cleanup_service(&paths, preset)
}

#[tauri::command]
#[specta::specta]
pub fn preview_run_data_cleanup(
    app: tauri::AppHandle,
    game_path: Option<String>,
    preset: crate::history::cleanup::CleanupPreset,
) -> Result<crate::history::cleanup::RunDataCleanupPreview, String> {
    let paths = require_history_paths(&app, game_path)?;
    preview_run_data_cleanup_service(&paths, preset)
}

#[tauri::command]
#[specta::specta]
pub fn execute_run_data_cleanup(
    app: tauri::AppHandle,
    game_path: Option<String>,
    preset: crate::history::cleanup::CleanupPreset,
) -> Result<crate::history::cleanup::RunDataCleanupResult, String> {
    let paths = require_history_paths(&app, game_path)?;
    execute_run_data_cleanup_service(&paths, preset)
}
