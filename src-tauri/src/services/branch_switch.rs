#![allow(dead_code)]

use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

use crate::services::branch::{
    read_appmanifest_branch_state, read_branch_target_authorized, write_appmanifest_branch_target,
    write_appmanifest_branch_target_with_state_flags, AppManifestBranchState,
};
use crate::services::install::{build_install_state, run_install, InstallState};
use crate::services::startup::InstallerContextState;
use crate::services::{game_process::is_bazaar_running_best_effort, steam};
use tauri::{Emitter, Manager};

pub const BRANCH_SWITCH_STATUS_EVENT: &str = "branch-switch-status";
const THE_BAZAAR_APP_ID: &str = "1617400";
const READY_STATE_FLAGS: &str = "4";
const BRANCH_SWITCH_POLL_INTERVAL: Duration = Duration::from_secs(2);
const BRANCH_SWITCH_POLL_TIMEOUT: Duration = Duration::from_secs(60 * 60 * 2);

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum SteamBranchTarget {
    Online,
    Ptr,
}

impl SteamBranchTarget {
    pub fn beta_key(self) -> &'static str {
        match self {
            SteamBranchTarget::Online => "",
            SteamBranchTarget::Ptr => "public_test_realm",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum BranchSwitchPhase {
    Idle,
    PreCheck,
    QuitSteam,
    EditAcf,
    Downloading,
    Repairing,
    Restoring,
    Canceled,
    Ready,
    Error,
}

#[derive(Clone, Debug, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct BranchSwitchStatus {
    pub phase: BranchSwitchPhase,
    pub target: Option<SteamBranchTarget>,
    pub cancelable: bool,
    pub bytes_downloaded: Option<u64>,
    pub bytes_to_download: Option<u64>,
    pub progress_fraction: Option<f64>,
    pub message: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct BranchSwitchResult {
    pub state: InstallState,
    pub canceled: bool,
}

impl BranchSwitchStatus {
    fn new(phase: BranchSwitchPhase, target: SteamBranchTarget, cancelable: bool) -> Self {
        Self {
            phase,
            target: Some(target),
            cancelable,
            bytes_downloaded: None,
            bytes_to_download: None,
            progress_fraction: None,
            message: None,
        }
    }

    fn idle() -> Self {
        Self {
            phase: BranchSwitchPhase::Idle,
            target: None,
            cancelable: false,
            bytes_downloaded: None,
            bytes_to_download: None,
            progress_fraction: None,
            message: None,
        }
    }

    fn with_message(mut self, message: impl Into<String>) -> Self {
        self.message = Some(message.into());
        self
    }

    fn with_download_progress(mut self, state: &AppManifestBranchState) -> Self {
        self.bytes_downloaded = state.bytes_downloaded;
        self.bytes_to_download = state.bytes_to_download;
        self.progress_fraction = progress_fraction(state.bytes_downloaded, state.bytes_to_download);
        self
    }
}

impl Default for BranchSwitchStatus {
    fn default() -> Self {
        Self::idle()
    }
}

#[derive(Clone, Default)]
pub struct BranchSwitchRuntimeState {
    inner: Arc<Mutex<BranchSwitchRuntimeInner>>,
}

#[derive(Default)]
struct BranchSwitchRuntimeInner {
    status: BranchSwitchStatus,
    active: Option<ActiveBranchSwitch>,
}

struct ActiveBranchSwitch {
    cancel_flag: Arc<AtomicBool>,
}

impl BranchSwitchRuntimeState {
    pub fn snapshot(&self) -> BranchSwitchStatus {
        self.inner
            .lock()
            .expect("branch switch runtime poisoned")
            .status
            .clone()
    }

    fn begin_switch(&self, target: SteamBranchTarget) -> Result<Arc<AtomicBool>, String> {
        let mut inner = self.inner.lock().expect("branch switch runtime poisoned");
        if inner.active.is_some() {
            return Err("A branch switch is already running.".to_string());
        }

        let cancel_flag = Arc::new(AtomicBool::new(false));
        inner.status = BranchSwitchStatus::new(BranchSwitchPhase::PreCheck, target, false);
        inner.active = Some(ActiveBranchSwitch {
            cancel_flag: cancel_flag.clone(),
        });

        Ok(cancel_flag)
    }

    fn set_status(&self, status: BranchSwitchStatus) -> BranchSwitchStatus {
        let mut inner = self.inner.lock().expect("branch switch runtime poisoned");
        inner.status = status;
        inner.status.clone()
    }

    pub fn request_cancel(&self) -> Result<BranchSwitchStatus, String> {
        let mut inner = self.inner.lock().expect("branch switch runtime poisoned");
        let cancel_flag = inner
            .active
            .as_ref()
            .map(|active| active.cancel_flag.clone())
            .ok_or_else(|| "No active branch switch.".to_string())?;

        if !inner.status.cancelable {
            return Err("Branch switch can no longer be canceled.".to_string());
        }

        cancel_flag.store(true, Ordering::SeqCst);
        inner.status.message = Some("Cancel requested.".to_string());
        Ok(inner.status.clone())
    }

    fn finish(&self, status: BranchSwitchStatus) -> BranchSwitchStatus {
        let mut inner = self.inner.lock().expect("branch switch runtime poisoned");
        inner.active = None;
        inner.status = status;
        inner.status.clone()
    }

    fn finish_active(&self) -> BranchSwitchStatus {
        let mut inner = self.inner.lock().expect("branch switch runtime poisoned");
        inner.active = None;
        inner.status.clone()
    }
}

pub async fn run_branch_switch(
    app: tauri::AppHandle,
    runtime: tauri::State<'_, BranchSwitchRuntimeState>,
    install_state: tauri::State<'_, InstallerContextState>,
    game_path: String,
    target: SteamBranchTarget,
    compat_opt_in: bool,
) -> Result<BranchSwitchResult, String> {
    let runtime = runtime.inner().clone();
    let cancel_flag = runtime.begin_switch(target)?;
    emit_status(&app, &runtime.snapshot());

    let result = run_branch_switch_started(
        app.clone(),
        runtime.clone(),
        install_state,
        game_path,
        target,
        compat_opt_in,
        cancel_flag,
    )
    .await;

    match result {
        Ok(result) => {
            runtime.finish_active();
            Ok(result)
        }
        Err(error) => {
            let status = BranchSwitchStatus::new(BranchSwitchPhase::Error, target, false)
                .with_message(error.clone());
            let status = runtime.finish(status);
            emit_status(&app, &status);
            Err(error)
        }
    }
}

async fn run_branch_switch_started(
    app: tauri::AppHandle,
    runtime: BranchSwitchRuntimeState,
    install_state: tauri::State<'_, InstallerContextState>,
    game_path: String,
    target: SteamBranchTarget,
    compat_opt_in: bool,
    cancel_flag: Arc<AtomicBool>,
) -> Result<BranchSwitchResult, String> {
    set_and_emit_status(
        &app,
        &runtime,
        BranchSwitchStatus::new(BranchSwitchPhase::PreCheck, target, false)
            .with_message("Checking Steam branch switch prerequisites."),
    );

    let appmanifest_path = appmanifest_path_from_game_path(Path::new(&game_path))?;
    if is_bazaar_running_best_effort() {
        return Err(
            "The Bazaar is running. Close the game before switching Steam branches.".to_string(),
        );
    }

    let detected = build_install_state(app.clone(), install_state, Some(game_path.clone()))?;
    ensure_target_authorized(&detected, target)?;

    let original_manifest = read_appmanifest_branch_state(&appmanifest_path)?;
    let original_beta_key = original_manifest.user_beta_key.clone();
    if branch_switch_complete(&original_manifest, target) {
        let state = repair_if_needed(app, runtime, game_path, target, compat_opt_in).await?;
        return Ok(BranchSwitchResult {
            state,
            canceled: false,
        });
    }

    let baseline_bytes_staged = original_manifest.bytes_staged.unwrap_or(0);
    let blocking_result = {
        let app = app.clone();
        let runtime = runtime.clone();
        let appmanifest_path = appmanifest_path.clone();
        tauri::async_runtime::spawn_blocking(move || {
            run_branch_switch_blocking(
                app,
                runtime,
                appmanifest_path,
                target,
                cancel_flag,
                original_beta_key,
                baseline_bytes_staged,
            )
        })
        .await
        .map_err(|err| format!("failed to run branch switch task: {err}"))??
    };

    match blocking_result {
        BlockingSwitchResult::Canceled => {
            let state = build_install_state(
                app.clone(),
                app.state::<InstallerContextState>(),
                Some(game_path),
            )?;
            Ok(BranchSwitchResult {
                state,
                canceled: true,
            })
        }
        BlockingSwitchResult::Completed => {
            let state = repair_if_needed(app, runtime, game_path, target, compat_opt_in).await?;
            Ok(BranchSwitchResult {
                state,
                canceled: false,
            })
        }
    }
}

fn ensure_target_authorized(
    install_state: &InstallState,
    target: SteamBranchTarget,
) -> Result<(), String> {
    let target_beta_key = target.beta_key();
    if target_beta_key.is_empty() {
        return Ok(());
    }

    let steam_path = install_state
        .steam_path
        .as_ref()
        .ok_or_else(|| "Cannot locate Steam installation for PTR authorization.".to_string())?;
    let config_path = Path::new(steam_path).join("config").join("config.vdf");
    let authorized = read_branch_target_authorized(&config_path, target_beta_key)?;
    if authorized {
        Ok(())
    } else {
        Err("Steam account is not authorized for the PTR branch.".to_string())
    }
}

async fn repair_if_needed(
    app: tauri::AppHandle,
    runtime: BranchSwitchRuntimeState,
    game_path: String,
    target: SteamBranchTarget,
    compat_opt_in: bool,
) -> Result<InstallState, String> {
    let state = build_install_state(
        app.clone(),
        app.state::<InstallerContextState>(),
        Some(game_path.clone()),
    )?;

    if state.mod_state.installed && !state.mod_state.version_matches {
        set_and_emit_status(
            &app,
            &runtime,
            BranchSwitchStatus::new(BranchSwitchPhase::Repairing, target, false)
                .with_message("Repairing BazaarPlusPlus after the Steam branch switch."),
        );
        let repaired = run_install(
            app.clone(),
            app.state::<InstallerContextState>(),
            game_path,
            compat_opt_in,
        )
        .await?;
        set_and_emit_status(
            &app,
            &runtime,
            BranchSwitchStatus::new(BranchSwitchPhase::Ready, target, false)
                .with_message("Steam branch switch is ready."),
        );
        return Ok(repaired);
    }

    set_and_emit_status(
        &app,
        &runtime,
        BranchSwitchStatus::new(BranchSwitchPhase::Ready, target, false)
            .with_message("Steam branch switch is ready."),
    );
    Ok(state)
}

#[derive(Debug)]
enum BlockingSwitchResult {
    Completed,
    Canceled,
}

trait BranchSwitchBlockingOps {
    fn close_steam(&mut self) -> Result<(), String>;
    fn write_appmanifest_branch_target(&mut self, target_beta_key: &str) -> Result<(), String>;
    fn start_steam(&mut self) -> Result<(), String>;
    fn begin_polling(&mut self);
    fn timed_out(&mut self) -> bool;
    fn read_appmanifest_branch_state(&mut self) -> Result<AppManifestBranchState, String>;
    fn restore_original_branch(&mut self, original_beta_key: &str) -> Result<(), String>;
    fn sleep(&mut self, interval: Duration);
}

fn run_branch_switch_blocking_with_ops<Ops, Emit>(
    ops: &mut Ops,
    target: SteamBranchTarget,
    cancel_flag: &AtomicBool,
    original_beta_key: &str,
    baseline_bytes_staged: u64,
    mut emit_status: Emit,
) -> Result<BlockingSwitchResult, String>
where
    Ops: BranchSwitchBlockingOps,
    Emit: FnMut(BranchSwitchStatus),
{
    emit_status(
        BranchSwitchStatus::new(BranchSwitchPhase::QuitSteam, target, false)
            .with_message("Closing Steam before editing the appmanifest."),
    );
    ops.close_steam()?;

    emit_status(
        BranchSwitchStatus::new(BranchSwitchPhase::EditAcf, target, false)
            .with_message("Updating Steam appmanifest branch target."),
    );
    ops.write_appmanifest_branch_target(target.beta_key())?;
    if let Err(error) = ops.start_steam() {
        return Err(restore_after_pre_commit_error(
            ops,
            original_beta_key,
            error,
        ));
    }

    ops.begin_polling();
    let mut commit_lock = CancelCommitLock::new(baseline_bytes_staged);
    let mut last_progress: Option<(Option<u64>, Option<u64>, bool)> = None;
    loop {
        if ops.timed_out() {
            let error = "Timed out waiting for Steam to finish switching branches.".to_string();
            return if commit_lock.locked {
                Err(error)
            } else {
                Err(restore_after_pre_commit_error(
                    ops,
                    original_beta_key,
                    error,
                ))
            };
        }

        let current = match ops.read_appmanifest_branch_state() {
            Ok(current) => current,
            Err(error) => {
                return if commit_lock.locked {
                    Err(error)
                } else {
                    Err(restore_after_pre_commit_error(
                        ops,
                        original_beta_key,
                        error,
                    ))
                };
            }
        };
        let cancelable = commit_lock.update_cancelable(current.bytes_staged);

        let progress_key = (
            current.bytes_downloaded,
            current.bytes_to_download,
            cancelable,
        );
        if last_progress.as_ref() != Some(&progress_key) {
            let message = if cancelable {
                "Waiting for Steam to download the selected branch."
            } else {
                "Steam is staging downloaded files; cancel is locked."
            };
            emit_status(
                BranchSwitchStatus::new(BranchSwitchPhase::Downloading, target, cancelable)
                    .with_download_progress(&current)
                    .with_message(message),
            );
            last_progress = Some(progress_key);
        }

        if cancel_flag.load(Ordering::SeqCst) && cancelable {
            emit_status(
                BranchSwitchStatus::new(BranchSwitchPhase::Restoring, target, false)
                    .with_message("Restoring the previous Steam branch."),
            );
            ops.close_steam()?;
            ops.restore_original_branch(original_beta_key)?;
            emit_status(
                BranchSwitchStatus::new(BranchSwitchPhase::Canceled, target, false)
                    .with_message("Steam branch switch was canceled and restored."),
            );
            return Ok(BlockingSwitchResult::Canceled);
        }

        if branch_switch_complete(&current, target) {
            return Ok(BlockingSwitchResult::Completed);
        }

        ops.sleep(BRANCH_SWITCH_POLL_INTERVAL);
    }
}

fn restore_after_pre_commit_error<Ops>(
    ops: &mut Ops,
    original_beta_key: &str,
    error: String,
) -> String
where
    Ops: BranchSwitchBlockingOps,
{
    match ops.restore_original_branch(original_beta_key) {
        Ok(()) => error,
        Err(restore_error) => {
            format!("{error}; additionally failed to restore original branch: {restore_error}")
        }
    }
}

struct RealBranchSwitchBlockingOps {
    appmanifest_path: PathBuf,
    poll_started_at: Option<Instant>,
}

impl RealBranchSwitchBlockingOps {
    fn new(appmanifest_path: PathBuf) -> Self {
        Self {
            appmanifest_path,
            poll_started_at: None,
        }
    }
}

impl BranchSwitchBlockingOps for RealBranchSwitchBlockingOps {
    fn close_steam(&mut self) -> Result<(), String> {
        steam::close_steam_for_branch_switch().map(|_| ())
    }

    fn write_appmanifest_branch_target(&mut self, target_beta_key: &str) -> Result<(), String> {
        write_appmanifest_branch_target(&self.appmanifest_path, target_beta_key)
    }

    fn start_steam(&mut self) -> Result<(), String> {
        start_steam()
    }

    fn begin_polling(&mut self) {
        self.poll_started_at = Some(Instant::now());
    }

    fn timed_out(&mut self) -> bool {
        self.poll_started_at
            .map(|started_at| started_at.elapsed() > BRANCH_SWITCH_POLL_TIMEOUT)
            .unwrap_or(false)
    }

    fn read_appmanifest_branch_state(&mut self) -> Result<AppManifestBranchState, String> {
        read_appmanifest_branch_state(&self.appmanifest_path)
    }

    fn restore_original_branch(&mut self, original_beta_key: &str) -> Result<(), String> {
        restore_original_branch(&self.appmanifest_path, original_beta_key)
    }

    fn sleep(&mut self, interval: Duration) {
        std::thread::sleep(interval);
    }
}

fn run_branch_switch_blocking(
    app: tauri::AppHandle,
    runtime: BranchSwitchRuntimeState,
    appmanifest_path: PathBuf,
    target: SteamBranchTarget,
    cancel_flag: Arc<AtomicBool>,
    original_beta_key: String,
    baseline_bytes_staged: u64,
) -> Result<BlockingSwitchResult, String> {
    let mut ops = RealBranchSwitchBlockingOps::new(appmanifest_path);
    run_branch_switch_blocking_with_ops(
        &mut ops,
        target,
        cancel_flag.as_ref(),
        &original_beta_key,
        baseline_bytes_staged,
        |status| {
            set_and_emit_status(&app, &runtime, status);
        },
    )
}

fn set_and_emit_status(
    app: &tauri::AppHandle,
    runtime: &BranchSwitchRuntimeState,
    status: BranchSwitchStatus,
) -> BranchSwitchStatus {
    let status = runtime.set_status(status);
    emit_status(app, &status);
    status
}

fn emit_status(app: &tauri::AppHandle, status: &BranchSwitchStatus) {
    let _ = app.emit(BRANCH_SWITCH_STATUS_EVENT, status.clone());
}

fn start_steam() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", "steam://open/main"])
            .spawn()
            .map_err(|err| format!("Failed to start Steam: {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Steam"])
            .spawn()
            .map_err(|err| format!("Failed to start Steam: {err}"))?;
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg("steam://open/main")
            .spawn()
            .map_err(|err| format!("Failed to start Steam: {err}"))?;
        Ok(())
    }
}

