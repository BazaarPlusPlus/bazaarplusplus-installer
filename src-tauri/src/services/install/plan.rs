//! Pure install planner: turns the facts gathered before `spawn_blocking`
//! into the exact ordered effect sequence `run_install` executes.
//!
//! ORDER IS THE OUTPUT. The three load-bearing ordering constraints —
//! (i) marker-before-Steam-clear, (ii) close-Steam-only-on-mode-switch,
//! (iii) prefix-marker-last — are encoded in the sequence this function
//! returns and pinned by the table tests below: any *planner* reorder fails
//! a scenario-named test row plus the positional invariant sweep. The
//! executor (`execute_install_step` in mod.rs) is orderless and carries no
//! branching; its per-arm argument literals (e.g. `prepare_steam(.., false)`)
//! are comment-guarded only — the accepted residual risk of a zero-mock
//! design, identical to master's exposure.

use crate::services::launch_mode::LaunchMode;

/// One effect in an install run. Each variant maps 1:1 to exactly one
/// existing effect call in `execute_install_step` — no variant may fan out
/// to multiple effects or grow conditionals in the executor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum InstallStep {
    /// `prepare_steam_for_launch_option_update(steam, /*skip_shutdown=*/false)`
    /// — quits Steam and polls until gone (steam.rs:136). Internal no-op `Ok`
    /// when `<steam>/userdata` is missing (steam.rs:140-146). The `false`
    /// literal is load-bearing: `true` silently skips the shutdown.
    CloseSteam,
    /// `install_bepinex(app, steam, game)` — payload extraction, self-rolls-
    /// back via `install_backup.restore` on failure (bepinex/mod.rs:118-192).
    /// Unconditional in every plan (present in both master branches).
    InstallBepInEx,
    /// `bepinex::install_trampoline(&app, game)` — bundle swap + sign + seal,
    /// self-restores vanilla on failure (trampoline.rs:362-445). IDEMPOTENT:
    /// on an already-trampolined bundle it is the re-seal/repair path
    /// (trampoline.rs:385-391), which is why trampoline-mode plans never
    /// consult `was_trampolined`. Non-macOS stub is `Ok(())`.
    InstallTrampoline,
    /// `bepinex::uninstall_trampoline(game)` — restore vanilla + reseal
    /// (trampoline.rs:447-472). Only on a trampoline→prefix mode switch.
    UninstallTrampoline,
    /// `bepinex::write_launch_mode_marker(game, mode)` (trampoline.rs:33-44).
    /// The plan's POSITION of this step is the ordering contract: trampoline
    /// plans persist the DESIRED mode as soon as the bundle is trampolined
    /// (before the fallible Steam clear, constraint (i)); prefix plans record
    /// the ACHIEVED mode last (constraint (iii)).
    WriteLaunchModeMarker(LaunchMode),
    /// `clear_launch_options_for_steam(steam)` — trampoline mode needs the
    /// empty/vanilla launch line (launch_options.rs:197). NOT gated on
    /// `steam_launch_options_supported` (parity with master :75-77; it
    /// no-ops internally when userdata is absent).
    ClearLaunchOptions,
    /// `patch_launch_options(app, steam, game)` — writes
    /// `"…run_bepinex.sh" %command%`. Executor keeps the discard-Ok shape:
    /// `Ok(verified:false)` is NOT an error, a hard `Err` still aborts —
    /// exactly master's `let _ = …?` (install/mod.rs:93-99). No output
    /// channel for `verified` is provided; deliberately not anticipated.
    PatchLaunchOptions,
}

/// Every fact the planner needs. Plain data — no paths, no handles, no IO.
/// Each field's single gathering site already exists pre-spawn on master
/// (A2–A6); PR 2 adds zero new IO.
#[derive(Debug, Clone, Copy)]
pub(super) struct InstallPlanInputs {
    /// INSTALL-TIME intent from PR 1:
    /// `LaunchModeGate::current().requested_mode(compat_opt_in)`.
    /// The planner never re-derives it (launch_mode.rs owns the gate).
    pub requested: LaunchMode,
    /// Live bundle probe before any mutation:
    /// `bepinex::is_trampolined(game).unwrap_or(false)` (fail-safe false).
    /// HISTORY of the bundle — distinct from `requested` (intent) and the
    /// detect marker (recorded mode); drives the mode-switch steps only.
    pub was_trampolined: bool,
    /// `!steam_path.trim().is_empty()` — Steam located at all. Deliberately
    /// independent of `steam_launch_options_supported` (a steam path without
    /// `userdata/` still enters the Steam-step gates, which no-op internally
    /// — fact map §8e).
    pub has_steam_path: bool,
    /// `before.steam_launch_options_supported` (startup-cached). Gates ONLY
    /// `PatchLaunchOptions`, mirroring master install/mod.rs:93.
    pub steam_launch_options_supported: bool,
}

