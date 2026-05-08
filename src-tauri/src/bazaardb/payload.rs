use serde::Serialize;

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize)]
pub struct ScreenshotMetadata {
    pub schema_version: u32,
    pub installer_version: String,
    pub auto_uploaded: bool,
    pub image_format: String,
    pub screenshot_id: String,
    pub run_id: Option<String>,
    pub hero_name: Option<String>,
    pub final_days: Option<i64>,
    pub final_victories: Option<i64>,
    pub player_name: Option<String>,
    pub player_account_id: String,
    pub player_rank: Option<String>,
    pub player_rating: Option<i64>,
    pub player_position: Option<i64>,
    pub captured_at_utc: String,
}

impl Default for ScreenshotMetadata {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            installer_version: env!("CARGO_PKG_VERSION").to_string(),
            auto_uploaded: false,
            image_format: "jpeg".into(),
            screenshot_id: String::new(),
            run_id: None,
            hero_name: None,
            final_days: None,
            final_victories: None,
            player_name: None,
            player_account_id: String::new(),
            player_rank: None,
            player_rating: None,
            player_position: None,
            captured_at_utc: String::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{ScreenshotMetadata, SCHEMA_VERSION};

    #[test]
    fn metadata_serializes_with_stable_keys() {
        let metadata = ScreenshotMetadata {
            screenshot_id: "snap-1".into(),
            run_id: Some("run-1".into()),
            hero_name: Some("Mak".into()),
            final_days: Some(14),
            final_victories: Some(10),
            player_name: Some("Xinyu".into()),
            player_account_id: "acct-9".into(),
            player_rank: Some("Diamond".into()),
            player_rating: Some(1942),
            player_position: Some(1),
            captured_at_utc: "2026-04-10T20:30:05+00:00".into(),
            installer_version: "3.3.0".into(),
            auto_uploaded: false,
            image_format: "jpeg".into(),
            schema_version: SCHEMA_VERSION,
        };

        let json = serde_json::to_value(&metadata).unwrap();
        assert_eq!(json["schema_version"], SCHEMA_VERSION);
        assert_eq!(json["screenshot_id"], "snap-1");
        assert_eq!(json["installer_version"], "3.3.0");
        assert_eq!(json["auto_uploaded"], false);
        assert_eq!(json["image_format"], "jpeg");
        assert_eq!(json["player_account_id"], "acct-9");
    }
}
