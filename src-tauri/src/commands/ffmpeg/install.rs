// Install pipeline: read bundled zip resource → extract → chmod +x → probe →
// atomic swap into `<GameRoot>/BazaarPlusPlusV4/tools/ffmpeg/`.
//
// The intent expressed by the design doc is "never let mod see a half-installed
// binary": every IO step writes to a temp directory adjacent to the real
// target, and the swap is the last thing that runs. If any earlier step fails
// we surface a typed error code and leave the previously-installed copy alone.
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

use super::probe::{self, PROBE_TIMEOUT};
use super::state::{self, VersionFile};
use super::{FFMPEG_ERR_EXTRACT_FAILED, FFMPEG_ERR_PROBE_FAILED, FFMPEG_INSTALL_PROGRESS_EVENT};

pub(crate) const BUNDLED_FFMPEG_VERSION: &str = "7.1";
const BUNDLED_FFMPEG_DIR: &str = "FfmpegSource";
const BUNDLED_ZIP_FILE_NAME: &str = "ffmpeg.zip";
const LICENSE_FILE_NAME: &str = "LICENSE.txt";

#[derive(Debug, Clone)]
pub(crate) struct BundledFfmpegPackage {
    pub(crate) version: String,
    pub(crate) platform: String,
    pub(crate) sha256: String,
    pub(crate) entry_in_archive: String,
    pub(crate) zip_bytes: Vec<u8>,
    pub(crate) license_bytes: Option<Vec<u8>>,
}

/// Progress payload emitted to the UI during install. The `phase` string
/// drives copy switching on the frontend ("extracting" vs "probing"). Byte
/// counters remain zero because FFmpeg is bundled with the installer.
#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct FfmpegInstallProgress {
    pub phase: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

/// Top-level install entry point. The caller (the tauri command) is async, but
/// the heavy IO is kept synchronous and pushed through `spawn_blocking` —
/// matches the rest of the codebase and keeps the async surface small.
pub(crate) async fn install(app: &AppHandle, game_path: &Path) -> Result<(), String> {
    let platform_key = state::current_platform_key()?;
    let resource_dir = app.path().resource_dir().map_err(|err| err.to_string())?;
    let package = load_bundled_package_from_resource_dir(&resource_dir, &platform_key)?;

    let tools_root = state::tools_root_dir(game_path);
    std::fs::create_dir_all(&tools_root)
        .map_err(|err| format!("Cannot create {}: {err}", tools_root.display()))?;

    let staging = tempfile::tempdir_in(&tools_root)
        .map_err(|err| format!("Cannot create staging dir: {err}"))?;

    emit_progress(app, "extracting", 0, 0);
    let extract_dir = staging.path().join("extracted");
    std::fs::create_dir_all(&extract_dir)
        .map_err(|err| format!("Cannot create {}: {err}", extract_dir.display()))?;
    extract_zip(&package.zip_bytes, &extract_dir)?;

    let binary_in_archive = extract_dir.join(&package.entry_in_archive);
    if !binary_in_archive.is_file() {
        return Err(format!(
            "{FFMPEG_ERR_EXTRACT_FAILED}:binary {} not found after extract",
            package.entry_in_archive
        ));
    }

    let final_dir = staging.path().join("final");
    std::fs::create_dir_all(&final_dir)
        .map_err(|err| format!("Cannot create {}: {err}", final_dir.display()))?;
    let final_binary = final_dir.join(state::ffmpeg_binary_name());
    std::fs::copy(&binary_in_archive, &final_binary)
        .map_err(|err| format!("Cannot stage binary: {err}"))?;
    make_executable(&final_binary)?;

    emit_progress(app, "probing", 0, 0);
    probe::run_ffmpeg_version(&final_binary, PROBE_TIMEOUT)
        .map_err(|reason| format!("{FFMPEG_ERR_PROBE_FAILED}:{reason}"))?;

    if let Some(license_bytes) = package.license_bytes.as_deref() {
        std::fs::write(final_dir.join(LICENSE_FILE_NAME), license_bytes)
            .map_err(|err| format!("Cannot stage FFmpeg LICENSE: {err}"))?;
    }

    let version_info = VersionFile {
        version: package.version.clone(),
        platform: package.platform.clone(),
        sha256: package.sha256.clone(),
        installed_at_utc: Utc::now().to_rfc3339(),
    };
    state::write_version_file(&final_dir, &version_info)?;

    swap_into_place(&final_dir, &state::ffmpeg_dir(game_path))?;
    emit_progress(app, "complete", 0, 0);
    Ok(())
}

pub(crate) fn bundled_zip_relative_path() -> PathBuf {
    PathBuf::from(BUNDLED_FFMPEG_DIR).join(BUNDLED_ZIP_FILE_NAME)
}

pub(crate) fn bundled_license_relative_path() -> PathBuf {
    PathBuf::from(BUNDLED_FFMPEG_DIR).join(LICENSE_FILE_NAME)
}