/// Pure. Returns the exact ordered effect list; the executor runs it
/// front-to-back and returns on the first `Err` (identical propagation to
/// master's straight-line `?`s).
pub(super) fn plan_install(inputs: InstallPlanInputs) -> Vec<InstallStep> {
    let mut steps = Vec::new();
    match inputs.requested {
        LaunchMode::Trampoline => {
            // Trampoline mode MUTATES the .app and needs a reliable localconfig
            // clear -> Steam MUST be closed.                       [moved: (iv)]
            if inputs.has_steam_path {
                steps.push(InstallStep::CloseSteam);
            }
            steps.push(InstallStep::InstallBepInEx);
            steps.push(InstallStep::InstallTrampoline);
            // Persist the desired mode AS SOON AS the bundle is trampolined, before
            // the Steam step below — otherwise a clear-launch-options failure would
            // leave a trampolined bundle with no marker, which a later detect would
            // mislabel as `trampoline_reverted` on macOS <= 26.    [moved: (i)]
            steps.push(InstallStep::WriteLaunchModeMarker(LaunchMode::Trampoline));
            // LaunchOptions are driven by the MODE: trampoline => cleared (the
            // empty/vanilla launch the stub needs).                [moved]
            if inputs.has_steam_path {
                steps.push(InstallStep::ClearLaunchOptions);
            }
        }
        LaunchMode::Prefix => {
            // Prefix mode. Close Steam ONLY to un-apply a previous trampoline (mode
            // switch); a plain <= 26 prefix install keeps today's behavior exactly
            // (Steam stays up; patch_launch_options does its own prepare(.., true)).
            //                                                      [moved: (ii)]
            if inputs.was_trampolined && inputs.has_steam_path {
                steps.push(InstallStep::CloseSteam);
            }
            steps.push(InstallStep::InstallBepInEx);
            if inputs.was_trampolined {
                steps.push(InstallStep::UninstallTrampoline);
            }
            if inputs.steam_launch_options_supported && inputs.has_steam_path {
                steps.push(InstallStep::PatchLaunchOptions);
            }
            // The marker records the ACHIEVED mode, mirroring the trampoline
            // branch's rule from the other side: written LAST, after the fallible
            // patch step — an earlier failure leaves no marker and a later detect
            // correctly reads desired=prefix.
            // [NEW comment — master pinned (iii) only structurally at :100;
            //  authored text, reviewer-verified against fact map §2(iii)]
            steps.push(InstallStep::WriteLaunchModeMarker(LaunchMode::Prefix));
        }
    }
    steps
}

#[cfg(test)]
mod tests {
    use super::{plan_install, InstallPlanInputs, InstallStep};
    use crate::services::launch_mode::LaunchMode;
    use InstallStep::*;

    fn inputs(
        requested: LaunchMode,
        was_trampolined: bool,
        has_steam_path: bool,
        supported: bool,
    ) -> InstallPlanInputs {
        InstallPlanInputs {
            requested,
            was_trampolined,
            has_steam_path,
            steam_launch_options_supported: supported,
        }
    }

