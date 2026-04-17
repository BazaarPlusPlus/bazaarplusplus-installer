use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn parse_dotnet_runtimes(output: &str) -> Option<String> {
    output
        .lines()
        .filter(|line| line.starts_with("Microsoft.NETCore.App "))
        .filter_map(|line| line.split_whitespace().nth(1))
        .filter(|version| is_supported_dotnet_version(version))
        .map(str::to_string)
        .max_by(|a, b| parse_version_tuple(a).cmp(&parse_version_tuple(b)))
}

fn parse_version_tuple(v: &str) -> (u32, u32, u32) {
    let mut parts = v.split('.').filter_map(|p| p.parse::<u32>().ok());
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

fn is_supported_dotnet_version(version: &str) -> bool {
    version
        .split('.')
        .next()
        .and_then(|major| major.parse::<u32>().ok())
        .map(|major| major >= 6)
        .unwrap_or(false)
}

pub(super) fn detect_dotnet() -> (Option<String>, bool) {
    #[cfg(target_os = "windows")]
    let candidates = {
        let mut candidates = vec!["dotnet".to_string()];
        if let Ok(program_files) = std::env::var("PROGRAMFILES") {
            candidates.push(format!(r"{}\dotnet\dotnet.exe", program_files));
        }
        candidates
    };

    #[cfg(not(target_os = "windows"))]
    let candidates = {
        let mut candidates = vec![
            "dotnet".to_string(),
            "/usr/local/bin/dotnet".to_string(),
            "/usr/local/share/dotnet/dotnet".to_string(),
            "/opt/homebrew/bin/dotnet".to_string(),
        ];
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join(".dotnet/dotnet").to_string_lossy().into_owned());
        }
        candidates
    };

    for candidate in candidates {
        let mut command = Command::new(&candidate);
        command.arg("--list-runtimes");

        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);

        let Ok(output) = command.output() else {
            continue;
        };
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(version) =
            parse_dotnet_runtimes(&stdout).filter(|version| is_supported_dotnet_version(version))
        {
            return (Some(version), true);
        }
    }

    (None, false)
}

#[cfg(test)]
mod tests {
    use super::{is_supported_dotnet_version, parse_dotnet_runtimes};

    #[test]
    fn test_parse_dotnet_runtimes_found() {
        let output = "Microsoft.NETCore.App 6.0.25 [/usr/share/dotnet/shared/Microsoft.NETCore.App]\nMicrosoft.NETCore.App 8.0.1 [/usr/share/dotnet/shared/Microsoft.NETCore.App]";
        let result = parse_dotnet_runtimes(output);
        assert_eq!(result.as_deref(), Some("8.0.1"));
    }

    #[test]
    fn test_parse_dotnet_runtimes_too_old() {
        let output = "Microsoft.NETCore.App 5.0.0 [/usr/share/dotnet]";
        let result = parse_dotnet_runtimes(output);
        assert_eq!(result, None);
    }

    #[test]
    fn test_parse_dotnet_runtimes_empty_output() {
        let result = parse_dotnet_runtimes("");
        assert_eq!(result, None);
    }

    #[test]
    fn test_is_supported_dotnet_version_requires_major_6_or_higher() {
        assert!(!is_supported_dotnet_version("5.0.17"));
        assert!(is_supported_dotnet_version("6.0.0"));
        assert!(is_supported_dotnet_version("8.0.1"));
    }
}
