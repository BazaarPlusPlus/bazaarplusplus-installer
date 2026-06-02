use std::path::{Path, PathBuf};
use std::process::Command;

use crate::config::{BAZAAR_DATA_DIRECTORY, DATABASE_FILE_NAME};
use crate::history::{
    delete_battle_video as delete_battle_video_in_repo,
    delete_run_videos as delete_run_videos_in_repo, get_history_run_detail as get_detail_from_repo,
    list_history_runs as list_runs_from_repo, load_battle_video_path, load_run_id_for_battle,
    load_run_screenshot_path, HistoryRunDetail, HistoryRunList, HistorySummary,
};
use crate::services::game_path::resolve_game_path;

pub struct HistoryPaths {
    pub game_path: PathBuf,
    pub data_dir: PathBuf,
    pub database_path: PathBuf,
}

pub fn resolve_history_paths(
    app: &tauri::AppHandle,
    session_game_path: Option<PathBuf>,
    game_path: Option<String>,
) -> Option<HistoryPaths> {
    let game_path = resolve_game_path(app, game_path, session_game_path)?;
    Some(history_paths_for_game_path(game_path))
}

pub fn require_history_paths(
    app: &tauri::AppHandle,
    session_game_path: Option<PathBuf>,
    game_path: Option<String>,
) -> Result<HistoryPaths, String> {
    resolve_history_paths(app, session_game_path, game_path)
        .ok_or_else(|| "Game path is not configured.".to_string())
}

pub fn list_runs(database_path: &Path, limit: usize) -> Result<HistoryRunList, String> {
    list_runs_from_repo(database_path, limit)
}

pub fn get_run_detail(database_path: &Path, run_id: &str) -> Result<HistoryRunDetail, String> {
    get_detail_from_repo(database_path, run_id)?
        .ok_or_else(|| format!("History run {run_id} was not found."))
}

pub fn reveal_run_screenshot(
    database_path: &Path,
    game_path: &Path,
    run_id: &str,
) -> Result<(), String> {
    let path = load_run_screenshot_path(database_path, game_path, run_id)?
        .ok_or_else(|| format!("No screenshot is available for run {run_id}."))?;
    reveal_in_file_browser(&path)
}

pub fn reveal_battle_video(
    database_path: &Path,
    data_dir: &Path,
    battle_id: &str,
    video_id: Option<&str>,
) -> Result<(), String> {
    let path = load_battle_video_path(database_path, data_dir, battle_id, video_id)?
        .ok_or_else(|| format!("No completed video is available for battle {battle_id}."))?;
    reveal_in_file_browser(&path)
}

pub fn delete_battle_video(
    database_path: &Path,
    data_dir: &Path,
    battle_id: &str,
    video_id: &str,
) -> Result<HistoryRunDetail, String> {
    let run_id = load_run_id_for_battle(database_path, battle_id)?
        .ok_or_else(|| format!("Battle {battle_id} was not found."))?;
    let deleted = delete_battle_video_in_repo(database_path, data_dir, battle_id, video_id)?;
    if !deleted {
        return Err(format!(
            "Video {video_id} was not found for battle {battle_id}."
        ));
    }

    get_run_detail(database_path, &run_id)
}

pub fn delete_run_videos(
    database_path: &Path,
    data_dir: &Path,
    run_id: &str,
    limit: usize,
) -> Result<HistoryRunList, String> {
    delete_run_videos_in_repo(database_path, data_dir, run_id)?;
    list_runs(database_path, limit)
}

pub fn empty_history_list() -> HistoryRunList {
    HistoryRunList {
        summary: HistorySummary {
            runs: 0,
            videos: 0,
            last_run_at_utc: None,
            win_rate: None,
        },
        runs: Vec::new(),
    }
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

pub fn reveal_in_file_browser(path: &Path) -> Result<(), String> {
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
