use std::path::{Path, PathBuf};
use std::process::Command;

use crate::history::{
    cleanup::{
        self, RunDataCleanupPreview, RunDataCleanupResult, ScreenshotCleanupPreview,
        ScreenshotCleanupResult,
    },
    delete_battle_video as delete_battle_video_in_repo,
    delete_run_videos as delete_run_videos_in_repo, get_history_run_detail, list_history_runs,
    load_battle_video_path, load_run_id_for_battle, load_run_screenshot_path,
};
use crate::problem::{SemanticProblem, SemanticProblemCode};
use crate::services::game_path::GamePathAcceptance;
use crate::services::paths;
use crate::services::selected_game_installation::SelectedGameInstallationState;
use tauri::Manager;

pub use crate::history::cleanup::StorageCleanupPreset;
pub(crate) use crate::history::{HistoryRunDetail, HistoryRunList};

const HISTORY_UNAVAILABLE: &str =
    "No selected game installation with a history database is available.";

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum StorageCleanupScope {
    Screenshots,
    RunData,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, specta::Type)]
#[serde(tag = "scope", rename_all = "snake_case")]
pub enum StorageCleanupPreview {
    Screenshots { preview: ScreenshotCleanupPreview },
    RunData { preview: RunDataCleanupPreview },
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, specta::Type)]
#[serde(tag = "scope", rename_all = "snake_case")]
pub enum StorageCleanupExecution {
    Screenshots { result: ScreenshotCleanupResult },
    RunData { result: RunDataCleanupResult },
}

struct HistoryStorage {
    game_path: PathBuf,
    combat_replay_videos_dir: PathBuf,
    database_path: PathBuf,
}

struct History {
    paths: HistoryStorage,
}

impl History {
    fn resolved_game_path(app: &tauri::AppHandle) -> Option<PathBuf> {
        app.state::<SelectedGameInstallationState>()
            .resolve(app, None, GamePathAcceptance::DatabaseExists)
            .map(|resolution| resolution.game_path)
    }

    fn resolve(app: &tauri::AppHandle) -> Result<Self, String> {
        Self::from_resolved_game_path(Self::resolved_game_path(app))
    }

    fn from_resolved_game_path(game_path: Option<PathBuf>) -> Result<Self, String> {
        game_path
            .map(history_paths_for_game_path)
            .map(|paths| Self { paths })
            .ok_or_else(|| HISTORY_UNAVAILABLE.to_string())
    }

    fn from_resolved_game_path_for_list(
        game_path: Option<PathBuf>,
    ) -> Result<Self, SemanticProblem> {
        Self::from_resolved_game_path(game_path)
            .map_err(|_| SemanticProblem::new(SemanticProblemCode::HistoryUnavailable))
    }

    fn list_runs(&self, limit: usize) -> Result<HistoryRunList, String> {
        list_history_runs(&self.paths.database_path, limit.clamp(1, 200))
    }

    fn list_runs_for_page(&self, limit: usize) -> Result<HistoryRunList, SemanticProblem> {
        self.list_runs(limit).map_err(|diagnostic| {
            SemanticProblem::new(SemanticProblemCode::HistoryReadFailed)
                .with_param("operation", "list_runs")
                .with_diagnostic(diagnostic)
        })
    }

    fn run_detail(&self, run_id: &str) -> Result<HistoryRunDetail, String> {
        get_history_run_detail(&self.paths.database_path, run_id)?
            .ok_or_else(|| format!("History run {run_id} was not found."))
    }

    fn reveal_run_screenshot(
        &self,
        run_id: &str,
        revealer: &impl FileRevealer,
    ) -> Result<(), String> {
        self.require_database_exists()?;
        let path =
            load_run_screenshot_path(&self.paths.database_path, &self.paths.game_path, run_id)?
                .ok_or_else(|| format!("No screenshot is available for run {run_id}."))?;
        revealer.reveal(&path)
    }

    fn reveal_battle_video(
        &self,
        battle_id: &str,
        video_id: Option<&str>,
        revealer: &impl FileRevealer,
    ) -> Result<(), String> {
        self.require_database_exists()?;
        let path = load_battle_video_path(
            &self.paths.database_path,
            &self.paths.combat_replay_videos_dir,
            battle_id,
            video_id,
        )?
        .ok_or_else(|| format!("No completed video is available for battle {battle_id}."))?;
        require_video_file_exists(&path)?;
        revealer.reveal(&path)
    }

