//! macOS launch-mode state: every launch-mode DECISION in one place.
//!
//! Two different questions get asked and MUST NOT be merged (they share the
//! forced-by-OS disjunct but differ in the second operand):
//! * DETECT-TIME — [`LaunchModeState::expected_trampoline`]: forced by the OS
//!   gate, OR recorded in the `.bpp-launch-mode` marker. Reads HISTORY.
//!   Compared against the live bundle probe to detect a Steam "Verify
//!   integrity" revert (ADR-003: reinstall is the repair path).
//! * INSTALL-TIME — [`LaunchModeGate::requested_mode`]: forced by the OS gate,
//!   OR the user's live 兼容模式 checkbox. Reads INTENT. On macOS <= 26 they
//!   can diverge (marker says Trampoline, user unchecks the box) — that is a
//!   mode switch, not a bug.
//!
//! All IO (marker read/write in `bepinex::trampoline`, bundle probe via
//! `bepinex::is_trampolined`) stays at the edges and is passed in as data.

/// macOS 27 and later require the trampoline launch path.
pub(crate) const TRAMPOLINE_FORCED_MAJOR: u32 = 27;

/// Which launch mechanism an install applies. Persisted ONLY through
/// `bepinex::trampoline`'s marker functions as "trampoline"/"prefix" — do not
/// add a second persistence path for this codec.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LaunchMode {
    Trampoline,
    Prefix,
}

impl LaunchMode {
    /// Marker-file wire string. Stable on-disk contract.
    pub(crate) fn as_marker(self) -> &'static str {
        match self {
            LaunchMode::Trampoline => "trampoline",
            LaunchMode::Prefix => "prefix",
        }
    }

    /// Unknown or corrupt content is equivalent to a missing marker.
    pub(crate) fn from_marker(value: &str) -> Option<Self> {
        match value {
            "trampoline" => Some(LaunchMode::Trampoline),
            "prefix" => Some(LaunchMode::Prefix),
            _ => None,
        }
    }
}

/// The OS gate for launch-mode decisions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) enum LaunchModeGate {
    /// Not macOS: everything reduces to Prefix.
    Unsupported,
    /// macOS <= 26, or an unknown version: trampoline is an opt-in.
    OptIn,
    /// macOS 27+: trampoline is the only working launch path.
    Forced,
}

impl LaunchModeGate {
    /// Derive the gate from platform facts. An unknown macOS version preserves
    /// the safe opt-in default.
    pub(crate) fn from_platform(on_macos: bool, macos_major: Option<u32>) -> Self {
        if !on_macos {
            return Self::Unsupported;
        }

        if macos_major.is_some_and(|major| major >= TRAMPOLINE_FORCED_MAJOR) {
            Self::Forced
        } else {
            Self::OptIn
        }
    }

    /// The gate for the running process. This is this module's only impure
    /// function; tests use [`Self::from_platform`] instead.
    #[cfg(target_os = "macos")]
    pub(crate) fn current() -> Self {
        Self::from_platform(true, crate::services::macos_version::macos_major())
    }

    #[cfg(not(target_os = "macos"))]
    pub(crate) fn current() -> Self {
        Self::Unsupported
    }

    /// Select the mode requested for this install from the live checkbox.
    pub(crate) fn requested_mode(self, compat_opt_in: bool) -> LaunchMode {
        match self {
            Self::Forced => LaunchMode::Trampoline,
            Self::OptIn if compat_opt_in => LaunchMode::Trampoline,
            Self::Unsupported | Self::OptIn => LaunchMode::Prefix,
        }
    }

    pub(crate) fn forced(self) -> bool {
        self == Self::Forced
    }

    pub(crate) fn opt_in_available(self) -> bool {
        self == Self::OptIn
    }
}

/// Every launch-mode fact captured during one detection pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct LaunchModeState {
    pub gate: LaunchModeGate,
    /// DETECT-TIME: forced, or the marker recorded Trampoline. Missing/corrupt
    /// marker on <= 26 means prefix.
    pub expected_trampoline: bool,
    /// Live bundle probe, recomputed per detection. An error/no path is false.
    pub trampoline_applied: bool,
}

impl LaunchModeState {
    /// Build a snapshot from facts gathered at IO edges. The marker is read
    /// unconditionally, including when the OS gate is forced.
    pub(crate) fn from_facts(
        gate: LaunchModeGate,
        marker: Option<LaunchMode>,
        trampoline_applied: bool,
    ) -> Self {
        Self {
            gate,
            expected_trampoline: gate.forced() || marker == Some(LaunchMode::Trampoline),
            trampoline_applied,
        }
    }

    /// Whether the expected and applied launch modes agree.
    pub(crate) fn consistent(self) -> bool {
        self.expected_trampoline == self.trampoline_applied
    }

    /// Whether an installed mod needs launch-mode repair.
    pub(crate) fn needs_repair(self, installed: bool) -> bool {
        installed && !self.consistent()
    }

    pub(crate) fn forced(self) -> bool {
        self.gate.forced()
    }

    pub(crate) fn opt_in_available(self) -> bool {
        self.gate.opt_in_available()
    }
}

#[cfg(test)]
mod tests {
    use super::{LaunchMode, LaunchModeGate, LaunchModeState, TRAMPOLINE_FORCED_MAJOR};
    use LaunchMode::{Prefix, Trampoline};
    use LaunchModeGate::{Forced, OptIn, Unsupported};

