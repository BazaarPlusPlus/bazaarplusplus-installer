// src-tauri/src/commands/bepinex/versioning.rs
use serde::Deserialize;
use std::path::Path;
use tauri::Manager;

pub(crate) const LEGACY_RECORD_DIRECTORY: &str = "BazaarPlusPlus";
pub(crate) const BPP_DATA_VERSION_FILE_NAME: &str = "BPPData.version";
pub(crate) const CURRENT_BPP_DATA_VERSION: &str = env!("CARGO_PKG_VERSION");
const BPP_DATA_VERSION_POLICY_RESOURCE_PATH: &str = "BppDataVersionPolicy.json";

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub(crate) struct BppDataVersionPolicy {
    pub(crate) minimum_supported_bpp_data_version: String,
}

pub(crate) fn default_bpp_data_version_policy() -> BppDataVersionPolicy {
    BppDataVersionPolicy {
        minimum_supported_bpp_data_version: CURRENT_BPP_DATA_VERSION.to_string(),
    }
}

pub(crate) fn read_bundled_bpp_data_version_policy(
    app: &tauri::AppHandle,
) -> Result<BppDataVersionPolicy, String> {
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|err| err.to_string())?
        .join(BPP_DATA_VERSION_POLICY_RESOURCE_PATH);
    let raw = std::fs::read_to_string(&resource_path)
        .map_err(|err| format!("Cannot read {}: {err}", resource_path.display()))?;
    let policy = serde_json::from_str::<BppDataVersionPolicy>(&raw)
        .map_err(|err| format!("Cannot parse {}: {err}", resource_path.display()))?;

    Ok(policy)
}

fn parse_version_components(version: &str) -> Option<Vec<u64>> {
    let trimmed = version.trim();
    if trimmed.is_empty() {
        return None;
    }

    trimmed
        .split('.')
        .map(|part| part.parse::<u64>().ok())
        .collect::<Option<Vec<_>>>()
}

fn compare_version_strings(left: &str, right: &str) -> Option<std::cmp::Ordering> {
    let left = parse_version_components(left)?;
    let right = parse_version_components(right)?;
    let len = left.len().max(right.len());

    for index in 0..len {
        let left_part = *left.get(index).unwrap_or(&0);
        let right_part = *right.get(index).unwrap_or(&0);

        match left_part.cmp(&right_part) {
            std::cmp::Ordering::Equal => continue,
            ordering => return Some(ordering),
        }
    }

    Some(std::cmp::Ordering::Equal)
}

pub(crate) fn is_compatible_bpp_data_version(
    version: &str,
    minimum_supported_version: &str,
) -> bool {
    let Some(at_least_minimum) = compare_version_strings(version, minimum_supported_version) else {
        return false;
    };

    at_least_minimum != std::cmp::Ordering::Less
}

pub(crate) fn bpp_data_version_path(game_path: &Path) -> std::path::PathBuf {
    game_path
        .join(LEGACY_RECORD_DIRECTORY)
        .join(BPP_DATA_VERSION_FILE_NAME)
}

pub(crate) fn ensure_bpp_data_version_file(game_path: &Path) -> Result<(), String> {
    let data_dir = game_path.join(LEGACY_RECORD_DIRECTORY);
    std::fs::create_dir_all(&data_dir)
        .map_err(|err| format!("Cannot create {}: {err}", data_dir.display()))?;

    let version_path = data_dir.join(BPP_DATA_VERSION_FILE_NAME);
    std::fs::write(&version_path, format!("{CURRENT_BPP_DATA_VERSION}\n"))
        .map_err(|err| format!("Cannot write {}: {err}", version_path.display()))
}

#[cfg(test)]
mod tests {
    use super::{
        bpp_data_version_path, compare_version_strings, ensure_bpp_data_version_file,
        is_compatible_bpp_data_version, CURRENT_BPP_DATA_VERSION,
    };

    #[test]
    fn test_ensure_bpp_data_version_file_creates_version_marker() {
        let tmp = tempfile::tempdir().unwrap();

        ensure_bpp_data_version_file(tmp.path()).unwrap();

        assert_eq!(
            std::fs::read_to_string(bpp_data_version_path(tmp.path()))
                .unwrap()
                .trim(),
            CURRENT_BPP_DATA_VERSION
        );
    }

    #[test]
    fn test_is_compatible_bpp_data_version_matches_current_version() {
        assert!(is_compatible_bpp_data_version(
            CURRENT_BPP_DATA_VERSION,
            CURRENT_BPP_DATA_VERSION
        ));
        assert!(!is_compatible_bpp_data_version(
            "0",
            CURRENT_BPP_DATA_VERSION
        ));
    }

    #[test]
    fn test_is_compatible_bpp_data_version_accepts_versions_in_supported_range() {
        assert!(is_compatible_bpp_data_version("2.9.8", "2.9.0"));
        assert!(!is_compatible_bpp_data_version("2.8.9", "2.9.0"));
        assert!(is_compatible_bpp_data_version("999.0.0", "2.9.0"));
    }

    #[test]
    fn test_compare_version_strings_compares_dot_versions() {
        assert_eq!(
            compare_version_strings("2.9.9", "2.9.8"),
            Some(std::cmp::Ordering::Greater)
        );
        assert_eq!(
            compare_version_strings("2.9", "2.9.0"),
            Some(std::cmp::Ordering::Equal)
        );
        assert_eq!(compare_version_strings("bad", "2.9.0"), None);
    }
}
