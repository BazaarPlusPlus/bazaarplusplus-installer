// Synchronous subprocess wrapper around `ffmpeg -version` with a hard 2s
// timeout. The mod's `FfmpegLocator.TryProbe` uses the same timeout, so the
// installer's idea of "this binary is usable" stays in lockstep with what the
// game will accept.
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

pub(crate) const PROBE_TIMEOUT: Duration = Duration::from_secs(2);

/// Stdout of `ffmpeg -version` is parsed only to surface the human-readable
/// version line in the UI. Probe success is decided by exit status, not text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProbeOutcome {
    pub version: Option<String>,
}

/// Run `ffmpeg -version` against the given path with a 2s wall-clock cap.
///
/// Returns the parsed version line on success, or an error describing why the
/// probe failed (non-zero exit, timeout, IO error). The child is force-killed
/// if it exceeds the timeout so we never leave a hung subprocess behind.
pub(crate) fn run_ffmpeg_version(
    binary: &Path,
    timeout: Duration,
) -> Result<ProbeOutcome, String> {
    let mut child = Command::new(binary)
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("failed to spawn {}: {err}", binary.display()))?;

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut stdout_buf = Vec::new();
                if let Some(mut stdout) = child.stdout.take() {
                    use std::io::Read;
                    let _ = stdout.read_to_end(&mut stdout_buf);
                }
                let _ = child.wait();

                if !status.success() {
                    return Err(format!("ffmpeg -version exited with {status}"));
                }
                let text = String::from_utf8_lossy(&stdout_buf).to_string();
                return Ok(ProbeOutcome {
                    version: parse_version_line(&text),
                });
            }
            Ok(None) => {
                if started.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "ffmpeg -version timed out after {}s",
                        timeout.as_secs()
                    ));
                }
                thread::sleep(Duration::from_millis(40));
            }
            Err(err) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("failed to wait on ffmpeg: {err}"));
            }
        }
    }
}

/// Pull the leading `ffmpeg version <token>` from the first stdout line.
/// Falls back to the raw first line if parsing fails so the UI still has
/// something to show.
pub(crate) fn parse_version_line(stdout: &str) -> Option<String> {
    let first = stdout.lines().next()?.trim();
    if first.is_empty() {
        return None;
    }
    if let Some(rest) = first.strip_prefix("ffmpeg version ") {
        // The release builds emit `ffmpeg version 7.1 Copyright (c) ...`; trim
        // at the next whitespace so we get the semver-ish token only.
        let token = rest.split_whitespace().next().unwrap_or(rest);
        return Some(token.to_string());
    }
    Some(first.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_standard_ffmpeg_version_line() {
        let line = "ffmpeg version 7.1 Copyright (c) 2000-2024 the FFmpeg developers\n";
        assert_eq!(parse_version_line(line).as_deref(), Some("7.1"));
    }

    #[test]
    fn falls_back_to_first_line_if_prefix_missing() {
        let line = "unexpected build output\nother line";
        assert_eq!(
            parse_version_line(line).as_deref(),
            Some("unexpected build output")
        );
    }

    #[test]
    fn empty_stdout_returns_none() {
        assert!(parse_version_line("").is_none());
        assert!(parse_version_line("   \n").is_none());
    }

    #[cfg(unix)]
    #[test]
    fn runs_against_true_binary_treats_zero_exit_as_success() {
        let outcome = run_ffmpeg_version(Path::new("/usr/bin/true"), PROBE_TIMEOUT).unwrap();
        // `true` writes nothing; we should still report success with no parsed
        // version rather than an error.
        assert!(outcome.version.is_none());
    }

    #[cfg(unix)]
    #[test]
    fn runs_against_false_binary_reports_nonzero_exit() {
        let result = run_ffmpeg_version(Path::new("/usr/bin/false"), PROBE_TIMEOUT);
        assert!(result.is_err());
    }
}
