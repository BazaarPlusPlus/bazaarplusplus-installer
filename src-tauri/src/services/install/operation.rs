use std::path::Path;

use tauri::Manager;

use super::plan::{plan_install, InstallEffect, InstallPlanInputs, PayloadState};
use super::{build_install_state_raw, install_action_problem, InstallState};
use crate::problem::SemanticProblem;
use crate::services::{
    bepinex::{self, install_bepinex},
    detect::detect_for_install,
    launch_mode::LaunchModeGate,
    startup::InstallerContextState,
    steam::prepare_steam_for_launch_option_update,
    vdf::{clear_launch_options_for_steam, patch_launch_options},
};

pub(crate) struct InstallRequest {
    pub(crate) game_path: String,
    pub(crate) compat_opt_in: bool,
}

fn classify_payload(
    bepinex_installed: bool,
    installed_version: Option<&str>,
    bundled_version: Option<&str>,
) -> PayloadState {
    if !bepinex_installed || installed_version.is_none() {
        return PayloadState::Missing;
    }
    if bundled_version.is_none() || installed_version == bundled_version {
        PayloadState::Current
    } else {
        PayloadState::Changed
    }
}

pub(crate) async fn install(
    app: tauri::AppHandle,
    request: InstallRequest,
) -> Result<InstallState, SemanticProblem> {
    let task_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let installer_state = task_app.state::<InstallerContextState>();
        let before = detect_for_install(
            task_app.clone(),
            installer_state,
            Some(request.game_path.clone()),
        )?;
        let steam_path = before.steam_path.clone().unwrap_or_default();
        let requested = LaunchModeGate::current().requested_mode(request.compat_opt_in);
        let requested_trampoline =
            requested == crate::services::launch_mode::LaunchMode::Trampoline;
        let facts = InstallPlanInputs {
            requested,
            was_trampolined: before.launch_mode.trampoline_applied,
            has_steam_path: !steam_path.trim().is_empty(),
            steam_launch_options_supported: before.steam_launch_options_supported,
            payload: classify_payload(
                before.bepinex_installed,
                before.bpp_version.as_deref(),
                before.bundled_bpp_version.as_deref(),
            ),
            launch_mode_satisfied: before.launch_mode.expected_trampoline == requested_trampoline
                && before.launch_mode.trampoline_applied == requested_trampoline,
        };
        let mut effects = ProductionInstallEffects {
            app: task_app.clone(),
            steam_path,
            game_path: request.game_path.clone(),
        };

        execute_and_refresh(facts, &mut effects, || {
            let installer_state = task_app.state::<InstallerContextState>();
            build_install_state_raw(task_app.clone(), installer_state, Some(request.game_path))
        })
    })
    .await
    .map_err(|error| {
        install_action_problem("install", format!("failed to run install task: {error}"))
    })?
    .map_err(|diagnostic| install_action_problem("install", diagnostic))
}

trait InstallEffects {
    fn execute(&mut self, effect: InstallEffect) -> Result<(), String>;
}

struct ProductionInstallEffects {
    app: tauri::AppHandle,
    steam_path: String,
    game_path: String,
}

impl InstallEffects for ProductionInstallEffects {
    fn execute(&mut self, effect: InstallEffect) -> Result<(), String> {
        let steam = Path::new(&self.steam_path);
        let game = Path::new(&self.game_path);
        match effect {
            InstallEffect::CloseSteam => prepare_steam_for_launch_option_update(steam, false),
            InstallEffect::InstallBepInEx => install_bepinex(
                self.app.clone(),
                self.steam_path.clone(),
                self.game_path.clone(),
            ),
            InstallEffect::InstallTrampoline => bepinex::install_trampoline(&self.app, game),
            InstallEffect::UninstallTrampoline => bepinex::uninstall_trampoline(game),
            InstallEffect::WriteLaunchModeMarker(mode) => {
                bepinex::write_launch_mode_marker(game, mode)
            }
            InstallEffect::ClearLaunchOptions => clear_launch_options_for_steam(steam),
            InstallEffect::PatchLaunchOptions => patch_launch_options(
                self.app.clone(),
                self.steam_path.clone(),
                self.game_path.clone(),
            )
            .map(|_| ()),
        }
    }
}

