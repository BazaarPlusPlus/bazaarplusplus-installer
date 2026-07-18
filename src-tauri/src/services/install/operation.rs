use std::path::Path;

use tauri::Manager;

use super::plan::{plan_install, InstallEffect, InstallPlanInputs};
use super::{build_install_state, InstallState};
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

pub(crate) async fn install(
    app: tauri::AppHandle,
    request: InstallRequest,
) -> Result<InstallState, String> {
    let task_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let installer_state = task_app.state::<InstallerContextState>();
        let before = detect_for_install(
            task_app.clone(),
            installer_state,
            Some(request.game_path.clone()),
        )?;
        let steam_path = before.steam_path.clone().unwrap_or_default();
        let facts = InstallPlanInputs {
            requested: LaunchModeGate::current().requested_mode(request.compat_opt_in),
            was_trampolined: bepinex::is_trampolined(Path::new(&request.game_path))
                .unwrap_or(false),
            has_steam_path: !steam_path.trim().is_empty(),
            steam_launch_options_supported: before.steam_launch_options_supported,
        };
        let mut effects = ProductionInstallEffects {
            app: task_app.clone(),
            steam_path,
            game_path: request.game_path.clone(),
        };

        execute_and_refresh(facts, &mut effects, || {
            let installer_state = task_app.state::<InstallerContextState>();
            build_install_state(task_app.clone(), installer_state, Some(request.game_path))
        })
    })
    .await
    .map_err(|error| format!("failed to run install task: {error}"))?
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
    fn every_install_attempts_payload_even_without_steam_or_on_repair() {
        for facts in [
            facts(LaunchMode::Prefix, false, false, false),
            facts(LaunchMode::Prefix, true, false, false),
            facts(LaunchMode::Trampoline, true, false, false),
        ] {
            let mut recorder = Recorder::default();
            execute_and_refresh(facts, &mut recorder, || Ok(())).unwrap();
            assert!(recorder.effects.contains(&InstallEffect::InstallBepInEx));
        }
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
