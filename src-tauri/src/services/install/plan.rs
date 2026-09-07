//! Private install planner: turns gathered facts into ordered effects.
//! macOS has one bootstrap only: trampoline plus empty Steam launch options.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum InstallEffect {
    /// Refuse to modify an active game installation.
    EnsureGameStopped,
    /// Quit Steam only when its launch options need changing.
    CloseSteam,
    /// Extract the current BepInEx and BazaarPlusPlus payload.
    InstallBepInEx,
    /// Install or refresh the bundled trampoline and verify the signed bundle.
    InstallTrampoline,
    /// Remove every LaunchOptions entry for The Bazaar and verify the result.
    ClearLaunchOptions,
    /// Delete installer-owned files that are not part of the canonical bootstrap.
    RemoveObsoleteMacosArtifacts,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum PayloadState {
    Missing,
    Changed,
    Current,
}

#[derive(Debug, Clone, Copy)]
pub(super) struct InstallPlanInputs {
    pub requires_macos_bootstrap: bool,
    pub payload: PayloadState,
    pub bootstrap_satisfied: bool,
    pub launch_options_empty: bool,
}

pub(super) fn plan_install(inputs: InstallPlanInputs) -> Vec<InstallEffect> {
    if inputs.payload == PayloadState::Current && inputs.bootstrap_satisfied {
        return Vec::new();
    }

    let mut steps = Vec::new();
    if inputs.requires_macos_bootstrap {
        steps.push(InstallEffect::EnsureGameStopped);
        if !inputs.launch_options_empty {
            steps.push(InstallEffect::CloseSteam);
        }
    }
    if inputs.payload != PayloadState::Current {
        steps.push(InstallEffect::InstallBepInEx);
    }
    if inputs.requires_macos_bootstrap {
        steps.extend([
            InstallEffect::InstallTrampoline,
            InstallEffect::RemoveObsoleteMacosArtifacts,
        ]);
        if !inputs.launch_options_empty {
            steps.push(InstallEffect::ClearLaunchOptions);
        }
    }
    steps
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn empty_launch_options_keep_steam_running_for_install_update_and_repair() {
        for payload in [
            PayloadState::Missing,
            PayloadState::Changed,
            PayloadState::Current,
        ] {
            let steps = plan_install(InstallPlanInputs {
                requires_macos_bootstrap: true,
                payload,
                bootstrap_satisfied: false,
                launch_options_empty: true,
            });
            assert_eq!(steps.first(), Some(&InstallEffect::EnsureGameStopped));
            assert!(!steps.contains(&InstallEffect::CloseSteam));
            assert!(!steps.contains(&InstallEffect::ClearLaunchOptions));
            assert!(steps.contains(&InstallEffect::InstallTrampoline));
            assert_eq!(
                steps.contains(&InstallEffect::InstallBepInEx),
                payload != PayloadState::Current
            );
        }
    }
    #[test]
    fn legacy_launch_options_require_steam_exit_before_mutation() {
        let steps = plan_install(InstallPlanInputs {
            requires_macos_bootstrap: true,
            payload: PayloadState::Missing,
            bootstrap_satisfied: false,
            launch_options_empty: false,
        });
        assert_eq!(
            steps,
            vec![
                InstallEffect::EnsureGameStopped,
                InstallEffect::CloseSteam,
                InstallEffect::InstallBepInEx,
                InstallEffect::InstallTrampoline,
                InstallEffect::RemoveObsoleteMacosArtifacts,
                InstallEffect::ClearLaunchOptions
            ]
        );
    }
    #[test]
    fn current_install_is_noop_and_windows_only_updates_payload() {
        assert!(plan_install(InstallPlanInputs {
            requires_macos_bootstrap: true,
            payload: PayloadState::Current,
            bootstrap_satisfied: true,
            launch_options_empty: true
        })
        .is_empty());
        assert_eq!(
            plan_install(InstallPlanInputs {
                requires_macos_bootstrap: false,
                payload: PayloadState::Missing,
                bootstrap_satisfied: true,
                launch_options_empty: true
            }),
            vec![InstallEffect::InstallBepInEx]
        );
    }
}
