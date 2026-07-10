//! macOS major-version probe.
//!
//! macOS 27 changed the Steam client so it no longer spawns a prefix executable
//! before `%command%` (even `/bin/sh` fails), which kills the `run_bepinex.sh`
//! launch path BepInEx depends on. On 27+ we must inject from inside the `.app`
//! via the Mach-O trampoline (`services::bepinex::trampoline`). The probe is
//! cached process-wide because the OS version cannot change without a reboot.
//!
#[cfg(target_os = "macos")]
use std::sync::OnceLock;

#[cfg(target_os = "macos")]
fn detect_macos_major() -> Option<u32> {
    use std::process::Command;

    let output = Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let version = String::from_utf8_lossy(&output.stdout);
    parse_major(version.trim())
}

/// Parse the leading major component of a `productVersion` string ("27.0.1" -> 27).
#[cfg(target_os = "macos")]
fn parse_major(version: &str) -> Option<u32> {
    version.split('.').next()?.trim().parse::<u32>().ok()
}

/// Cached macOS major version. Returns `None` only if `sw_vers` is unavailable or
/// unparseable, in which case callers treat the platform as not-forced (the safe,
/// zero-regression default that preserves the prefix path).
#[cfg(target_os = "macos")]
pub fn macos_major() -> Option<u32> {
    static MAJOR: OnceLock<Option<u32>> = OnceLock::new();
    *MAJOR.get_or_init(detect_macos_major)
}

#[cfg(test)]
#[cfg(target_os = "macos")]
mod tests {
    use super::parse_major;

    #[test]
    fn test_parse_major_reads_leading_component() {
        assert_eq!(parse_major("27.0"), Some(27));
        assert_eq!(parse_major("26.4.1"), Some(26));
        assert_eq!(parse_major("27"), Some(27));
    }

    #[test]
    fn test_parse_major_rejects_garbage() {
        assert_eq!(parse_major(""), None);
        assert_eq!(parse_major("sonoma"), None);
    }
}