    fn delete_battle_video(
        &self,
        battle_id: &str,
        video_id: &str,
    ) -> Result<HistoryRunDetail, String> {
        self.require_database_exists()?;
        let run_id = load_run_id_for_battle(&self.paths.database_path, battle_id)?
            .ok_or_else(|| format!("Battle {battle_id} was not found."))?;
        let deleted = delete_battle_video_in_repo(
            &self.paths.database_path,
            &self.paths.combat_replay_videos_dir,
            battle_id,
            video_id,
        )?;
        if !deleted {
            return Err(format!(
                "Video {video_id} was not found for battle {battle_id}."
            ));
        }

        self.run_detail(&run_id)
    }

    fn delete_run_videos(&self, run_id: &str, limit: usize) -> Result<HistoryRunList, String> {
        self.require_database_exists()?;
        delete_run_videos_in_repo(
            &self.paths.database_path,
            &self.paths.combat_replay_videos_dir,
            run_id,
        )?;
        self.list_runs(limit)
    }

    fn preview_cleanup(
        &self,
        scope: StorageCleanupScope,
        preset: StorageCleanupPreset,
    ) -> Result<StorageCleanupPreview, String> {
        let now = chrono::Local::now();
        let today = now.date_naive();
        let cutoff = cleanup::CleanupCutoff::for_preset(preset, now);
        match scope {
            StorageCleanupScope::Screenshots => {
                let plan = cleanup::plan_screenshot_cleanup(
                    &self.paths.database_path,
                    &self.paths.game_path,
                    cutoff.as_ref(),
                    today,
                )?;
                Ok(StorageCleanupPreview::Screenshots {
                    preview: plan.to_preview(),
                })
            }
            StorageCleanupScope::RunData => {
                let plan = cleanup::plan_run_data_cleanup(
                    &self.paths.database_path,
                    &self.paths.game_path,
                    cutoff.as_ref(),
                )?;
                Ok(StorageCleanupPreview::RunData {
                    preview: plan.to_preview(),
                })
            }
        }
    }

    fn execute_cleanup(
        &self,
        scope: StorageCleanupScope,
        preset: StorageCleanupPreset,
    ) -> Result<StorageCleanupExecution, String> {
        let now = chrono::Local::now();
        let today = now.date_naive();
        let cutoff = cleanup::CleanupCutoff::for_preset(preset, now);
        match scope {
            StorageCleanupScope::Screenshots => cleanup::execute_screenshot_cleanup(
                &self.paths.database_path,
                &self.paths.game_path,
                cutoff.as_ref(),
                today,
            )
            .map(|result| StorageCleanupExecution::Screenshots { result }),
            StorageCleanupScope::RunData => cleanup::execute_run_data_cleanup(
                &self.paths.database_path,
                &self.paths.game_path,
                cutoff.as_ref(),
            )
            .map(|result| StorageCleanupExecution::RunData { result }),
        }
    }

    fn require_database_exists(&self) -> Result<(), String> {
        self.paths
            .database_path
            .exists()
            .then_some(())
            .ok_or_else(|| {
                format!(
                    "History database was not found at {}.",
                    self.paths.database_path.display()
                )
            })
    }
}

pub fn list_runs(
    app: &tauri::AppHandle,
    limit: Option<usize>,
) -> Result<HistoryRunList, SemanticProblem> {
    History::from_resolved_game_path_for_list(History::resolved_game_path(app))?
        .list_runs_for_page(limit.unwrap_or(50))
}

pub fn get_run_detail(app: &tauri::AppHandle, run_id: &str) -> Result<HistoryRunDetail, String> {
    History::resolve(app)?.run_detail(run_id)
}

pub fn reveal_run_screenshot(app: &tauri::AppHandle, run_id: &str) -> Result<(), String> {
    History::resolve(app)?.reveal_run_screenshot(run_id, &SystemFileRevealer)
}

