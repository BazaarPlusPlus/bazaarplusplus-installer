use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Ordering;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::commands::{debug_error, debug_log};

const BUNDLED_SUPPORTERS_JSON: &str = include_str!("../../../static/support/supporter-list.json");
const SUPPORTERS_CACHE_FILE_NAME: &str = "supporters-cache.json";
const SUPPORTERS_CACHE_DIR_NAME: &str = "BazaarPlusPlusInstaller";
const SUPPORTERS_REMOTE_URL: &str = "https://bpp-static.bazaarplusplus.com/supporter-list.json";

pub const SUPPORTER_REFRESH_INTERVAL_SECS: u64 = 8 * 60 * 60;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SupporterEntry {
    pub name: String,
    pub tier: u8,
    pub amount: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SupportersPayload {
    pub entries: Vec<SupporterEntry>,
    #[serde(rename = "fetchedAt")]
    pub fetched_at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SupportersSource {
    Bundled,
    Cache,
    Remote,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportersResponse {
    pub entries: Vec<SupporterEntry>,
    pub source: SupportersSource,
    pub fetched_at: Option<u64>,
    pub stale: bool,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SupportersCacheDocument {
    entries: Vec<SupporterEntry>,
    fetched_at: u64,
}

#[tauri::command]
pub async fn load_supporters() -> Result<SupportersResponse, String> {
    tauri::async_runtime::spawn_blocking(load_supporters_sync)
        .await
        .map_err(|err| format!("failed to join supporters loader: {err}"))?
}

pub fn normalize_supporter_entries(raw: &str) -> Option<Vec<SupporterEntry>> {
    let payload = serde_json::from_str::<Value>(raw).ok()?;
    let entries = payload.as_array()?;

    let mut normalized_entries = Vec::with_capacity(entries.len());
    for entry in entries {
        let name = entry.get("name")?.as_str()?.trim();
        let tier = entry.get("tier")?.as_u64()?;
        let amount = entry.get("amount")?.as_f64()?;

        if name.is_empty() || !(1..=4).contains(&tier) || !amount.is_finite() || amount <= 0.0 {
            return None;
        }

        normalized_entries.push(SupporterEntry {
            name: name.to_string(),
            tier: tier as u8,
            amount: round_supporter_amount(amount),
        });
    }

    sort_supporters(&mut normalized_entries);

    Some(normalized_entries)
}

pub fn is_cache_stale(fetched_at: Option<u64>, now: u64) -> bool {
    fetched_at
        .map(|timestamp| now.saturating_sub(timestamp) >= SUPPORTER_REFRESH_INTERVAL_SECS)
        .unwrap_or(true)
}

pub fn select_local_payload(
    bundled_entries: Vec<SupporterEntry>,
    cache_entries: Option<Vec<SupporterEntry>>,
    cache_fetched_at: Option<u64>,
) -> SupportersPayload {
    if let Some(entries) = cache_entries {
        return SupportersPayload {
            entries,
            fetched_at: cache_fetched_at,
        };
    }

    SupportersPayload {
        entries: bundled_entries,
        fetched_at: None,
    }
}

fn load_supporters_sync() -> Result<SupportersResponse, String> {
    let bundled_entries = load_bundled_entries()?;
    let cached_payload = read_cached_payload();
    let local_payload = select_local_payload(
        bundled_entries,
        cached_payload.as_ref().map(|cache| cache.entries.clone()),
        cached_payload.as_ref().map(|cache| cache.fetched_at),
    );
    let local_source = if local_payload.fetched_at.is_some() {
        SupportersSource::Cache
    } else {
        SupportersSource::Bundled
    };
    let now = current_unix_timestamp_secs()?;
    let stale = is_cache_stale(local_payload.fetched_at, now);

    if !stale {
        return Ok(SupportersResponse {
            entries: local_payload.entries,
            source: local_source,
            fetched_at: local_payload.fetched_at,
            stale: false,
        });
    }

    match fetch_remote_entries(SUPPORTERS_REMOTE_URL) {
        Ok(remote_entries) => {
            if let Err(_error) = write_cached_payload(&remote_entries, now) {
                debug_error!("failed to write supporters cache: {_error}");
            }

            Ok(SupportersResponse {
                entries: remote_entries,
                source: SupportersSource::Remote,
                fetched_at: Some(now),
                stale: false,
            })
        }
        Err(_error) => {
            debug_error!("failed to refresh supporters: {_error}");

            Ok(SupportersResponse {
                entries: local_payload.entries,
                source: local_source,
                fetched_at: local_payload.fetched_at,
                stale: true,
            })
        }
    }
}

fn load_bundled_entries() -> Result<Vec<SupporterEntry>, String> {
    normalize_supporter_entries(BUNDLED_SUPPORTERS_JSON)
        .ok_or_else(|| "bundled supporter list is invalid".to_string())
}

fn read_cached_payload() -> Option<SupportersCacheDocument> {
    let cache_path = cache_file_path()?;
    let raw = fs::read_to_string(cache_path).ok()?;
    let document = serde_json::from_str::<SupportersCacheDocument>(&raw).ok()?;

    let entries_json = serde_json::to_string(&document.entries).ok()?;
    let entries = normalize_supporter_entries(&entries_json)?;

    Some(SupportersCacheDocument {
        entries,
        fetched_at: document.fetched_at,
    })
}

fn write_cached_payload(entries: &[SupporterEntry], fetched_at: u64) -> Result<(), String> {
    let Some(cache_dir) = cache_directory() else {
        return Err("cache directory is unavailable".to_string());
    };

    fs::create_dir_all(&cache_dir)
        .map_err(|err| format!("failed to create supporters cache directory: {err}"))?;

    let payload = SupportersCacheDocument {
        entries: entries.to_vec(),
        fetched_at,
    };
    let raw = serde_json::to_string_pretty(&payload)
        .map_err(|err| format!("failed to serialize supporters cache payload: {err}"))?;

    fs::write(cache_dir.join(SUPPORTERS_CACHE_FILE_NAME), raw)
        .map_err(|err| format!("failed to write supporters cache payload: {err}"))
}

fn fetch_remote_entries(remote_url: &str) -> Result<Vec<SupporterEntry>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|err| format!("failed to build supporters client: {err}"))?;
    let response = client
        .get(remote_url)
        .send()
        .map_err(|err| format!("failed to fetch supporters payload: {err}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "supporters payload request returned status {}",
            response.status()
        ));
    }

    let raw = response
        .text()
        .map_err(|err| format!("failed to read supporters payload body: {err}"))?;

    normalize_supporter_entries(&raw)
        .ok_or_else(|| "remote supporters payload is invalid".to_string())
}

fn cache_directory() -> Option<PathBuf> {
    dirs::cache_dir().map(|path| path.join(SUPPORTERS_CACHE_DIR_NAME))
}

fn cache_file_path() -> Option<PathBuf> {
    cache_directory().map(|dir| dir.join(SUPPORTERS_CACHE_FILE_NAME))
}

fn current_unix_timestamp_secs() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|err| format!("system time before unix epoch: {err}"))
}