fn progress_fraction(bytes_downloaded: Option<u64>, bytes_to_download: Option<u64>) -> Option<f64> {
    let downloaded = bytes_downloaded?;
    let to_download = bytes_to_download?;
    if to_download == 0 {
        return Some(1.0);
    }

    Some((downloaded as f64 / to_download as f64).clamp(0.0, 1.0))
}

fn appmanifest_path_from_game_path(game_path: &Path) -> Result<PathBuf, String> {
    let install_dir = game_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Invalid game path: {}", game_path.display()))?;
    if install_dir != "The Bazaar" {
        return Err(format!(
            "Game path must end with The Bazaar: {}",
            game_path.display()
        ));
    }

    let common_dir = game_path
        .parent()
        .ok_or_else(|| format!("Invalid game path: {}", game_path.display()))?;
    let common_name = common_dir
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Invalid game path: {}", game_path.display()))?;
    if common_name != "common" {
        return Err(format!(
            "Game path must be inside steamapps/common: {}",
            game_path.display()
        ));
    }

    let steamapps_dir = common_dir
        .parent()
        .ok_or_else(|| format!("Invalid game path: {}", game_path.display()))?;
    let steamapps_name = steamapps_dir
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Invalid game path: {}", game_path.display()))?;
    if steamapps_name != "steamapps" {
        return Err(format!(
            "Game path must be inside steamapps/common: {}",
            game_path.display()
        ));
    }

    Ok(steamapps_dir.join(format!("appmanifest_{THE_BAZAAR_APP_ID}.acf")))
}