pub(crate) fn load_bundled_package_from_resource_dir(
    resource_dir: &Path,
    platform: &str,
) -> Result<BundledFfmpegPackage, String> {
    let zip_path = resource_dir.join(bundled_zip_relative_path());
    let license_path = resource_dir.join(bundled_license_relative_path());
    let zip_bytes = std::fs::read(&zip_path).map_err(|err| {
        format!(
            "Cannot read bundled FFmpeg zip {}: {err}",
            zip_path.display()
        )
    })?;
    let license_bytes = std::fs::read(&license_path).map_err(|err| {
        format!(
            "Cannot read bundled FFmpeg LICENSE {}: {err}",
            license_path.display()
        )
    })?;

    Ok(BundledFfmpegPackage {
        version: BUNDLED_FFMPEG_VERSION.to_string(),
        platform: platform.to_string(),
        sha256: sha256_hex(&zip_bytes),
        entry_in_archive: entry_in_archive_for_platform(platform)?.to_string(),
        zip_bytes,
        license_bytes: Some(license_bytes),
    })
}

fn entry_in_archive_for_platform(platform: &str) -> Result<&'static str, String> {
    match platform {
        "windows-x86_64" => Ok("ffmpeg.exe"),
        "darwin-aarch64" => Ok("ffmpeg"),
        _ => Err(super::FFMPEG_ERR_PLATFORM_UNSUPPORTED.to_string()),
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

pub(crate) fn extract_zip(zip_bytes: &[u8], dest_dir: &Path) -> Result<(), String> {
    let reader = Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|err| format!("{FFMPEG_ERR_EXTRACT_FAILED}:open zip: {err}"))?;

    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|err| format!("{FFMPEG_ERR_EXTRACT_FAILED}:read entry {index}: {err}"))?;
        let Some(relative_path) = file.enclosed_name().map(|path| path.to_path_buf()) else {
            return Err(format!(
                "{FFMPEG_ERR_EXTRACT_FAILED}:unsafe zip path: {}",
                file.name()
            ));
        };
        let output_path = dest_dir.join(relative_path);

        if file.is_dir() {
            std::fs::create_dir_all(&output_path).map_err(|err| {
                format!(
                    "{FFMPEG_ERR_EXTRACT_FAILED}:mkdir {}: {err}",
                    output_path.display()
                )
            })?;
            continue;
        }

        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent).map_err(|err| {
                format!(
                    "{FFMPEG_ERR_EXTRACT_FAILED}:mkdir {}: {err}",
                    parent.display()
                )
            })?;
        }

        let mut contents = Vec::new();
        file.read_to_end(&mut contents)
            .map_err(|err| format!("{FFMPEG_ERR_EXTRACT_FAILED}:read body: {err}"))?;
        std::fs::write(&output_path, contents).map_err(|err| {
            format!(
                "{FFMPEG_ERR_EXTRACT_FAILED}:write {}: {err}",
                output_path.display()
            )
        })?;
    }

    Ok(())
}

fn make_executable(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(path)
            .map_err(|err| format!("cannot read perms: {err}"))?
            .permissions();
        // Owner rwx, group rx, others rx. Matches what BtbN ships in their
        // posix archives and what BepInEx's `run_bepinex.sh` lands as.
        perms.set_mode(0o755);
        std::fs::set_permissions(path, perms).map_err(|err| format!("cannot set perms: {err}"))
    }

    #[cfg(not(unix))]
    {
        let _ = path;
        Ok(())
    }
}

/// Move `staged` into `target`, displacing any prior install. The previously
/// installed directory is renamed to a sibling backup first so that even on
/// Windows (where `rename` won't overwrite a non-empty directory) the swap is
/// recoverable: if the second rename fails, we restore the backup.
fn swap_into_place(staged: &Path, target: &Path) -> Result<(), String> {
    let backup = if target.exists() {
        let backup_path = sibling_backup_path(target);
        std::fs::rename(target, &backup_path)
            .map_err(|err| format!("Cannot stash previous ffmpeg install: {err}"))?;
        Some(backup_path)
    } else {
        None
    };

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Cannot create {}: {err}", parent.display()))?;
    }

    if let Err(err) = std::fs::rename(staged, target) {
        // Best-effort restore — don't mask the original error if rollback
        // itself blows up. Either way the caller learns the swap failed.
        if let Some(backup_path) = backup {
            let _ = std::fs::rename(&backup_path, target);
        }
        return Err(format!("Cannot install staged ffmpeg: {err}"));
    }

    if let Some(backup_path) = backup {
        let _ = std::fs::remove_dir_all(&backup_path);
    }

    Ok(())
}

fn sibling_backup_path(target: &Path) -> PathBuf {
    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    let file_name = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "ffmpeg".to_string());
    let nonce = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0);
    parent.join(format!(".{file_name}.swap-{nonce}"))
}

