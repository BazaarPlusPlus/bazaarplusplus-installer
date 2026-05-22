// Fetch and parse the FFmpeg R2 manifest. The manifest is the single source
// of truth for which version + which per-platform binary the installer pulls.
use std::collections::BTreeMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::FFMPEG_ERR_NETWORK;

const DEFAULT_MANIFEST_URL: &str =
    "https://bppinstaller.bazaarplusplus.com/ffmpeg/manifest.json";
const MANIFEST_TIMEOUT: Duration = Duration::from_secs(15);

/// Latest schema this installer understands. The Rust side hard-rejects any
/// manifest that bumps `schema_version` past this number so that an
/// incompatible future shape never silently lands as a broken install.
pub(crate) const MAX_SUPPORTED_SCHEMA: u32 = 1;

pub(crate) fn manifest_url() -> String {
    std::env::var("BPP_FFMPEG_MANIFEST_URL")
        .unwrap_or_else(|_| DEFAULT_MANIFEST_URL.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct FfmpegManifest {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub current_version: String,
    pub versions: BTreeMap<String, FfmpegVersionEntry>,
}

fn default_schema_version() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct FfmpegVersionEntry {
    pub platforms: BTreeMap<String, FfmpegPlatformEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct FfmpegPlatformEntry {
    pub asset_url: String,
    #[serde(default)]
    pub license_url: Option<String>,
    pub sha256: String,
    #[serde(default)]
    pub size_bytes: Option<u64>,
    pub entry_in_archive: String,
}

impl FfmpegManifest {
    pub(crate) fn select_current(
        &self,
        platform_key: &str,
    ) -> Result<(String, FfmpegPlatformEntry), String> {
        let version = self.current_version.trim();
        let entry = self
            .versions
            .get(version)
            .ok_or_else(|| format!("manifest current_version {version} is missing from versions"))?;
        let platform = entry
            .platforms
            .get(platform_key)
            .cloned()
            .ok_or_else(|| {
                format!("manifest does not list platform {platform_key} for version {version}")
            })?;
        Ok((version.to_string(), platform))
    }
}

pub(crate) async fn fetch_manifest() -> Result<FfmpegManifest, String> {
    let url = manifest_url();
    let client = reqwest::Client::builder()
        .timeout(MANIFEST_TIMEOUT)
        .build()
        .map_err(|err| network_error(&format!("client init failed: {err}")))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|err| network_error(&format!("manifest fetch failed: {err}")))?;

    let response = response
        .error_for_status()
        .map_err(|err| network_error(&format!("manifest status: {err}")))?;

    let body = response
        .bytes()
        .await
        .map_err(|err| network_error(&format!("manifest read failed: {err}")))?;

    let manifest: FfmpegManifest = serde_json::from_slice(&body).map_err(|err| {
        // Parse errors are not surfaced as network errors — the URL responded,
        // just with something we can't use. Mapping to NETWORK would mask a
        // genuinely broken manifest behind a "check your wifi" message.
        format!("{FFMPEG_ERR_NETWORK}:manifest parse failed: {err}")
    })?;

    if manifest.schema_version > MAX_SUPPORTED_SCHEMA {
        return Err(format!(
            "{FFMPEG_ERR_NETWORK}:manifest schema_version {} exceeds supported {}",
            manifest.schema_version, MAX_SUPPORTED_SCHEMA
        ));
    }

    Ok(manifest)
}

fn network_error(detail: &str) -> String {
    format!("{FFMPEG_ERR_NETWORK}:{detail}")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
      "schema_version": 1,
      "current_version": "7.1",
      "versions": {
        "7.1": {
          "platforms": {
            "windows-x86_64": {
              "asset_url": "https://example.test/ffmpeg.zip",
              "license_url": "https://example.test/LICENSE.txt",
              "sha256": "abc",
              "size_bytes": 28000000,
              "entry_in_archive": "ffmpeg.exe"
            }
          }
        }
      }
    }"#;

    #[test]
    fn parses_sample_manifest() {
        let parsed: FfmpegManifest = serde_json::from_str(SAMPLE).unwrap();
        let (version, entry) = parsed.select_current("windows-x86_64").unwrap();
        assert_eq!(version, "7.1");
        assert_eq!(entry.entry_in_archive, "ffmpeg.exe");
        assert_eq!(entry.sha256, "abc");
        assert_eq!(entry.size_bytes, Some(28000000));
    }

    #[test]
    fn parses_manifest_without_schema_defaults_to_one() {
        let raw = r#"{
          "current_version": "1.0",
          "versions": { "1.0": { "platforms": {} } }
        }"#;
        let parsed: FfmpegManifest = serde_json::from_str(raw).unwrap();
        assert_eq!(parsed.schema_version, 1);
    }

    #[test]
    fn select_current_errors_when_platform_missing() {
        let parsed: FfmpegManifest = serde_json::from_str(SAMPLE).unwrap();
        let err = parsed.select_current("darwin-aarch64").unwrap_err();
        assert!(err.contains("darwin-aarch64"));
    }

    #[test]
    fn select_current_errors_when_version_missing_from_versions_map() {
        let raw = r#"{
          "schema_version": 1,
          "current_version": "9.9",
          "versions": {}
        }"#;
        let parsed: FfmpegManifest = serde_json::from_str(raw).unwrap();
        let err = parsed.select_current("windows-x86_64").unwrap_err();
        assert!(err.contains("9.9"));
    }
}