fn downloading_scratch_path(appmanifest_path: &Path) -> Result<PathBuf, String> {
    let steamapps_dir = appmanifest_path.parent().ok_or_else(|| {
        format!(
            "Cannot derive downloading scratch path from {}",
            appmanifest_path.display()
        )
    })?;

    Ok(steamapps_dir.join("downloading").join(THE_BAZAAR_APP_ID))
}

fn branch_switch_complete(state: &AppManifestBranchState, target: SteamBranchTarget) -> bool {
    state.state_flags == 4
        && mounted_beta_matches_target(state.mounted_beta_key.as_deref(), target)
        && state
            .bytes_downloaded
            .zip(state.bytes_to_download)
            .map(|(downloaded, to_download)| downloaded == to_download)
            .unwrap_or(false)
        && state
            .bytes_staged
            .zip(state.bytes_to_stage)
            .map(|(staged, to_stage)| staged == to_stage)
            .unwrap_or(false)
}

fn mounted_beta_matches_target(mounted_beta_key: Option<&str>, target: SteamBranchTarget) -> bool {
    match target {
        SteamBranchTarget::Online => mounted_beta_key.unwrap_or("").is_empty(),
        SteamBranchTarget::Ptr => mounted_beta_key == Some(target.beta_key()),
    }
}

