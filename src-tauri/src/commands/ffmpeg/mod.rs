// FFmpeg deployment commands. Mirrors the layout of `commands/bepinex` —
// payload-style helpers in submodules, the four `#[tauri::command]` entry
// points here. See `docs/combat-replay-ffmpeg-deployment.md` for design.
mod install;
mod probe;
mod state;
mod uninstall;

use std::path::{Path, PathBuf};

pub use state::{FfmpegDetectResult, FfmpegStatus};

/// Stable error-code prefixes that the frontend pattern-matches to render
/// targeted UI. Adding a variant requires a matching branch in
/// `formatFfmpegError` on the TS side.
pub(crate) const FFMPEG_ERR_EXTRACT_FAILED: &str = "bpp_ffmpeg_extract_failed";
pub(crate) const FFMPEG_ERR_PROBE_FAILED: &str = "bpp_ffmpeg_probe_failed";
pub(crate) const FFMPEG_ERR_PLATFORM_UNSUPPORTED: &str = "bpp_ffmpeg_platform_unsupported";

pub(crate) const FFMPEG_TOOLS_SUBDIR: &str = "ffmpeg";
pub(crate) const VERSION_JSON_FILE_NAME: &str = "version.json";
/// Tauri event the install pipeline emits while bundled FFmpeg is being
/// extracted and probed. The frontend subscribes to this to drive the spinner.
pub const FFMPEG_INSTALL_PROGRESS_EVENT: &str = "ffmpeg:install:progress";

/// Re-export so `uninstall_bpp` can clean up the FFmpeg subtree without
/// reaching into the submodule.
pub(crate) use uninstall::remove_ffmpeg_dir;

fn ensure_valid_game_path(game_path: &Path) -> Result<(), String> {
    if crate::commands::detect::is_valid_game_path(game_path) {
        return Ok(());
    }
    Err(format!(
        "Selected path is not a valid The Bazaar installation: {}",
        game_path.display()
    ))
}

#[tauri::command]
pub async fn detect_ffmpeg(game_path: String) -> Result<FfmpegDetectResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let game_path = PathBuf::from(game_path);
        ensure_valid_game_path(&game_path)?;

        let bundled_path = state::ffmpeg_binary_path(&game_path);
        let status = detect_status_blocking(&game_path);
        Ok(FfmpegDetectResult {
            status,
            bundled_path: bundled_path.to_string_lossy().into_owned(),
        })
    })
    .await
    .map_err(|err| format!("failed to detect ffmpeg: {err}"))?
}

fn detect_status_blocking(game_path: &Path) -> FfmpegStatus {
    let bundled = state::ffmpeg_binary_path(game_path);
    if bundled.is_file() {
        match probe::run_ffmpeg_version(&bundled, probe::PROBE_TIMEOUT) {
            Ok(outcome) => {
                let recorded =
                    state::read_version_file(&state::ffmpeg_dir(game_path)).map(|v| v.version);
                return FfmpegStatus::Bundled {
                    version: outcome.version.or(recorded),
                };
            }
            Err(reason) => {
                return FfmpegStatus::BundledCorrupted { reason };
            }
        }
    }

    if let Some(system) = which_system_ffmpeg() {
        if probe::run_ffmpeg_version(&system, probe::PROBE_TIMEOUT).is_ok() {
            return FfmpegStatus::SystemAvailable;
        }
    }

    FfmpegStatus::NotInstalled
}

fn which_system_ffmpeg() -> Option<PathBuf> {
    let exe_name = state::ffmpeg_binary_name();
    let path_env = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_env) {
        let candidate = dir.join(exe_name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

#[tauri::command]
pub async fn install_ffmpeg(app: tauri::AppHandle, game_path: String) -> Result<(), String> {
    let game_path = PathBuf::from(game_path);
    ensure_valid_game_path(&game_path)?;
    install::install(&app, &game_path).await
}

#[tauri::command]
pub async fn uninstall_ffmpeg(game_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let game_path = PathBuf::from(game_path);
        ensure_valid_game_path(&game_path)?;
        uninstall::remove_ffmpeg_dir(&game_path)
    })
    .await
    .map_err(|err| format!("failed to uninstall ffmpeg: {err}"))?
}

#[tauri::command]
pub async fn repair_ffmpeg(app: tauri::AppHandle, game_path: String) -> Result<(), String> {
    let game_path_buf = PathBuf::from(&game_path);
    ensure_valid_game_path(&game_path_buf)?;
    // The repair is just "uninstall then install" — pulling the existing
    // binary out first avoids any chance of a half-overwritten directory if
    // the new install bails mid-extract.
    {
        let game_path_for_uninstall = game_path_buf.clone();
        tauri::async_runtime::spawn_blocking(move || {
            uninstall::remove_ffmpeg_dir(&game_path_for_uninstall)
        })
        .await
        .map_err(|err| format!("failed to clean ffmpeg before repair: {err}"))??;
    }
    install::install(&app, &game_path_buf).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_valid_game_dir() -> tempfile::TempDir {
        let tmp = tempfile::tempdir().unwrap();
        #[cfg(target_os = "macos")]
        {
            std::fs::create_dir_all(tmp.path().join("TheBazaar.app")).unwrap();
        }
        #[cfg(target_os = "windows")]
        {
            std::fs::write(tmp.path().join("TheBazaar.exe"), b"exe").unwrap();
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            std::fs::write(tmp.path().join("TheBazaar"), b"exe").unwrap();
        }
        tmp
    }

    #[test]
    fn detect_returns_not_installed_when_nothing_present() {
        let tmp = make_valid_game_dir();
        let status = detect_status_blocking(tmp.path());
        // On a clean CI without ffmpeg on PATH this is NotInstalled. On a dev
        // box with ffmpeg installed, SystemAvailable is also a valid result —
        // both are non-Bundled, which is what this assertion really cares
        // about (proves we don't false-positive Bundled).
        assert!(matches!(
            status,
            FfmpegStatus::NotInstalled | FfmpegStatus::SystemAvailable
        ));
    }

    #[cfg(unix)]
    #[test]
    fn detect_reports_corrupted_when_bundled_binary_fails_to_probe() {
        let tmp = make_valid_game_dir();
        let dir = state::ffmpeg_dir(tmp.path());
        std::fs::create_dir_all(&dir).unwrap();
        // Write a bogus file masquerading as ffmpeg; spawn will succeed but
        // exec will fail (binary isn't executable / not an ELF).
        let binary = dir.join(state::ffmpeg_binary_name());
        std::fs::write(&binary, b"not a real binary").unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755)).unwrap();

        let status = detect_status_blocking(tmp.path());
        assert!(
            matches!(status, FfmpegStatus::BundledCorrupted { .. }),
            "expected BundledCorrupted, got {status:?}"
        );
    }

    #[test]
    fn error_codes_are_stable_prefixes() {
        // Locks the wire format that the TS-side `formatFfmpegError` parses.
        // If you rename one of these you'll need to update both sides.
        assert_eq!(FFMPEG_ERR_EXTRACT_FAILED, "bpp_ffmpeg_extract_failed");
        assert_eq!(FFMPEG_ERR_PROBE_FAILED, "bpp_ffmpeg_probe_failed");
        assert_eq!(
            FFMPEG_ERR_PLATFORM_UNSUPPORTED,
            "bpp_ffmpeg_platform_unsupported"
        );
        assert_eq!(FFMPEG_INSTALL_PROGRESS_EVENT, "ffmpeg:install:progress");
    }
}
