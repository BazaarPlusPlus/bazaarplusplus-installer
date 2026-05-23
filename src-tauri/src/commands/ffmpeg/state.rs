// Paths, on-disk metadata (`version.json`), and `detect_ffmpeg` state model
// shared by the rest of the ffmpeg command module.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::{FFMPEG_ERR_PLATFORM_UNSUPPORTED, FFMPEG_TOOLS_SUBDIR, VERSION_JSON_FILE_NAME};

pub(crate) fn current_platform_key() -> Result<String, String> {
    platform_key_for_parts(std::env::consts::OS, std::env::consts::ARCH)
}

/// Concrete platform key for bundled FFmpeg resources. Only the two platforms
/// with installer-bundled binaries are supported.
pub(crate) fn platform_key_for_parts(os: &str, arch: &str) -> Result<String, String> {
    match (os, arch) {
        ("windows", "x86_64") => Ok("windows-x86_64".to_string()),
        ("macos", "aarch64") => Ok("darwin-aarch64".to_string()),
        _ => Err(FFMPEG_ERR_PLATFORM_UNSUPPORTED.to_string()),
    }
}

pub(crate) fn tools_root_dir(game_path: &Path) -> PathBuf {
    game_path.join("BazaarPlusPlus").join("tools")
}

pub(crate) fn ffmpeg_dir(game_path: &Path) -> PathBuf {
    tools_root_dir(game_path).join(FFMPEG_TOOLS_SUBDIR)
}

pub(crate) fn ffmpeg_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    }
}

pub(crate) fn ffmpeg_binary_path(game_path: &Path) -> PathBuf {
    ffmpeg_dir(game_path).join(ffmpeg_binary_name())
}

pub(crate) fn version_json_path(ffmpeg_root: &Path) -> PathBuf {
    ffmpeg_root.join(VERSION_JSON_FILE_NAME)
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FfmpegStatus {
    /// Bundled binary at `tools/ffmpeg/ffmpeg(.exe)` probed successfully.
    Bundled { version: Option<String> },
    /// Files exist under `tools/ffmpeg/` but the binary failed to probe.
    BundledCorrupted { reason: String },
    /// No bundled binary; the system `PATH` has a working ffmpeg.
    SystemAvailable,
    /// Neither bundled nor on `PATH`.
    NotInstalled,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
pub struct FfmpegDetectResult {
    pub status: FfmpegStatus,
    /// Absolute path of the bundled binary the installer manages — surfaced for
    /// the UI even when the binary is corrupted, so a "show me where it lives"
    /// affordance can keep working without re-deriving the path.
    pub bundled_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct VersionFile {
    pub version: String,
    pub platform: String,
    pub sha256: String,
    pub installed_at_utc: String,
}

pub(crate) fn read_version_file(ffmpeg_root: &Path) -> Option<VersionFile> {
    let raw = std::fs::read_to_string(version_json_path(ffmpeg_root)).ok()?;
    serde_json::from_str(&raw).ok()
}

pub(crate) fn write_version_file(ffmpeg_root: &Path, info: &VersionFile) -> Result<(), String> {
    let path = version_json_path(ffmpeg_root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Cannot create {}: {err}", parent.display()))?;
    }
    let body = serde_json::to_vec_pretty(info)
        .map_err(|err| format!("Cannot serialize version.json: {err}"))?;
    std::fs::write(&path, body).map_err(|err| format!("Cannot write {}: {err}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_key_for_parts_supports_only_bundled_platforms() {
        assert_eq!(
            platform_key_for_parts("windows", "x86_64").unwrap(),
            "windows-x86_64"
        );
        assert_eq!(
            platform_key_for_parts("macos", "aarch64").unwrap(),
            "darwin-aarch64"
        );
        assert_eq!(
            platform_key_for_parts("macos", "x86_64").unwrap_err(),
            FFMPEG_ERR_PLATFORM_UNSUPPORTED
        );
    }

    #[test]
    fn version_file_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let info = VersionFile {
            version: "7.1".into(),
            platform: "windows-x86_64".into(),
            sha256: "deadbeef".into(),
            installed_at_utc: "2026-05-22T00:00:00Z".into(),
        };

        write_version_file(tmp.path(), &info).unwrap();
        let read = read_version_file(tmp.path()).expect("expected version file");

        assert_eq!(read.version, info.version);
        assert_eq!(read.platform, info.platform);
        assert_eq!(read.sha256, info.sha256);
        assert_eq!(read.installed_at_utc, info.installed_at_utc);
    }

    #[test]
    fn ffmpeg_paths_layout_is_under_bpp_tools() {
        let game = PathBuf::from("/games/The Bazaar");
        let dir = ffmpeg_dir(&game);
        let bin = ffmpeg_binary_path(&game);

        assert!(dir.ends_with("BazaarPlusPlus/tools/ffmpeg"));
        assert_eq!(bin.parent().unwrap(), dir);
        assert!(bin
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("ffmpeg"));
    }

    #[test]
    fn version_file_missing_returns_none() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(read_version_file(tmp.path()).is_none());
    }
}
