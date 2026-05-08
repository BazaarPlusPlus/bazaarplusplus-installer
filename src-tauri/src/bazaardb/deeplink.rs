#[derive(Debug, PartialEq, Eq)]
pub struct LinkParams {
    pub token: String,
    pub account: Option<String>,
}

pub fn parse_link_url(raw: &str) -> Result<LinkParams, String> {
    let stripped = raw.strip_prefix("bazaarplusplus://").ok_or("not a bazaarplusplus url")?;
    let (path, query) = stripped.split_once('?').unwrap_or((stripped, ""));
    if path != "link" {
        return Err(format!("unexpected path: {path}"));
    }
    let mut token = None;
    let mut account = None;
    for pair in query.split('&') {
        if pair.is_empty() { continue; }
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        let decoded = percent_decode(value);
        match key {
            "token" => token = Some(decoded),
            "account" => account = Some(decoded),
            _ => {}
        }
    }
    let token = token.ok_or("missing token")?;
    Ok(LinkParams { token, account })
}

fn percent_decode(input: &str) -> String {
    let mut bytes_out: Vec<u8> = Vec::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                bytes_out.push(byte);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            bytes_out.push(b' ');
            i += 1;
            continue;
        }
        bytes_out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&bytes_out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::{parse_link_url, LinkParams};

    #[test]
    fn parses_token_and_account_from_link_url() {
        let parsed = parse_link_url("bazaarplusplus://link?token=pat-abc&account=Xinyu").unwrap();
        assert_eq!(parsed, LinkParams {
            token: "pat-abc".into(),
            account: Some("Xinyu".into()),
        });
    }

    #[test]
    fn percent_decodes_account_display_name() {
        let parsed =
            parse_link_url("bazaarplusplus://link?token=pat&account=Xin%20yu").unwrap();
        assert_eq!(parsed.account.as_deref(), Some("Xin yu"));
    }

    #[test]
    fn rejects_non_link_paths() {
        assert!(parse_link_url("bazaarplusplus://other?token=pat").is_err());
    }

    #[test]
    fn rejects_missing_token() {
        assert!(parse_link_url("bazaarplusplus://link?account=Xinyu").is_err());
    }

    #[test]
    fn percent_decodes_non_ascii_account_display_name() {
        // %E6%9D%A8 = 杨 (U+6768) in UTF-8
        let parsed = parse_link_url("bazaarplusplus://link?token=pat&account=%E6%9D%A8").unwrap();
        assert_eq!(parsed.account.as_deref(), Some("杨"));
    }
}