fn round_supporter_amount(amount: f64) -> f64 {
    format!("{amount:.2}")
        .parse::<f64>()
        .unwrap_or(amount)
}

fn sort_supporters(entries: &mut [SupporterEntry]) {
    entries.sort_by(|left, right| {
        right
            .tier
            .cmp(&left.tier)
            .then_with(|| {
                right
                    .amount
                    .partial_cmp(&left.amount)
                    .unwrap_or(Ordering::Equal)
            })
            .then_with(|| left.name.cmp(&right.name))
    });
    debug_log!("loaded {} supporters", entries.len());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_supporter_entries_accepts_valid_entries() {
        let raw = r#"[{"name":"Alice","tier":4,"amount":1.5},{"name":"Bob","tier":2,"amount":0.1}]"#;

        let entries = normalize_supporter_entries(raw).expect("expected entries");

        assert_eq!(
            entries,
            vec![
                SupporterEntry {
                    name: "Alice".to_string(),
                    tier: 4,
                    amount: 1.5,
                },
                SupporterEntry {
                    name: "Bob".to_string(),
                    tier: 2,
                    amount: 0.1,
                },
            ]
        );
    }

    #[test]
    fn test_normalize_supporter_entries_rejects_invalid_entries() {
        let raw = r#"[{"name":" ","tier":4,"amount":1.5},{"name":"Bob","tier":8,"amount":0.1}]"#;

        let entries = normalize_supporter_entries(raw);

        assert_eq!(entries, None);
    }

    #[test]
    fn test_is_cache_stale_returns_false_within_refresh_window() {
        let now = 200_000;

        assert_eq!(
            is_cache_stale(Some(now - SUPPORTER_REFRESH_INTERVAL_SECS + 1), now),
            false
        );
    }

    #[test]
    fn test_is_cache_stale_returns_true_at_refresh_boundary() {
        let now = 200_000;

        assert_eq!(
            is_cache_stale(Some(now - SUPPORTER_REFRESH_INTERVAL_SECS), now),
            true
        );
    }

    #[test]
    fn test_select_local_payload_prefers_valid_cache_over_bundled_entries() {
        let bundled_entries = vec![SupporterEntry {
            name: "Bundled".to_string(),
            tier: 1,
            amount: 0.1,
        }];
        let cache_entries = vec![SupporterEntry {
            name: "Cached".to_string(),
            tier: 4,
            amount: 1.5,
        }];

        let payload = select_local_payload(bundled_entries, Some(cache_entries.clone()), Some(123));

        assert_eq!(
            payload,
            SupportersPayload {
                entries: cache_entries,
                fetched_at: Some(123),
            }
        );
    }

    #[test]
    fn test_select_local_payload_falls_back_to_bundled_entries_when_cache_missing() {
        let bundled_entries = vec![SupporterEntry {
            name: "Bundled".to_string(),
            tier: 1,
            amount: 0.1,
        }];

        let payload = select_local_payload(bundled_entries.clone(), None, None);

        assert_eq!(
            payload,
            SupportersPayload {
                entries: bundled_entries,
                fetched_at: None,
            }
        );
    }
}
