// Install pipeline: fetch manifest → download zip → sha256 verify → extract →
// chmod +x → probe → atomic swap into `<GameRoot>/BazaarPlusPlus/tools/ffmpeg/`.
//
// The intent expressed by the design doc is "never let mod see a half-installed
// binary": every IO step writes to a temp directory adjacent to the real
// target, and the swap is the last thing that runs. If any earlier step fails
// we surface a typed error code and leave the previously-installed copy alone.
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::Utc;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use super::manifest::{self, FfmpegPlatformEntry};
use super::probe::{self, PROBE_TIMEOUT};
use super::state::{self, VersionFile};
use super::{
    FFMPEG_ERR_EXTRACT_FAILED, FFMPEG_ERR_INVALID_CHECKSUM, FFMPEG_ERR_NETWORK,
    FFMPEG_ERR_PROBE_FAILED, FFMPEG_INSTALL_PROGRESS_EVENT,
};

const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(300);
const LICENSE_FILE_NAME: &str = "LICENSE.txt";

/// Progress payload emitted to the UI during install. The `phase` string
/// drives copy switching on the frontend ("downloading" vs "extracting" vs
/// "probing"). Byte counters are populated only during the download phase.
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
pub(crate) async fn install(
    app: &AppHandle,
    game_path: &Path,
) -> Result<(), String> {
    emit_progress(app, "manifest", 0, 0);
    let manifest = manifest::fetch_manifest().await?;
    let platform_key = state::current_platform_key()?;
    let (version, entry) = manifest.select_current(&platform_key)?;

    let tools_root = state::tools_root_dir(game_path);
    std::fs::create_dir_all(&tools_root)
        .map_err(|err| format!("Cannot create {}: {err}", tools_root.display()))?;

    let staging = tempfile::tempdir_in(&tools_root)
        .map_err(|err| format!("Cannot create staging dir: {err}"))?;

    let zip_path = staging.path().join("ffmpeg.zip");
    let total_hint = entry.size_bytes.unwrap_or(0);
    let downloaded_sha = download_with_progress(app, &entry, &zip_path, total_hint).await?;

    let expected_sha = entry.sha256.trim().to_lowercase();
    if downloaded_sha != expected_sha {
        return Err(format!(
            "{FFMPEG_ERR_INVALID_CHECKSUM}:expected {expected_sha} got {downloaded_sha}"
        ));
    }

    emit_progress(app, "extracting", 0, 0);
    let extract_dir = staging.path().join("extracted");
    std::fs::create_dir_all(&extract_dir)
        .map_err(|err| format!("Cannot create {}: {err}", extract_dir.display()))?;
    let zip_bytes = std::fs::read(&zip_path)
        .map_err(|err| format!("Cannot read downloaded zip: {err}"))?;
    extract_zip(&zip_bytes, &extract_dir)?;

    let binary_in_archive = extract_dir.join(&entry.entry_in_archive);
    if !binary_in_archive.is_file() {
        return Err(format!(
            "{FFMPEG_ERR_EXTRACT_FAILED}:binary {} not found after extract",
            entry.entry_in_archive
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

    // LICENSE.txt is best-effort — the mod still runs without it; we only
    // bundle it for downstream audit. A network blip here shouldn't fail the
    // install when the binary itself is already verified and probed.
    if let Some(url) = entry.license_url.as_deref() {
        if let Err(err) = download_license(url, &final_dir.join(LICENSE_FILE_NAME)).await {
            eprintln!("[ffmpeg install] LICENSE download skipped: {err}");
        }
    }

    let version_info = VersionFile {
        version: version.clone(),
        platform: platform_key.clone(),
        sha256: expected_sha.clone(),
        installed_at_utc: Utc::now().to_rfc3339(),
    };
    state::write_version_file(&final_dir, &version_info)?;

    swap_into_place(&final_dir, &state::ffmpeg_dir(game_path))?;
    emit_progress(app, "complete", 0, 0);
    Ok(())
}

async fn download_with_progress(
    app: &AppHandle,
    entry: &FfmpegPlatformEntry,
    destination: &Path,
    total_hint: u64,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(DOWNLOAD_TIMEOUT)
        .build()
        .map_err(|err| format!("{FFMPEG_ERR_NETWORK}:client init failed: {err}"))?;

    let response = client
        .get(&entry.asset_url)
        .send()
        .await
        .map_err(|err| format!("{FFMPEG_ERR_NETWORK}:asset request failed: {err}"))?
        .error_for_status()
        .map_err(|err| format!("{FFMPEG_ERR_NETWORK}:asset status: {err}"))?;

    let content_length = response.content_length();
    let total = content_length.unwrap_or(total_hint);

    let mut file = std::fs::File::create(destination)
        .map_err(|err| format!("Cannot create download file: {err}"))?;
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;
    emit_progress(app, "downloading", downloaded, total);

    let mut stream = response;
    while let Some(chunk) = stream
        .chunk()
        .await
        .map_err(|err| format!("{FFMPEG_ERR_NETWORK}:chunk read failed: {err}"))?
    {
        hasher.update(&chunk);
        file.write_all(&chunk)
            .map_err(|err| format!("Cannot write download chunk: {err}"))?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        // Coalesce progress events to ~64 KiB granularity so we don't drown
        // the UI bridge in updates on a fast connection.
        if downloaded - last_emit >= 64 * 1024 {
            emit_progress(app, "downloading", downloaded, total);
            last_emit = downloaded;
        }
    }
    file.flush().map_err(|err| format!("Cannot flush download: {err}"))?;
    drop(file);

    emit_progress(app, "downloading", downloaded, total.max(downloaded));
    Ok(format!("{:x}", hasher.finalize()))
}

async fn download_license(url: &str, destination: &Path) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|err| format!("license client init failed: {err}"))?;

    let body = client
        .get(url)
        .send()
        .await
        .map_err(|err| format!("license fetch failed: {err}"))?
        .error_for_status()
        .map_err(|err| format!("license status: {err}"))?
        .bytes()
        .await
        .map_err(|err| format!("license read failed: {err}"))?;

    std::fs::write(destination, body)
        .map_err(|err| format!("Cannot write LICENSE: {err}"))
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
            std::fs::create_dir_all(&output_path)
                .map_err(|err| format!("{FFMPEG_ERR_EXTRACT_FAILED}:mkdir {}: {err}", output_path.display()))?;
            continue;
        }

        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|err| format!("{FFMPEG_ERR_EXTRACT_FAILED}:mkdir {}: {err}", parent.display()))?;
        }

        let mut contents = Vec::new();
        file.read_to_end(&mut contents)
            .map_err(|err| format!("{FFMPEG_ERR_EXTRACT_FAILED}:read body: {err}"))?;
        std::fs::write(&output_path, contents)
            .map_err(|err| format!("{FFMPEG_ERR_EXTRACT_FAILED}:write {}: {err}", output_path.display()))?;
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
        std::fs::set_permissions(path, perms)
            .map_err(|err| format!("cannot set perms: {err}"))
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
        std::fs::rename(target, &backup_path).map_err(|err| {
            format!("Cannot stash previous ffmpeg install: {err}")
        })?;
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
    use std::io::Cursor as StdCursor;

    fn build_zip_with_binary(entry_path: &str, binary_bytes: &[u8]) -> Vec<u8> {
        let buffer = StdCursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(buffer);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file(entry_path, options).unwrap();
        zip.write_all(binary_bytes).unwrap();
        zip.finish().unwrap().into_inner()
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
        std::fs::set_permissions(
            &path,
            std::fs::Permissions::from_mode(0o600),
        )
        .unwrap();

        make_executable(&path).unwrap();

        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o755);
    }
}