    #[test]
    fn test_plan_matrix_named_after_fact_map_scenarios() {
        use LaunchMode::{Prefix, Trampoline};
        // Rows with identical plans ((a)==(b)==(f)==(g), (d)==plain-prefix) are
        // DELIBERATE documentation of distinct scenarios — do not collapse them;
        // the names are the spec.
        for (name, req, was, steam, sup, want) in [
            (
                "(a) macos27 fresh trampoline install, Steam present",
                Trampoline,
                false,
                true,
                true,
                vec![
                    CloseSteam,
                    InstallBepInEx,
                    InstallTrampoline,
                    WriteLaunchModeMarker(Trampoline),
                    ClearLaunchOptions,
                ],
            ),
            (
                "(b) macos26 opt-in trampoline == (a): OS gate resolved upstream in launch_mode",
                Trampoline,
                false,
                true,
                true,
                vec![
                    CloseSteam,
                    InstallBepInEx,
                    InstallTrampoline,
                    WriteLaunchModeMarker(Trampoline),
                    ClearLaunchOptions,
                ],
            ),
            (
                "(c) macos26 mode-switch downgrade: Steam closed ONLY because was_trampolined; \
                 marker moves to LAST (constraints ii + iii)",
                Prefix,
                true,
                true,
                true,
                vec![
                    CloseSteam,
                    InstallBepInEx,
                    UninstallTrampoline,
                    PatchLaunchOptions,
                    WriteLaunchModeMarker(Prefix),
                ],
            ),
            (
                "plain macos26 prefix install keeps Steam UP (constraint ii converse)",
                Prefix,
                false,
                true,
                true,
                vec![
                    InstallBepInEx,
                    PatchLaunchOptions,
                    WriteLaunchModeMarker(Prefix),
                ],
            ),
            (
                "(d) windows prefix install == plain prefix: patch step still planned, \
                 empty-args short-circuit lives in the effect, not the planner",
                Prefix,
                false,
                true,
                true,
                vec![
                    InstallBepInEx,
                    PatchLaunchOptions,
                    WriteLaunchModeMarker(Prefix),
                ],
            ),
            (
                "(e) trampoline, steam path present but launch options unsupported: \
                 Steam steps STILL planned (clear is NOT gated on supported; they early-Ok internally)",
                Trampoline,
                false,
                true,
                false,
                vec![
                    CloseSteam,
                    InstallBepInEx,
                    InstallTrampoline,
                    WriteLaunchModeMarker(Trampoline),
                    ClearLaunchOptions,
                ],
            ),
            (
                "(e') prefix without launch-option support: patch dropped, marker still last",
                Prefix,
                false,
                true,
                false,
                vec![InstallBepInEx, WriteLaunchModeMarker(Prefix)],
            ),
            (
                "(f) == (a): install_trampoline mid-failure aborts BEFORE the marker step \
                 by plan POSITION; recovery is detect-driven (needs_trampoline_repair, PR 1)",
                Trampoline,
                false,
                true,
                true,
                vec![
                    CloseSteam,
                    InstallBepInEx,
                    InstallTrampoline,
                    WriteLaunchModeMarker(Trampoline),
                    ClearLaunchOptions,
                ],
            ),
            (
                "(g) repair/reinstall over healthy trampoline: was_trampolined IGNORED in \
                 trampoline mode (install_trampoline is the idempotent re-seal path)",
                Trampoline,
                true,
                true,
                true,
                vec![
                    CloseSteam,
                    InstallBepInEx,
                    InstallTrampoline,
                    WriteLaunchModeMarker(Trampoline),
                    ClearLaunchOptions,
                ],
            ),
            (
                "no Steam at all, trampoline: pure filesystem plan",
                Trampoline,
                false,
                false,
                true,
                vec![
                    InstallBepInEx,
                    InstallTrampoline,
                    WriteLaunchModeMarker(Trampoline),
                ],
            ),
            (
                "no Steam at all, prefix downgrade: trampoline still un-applied",
                Prefix,
                true,
                false,
                true,
                vec![
                    InstallBepInEx,
                    UninstallTrampoline,
                    WriteLaunchModeMarker(Prefix),
                ],
            ),
        ] {
            assert_eq!(plan_install(inputs(req, was, steam, sup)), want, "{name}");
        }
    }

    #[test]
    fn test_ordering_constraints_hold_for_every_input_combination() {
        use LaunchMode::{Prefix, Trampoline};
        for requested in [Trampoline, Prefix] {
            for was in [false, true] {
                for steam in [false, true] {
                    for sup in [false, true] {
                        let plan = plan_install(inputs(requested, was, steam, sup));
                        let pos = |s: &InstallStep| plan.iter().position(|x| x == s);
                        // marker: exactly once, and it echoes `requested`
                        let marker = pos(&WriteLaunchModeMarker(requested))
                            .expect("every plan persists the requested mode");
                        assert_eq!(
                            plan.iter()
                                .filter(|s| matches!(s, WriteLaunchModeMarker(_)))
                                .count(),
                            1
                        );
                        // (i) marker BEFORE the fallible Steam clear
                        if let Some(clear) = pos(&ClearLaunchOptions) {
                            assert!(
                                marker < clear,
                                "marker-before-clear: {requested:?}/{was}/{steam}/{sup}"
                            );
                        }
                        // (iii) prefix marker is the LAST step
                        if requested == Prefix {
                            assert_eq!(marker, plan.len() - 1, "prefix-marker-last");
                        }
                        // (ii) Steam closed iff trampoline mutation or mode switch —
                        // NOTE: re-states the planner's gate (drift pin, not an
                        // independent oracle; the exact-Vec rows above are the
                        // hand-verified-against-master pins).
                        let expect_close = steam && (requested == Trampoline || was);
                        assert_eq!(
                            pos(&CloseSteam).is_some(),
                            expect_close,
                            "close-steam-only-when-needed"
                        );
                        // CloseSteam, when present, is always the FIRST effect
                        if expect_close {
                            assert_eq!(pos(&CloseSteam), Some(0));
                        }
                        // InstallBepInEx present in every plan, before any bundle step
                        let payload = pos(&InstallBepInEx).expect("payload always installed");
                        for bundle in [pos(&InstallTrampoline), pos(&UninstallTrampoline)]
                            .into_iter()
                            .flatten()
                        {
                            assert!(payload < bundle);
                        }
                    }
                }
            }
        }
    }
}
