use std::path::{Path, PathBuf};
use std::process::Command;

use crate::config::{BAZAAR_DATA_DIRECTORY, DATABASE_FILE_NAME};
use crate::history::repo::{
    delete_battle_video as delete_battle_video_in_repo,
    delete_run_videos as delete_run_videos_in_repo, get_history_run_detail as get_detail_from_repo,
    list_history_runs as list_runs_from_repo, load_battle_video_path, load_run_id_for_battle,
    load_run_screenshot_path, HistoryRunDetail, HistoryRunList, HistorySummary,
};
use crate::stream::{path_resolution::resolve_game_path_with_fallback, state::StreamRuntimeState};

#[tauri::command]
pub fn list_history_runs(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    limit: Option<usize>,
) -> Result<HistoryRunList, String> {
    let Some(paths) = resolve_history_paths(&app, Some(&state), game_path) else {
        return Ok(empty_history_list());
    };

    list_runs_from_repo(&paths.database_path, limit.unwrap_or(50).clamp(1, 200))
}

#[tauri::command]
pub fn get_history_run_detail(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    run_id: String,
) -> Result<HistoryRunDetail, String> {
    let paths = require_history_paths(&app, Some(&state), game_path)?;
    get_detail_from_repo(&paths.database_path, &run_id)?
        .ok_or_else(|| format!("History run {run_id} was not found."))
}

#[tauri::command]
pub fn reveal_run_screenshot(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    run_id: String,
) -> Result<(), String> {
    let paths = require_history_paths(&app, Some(&state), game_path)?;
    let path = load_run_screenshot_path(&paths.database_path, &paths.game_path, &run_id)?
        .ok_or_else(|| format!("No screenshot is available for run {run_id}."))?;
    reveal_in_file_browser(&path)
}

#[tauri::command]
pub fn reveal_battle_video(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    battle_id: String,
    video_id: Option<String>,
) -> Result<(), String> {
    let paths = require_history_paths(&app, Some(&state), game_path)?;
    let path = load_battle_video_path(
        &paths.database_path,
        &paths.data_dir,
        &battle_id,
        video_id.as_deref(),
    )?
    .ok_or_else(|| format!("No completed video is available for battle {battle_id}."))?;
    reveal_in_file_browser(&path)
}

#[tauri::command]
pub fn delete_battle_video(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    battle_id: String,
    video_id: String,
) -> Result<HistoryRunDetail, String> {
    let paths = require_history_paths(&app, Some(&state), game_path)?;
    let run_id = load_run_id_for_battle(&paths.database_path, &battle_id)?
        .ok_or_else(|| format!("Battle {battle_id} was not found."))?;
    let deleted =
        delete_battle_video_in_repo(&paths.database_path, &paths.data_dir, &battle_id, &video_id)?;
    if !deleted {
        return Err(format!(
            "Video {video_id} was not found for battle {battle_id}."
        ));
    }

    get_detail_from_repo(&paths.database_path, &run_id)?
        .ok_or_else(|| format!("History run {run_id} was not found."))
}

#[tauri::command]
pub fn delete_run_videos(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
    game_path: Option<String>,
    run_id: String,
    limit: Option<usize>,
) -> Result<HistoryRunList, String> {
    let paths = require_history_paths(&app, Some(&state), game_path)?;
    delete_run_videos_in_repo(&paths.database_path, &paths.data_dir, &run_id)?;
    list_runs_from_repo(&paths.database_path, limit.unwrap_or(50).clamp(1, 200))
}

struct HistoryPaths {
    game_path: PathBuf,
    data_dir: PathBuf,
    database_path: PathBuf,
}

fn resolve_history_paths(
    app: &tauri::AppHandle,
    state: Option<&StreamRuntimeState>,
    game_path: Option<String>,
) -> Option<HistoryPaths> {
    let game_path = resolve_game_path_with_fallback(app, state, game_path)?;
    Some(history_paths_for_game_path(game_path))
}

fn require_history_paths(
    app: &tauri::AppHandle,
    state: Option<&StreamRuntimeState>,
    game_path: Option<String>,
) -> Result<HistoryPaths, String> {
    resolve_history_paths(app, state, game_path)
        .ok_or_else(|| "Game path is not configured.".to_string())
}

fn history_paths_for_game_path(game_path: PathBuf) -> HistoryPaths {
    let data_dir = game_path.join(BAZAAR_DATA_DIRECTORY);
    let database_path = data_dir.join(DATABASE_FILE_NAME);
    HistoryPaths {
        game_path,
        data_dir,
        database_path,
    }
}

fn empty_history_list() -> HistoryRunList {
    HistoryRunList {
        summary: HistorySummary {
            runs: 0,
            videos: 0,
            last_run_at_utc: None,
            win_rate: None,
        },
        runs: Vec::new(),
        next_cursor: None,
    }
}

#[cfg(target_os = "windows")]
fn strip_extended_length_prefix(value: &str) -> String {
    if let Some(stripped) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{stripped}")
    } else if let Some(stripped) = value.strip_prefix(r"\\?\") {
        stripped.to_string()
    } else {
        value.to_string()
    }
}

fn reveal_in_file_browser(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        let canonical = std::fs::canonicalize(path)
            .map(|buf| strip_extended_length_prefix(&buf.to_string_lossy()))
            .unwrap_or_else(|_| path.to_string_lossy().into_owned());

        Command::new("explorer")
            .raw_arg(format!("/select,\"{}\"", canonical))
            .spawn()
            .map_err(|err| format!("failed to reveal file in Explorer: {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path.to_string_lossy()])
            .spawn()
            .map_err(|err| format!("failed to reveal file in Finder: {err}"))?;
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let parent = path
            .parent()
            .ok_or_else(|| "file parent directory is missing".to_string())?;
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|err| format!("failed to open file directory: {err}"))?;
        Ok(())
    }
}
