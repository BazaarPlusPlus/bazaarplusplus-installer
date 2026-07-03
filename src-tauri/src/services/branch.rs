#![allow(dead_code)]

use std::path::Path;

const APP_STATE_KEY: &str = "AppState";
const USER_CONFIG_KEY: &str = "UserConfig";
const MOUNTED_CONFIG_KEY: &str = "MountedConfig";
const BETA_KEY: &str = "BetaKey";
const STATE_FLAGS_KEY: &str = "StateFlags";
const BRANCH_SWITCH_STATE_FLAGS: &str = "6";
const BYTES_DOWNLOADED_KEY: &str = "BytesDownloaded";
const BYTES_TO_DOWNLOAD_KEY: &str = "BytesToDownload";
const BYTES_STAGED_KEY: &str = "BytesStaged";
const BYTES_TO_STAGE_KEY: &str = "BytesToStage";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppManifestBranchState {
    pub user_beta_key: String,
    pub mounted_beta_key: Option<String>,
    pub state_flags: u64,
    pub bytes_downloaded: Option<u64>,
    pub bytes_to_download: Option<u64>,
    pub bytes_staged: Option<u64>,
    pub bytes_to_stage: Option<u64>,
}

pub fn parse_appmanifest_branch_state(content: &str) -> Result<AppManifestBranchState, String> {
    let lines = content.lines().map(str::to_string).collect::<Vec<_>>();
    let (app_open, app_close) = find_app_state_block(&lines)?;
    let (user_open, user_close) =
        find_required_direct_block(&lines, app_open, app_close, USER_CONFIG_KEY)?;

    Ok(AppManifestBranchState {
        user_beta_key: read_required_string_field(
            &lines,
            user_open,
            user_close,
            &format!("{USER_CONFIG_KEY}.{BETA_KEY}"),
            BETA_KEY,
        )?,
        mounted_beta_key: read_optional_mounted_beta_key(&lines, app_open, app_close),
        state_flags: read_required_u64_field(
            &lines,
            app_open,
            app_close,
            STATE_FLAGS_KEY,
            STATE_FLAGS_KEY,
        )?,
        bytes_downloaded: read_optional_u64_field(
            &lines,
            app_open,
            app_close,
            BYTES_DOWNLOADED_KEY,
        )?,
        bytes_to_download: read_optional_u64_field(
            &lines,
            app_open,
            app_close,
            BYTES_TO_DOWNLOAD_KEY,
        )?,
        bytes_staged: read_optional_u64_field(&lines, app_open, app_close, BYTES_STAGED_KEY)?,
        bytes_to_stage: read_optional_u64_field(&lines, app_open, app_close, BYTES_TO_STAGE_KEY)?,
    })
}

pub fn rewrite_appmanifest_branch_target(
    content: &str,
    target_beta_key: &str,
) -> Result<String, String> {
    let spans = line_spans(content);
    let lines = spans
        .iter()
        .map(|span| span.content.to_string())
        .collect::<Vec<_>>();
    let (app_open, app_close) = find_app_state_block(&lines)?;
    let state_flags_idx = find_direct_pair_index(&lines, app_open, app_close, STATE_FLAGS_KEY)
        .ok_or_else(|| missing_field_error(STATE_FLAGS_KEY))?;
    let (user_open, user_close) =
        find_required_direct_block(&lines, app_open, app_close, USER_CONFIG_KEY)?;
    let user_beta_idx = find_direct_pair_index(&lines, user_open, user_close, BETA_KEY)
        .ok_or_else(|| missing_field_error(&format!("{USER_CONFIG_KEY}.{BETA_KEY}")))?;

    let state_flags_line = rewrite_pair_line(
        spans[state_flags_idx].content,
        STATE_FLAGS_KEY,
        BRANCH_SWITCH_STATE_FLAGS,
    )?;
    let user_beta_line =
        rewrite_pair_line(spans[user_beta_idx].content, BETA_KEY, target_beta_key)?;

    Ok(replace_line_contents(
        content,
        &spans,
        &[
            (state_flags_idx, state_flags_line),
            (user_beta_idx, user_beta_line),
        ],
    ))
}

pub fn read_appmanifest_branch_state(path: &Path) -> Result<AppManifestBranchState, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|err| format!("Cannot read appmanifest {}: {err}", path.display()))?;
    parse_appmanifest_branch_state(&content)
}

pub fn write_appmanifest_branch_target(path: &Path, target_beta_key: &str) -> Result<(), String> {
    let content = std::fs::read_to_string(path)
        .map_err(|err| format!("Cannot read appmanifest {}: {err}", path.display()))?;
    let updated = rewrite_appmanifest_branch_target(&content, target_beta_key)?;
    let tmp = path.with_extension("acf.tmp");

    std::fs::write(&tmp, updated).map_err(|err| {
        format!(
            "Cannot write temporary appmanifest {}: {err}",
            tmp.display()
        )
    })?;
    std::fs::rename(&tmp, path).map_err(|err| {
        format!(
            "Cannot replace appmanifest {} with {}: {err}",
            path.display(),
            tmp.display()
        )
    })
}