fn execute_and_refresh<T>(
    facts: InstallPlanInputs,
    effects: &mut impl InstallEffects,
    refresh: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    for effect in plan_install(facts) {
        effects.execute(effect)?;
    }
    refresh()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::launch_mode::LaunchMode;

    #[derive(Default)]
    struct Recorder {
        effects: Vec<InstallEffect>,
        fail_on: Option<InstallEffect>,
    }

    impl InstallEffects for Recorder {
        fn execute(&mut self, effect: InstallEffect) -> Result<(), String> {
            self.effects.push(effect);
            if self.fail_on == Some(effect) {
                return Err("effect failed".to_string());
            }
            Ok(())
        }
    }

    fn facts(
        requested: LaunchMode,
        was_trampolined: bool,
        has_steam_path: bool,
        steam_launch_options_supported: bool,
    ) -> InstallPlanInputs {
        InstallPlanInputs {
            requested,
            was_trampolined,
            has_steam_path,
            steam_launch_options_supported,
            payload: PayloadState::Missing,
            launch_mode_satisfied: false,
        }
    }

    #[test]
    fn payload_classification_covers_fresh_missing_changed_and_current() {
        for (installed, installed_version, bundled_version, expected) in [
            (false, None, Some("2"), PayloadState::Missing),
            (true, None, Some("2"), PayloadState::Missing),
            (true, Some("1"), Some("2"), PayloadState::Changed),
            (true, Some("2"), Some("2"), PayloadState::Current),
            (true, Some("2"), None, PayloadState::Current),
        ] {
            assert_eq!(
                classify_payload(installed, installed_version, bundled_version),
                expected
            );
        }
    }

    #[test]
    fn complete_install_records_prefix_effects_then_returns_refreshed_outcome() {
        let mut recorder = Recorder::default();

        let outcome = execute_and_refresh(
            facts(LaunchMode::Prefix, false, true, true),
            &mut recorder,
            || Ok("state read back from disk"),
        );

        assert_eq!(outcome.unwrap(), "state read back from disk");
        assert_eq!(
            recorder.effects,
            vec![
                InstallEffect::InstallBepInEx,
                InstallEffect::PatchLaunchOptions,
                InstallEffect::WriteLaunchModeMarker(LaunchMode::Prefix),
            ]
        );
    }

    #[test]
    fn complete_install_records_trampoline_and_downgrade_effects() {
        let scenarios = [
            (
                facts(LaunchMode::Trampoline, false, true, true),
                vec![
                    InstallEffect::CloseSteam,
                    InstallEffect::InstallBepInEx,
                    InstallEffect::InstallTrampoline,
                    InstallEffect::WriteLaunchModeMarker(LaunchMode::Trampoline),
                    InstallEffect::ClearLaunchOptions,
                ],
            ),
            (
                facts(LaunchMode::Prefix, true, true, true),
                vec![
                    InstallEffect::CloseSteam,
                    InstallEffect::InstallBepInEx,
                    InstallEffect::UninstallTrampoline,
                    InstallEffect::PatchLaunchOptions,
                    InstallEffect::WriteLaunchModeMarker(LaunchMode::Prefix),
                ],
            ),
        ];

        for (facts, expected) in scenarios {
            let mut recorder = Recorder::default();
            execute_and_refresh(facts, &mut recorder, || Ok(())).unwrap();
            assert_eq!(recorder.effects, expected);
        }
    }

    #[test]
    fn install_operation_covers_fresh_changed_current_and_mode_repair_states() {
        let mut fresh = facts(LaunchMode::Prefix, false, false, false);
        fresh.payload = PayloadState::Missing;
        let mut changed = facts(LaunchMode::Prefix, false, false, false);
        changed.payload = PayloadState::Changed;
        let mut no_op = facts(LaunchMode::Prefix, false, false, false);
        no_op.payload = PayloadState::Current;
        no_op.launch_mode_satisfied = true;
        let mut mode_repair = facts(LaunchMode::Trampoline, false, false, false);
        mode_repair.payload = PayloadState::Current;

        for scenario in [fresh, changed] {
            let mut recorder = Recorder::default();
            execute_and_refresh(scenario, &mut recorder, || Ok(())).unwrap();
            assert!(recorder.effects.contains(&InstallEffect::InstallBepInEx));
        }

        let mut recorder = Recorder::default();
        execute_and_refresh(no_op, &mut recorder, || Ok(())).unwrap();
        assert!(recorder.effects.is_empty());

        let mut recorder = Recorder::default();
        execute_and_refresh(mode_repair, &mut recorder, || Ok(())).unwrap();
        assert!(!recorder.effects.contains(&InstallEffect::InstallBepInEx));
        assert!(recorder.effects.contains(&InstallEffect::InstallTrampoline));
    }

    #[test]
    fn complete_install_stops_on_first_error_and_does_not_refresh() {
        let mut recorder = Recorder {
            fail_on: Some(InstallEffect::PatchLaunchOptions),
            ..Recorder::default()
        };
        let mut refreshed = false;

        let error = execute_and_refresh(
            facts(LaunchMode::Prefix, false, true, true),
            &mut recorder,
            || {
                refreshed = true;
                Ok(())
            },
        )
        .unwrap_err();

        assert_eq!(error, "effect failed");
        assert!(!refreshed);
        assert_eq!(
            recorder.effects,
            vec![
                InstallEffect::InstallBepInEx,
                InstallEffect::PatchLaunchOptions
            ]
        );
    }
}