pub fn reveal_battle_video(
    app: &tauri::AppHandle,
    battle_id: &str,
    video_id: Option<&str>,
) -> Result<(), String> {
    History::resolve(app)?.reveal_battle_video(battle_id, video_id, &SystemFileRevealer)
}

pub fn delete_battle_video(
    app: &tauri::AppHandle,
    battle_id: &str,
    video_id: &str,
) -> Result<HistoryRunDetail, String> {
    History::resolve(app)?.delete_battle_video(battle_id, video_id)
}

pub fn delete_run_videos(
    app: &tauri::AppHandle,
    run_id: &str,
    limit: Option<usize>,
) -> Result<HistoryRunList, String> {
    History::resolve(app)?.delete_run_videos(run_id, limit.unwrap_or(50))
}

pub fn preview_storage_cleanup(
    app: &tauri::AppHandle,
    scope: StorageCleanupScope,
    preset: StorageCleanupPreset,
) -> Result<StorageCleanupPreview, String> {
    History::resolve(app)?.preview_cleanup(scope, preset)
}

pub fn execute_storage_cleanup(
    app: &tauri::AppHandle,
    scope: StorageCleanupScope,
    preset: StorageCleanupPreset,
) -> Result<StorageCleanupExecution, String> {
    History::resolve(app)?.execute_cleanup(scope, preset)
}

fn history_paths_for_game_path(game_path: PathBuf) -> HistoryStorage {
    HistoryStorage {
        combat_replay_videos_dir: paths::combat_replay_videos_dir(&game_path),
        database_path: paths::database_path(&game_path),
        game_path,
    }
}

fn require_video_file_exists(path: &Path) -> Result<(), String> {
    path.try_exists()
        .map_err(|err| format!("Failed to inspect video file at {}: {err}", path.display()))?
        .then_some(())
        .ok_or_else(|| format!("Video file was not found at {}.", path.display()))
}

trait FileRevealer {
    fn reveal(&self, path: &Path) -> Result<(), String>;
}

struct SystemFileRevealer;

impl FileRevealer for SystemFileRevealer {
    fn reveal(&self, path: &Path) -> Result<(), String> {
        reveal_in_file_browser(path)
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
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path.to_string_lossy()])
            .spawn()
            .map_err(|err| format!("failed to reveal file in Finder: {err}"))?;
        Ok(())
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

#[cfg(test)]
mod tests {
    use super::{
        history_paths_for_game_path, require_video_file_exists, FileRevealer, History,
        StorageCleanupExecution, StorageCleanupPreset, StorageCleanupPreview, StorageCleanupScope,
        HISTORY_UNAVAILABLE,
    };
    use crate::problem::SemanticProblemCode;
    use crate::services::paths;
    use std::{path::Path, sync::Mutex};

    #[derive(Default)]
    struct RecordingRevealer {
        revealed: Mutex<Vec<std::path::PathBuf>>,
    }

    impl FileRevealer for RecordingRevealer {
        fn reveal(&self, path: &Path) -> Result<(), String> {
            self.revealed.lock().unwrap().push(path.to_path_buf());
            Ok(())
        }
    }

    fn create_history_schema(conn: &rusqlite::Connection) {
        conn.execute_batch(
            "
            pragma foreign_keys = on;
            create table runs (
                run_id text primary key,
                started_at_utc text not null,
                last_seen_at_utc text not null,
                status text not null,
                completed integer not null default 0,
                hero text not null,
                game_mode text not null,
                ended_at_utc text null,
                final_day integer null,
                final_hour integer null,
                victories integer null,
                losses integer null,
                final_player_rank text null,
                final_player_rating integer null,
                final_player_rating_delta integer null
            );
            create table battles (
                battle_id text primary key,
                source text not null,
                run_id text null,
                recorded_at_utc text not null,
                day integer null,
                hour integer null,
                player_name text null,
                player_hero text null,
                opponent_hero text null,
                opponent_name text null,
                opponent_rank text null,
                opponent_rating integer null,
                result text null,
                replay_dirty integer not null default 0,
                deleted_at_utc text null,
                foreign key (run_id) references runs(run_id) on delete cascade
            );
            create table run_screenshots (
                screenshot_id text primary key,
                run_id text null,
                hero_name text null,
                capture_source text not null,
                is_primary integer not null default 0,
                image_relative_path text not null,
                captured_at_utc text not null,
                captured_at_local text not null,
                player_rank text null,
                player_rating integer null,
                victories_at_capture integer null
            );
            create table combat_replay_videos (
                video_id text primary key,
                battle_id text not null,
                video_relative_path text not null,
                started_at_utc text not null,
                duration_ms integer null,
                file_size_bytes integer null,
                status text not null
            );
            ",
        )
        .unwrap();
    }