fn parse_line_pair(line: &str) -> Option<(&str, &str, &str)> {
    let indent_len = line.find('"')?;
    let indent = &line[..indent_len];
    let trimmed = &line[indent_len..];

    fn parse_quoted(input: &str) -> Option<(&str, &str)> {
        let mut escaped = false;
        let mut end = None;

        for (idx, ch) in input.char_indices().skip(1) {
            if escaped {
                escaped = false;
                continue;
            }

            if ch == '\\' {
                escaped = true;
                continue;
            }

            if ch == '"' {
                end = Some(idx);
                break;
            }
        }

        let end = end?;
        Some((&input[1..end], &input[end + 1..]))
    }

    let (key, rest) = parse_quoted(trimmed)?;
    let rest = rest.trim_start();
    let (value, remainder) = parse_quoted(rest)?;
    if !remainder.trim().is_empty() {
        return None;
    }

    Some((indent, key, value))
}

struct LineSpan<'a> {
    content: &'a str,
    start: usize,
    content_end: usize,
}

fn line_spans(content: &str) -> Vec<LineSpan<'_>> {
    let mut spans = Vec::new();
    let mut line_start = 0usize;

    for segment in content.split_inclusive('\n') {
        let line_end = line_start + segment.len();
        let content_end = if segment.ends_with("\r\n") {
            line_end - 2
        } else if segment.ends_with('\n') {
            line_end - 1
        } else {
            line_end
        };

        spans.push(LineSpan {
            content: &content[line_start..content_end],
            start: line_start,
            content_end,
        });
        line_start = line_end;
    }

    spans
}

