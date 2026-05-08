const SCHEDULE: &[u64] = &[
    60,
    5 * 60,
    15 * 60,
    60 * 60,
    6 * 60 * 60,
    24 * 60 * 60,
];

pub fn next_delay_seconds(attempts_so_far: u32) -> u64 {
    let idx = (attempts_so_far as usize).min(SCHEDULE.len() - 1);
    SCHEDULE[idx]
}

#[cfg(test)]
mod tests {
    use super::next_delay_seconds;

    #[test]
    fn schedule_matches_spec_for_first_six_attempts() {
        assert_eq!(next_delay_seconds(0), 60);          // 1m
        assert_eq!(next_delay_seconds(1), 5 * 60);      // 5m
        assert_eq!(next_delay_seconds(2), 15 * 60);     // 15m
        assert_eq!(next_delay_seconds(3), 60 * 60);     // 1h
        assert_eq!(next_delay_seconds(4), 6 * 60 * 60); // 6h
        assert_eq!(next_delay_seconds(5), 24 * 60 * 60);// 24h cap
    }

    #[test]
    fn schedule_caps_at_24h_for_high_attempt_counts() {
        assert_eq!(next_delay_seconds(99), 24 * 60 * 60);
    }
}
