use chrono::{DateTime, Datelike, Duration, NaiveDate, SecondsFormat, TimeZone, Utc};

/// Wire strings are a stable contract with the frontend preset buttons.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize, ts_rs::TS)]
#[ts(export)]
pub enum CleanupPreset {
    #[serde(rename = "all")]
    All,
    #[serde(rename = "older_than_7_days")]
    OlderThan7Days,
    #[serde(rename = "before_this_month")]
    BeforeThisMonth,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CleanupCutoff {
    /// RFC3339 UTC instant; SQL compares via datetime() on both sides.
    pub utc: String,
    /// Local calendar date of the cutoff; used for dated-folder orphan sweeps
    /// (folder names come from captured_at_local).
    pub local_date: NaiveDate,
}

impl CleanupCutoff {
    pub fn for_preset<Tz: TimeZone>(
        preset: CleanupPreset,
        now: DateTime<Tz>,
    ) -> Option<CleanupCutoff> {
        let instant = match preset {
            CleanupPreset::All => return None,
            CleanupPreset::OlderThan7Days => now.clone() - Duration::days(7),
            CleanupPreset::BeforeThisMonth => {
                let month_start = now
                    .date_naive()
                    .with_day(1)
                    .expect("day 1 is always a valid day")
                    .and_hms_opt(0, 0, 0)
                    .expect("midnight is always a valid time");
                now.timezone()
                    .from_local_datetime(&month_start)
                    .earliest()?
            }
        };
        Some(CleanupCutoff {
            utc: instant
                .with_timezone(&Utc)
                .to_rfc3339_opts(SecondsFormat::Secs, true),
            local_date: instant.date_naive(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{CleanupCutoff, CleanupPreset};
    use chrono::{FixedOffset, NaiveDate, TimeZone};

    #[test]
    fn cutoff_for_all_preset_is_none() {
        let tz = FixedOffset::east_opt(8 * 3600).unwrap();
        let now = tz.with_ymd_and_hms(2026, 7, 15, 10, 0, 0).unwrap();
        assert!(CleanupCutoff::for_preset(CleanupPreset::All, now).is_none());
    }

    #[test]
    fn cutoff_older_than_7_days_subtracts_from_now() {
        let tz = FixedOffset::east_opt(8 * 3600).unwrap();
        let now = tz.with_ymd_and_hms(2026, 7, 15, 10, 0, 0).unwrap();
        let cutoff = CleanupCutoff::for_preset(CleanupPreset::OlderThan7Days, now).unwrap();
        assert_eq!(cutoff.utc, "2026-07-08T02:00:00Z");
        assert_eq!(
            cutoff.local_date,
            NaiveDate::from_ymd_opt(2026, 7, 8).unwrap()
        );
    }

    #[test]
    fn cutoff_before_this_month_is_local_month_start_in_utc() {
        let tz = FixedOffset::east_opt(8 * 3600).unwrap();
        let now = tz.with_ymd_and_hms(2026, 7, 15, 10, 0, 0).unwrap();
        let cutoff = CleanupCutoff::for_preset(CleanupPreset::BeforeThisMonth, now).unwrap();
        // Local 2026-07-01T00:00:00+08:00 == 2026-06-30T16:00:00Z
        assert_eq!(cutoff.utc, "2026-06-30T16:00:00Z");
        assert_eq!(
            cutoff.local_date,
            NaiveDate::from_ymd_opt(2026, 7, 1).unwrap()
        );
    }
}