fn replace_line_contents(
    content: &str,
    spans: &[LineSpan<'_>],
    replacements: &[(usize, String)],
) -> String {
    let mut updated = content.to_string();
    let mut replacements = replacements.iter().collect::<Vec<_>>();
    replacements.sort_by_key(|(line_idx, _line)| std::cmp::Reverse(spans[*line_idx].start));

    for (line_idx, new_line) in replacements {
        let span = &spans[*line_idx];
        updated.replace_range(span.start..span.content_end, new_line);
    }

    updated
}

fn quoted_key(key: &str) -> String {
    format!("\"{key}\"")
}

fn escape_vdf_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn unescape_vdf_string(value: &str) -> String {
    let mut result = String::new();
    let mut escaped = false;

    for ch in value.chars() {
        if escaped {
            result.push(ch);
            escaped = false;
        } else if ch == '\\' {
            escaped = true;
        } else {
            result.push(ch);
        }
    }

    if escaped {
        result.push('\\');
    }

    result
}

fn find_block_close(lines: &[String], open: usize, limit_exclusive: usize) -> Option<usize> {
    let mut depth = 0usize;

    for idx in open..limit_exclusive {
        match lines[idx].trim() {
            "{" => depth += 1,
            "}" => {
                depth = depth.checked_sub(1)?;
                if depth == 0 {
                    return Some(idx);
                }
            }
            _ => {}
        }
    }

    None
}

fn find_root_named_block(lines: &[String], key: &str) -> Option<(usize, usize)> {
    let key_line = lines
        .iter()
        .position(|line| line.trim() == quoted_key(key))?;
    let open = (key_line + 1..lines.len()).find(|&idx| lines[idx].trim() == "{")?;
    let close = find_block_close(lines, open, lines.len())?;

    Some((open, close))
}

fn find_direct_named_block(
    lines: &[String],
    block_open: usize,
    block_close: usize,
    key: &str,
) -> Option<(usize, usize)> {
    let mut depth = 0usize;
    let mut idx = block_open + 1;

    while idx < block_close {
        let trimmed = lines[idx].trim();

        if depth == 0 && trimmed == quoted_key(key) {
            let open = (idx + 1..block_close).find(|&line_idx| lines[line_idx].trim() == "{")?;
            let close = find_block_close(lines, open, block_close)?;
            return Some((open, close));
        }

        match trimmed {
            "{" => depth += 1,
            "}" => depth = depth.saturating_sub(1),
            _ => {}
        }

        idx += 1;
    }

    None
}

fn find_direct_pair_index(
    lines: &[String],
    block_open: usize,
    block_close: usize,
    key: &str,
) -> Option<usize> {
    let mut depth = 0usize;

    for idx in block_open + 1..block_close {
        match lines[idx].trim() {
            "{" => {
                depth += 1;
                continue;
            }
            "}" => {
                depth = depth.saturating_sub(1);
                continue;
            }
            _ => {}
        }

        if depth == 0 {
            if let Some((_indent, parsed_key, _value)) = parse_line_pair(&lines[idx]) {
                if parsed_key == key {
                    return Some(idx);
                }
            }
        }
    }

    None
}

fn find_app_state_block(lines: &[String]) -> Result<(usize, usize), String> {
    find_root_named_block(lines, APP_STATE_KEY)
        .ok_or_else(|| "Malformed appmanifest: missing AppState block".to_string())
}

fn find_required_direct_block(
    lines: &[String],
    block_open: usize,
    block_close: usize,
    key: &str,
) -> Result<(usize, usize), String> {
    find_direct_named_block(lines, block_open, block_close, key)
        .ok_or_else(|| format!("Malformed appmanifest: missing {key} block"))
}

fn missing_field_error(field: &str) -> String {
    format!("Malformed appmanifest: missing {field}")
}

fn invalid_number_error(field: &str, value: &str) -> String {
    format!("Malformed appmanifest: {field} is not a valid unsigned integer: {value:?}")
}

fn read_required_string_field(
    lines: &[String],
    block_open: usize,
    block_close: usize,
    label: &str,
    key: &str,
) -> Result<String, String> {
    let idx = find_direct_pair_index(lines, block_open, block_close, key)
        .ok_or_else(|| missing_field_error(label))?;
    let (_indent, _key, value) =
        parse_line_pair(&lines[idx]).ok_or_else(|| missing_field_error(label))?;

    Ok(unescape_vdf_string(value))
}

fn read_required_u64_field(
    lines: &[String],
    block_open: usize,
    block_close: usize,
    label: &str,
    key: &str,
) -> Result<u64, String> {
    let value = read_required_string_field(lines, block_open, block_close, label, key)?;
    value
        .parse::<u64>()
        .map_err(|_| invalid_number_error(label, &value))
}

fn read_optional_u64_field(
    lines: &[String],
    block_open: usize,
    block_close: usize,
    key: &str,
) -> Result<Option<u64>, String> {
    let Some(idx) = find_direct_pair_index(lines, block_open, block_close, key) else {
        return Ok(None);
    };
    let (_indent, _key, value) =
        parse_line_pair(&lines[idx]).ok_or_else(|| missing_field_error(key))?;
    let value = unescape_vdf_string(value);

    value
        .parse::<u64>()
        .map(Some)
        .map_err(|_| invalid_number_error(key, &value))
}

fn read_optional_mounted_beta_key(
    lines: &[String],
    app_open: usize,
    app_close: usize,
) -> Option<String> {
    let (mounted_open, mounted_close) =
        find_direct_named_block(lines, app_open, app_close, MOUNTED_CONFIG_KEY)?;
    let beta_idx = find_direct_pair_index(lines, mounted_open, mounted_close, BETA_KEY)?;
    let (_indent, _key, value) = parse_line_pair(&lines[beta_idx])?;

    Some(unescape_vdf_string(value))
}

fn rewrite_pair_line(line: &str, expected_key: &str, value: &str) -> Result<String, String> {
    let (indent, key, _old_value) =
        parse_line_pair(line).ok_or_else(|| missing_field_error(expected_key))?;
    if key != expected_key {
        return Err(format!(
            "Malformed appmanifest: expected {expected_key} line but found {key}"
        ));
    }

    Ok(format!(
        "{indent}\"{expected_key}\"\t\t\"{}\"",
        escape_vdf_string(value)
    ))
}

#[cfg(test)]
mod tests {
    use super::{parse_appmanifest_branch_state, rewrite_appmanifest_branch_target};

    fn appmanifest_fixture() -> &'static str {
        "\"AppState\"
{
\t\"appid\"\t\t\"1617400\"
\t\"Universe\"\t\t\"1\"
\t\"StateFlags\"\t\t\"4\"
\t\"installdir\"\t\t\"The Bazaar\"
\t\"BytesDownloaded\"\t\t\"111\"
\t\"BytesToDownload\"\t\t\"222\"
\t\"BytesStaged\"\t\t\"333\"
\t\"BytesToStage\"\t\t\"444\"
\t\"Unrelated\"\t\t\"preserve me\"
\t\"UserConfig\"
\t{
\t\t\"language\"\t\t\"english\"
\t\t\"BetaKey\"\t\t\"online_target\"
\t\t\"BetaKey\"\t\t\"ignored_second_user_beta\"
\t}
\t\"MountedConfig\"
\t{
\t\t\"BetaKey\"\t\t\"mounted_should_stay\"
\t\t\"MountedDepots\"
\t\t{
\t\t\t\"1617401\"\t\t\"123456789\"
\t\t}
\t}
}"
    }

    fn online_appmanifest_fixture() -> &'static str {
        "\"AppState\"
{
\t\"StateFlags\"\t\t\"4\"
\t\"UserConfig\"
\t{
\t\t\"BetaKey\"\t\t\"public_test_realm\"
\t}
\t\"MountedConfig\"
\t{
\t\t\"BetaKey\"\t\t\"public_test_realm\"
\t}
}"
    }

    #[test]
    fn test_parse_appmanifest_branch_state_reads_branch_and_download_fields() {
        let state = parse_appmanifest_branch_state(appmanifest_fixture()).unwrap();

        assert_eq!(state.user_beta_key, "online_target");
        assert_eq!(
            state.mounted_beta_key.as_deref(),
            Some("mounted_should_stay")
        );
        assert_eq!(state.state_flags, 4);
        assert_eq!(state.bytes_downloaded, Some(111));
        assert_eq!(state.bytes_to_download, Some(222));
        assert_eq!(state.bytes_staged, Some(333));
        assert_eq!(state.bytes_to_stage, Some(444));
    }

    #[test]
    fn test_rewrite_appmanifest_branch_target_updates_only_user_config_and_state_flags() {
        let original = appmanifest_fixture();
        let updated = rewrite_appmanifest_branch_target(original, "public_test_realm").unwrap();

        let changed_lines = original
            .lines()
            .zip(updated.lines())
            .filter(|(before, after)| before != after)
            .collect::<Vec<_>>();

        assert_eq!(changed_lines.len(), 2);
        assert_eq!(changed_lines[0].1.trim(), "\"StateFlags\"\t\t\"6\"");
        assert_eq!(
            changed_lines[1].1.trim(),
            "\"BetaKey\"\t\t\"public_test_realm\""
        );
        assert!(updated.contains("\t\t\"BetaKey\"\t\t\"mounted_should_stay\""));
        assert!(updated.contains("\t\"Unrelated\"\t\t\"preserve me\""));

        let state = parse_appmanifest_branch_state(&updated).unwrap();
        assert_eq!(state.user_beta_key, "public_test_realm");
        assert_eq!(
            state.mounted_beta_key.as_deref(),
            Some("mounted_should_stay")
        );
        assert_eq!(state.state_flags, 6);
    }

    #[test]
    fn test_rewrite_appmanifest_branch_target_preserves_untouched_crlf_bytes() {
        let original = "\"AppState\"\r\n{\r\n\t\"StateFlags\"\t\t\"4\"\r\n\t\"Unrelated\"\t\t\"preserve me\"\r\n\t\"UserConfig\"\r\n\t{\r\n\t\t\"BetaKey\"\t\t\"online_target\"\r\n\t\t\"Other\"\t\t\"keep\"\r\n\t}\r\n\t\"MountedConfig\"\r\n\t{\r\n\t\t\"BetaKey\"\t\t\"mounted_should_stay\"\r\n\t}\r\n}\r\n";
        let expected = original
            .replacen("\"StateFlags\"\t\t\"4\"", "\"StateFlags\"\t\t\"6\"", 1)
            .replacen(
                "\t\t\"BetaKey\"\t\t\"online_target\"",
                "\t\t\"BetaKey\"\t\t\"public_test_realm\"",
                1,
            );

        let updated = rewrite_appmanifest_branch_target(original, "public_test_realm").unwrap();

        assert_eq!(updated, expected);
        assert!(updated.ends_with("\r\n"));
        assert!(updated.contains("\r\n\t\"Unrelated\"\t\t\"preserve me\"\r\n"));
        assert!(updated.contains("\r\n\t\t\"BetaKey\"\t\t\"mounted_should_stay\"\r\n"));
    }

    #[test]
    fn test_rewrite_appmanifest_branch_target_accepts_empty_online_beta_key() {
        let updated = rewrite_appmanifest_branch_target(online_appmanifest_fixture(), "").unwrap();

        let state = parse_appmanifest_branch_state(&updated).unwrap();
        assert_eq!(state.user_beta_key, "");
        assert_eq!(state.mounted_beta_key.as_deref(), Some("public_test_realm"));
        assert!(updated.contains("\t\t\"BetaKey\"\t\t\"\""));
    }

    #[test]
    fn test_rewrite_appmanifest_branch_target_errors_when_user_config_is_missing() {
        let manifest = "\"AppState\"
{
\t\"StateFlags\"\t\t\"4\"
}";

        let error = rewrite_appmanifest_branch_target(manifest, "public_test_realm").unwrap_err();

        assert!(error.contains("UserConfig"));
    }

    #[test]
    fn test_rewrite_appmanifest_branch_target_errors_when_state_flags_is_missing() {
        let manifest = "\"AppState\"
{
\t\"UserConfig\"
\t{
\t\t\"BetaKey\"\t\t\"public_test_realm\"
\t}
}";

        let error = rewrite_appmanifest_branch_target(manifest, "public_test_realm").unwrap_err();

        assert!(error.contains("StateFlags"));
    }
}
