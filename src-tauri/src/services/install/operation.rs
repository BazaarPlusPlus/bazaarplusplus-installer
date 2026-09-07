use std::path::Path;

use tauri::Manager;

use super::plan::{plan_install, InstallEffect, InstallPlanInputs, PayloadState};
use super::{build_install_state_raw, install_action_problem, InstallState};
use crate::problem::SemanticProblem;
use crate::services::{
    bepinex::{self, install_bepinex},
    detect::detect_for_install,
    startup::InstallerContextState,
    steam::prepare_steam_for_config_update,
    vdf::{clear_launch_options_for_steam, SteamLaunchOptionsState},
};

pub(crate) struct InstallRequest {
    pub(crate) game_path: String,
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
        let requires_macos_bootstrap = cfg!(target_os = "macos");
        if requires_macos_bootstrap
            && (steam_path.trim().is_empty()
                || before.steam_launch_options == SteamLaunchOptionsState::Unavailable)
        {
            return Err(
                "Steam localconfig.vdf is unavailable; start Steam once, close it, and retry."
                    .to_string(),
            );
        }
        let facts = InstallPlanInputs {
            launch_options_empty: before.steam_launch_options == SteamLaunchOptionsState::Empty,
            requires_macos_bootstrap,
            payload: classify_payload(
                before.bepinex_installed,
                before.bpp_version.as_deref(),
                before.bundled_bpp_version.as_deref(),
            ),
            bootstrap_satisfied: !requires_macos_bootstrap
                || (before.trampoline_current
                    && before.steam_launch_options == SteamLaunchOptionsState::Empty
                    && !before.obsolete_macos_artifacts_present),
        };
        let mut effects = ProductionInstallEffects {
            resource_dir: task_app
                .path()
                .resource_dir()
                .map_err(|err| err.to_string())?,
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
    resource_dir: std::path::PathBuf,
    steam_path: String,
    game_path: String,
}

impl InstallEffects for ProductionInstallEffects {
    fn execute(&mut self, effect: InstallEffect) -> Result<(), String> {
        let steam = Path::new(&self.steam_path);
        let game = Path::new(&self.game_path);
        match effect {
            InstallEffect::EnsureGameStopped => {
                crate::services::game_process::ensure_bazaar_stopped(game)
            }
            InstallEffect::CloseSteam => prepare_steam_for_config_update(steam),
            InstallEffect::InstallBepInEx => install_bepinex(&self.resource_dir, game),
            InstallEffect::InstallTrampoline => {
                bepinex::install_trampoline(&self.resource_dir, game)
            }
            InstallEffect::ClearLaunchOptions => clear_launch_options_for_steam(steam),
            InstallEffect::RemoveObsoleteMacosArtifacts => {
                bepinex::remove_obsolete_macos_artifacts(game)
            }
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

    fn facts(payload: PayloadState, bootstrap_satisfied: bool) -> InstallPlanInputs {
        InstallPlanInputs {
            requires_macos_bootstrap: true,
            payload,
            bootstrap_satisfied,
            launch_options_empty: false,
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
    fn complete_install_records_one_macos_bootstrap_then_returns_refreshed_outcome() {
        let mut recorder = Recorder::default();

        let outcome =
            execute_and_refresh(facts(PayloadState::Missing, false), &mut recorder, || {
                Ok("state read back from disk")
            });

        assert_eq!(outcome.unwrap(), "state read back from disk");
        assert_eq!(
            recorder.effects,
            vec![
                InstallEffect::EnsureGameStopped,
                InstallEffect::CloseSteam,
                InstallEffect::InstallBepInEx,
                InstallEffect::InstallTrampoline,
                InstallEffect::RemoveObsoleteMacosArtifacts,
                InstallEffect::ClearLaunchOptions,
            ]
        );
    }

    #[test]
    fn install_operation_covers_fresh_changed_current_and_bootstrap_repair_states() {
        let fresh = facts(PayloadState::Missing, false);
        let changed = facts(PayloadState::Changed, false);
        let no_op = facts(PayloadState::Current, true);
        let bootstrap_repair = facts(PayloadState::Current, false);

        for scenario in [fresh, changed] {
            let mut recorder = Recorder::default();
            execute_and_refresh(scenario, &mut recorder, || Ok(())).unwrap();
            assert!(recorder.effects.contains(&InstallEffect::InstallBepInEx));
        }

        let mut recorder = Recorder::default();
        execute_and_refresh(no_op, &mut recorder, || Ok(())).unwrap();
        assert!(recorder.effects.is_empty());

        let mut recorder = Recorder::default();
        execute_and_refresh(bootstrap_repair, &mut recorder, || Ok(())).unwrap();
        assert!(!recorder.effects.contains(&InstallEffect::InstallBepInEx));
        assert!(recorder.effects.contains(&InstallEffect::InstallTrampoline));
    }

    #[test]
    fn complete_install_stops_on_first_error_and_does_not_refresh() {
        let mut recorder = Recorder {
            fail_on: Some(InstallEffect::ClearLaunchOptions),
            ..Recorder::default()
        };
        let mut refreshed = false;

        let error = execute_and_refresh(facts(PayloadState::Missing, false), &mut recorder, || {
            refreshed = true;
            Ok(())
        })
        .unwrap_err();

        assert_eq!(error, "effect failed");
        assert!(!refreshed);
        assert_eq!(
            recorder.effects,
            vec![
                InstallEffect::EnsureGameStopped,
                InstallEffect::CloseSteam,
                InstallEffect::InstallBepInEx,
                InstallEffect::InstallTrampoline,
                InstallEffect::RemoveObsoleteMacosArtifacts,
                InstallEffect::ClearLaunchOptions,
            ]
        );
    }
}

#[cfg(all(test, target_os = "macos"))]
mod fresh_install_acceptance {
    use super::*;
    use std::io::Read;
    use std::process::Command;

    fn run(command: &mut Command) {
        let output = command.output().expect("run native tool");
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    // All filesystem effects are production effects. Only Steam shutdown is
    // intercepted so a regression cannot close the developer's Steam session.
    struct KeepSteamRunning(ProductionInstallEffects);
    impl InstallEffects for KeepSteamRunning {
        fn execute(&mut self, effect: InstallEffect) -> Result<(), String> {
            assert_ne!(
                effect,
                InstallEffect::CloseSteam,
                "fresh install attempted to quit Steam"
            );
            self.0.execute(effect)
        }
    }

    #[test]
    #[ignore = "requires packaged macOS payload: set BPP_ACCEPTANCE_RESOURCE_DIR and run explicitly"]
    fn fresh_install_writes_payload_and_signed_trampoline_without_quitting_steam() {
        let resources = std::path::PathBuf::from(
            std::env::var("BPP_ACCEPTANCE_RESOURCE_DIR").expect("resource directory required"),
        );
        assert!(resources.join("BepInExSource/BepInEx.zip").is_file());
        assert!(resources.join("Trampoline/bpp_launcher").is_file());
        let temporary = tempfile::tempdir().unwrap();
        let game = temporary.path().join("The Bazaar");
        let bundle = game.join("TheBazaar.app");
        let macos = bundle.join("Contents/MacOS");
        let frameworks = bundle.join("Contents/Frameworks");
        std::fs::create_dir_all(&macos).unwrap();
        std::fs::create_dir_all(&frameworks).unwrap();
        std::fs::write(bundle.join("Contents/Info.plist"), r#"<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>The Bazaar</string><key>CFBundleIdentifier</key><string>com.bpp.acceptance.fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>"#).unwrap();
        let library_source = temporary.path().join("unity.c");
        let main_source = temporary.path().join("main.c");
        std::fs::write(&library_source, "int fixture_unity(void) { return 0; }").unwrap();
        std::fs::write(
            &main_source,
            "extern int fixture_unity(void); int main(void) { return fixture_unity(); }",
        )
        .unwrap();
        let library = frameworks.join("UnityPlayer.dylib");
        let executable = macos.join("The Bazaar");
        run(Command::new("clang")
            .args([
                "-arch",
                "arm64",
                "-dynamiclib",
                "-install_name",
                "@executable_path/../Frameworks/UnityPlayer.dylib",
            ])
            .arg(&library_source)
            .arg("-o")
            .arg(&library));
        run(Command::new("clang")
            .args(["-arch", "arm64"])
            .arg(&main_source)
            .arg(&library)
            .arg("-o")
            .arg(&executable));
        run(Command::new("codesign")
            .args(["--force", "--sign", "-"])
            .arg(&library));
        run(Command::new("codesign")
            .args(["--force", "--sign", "-"])
            .arg(&bundle));

        let steam = temporary.path().join("Steam");
        let config = steam.join("userdata/123/config/localconfig.vdf");
        std::fs::create_dir_all(config.parent().unwrap()).unwrap();
        let original_config = r#""UserLocalConfigStore"
{
    "Software"
    {
        "Valve"
        {
            "Steam"
            {
                "apps"
                {
                    "1617400"
                    {
                        "LaunchOptions" ""
                    }
                }
            }
        }
    }
}
"#;
        std::fs::write(&config, original_config).unwrap();
        let options = crate::services::vdf::inspect_launch_options_for_steam(&steam);
        assert_eq!(options, SteamLaunchOptionsState::Empty);
        assert!(!game.join("BepInEx").exists());
        assert!(!macos.join("The Bazaar.orig").exists());
        let facts = InstallPlanInputs {
            requires_macos_bootstrap: true,
            payload: classify_payload(false, None, Some("packaged")),
            bootstrap_satisfied: false,
            launch_options_empty: options == SteamLaunchOptionsState::Empty,
        };
        let mut effects = KeepSteamRunning(ProductionInstallEffects {
            resource_dir: resources.clone(),
            steam_path: steam.to_string_lossy().into_owned(),
            game_path: game.to_string_lossy().into_owned(),
        });
        execute_and_refresh(facts, &mut effects, || {
            let mut archive = zip::ZipArchive::new(
                std::fs::File::open(resources.join("BepInExSource/BepInEx.zip")).unwrap(),
            )
            .unwrap();
            let mut verified_files = 0;
            for index in 0..archive.len() {
                let mut entry = archive.by_index(index).unwrap();
                if entry.is_dir() {
                    continue;
                }
                let path = game.join(entry.enclosed_name().expect("safe packaged path"));
                let mut expected = Vec::new();
                entry.read_to_end(&mut expected).unwrap();
                assert_eq!(
                    std::fs::read(&path).unwrap(),
                    expected,
                    "payload mismatch: {}",
                    path.display()
                );
                verified_files += 1;
            }
            assert!(verified_files > 0);
            eprintln!("Verified all {verified_files} packaged files byte-for-byte.");
            assert!(game.join("BepInEx/core/BepInEx.Preloader.dll").is_file());
            assert!(game.join("BepInEx/plugins/BazaarPlusPlus.dll").is_file());
            assert!(game.join("libdoorstop.dylib").is_file());
            assert!(macos.join("The Bazaar.orig").is_file());
            assert_eq!(std::fs::read_to_string(&config).unwrap(), original_config);
            assert!(!config.with_extension("vdf.bak").exists());
            run(Command::new("codesign")
                .args(["--verify", "--deep", "--strict"])
                .arg(&bundle));
            let installed_uuid = Command::new("dwarfdump")
                .arg("--uuid")
                .arg(&executable)
                .output()
                .unwrap();
            let bundled_uuid = Command::new("dwarfdump")
                .arg("--uuid")
                .arg(resources.join("Trampoline/bpp_launcher"))
                .output()
                .unwrap();
            assert_eq!(
                String::from_utf8_lossy(&installed_uuid.stdout)
                    .split_whitespace()
                    .nth(1),
                String::from_utf8_lossy(&bundled_uuid.stdout)
                    .split_whitespace()
                    .nth(1)
            );
            Ok(())
        })
        .unwrap();
        eprintln!("Fresh install passed: packaged payload, .orig preservation, trampoline UUID, deep signature, unchanged Steam config; temporary directory removed on exit.");
    }
}
