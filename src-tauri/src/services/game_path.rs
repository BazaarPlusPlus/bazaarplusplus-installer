#[cfg(target_os = "windows")]
use crate::config::STEAM_LIBRARY_FALLBACK_CANDIDATES;
#[cfg(target_os = "windows")]
use crate::config::{BAZAAR_DATA_DIRECTORY, DATABASE_FILE_NAME};
use crate::services::path::normalize_requested_game_path;
use crate::services::startup::InstallerContextState;
use std::path::PathBuf;
use tauri::Manager;

/// Resolve the game directory using the standard fallback chain.
///
/// 1. Full Steam-aware environment detection (errors are swallowed).
/// 2. The user's manually-supplied path (if any).
/// 3. Optional stream session path hint from the last started overlay service.
/// 4. Well-known Windows Steam library paths that contain the BPP database.
pub fn resolve_game_path(
    app: &tauri::AppHandle,
    requested_game_path: Option<String>,
    session_game_path: Option<PathBuf>,
) -> Option<PathBuf> {
    let context_state = app.state::<InstallerContextState>();
    if let Ok(env) = crate::services::detect::detect_environment(
        app.clone(),
        context_state,
        requested_game_path.clone(),
    ) {
        if let Some(path) = env.game_path.map(PathBuf::from) {
            return Some(path);
        }
    }

    if let Some(path) = normalize_requested_game_path(requested_game_path) {
        return Some(path);
    }

    if let Some(path) = session_game_path {
        return Some(path);
    }

    #[cfg(target_os = "windows")]
    {
        for candidate in STEAM_LIBRARY_FALLBACK_CANDIDATES {
            let path = PathBuf::from(candidate);
            let db = path.join(BAZAAR_DATA_DIRECTORY).join(DATABASE_FILE_NAME);
            if db.exists() {
                return Some(path);
            }
        }
    }

    None
}