    #[test]
    fn test_gate_from_platform_matrix() {
        for (name, on_macos, major, want) in [
            (
                "off-macos regardless of version",
                false,
                Some(27),
                Unsupported,
            ),
            ("off-macos no version", false, None, Unsupported),
            ("macos 27 forced", true, Some(27), Forced),
            ("macos 28 stays forced", true, Some(28), Forced),
            ("macos 26 opt-in", true, Some(26), OptIn),
            (
                "unparseable sw_vers -> opt-in safe default",
                true,
                None,
                OptIn,
            ),
        ] {
            assert_eq!(
                LaunchModeGate::from_platform(on_macos, major),
                want,
                "{name}"
            );
        }
    }

    #[test]
    fn test_requested_mode_reads_live_checkbox_not_marker() {
        for (name, gate, opt_in, want) in [
            (
                "27 forces trampoline even unchecked",
                Forced,
                false,
                Trampoline,
            ),
            ("27 checked", Forced, true, Trampoline),
            ("26 opt-in checked", OptIn, true, Trampoline),
            ("26 unchecked -> prefix", OptIn, false, Prefix),
            ("off-macos ignores the box", Unsupported, true, Prefix),
        ] {
            assert_eq!(gate.requested_mode(opt_in), want, "{name}");
        }
    }

    #[test]
    fn test_state_matrix_named_after_fact_map_scenarios() {
        // (name, gate, marker, applied) -> (expected, consistent, repair_when_installed)
        for (name, gate, marker, applied, exp, cons, rep) in [
            // healthy
            (
                "(a) macos27 healthy trampoline install",
                Forced,
                Some(Trampoline),
                true,
                true,
                true,
                false,
            ),
            (
                "(b) macos26 healthy opt-in trampoline",
                OptIn,
                Some(Trampoline),
                true,
                true,
                true,
                false,
            ),
            (
                "macos26 healthy prefix install",
                OptIn,
                Some(Prefix),
                false,
                false,
                true,
                false,
            ),
            (
                "macos26 fresh machine, no marker, vanilla",
                OptIn,
                None,
                false,
                false,
                true,
                false,
            ),
            (
                "(h) off-macos inert / Windows byte-identical",
                Unsupported,
                None,
                false,
                false,
                true,
                false,
            ),
            // Steam "Verify integrity" revert: bundle vanilla, marker survives outside .app
            (
                "(c) steam-verify revert on 27",
                Forced,
                Some(Trampoline),
                false,
                true,
                false,
                true,
            ),
            (
                "(c') steam-verify revert on 26 opt-in",
                OptIn,
                Some(Trampoline),
                false,
                true,
                false,
                true,
            ),
            // macOS 26 -> 27 upgrade after a prefix install: Forced overrides Prefix marker
            (
                "(d) os-upgrade 26->27 over prefix install",
                Forced,
                Some(Prefix),
                false,
                true,
                false,
                true,
            ),
            (
                "27 no marker still expects trampoline",
                Forced,
                None,
                false,
                true,
                false,
                true,
            ),
            // lost/corrupt marker while trampolined on <= 26: documented false-repair
            // (why the marker is written BEFORE the fallible Steam step, install/mod.rs)
            (
                "(f) lost marker on 26 with trampoline applied",
                OptIn,
                None,
                true,
                false,
                false,
                true,
            ),
        ] {
            let s = LaunchModeState::from_facts(gate, marker, applied);
            assert_eq!(s.expected_trampoline, exp, "expected: {name}");
            assert_eq!(s.trampoline_applied, applied, "applied passthrough: {name}");
            assert_eq!(s.consistent(), cons, "consistent: {name}");
            assert_eq!(s.needs_repair(true), rep, "repair: {name}");
            assert!(
                !s.needs_repair(false),
                "never repair when not installed: {name}"
            );
        }
    }

    #[test]
    fn test_g_opt_in_off_downgrade_keeps_the_two_questions_apart() {
        // (g) marker says Trampoline (prior opt-in install) but user unchecks
        // the box for THIS install: detect-time expected stays trampoline until
        // the new marker is written; install-time requested is Prefix (a mode
        // switch, not a bug).
        let state = LaunchModeState::from_facts(OptIn, Some(Trampoline), true);
        assert!(state.expected_trampoline);
        assert_eq!(OptIn.requested_mode(false), Prefix);
        // converse: fresh 26 machine, user opts in
        assert!(!LaunchModeState::from_facts(OptIn, None, false).expected_trampoline);
        assert_eq!(OptIn.requested_mode(true), Trampoline);
    }

    #[test]
    fn test_marker_codec_round_trip_and_garbage() {
        assert_eq!(
            LaunchMode::from_marker(Trampoline.as_marker()),
            Some(Trampoline)
        );
        assert_eq!(LaunchMode::from_marker(Prefix.as_marker()), Some(Prefix));
        assert_eq!(Trampoline.as_marker(), "trampoline");
        assert_eq!(Prefix.as_marker(), "prefix");
        for garbage in ["", "TRAMPOLINE", "garbage"] {
            assert_eq!(LaunchMode::from_marker(garbage), None);
        }
    }

    #[test]
    fn test_forced_threshold_is_27() {
        assert_eq!(TRAMPOLINE_FORCED_MAJOR, 27);
        assert_eq!(LaunchModeGate::from_platform(true, Some(26)), OptIn);
        assert_eq!(LaunchModeGate::from_platform(true, Some(27)), Forced);
    }
}