    #[test]
    fn history_paths_use_combat_replay_videos_as_video_root() {
        let game_path = std::path::PathBuf::from("/tmp/The Bazaar");

        let resolved = history_paths_for_game_path(game_path.clone());

        assert_eq!(
            resolved.combat_replay_videos_dir,
            paths::combat_replay_videos_dir(&game_path)
        );
        assert_eq!(resolved.database_path, paths::database_path(&game_path));
    }

    #[test]
    fn missing_selected_history_returns_a_domain_error() {
        let error = History::from_resolved_game_path(None).err().unwrap();

        assert_eq!(error, HISTORY_UNAVAILABLE);
    }

    #[test]
    fn history_page_list_uses_semantic_unavailable_and_read_failed_problems() {
        let unavailable = History::from_resolved_game_path_for_list(None)
            .err()
            .unwrap();
        assert_eq!(unavailable.code, SemanticProblemCode::HistoryUnavailable);
        assert!(unavailable.params.is_empty());
        assert_eq!(unavailable.diagnostic, None);

        let temp = tempfile::tempdir().unwrap();
        let game_path = temp.path().join("The Bazaar");
        let history = History::from_resolved_game_path_for_list(Some(game_path.clone())).unwrap();
        std::fs::create_dir_all(history.paths.database_path.parent().unwrap()).unwrap();
        std::fs::write(&history.paths.database_path, b"not sqlite").unwrap();

        let read_failed = history.list_runs_for_page(50).unwrap_err();
        assert_eq!(read_failed.code, SemanticProblemCode::HistoryReadFailed);
        assert_eq!(
            read_failed.params.get("operation").map(String::as_str),
            Some("list_runs")
        );
        assert!(read_failed.diagnostic.is_some());
    }

    #[test]
    fn video_file_exists_accepts_existing_file_and_rejects_missing_file() {
        let dir = tempfile::tempdir().expect("tempdir");
        let existing = dir.path().join("battle.mp4");
        std::fs::write(&existing, b"video").expect("write video file");

        assert!(require_video_file_exists(&existing).is_ok());
        let missing = dir.path().join("missing.mp4");
        assert_eq!(
            require_video_file_exists(&missing).unwrap_err(),
            format!("Video file was not found at {}.", missing.display())
        );
    }