fn cancel_allowed_before_commit_point(
    baseline_bytes_staged: u64,
    current_bytes_staged: Option<u64>,
) -> bool {
    current_bytes_staged.unwrap_or(0) <= baseline_bytes_staged
}

#[derive(Debug)]
struct CancelCommitLock {
    baseline_bytes_staged: u64,
    locked: bool,
}

impl CancelCommitLock {
    fn new(baseline_bytes_staged: u64) -> Self {
        Self {
            baseline_bytes_staged,
            locked: false,
        }
    }

    fn update_cancelable(&mut self, current_bytes_staged: Option<u64>) -> bool {
        if !cancel_allowed_before_commit_point(self.baseline_bytes_staged, current_bytes_staged) {
            self.locked = true;
        }

        !self.locked
    }
}

fn restore_original_branch(appmanifest_path: &Path, original_beta_key: &str) -> Result<(), String> {
    write_appmanifest_branch_target_with_state_flags(
        appmanifest_path,
        original_beta_key,
        READY_STATE_FLAGS,
    )?;
    remove_downloading_scratch(appmanifest_path)
}

fn remove_downloading_scratch(appmanifest_path: &Path) -> Result<(), String> {
    let scratch_path = downloading_scratch_path(appmanifest_path)?;
    if !scratch_path.exists() {
        return Ok(());
    }

    let metadata = std::fs::metadata(&scratch_path).map_err(|err| {
        format!(
            "Cannot inspect downloading scratch path {}: {err}",
            scratch_path.display()
        )
    })?;
    if metadata.is_dir() {
        std::fs::remove_dir_all(&scratch_path).map_err(|err| {
            format!(
                "Cannot remove downloading scratch directory {}: {err}",
                scratch_path.display()
            )
        })
    } else {
        std::fs::remove_file(&scratch_path).map_err(|err| {
            format!(
                "Cannot remove downloading scratch file {}: {err}",
                scratch_path.display()
            )
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{appmanifest_path_from_game_path, SteamBranchTarget};
    use crate::services::branch::{parse_appmanifest_branch_state, AppManifestBranchState};
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Duration;

    #[test]
    fn appmanifest_path_from_game_path_derives_manifest_from_game_library() {
        let game_path = Path::new("/SteamLibrary/steamapps/common/The Bazaar");

        let manifest_path = appmanifest_path_from_game_path(game_path).unwrap();

        assert_eq!(
            manifest_path,
            PathBuf::from("/SteamLibrary/steamapps/appmanifest_1617400.acf")
        );
    }

    #[test]
    fn downloading_scratch_path_resolves_from_appmanifest_parent() {
        let appmanifest_path = Path::new("/SteamLibrary/steamapps/appmanifest_1617400.acf");

        let scratch_path = super::downloading_scratch_path(appmanifest_path).unwrap();

        assert_eq!(
            scratch_path,
            PathBuf::from("/SteamLibrary/steamapps/downloading/1617400")
        );
    }

    #[test]
    fn steam_branch_targets_use_steam_beta_keys() {
        assert_eq!(SteamBranchTarget::Online.beta_key(), "");
        assert_eq!(SteamBranchTarget::Ptr.beta_key(), "public_test_realm");
    }

    fn manifest_state_for_completion() -> AppManifestBranchState {
        AppManifestBranchState {
            user_beta_key: "public_test_realm".to_string(),
            mounted_beta_key: Some("public_test_realm".to_string()),
            state_flags: 4,
            bytes_downloaded: Some(100),
            bytes_to_download: Some(100),
            bytes_staged: Some(25),
            bytes_to_stage: Some(25),
        }
    }

    fn incomplete_manifest_state(bytes_staged: Option<u64>) -> AppManifestBranchState {
        AppManifestBranchState {
            user_beta_key: "public_test_realm".to_string(),
            mounted_beta_key: Some("public_test_realm".to_string()),
            state_flags: 6,
            bytes_downloaded: Some(50),
            bytes_to_download: Some(100),
            bytes_staged,
            bytes_to_stage: Some(100),
        }
    }

    #[test]
    fn branch_switch_complete_requires_ready_state_mounted_target_and_equal_byte_pairs() {
        let ready = manifest_state_for_completion();

        assert!(super::branch_switch_complete(
            &ready,
            SteamBranchTarget::Ptr
        ));

        let mut wrong_state_flags = ready.clone();
        wrong_state_flags.state_flags = 6;
        assert!(!super::branch_switch_complete(
            &wrong_state_flags,
            SteamBranchTarget::Ptr
        ));

        let mut wrong_mounted_beta = ready.clone();
        wrong_mounted_beta.mounted_beta_key = Some("".to_string());
        assert!(!super::branch_switch_complete(
            &wrong_mounted_beta,
            SteamBranchTarget::Ptr
        ));

        let mut missing_download_bytes = ready.clone();
        missing_download_bytes.bytes_to_download = None;
        assert!(!super::branch_switch_complete(
            &missing_download_bytes,
            SteamBranchTarget::Ptr
        ));

        let mut unequal_stage_bytes = ready;
        unequal_stage_bytes.bytes_to_stage = Some(26);
        assert!(!super::branch_switch_complete(
            &unequal_stage_bytes,
            SteamBranchTarget::Ptr
        ));
    }

    #[test]
    fn branch_switch_complete_accepts_missing_or_empty_mounted_beta_for_online_only() {
        let mut online_without_mounted_beta = manifest_state_for_completion();
        online_without_mounted_beta.user_beta_key = "".to_string();
        online_without_mounted_beta.mounted_beta_key = None;
        assert!(super::branch_switch_complete(
            &online_without_mounted_beta,
            SteamBranchTarget::Online
        ));

        let mut online_with_empty_mounted_beta = online_without_mounted_beta.clone();
        online_with_empty_mounted_beta.mounted_beta_key = Some("".to_string());
        assert!(super::branch_switch_complete(
            &online_with_empty_mounted_beta,
            SteamBranchTarget::Online
        ));

        let mut online_with_ptr_mounted_beta = online_without_mounted_beta.clone();
        online_with_ptr_mounted_beta.mounted_beta_key = Some("public_test_realm".to_string());
        assert!(!super::branch_switch_complete(
            &online_with_ptr_mounted_beta,
            SteamBranchTarget::Online
        ));

        assert!(!super::branch_switch_complete(
            &online_without_mounted_beta,
            SteamBranchTarget::Ptr
        ));
    }

    #[test]
    fn runtime_state_rejects_concurrent_starts_and_only_cancels_while_cancelable() {
        let runtime = super::BranchSwitchRuntimeState::default();

        let cancel_flag = runtime.begin_switch(SteamBranchTarget::Ptr).unwrap();

        assert!(!cancel_flag.load(Ordering::SeqCst));
        assert_eq!(
            runtime.begin_switch(SteamBranchTarget::Online).unwrap_err(),
            "A branch switch is already running."
        );
        assert_eq!(
            runtime.request_cancel().unwrap_err(),
            "Branch switch can no longer be canceled."
        );
        assert!(!cancel_flag.load(Ordering::SeqCst));

        runtime.set_status(super::BranchSwitchStatus::new(
            super::BranchSwitchPhase::Downloading,
            SteamBranchTarget::Ptr,
            true,
        ));
        runtime.request_cancel().unwrap();

        assert!(cancel_flag.load(Ordering::SeqCst));

        runtime.finish(super::BranchSwitchStatus::idle());
        assert_eq!(
            runtime.request_cancel().unwrap_err(),
            "No active branch switch."
        );
    }

    #[test]
    fn runtime_finish_active_preserves_terminal_status_snapshot() {
        let runtime = super::BranchSwitchRuntimeState::default();

        runtime.begin_switch(SteamBranchTarget::Ptr).unwrap();
        runtime.set_status(
            super::BranchSwitchStatus::new(
                super::BranchSwitchPhase::Canceled,
                SteamBranchTarget::Ptr,
                false,
            )
            .with_message("restored"),
        );
        let canceled = runtime.finish_active();

        assert_eq!(canceled.phase, super::BranchSwitchPhase::Canceled);
        assert_eq!(canceled.message.as_deref(), Some("restored"));
        assert_eq!(
            runtime.request_cancel().unwrap_err(),
            "No active branch switch."
        );

        runtime.begin_switch(SteamBranchTarget::Online).unwrap();
        runtime.set_status(
            super::BranchSwitchStatus::new(
                super::BranchSwitchPhase::Ready,
                SteamBranchTarget::Online,
                false,
            )
            .with_message("ready"),
        );
        let ready = runtime.finish_active();

        assert_eq!(ready.phase, super::BranchSwitchPhase::Ready);
        assert_eq!(ready.message.as_deref(), Some("ready"));
        assert_eq!(runtime.snapshot().phase, super::BranchSwitchPhase::Ready);
    }

    #[test]
    fn cancel_lock_allows_cancel_until_staging_progresses_past_baseline() {
        assert!(super::cancel_allowed_before_commit_point(10, None));
        assert!(super::cancel_allowed_before_commit_point(10, Some(0)));
        assert!(super::cancel_allowed_before_commit_point(10, Some(10)));
        assert!(!super::cancel_allowed_before_commit_point(10, Some(11)));
    }

    #[test]
    fn cancel_commit_lock_stays_locked_after_staging_progresses() {
        let mut lock = super::CancelCommitLock::new(10);

        assert!(lock.update_cancelable(None));
        assert!(lock.update_cancelable(Some(10)));
        assert!(!lock.update_cancelable(Some(11)));
        assert!(!lock.update_cancelable(None));
        assert!(!lock.update_cancelable(Some(0)));
        assert!(!lock.update_cancelable(Some(10)));
    }

    #[test]
    fn restore_original_branch_writes_original_beta_ready_state_and_removes_scratch_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let steamapps = tmp.path().join("steamapps");
        let scratch = steamapps.join("downloading/1617400");
        std::fs::create_dir_all(&scratch).unwrap();
        let appmanifest = steamapps.join("appmanifest_1617400.acf");
        std::fs::write(
            &appmanifest,
            "\"AppState\"
{
\t\"StateFlags\"\t\t\"6\"
\t\"BytesDownloaded\"\t\t\"50\"
\t\"BytesToDownload\"\t\t\"100\"
\t\"BytesStaged\"\t\t\"0\"
\t\"BytesToStage\"\t\t\"10\"
\t\"UserConfig\"
\t{
\t\t\"BetaKey\"\t\t\"public_test_realm\"
\t}
\t\"MountedConfig\"
\t{
\t\t\"BetaKey\"\t\t\"public_test_realm\"
\t}
}",
        )
        .unwrap();

        super::restore_original_branch(&appmanifest, "").unwrap();

        let restored = std::fs::read_to_string(&appmanifest).unwrap();
        let state = parse_appmanifest_branch_state(&restored).unwrap();
        assert_eq!(state.user_beta_key, "");
        assert_eq!(state.state_flags, 4);
        assert_eq!(state.mounted_beta_key.as_deref(), Some("public_test_realm"));
        assert!(!scratch.exists());
    }

    #[derive(Default)]
    struct TestBlockingOps {
        close_result: Option<Result<(), String>>,
        write_result: Option<Result<(), String>>,
        start_result: Option<Result<(), String>>,
        read_results: Vec<Result<AppManifestBranchState, String>>,
        timed_out_results: Vec<bool>,
        restore_result: Option<Result<(), String>>,
        written_targets: Vec<String>,
        restored_betas: Vec<String>,
    }

    impl super::BranchSwitchBlockingOps for TestBlockingOps {
        fn close_steam(&mut self) -> Result<(), String> {
            self.close_result.take().unwrap_or(Ok(()))
        }

        fn write_appmanifest_branch_target(&mut self, target_beta_key: &str) -> Result<(), String> {
            self.written_targets.push(target_beta_key.to_string());
            self.write_result.take().unwrap_or(Ok(()))
        }

        fn start_steam(&mut self) -> Result<(), String> {
            self.start_result.take().unwrap_or(Ok(()))
        }

        fn begin_polling(&mut self) {}

        fn timed_out(&mut self) -> bool {
            if self.timed_out_results.is_empty() {
                false
            } else {
                self.timed_out_results.remove(0)
            }
        }

        fn read_appmanifest_branch_state(&mut self) -> Result<AppManifestBranchState, String> {
            if self.read_results.is_empty() {
                Ok(manifest_state_for_completion())
            } else {
                self.read_results.remove(0)
            }
        }

        fn restore_original_branch(&mut self, original_beta_key: &str) -> Result<(), String> {
            self.restored_betas.push(original_beta_key.to_string());
            self.restore_result.take().unwrap_or(Ok(()))
        }

        fn sleep(&mut self, _interval: Duration) {}
    }

    #[test]
    fn blocking_ops_start_error_after_manifest_write_restores_original_branch() {
        let mut ops = TestBlockingOps {
            start_result: Some(Err("start failed".to_string())),
            ..TestBlockingOps::default()
        };
        let cancel_flag = AtomicBool::new(false);
        let mut statuses = Vec::new();

        let error = super::run_branch_switch_blocking_with_ops(
            &mut ops,
            SteamBranchTarget::Ptr,
            &cancel_flag,
            "original_beta",
            0,
            |status| statuses.push(status),
        )
        .unwrap_err();

        assert_eq!(error, "start failed");
        assert_eq!(ops.written_targets, vec!["public_test_realm"]);
        assert_eq!(ops.restored_betas, vec!["original_beta"]);
    }

    #[test]
    fn blocking_ops_read_error_before_commit_combines_restore_failure() {
        let mut ops = TestBlockingOps {
            read_results: vec![Err("read failed".to_string())],
            restore_result: Some(Err("restore failed".to_string())),
            ..TestBlockingOps::default()
        };
        let cancel_flag = AtomicBool::new(false);

        let error = super::run_branch_switch_blocking_with_ops(
            &mut ops,
            SteamBranchTarget::Ptr,
            &cancel_flag,
            "original_beta",
            0,
            |_status| {},
        )
        .unwrap_err();

        assert!(error.contains("read failed"));
        assert!(error.contains("restore failed"));
        assert_eq!(ops.restored_betas, vec!["original_beta"]);
    }

    #[test]
    fn blocking_ops_timeout_before_commit_restores_original_branch() {
        let mut ops = TestBlockingOps {
            timed_out_results: vec![true],
            ..TestBlockingOps::default()
        };
        let cancel_flag = AtomicBool::new(false);

        let error = super::run_branch_switch_blocking_with_ops(
            &mut ops,
            SteamBranchTarget::Ptr,
            &cancel_flag,
            "original_beta",
            0,
            |_status| {},
        )
        .unwrap_err();

        assert!(error.contains("Timed out"));
        assert_eq!(ops.restored_betas, vec!["original_beta"]);
    }

    #[test]
    fn blocking_ops_latches_cancel_locked_after_staging_progress() {
        let mut ops = TestBlockingOps {
            read_results: vec![
                Ok(incomplete_manifest_state(Some(11))),
                Ok(incomplete_manifest_state(None)),
                Ok(manifest_state_for_completion()),
            ],
            ..TestBlockingOps::default()
        };
        let cancel_flag = AtomicBool::new(true);
        let mut statuses = Vec::new();

        let result = super::run_branch_switch_blocking_with_ops(
            &mut ops,
            SteamBranchTarget::Ptr,
            &cancel_flag,
            "original_beta",
            10,
            |status| statuses.push(status),
        )
        .unwrap();

        assert!(matches!(result, super::BlockingSwitchResult::Completed));
        assert!(ops.restored_betas.is_empty());
        let downloading_cancelables = statuses
            .iter()
            .filter(|status| status.phase == super::BranchSwitchPhase::Downloading)
            .map(|status| status.cancelable)
            .collect::<Vec<_>>();
        assert!(downloading_cancelables.len() >= 2);
        assert!(downloading_cancelables.iter().all(|cancelable| !cancelable));
    }
}