fn emit_progress(app: &AppHandle, phase: &str, downloaded_bytes: u64, total_bytes: u64) {
    let payload = FfmpegInstallProgress {
        phase: phase.to_string(),
        downloaded_bytes,
        total_bytes,
    };
    let _ = app.emit(FFMPEG_INSTALL_PROGRESS_EVENT, payload);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor as StdCursor, Write};

    fn build_zip_with_binary(entry_path: &str, binary_bytes: &[u8]) -> Vec<u8> {
        let buffer = StdCursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(buffer);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file(entry_path, options).unwrap();
        zip.write_all(binary_bytes).unwrap();
        zip.finish().unwrap().into_inner()
    }

    #[test]
    fn bundled_resource_paths_are_stable() {
        assert_eq!(
            bundled_zip_relative_path(),
            PathBuf::from("FfmpegSource/ffmpeg.zip")
        );
        assert_eq!(
            bundled_license_relative_path(),
            PathBuf::from("FfmpegSource/LICENSE.txt")
        );
    }

    #[test]
    fn load_bundled_package_reads_zip_license_and_metadata() {
        let tmp = tempfile::tempdir().unwrap();
        let source_dir = tmp.path().join("FfmpegSource");
        std::fs::create_dir_all(&source_dir).unwrap();
        let zip = build_zip_with_binary("ffmpeg.exe", b"binary");
        std::fs::write(source_dir.join("ffmpeg.zip"), &zip).unwrap();
        std::fs::write(source_dir.join("LICENSE.txt"), b"license").unwrap();

        let package = load_bundled_package_from_resource_dir(tmp.path(), "windows-x86_64").unwrap();

        assert_eq!(package.version, BUNDLED_FFMPEG_VERSION);
        assert_eq!(package.platform, "windows-x86_64");
        assert_eq!(package.entry_in_archive, "ffmpeg.exe");
        assert_eq!(package.zip_bytes, zip);
        assert_eq!(package.license_bytes.as_deref(), Some(&b"license"[..]));
        assert_eq!(package.sha256, sha256_hex(&zip));
    }

    #[test]
    fn extract_zip_creates_nested_layout() {
        let zip = build_zip_with_binary("ffmpeg.exe", b"binary");
        let tmp = tempfile::tempdir().unwrap();

        extract_zip(&zip, tmp.path()).unwrap();

        assert_eq!(
            std::fs::read(tmp.path().join("ffmpeg.exe")).unwrap(),
            b"binary"
        );
    }

    #[test]
    fn extract_zip_supports_nested_entry_path() {
        let zip = build_zip_with_binary("bin/ffmpeg.exe", b"binary");
        let tmp = tempfile::tempdir().unwrap();

        extract_zip(&zip, tmp.path()).unwrap();

        assert!(tmp.path().join("bin/ffmpeg.exe").exists());
    }

    #[test]
    fn extract_zip_rejects_unsafe_entry() {
        // Build a zip containing a path-traversal entry. zip-rs computes
        // `enclosed_name` from the entry name, which must escape `..`.
        let buffer = StdCursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(buffer);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("../escape.bin", options).unwrap();
        zip.write_all(b"x").unwrap();
        let bytes = zip.finish().unwrap().into_inner();

        let tmp = tempfile::tempdir().unwrap();
        let err = extract_zip(&bytes, tmp.path()).unwrap_err();
        assert!(err.contains(FFMPEG_ERR_EXTRACT_FAILED));
    }

    #[test]
    fn swap_into_place_installs_when_target_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let staged = tmp.path().join("staged");
        let target = tmp.path().join("target");
        std::fs::create_dir_all(&staged).unwrap();
        std::fs::write(staged.join("marker"), b"new").unwrap();

        swap_into_place(&staged, &target).unwrap();

        assert!(target.exists());
        assert_eq!(std::fs::read(target.join("marker")).unwrap(), b"new");
        assert!(!staged.exists());
    }

    #[test]
    fn swap_into_place_replaces_existing_target() {
        let tmp = tempfile::tempdir().unwrap();
        let staged = tmp.path().join("staged");
        let target = tmp.path().join("target");
        std::fs::create_dir_all(&staged).unwrap();
        std::fs::write(staged.join("marker"), b"new").unwrap();
        std::fs::create_dir_all(&target).unwrap();
        std::fs::write(target.join("marker"), b"old").unwrap();

        swap_into_place(&staged, &target).unwrap();

        assert_eq!(std::fs::read(target.join("marker")).unwrap(), b"new");
        let leftover_backup = std::fs::read_dir(tmp.path())
            .unwrap()
            .filter_map(Result::ok)
            .any(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".target.swap-")
            });
        assert!(!leftover_backup, "swap backup should be cleaned up");
    }

    #[cfg(unix)]
    #[test]
    fn make_executable_sets_owner_exec_bit() {
        use std::os::unix::fs::PermissionsExt;

        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("ffmpeg");
        std::fs::write(&path, b"binary").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();

        make_executable(&path).unwrap();

        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o755);
    }
}