    #[test]
    fn history_facade_owns_paths_queries_reveals_deletes_and_cleanup() {
        let temp = tempfile::tempdir().unwrap();
        let game_path = temp.path().join("The Bazaar");
        let database_path = paths::database_path(&game_path);
        let screenshots_dir = paths::screenshots_dir(&game_path);
        let videos_dir = paths::combat_replay_videos_dir(&game_path);
        std::fs::create_dir_all(database_path.parent().unwrap()).unwrap();
        std::fs::create_dir_all(screenshots_dir.join("2026-01-01")).unwrap();
        std::fs::create_dir_all(videos_dir.join("2026-01-01")).unwrap();
        let screenshot_path = screenshots_dir.join("2026-01-01/run.png");
        let video_path = videos_dir.join("2026-01-01/battle.mp4");
        std::fs::write(&screenshot_path, b"shot").unwrap();
        std::fs::write(&video_path, b"video").unwrap();

        let conn = rusqlite::Connection::open(&database_path).unwrap();
        create_history_schema(&conn);
        conn.execute_batch(
            "
            insert into runs (
                run_id, started_at_utc, last_seen_at_utc, status, completed,
                hero, game_mode, ended_at_utc, victories, losses
            ) values (
                'run-1', '2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z',
                'completed', 1, 'Vanessa', 'Ranked', '2026-01-01T10:00:00Z', 10, 2
            );
            insert into battles (
                battle_id, source, run_id, recorded_at_utc, player_name,
                opponent_hero, opponent_name, result, replay_dirty
            ) values (
                'battle-1', 'LOCAL', 'run-1', '2026-01-01T09:30:00Z', 'Player',
                'Dooley', 'Opponent', 'win', 0
            );
            insert into run_screenshots (
                screenshot_id, run_id, capture_source, is_primary,
                image_relative_path, captured_at_utc, captured_at_local
            ) values (
                'shot-1', 'run-1', 'end_of_run_auto', 1,
                '2026-01-01/run.png', '2026-01-01T10:00:00Z',
                '2026-01-01T18:00:00+08:00'
            );
            insert into combat_replay_videos (
                video_id, battle_id, video_relative_path, started_at_utc,
                file_size_bytes, status
            ) values (
                'video-1', 'battle-1', '2026-01-01/battle.mp4',
                '2026-01-01T09:30:00Z', 5, 'COMPLETED'
            );
            ",
        )
        .unwrap();
        drop(conn);

        let history = History::from_resolved_game_path(Some(game_path)).unwrap();
        let list = history.list_runs(50).unwrap();
        assert_eq!(list.summary.runs, 1);
        assert_eq!(list.summary.videos, 1);
        assert_eq!(list.runs.len(), 1);
        assert_eq!(history.run_detail("run-1").unwrap().battles.len(), 1);

        let revealer = RecordingRevealer::default();
        history.reveal_run_screenshot("run-1", &revealer).unwrap();
        history
            .reveal_battle_video("battle-1", Some("video-1"), &revealer)
            .unwrap();
        assert_eq!(
            *revealer.revealed.lock().unwrap(),
            vec![screenshot_path.clone(), video_path.clone()]
        );

        let detail = history.delete_battle_video("battle-1", "video-1").unwrap();
        assert_eq!(detail.run.video_count, 0);
        assert!(!video_path.exists());

        let preview = history
            .preview_cleanup(StorageCleanupScope::Screenshots, StorageCleanupPreset::All)
            .unwrap();
        let StorageCleanupPreview::Screenshots { preview } = preview else {
            panic!("expected screenshot preview");
        };
        assert_eq!(preview.screenshots, 1);
        let execution = history
            .execute_cleanup(StorageCleanupScope::Screenshots, StorageCleanupPreset::All)
            .unwrap();
        let StorageCleanupExecution::Screenshots { result } = execution else {
            panic!("expected screenshot result");
        };
        assert_eq!(result.deleted_rows, 1);
        assert!(!screenshot_path.exists());

        let preview = history
            .preview_cleanup(StorageCleanupScope::RunData, StorageCleanupPreset::All)
            .unwrap();
        let StorageCleanupPreview::RunData { preview } = preview else {
            panic!("expected run-data preview");
        };
        assert_eq!(preview.runs, 1);
        assert_eq!(preview.battles, 1);
        let execution = history
            .execute_cleanup(StorageCleanupScope::RunData, StorageCleanupPreset::All)
            .unwrap();
        let StorageCleanupExecution::RunData { result } = execution else {
            panic!("expected run-data result");
        };
        assert_eq!(result.deleted_runs, 1);
        assert_eq!(history.list_runs(50).unwrap().summary.runs, 0);
    }

    #[test]
    fn storage_cleanup_preview_serializes_as_a_scope_tagged_result() {
        let preview = StorageCleanupPreview::Screenshots {
            preview: crate::history::cleanup::ScreenshotCleanupPreview {
                screenshots: 2,
                orphan_files: 1,
                estimated_bytes: 42,
                skipped_pending_uploads: 0,
            },
        };

        assert_eq!(
            serde_json::to_value(preview).unwrap(),
            serde_json::json!({
                "scope": "screenshots",
                "preview": {
                    "screenshots": 2,
                    "orphan_files": 1,
                    "estimated_bytes": 42,
                    "skipped_pending_uploads": 0
                }
            })
        );
        assert_eq!(
            serde_json::to_value(StorageCleanupScope::Screenshots).unwrap(),
            serde_json::json!("screenshots")
        );
    }
}
