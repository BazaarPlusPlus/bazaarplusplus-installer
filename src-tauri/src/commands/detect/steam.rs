use keyvalues_parser::{Obj, Parser, Value};
use std::path::{Path, PathBuf};

fn first_obj<'a, 'text>(values: &'a [Value<'text>]) -> Option<&'a Obj<'text>>
where
    'a: 'text,
{
    values.first()?.get_obj()
}

fn first_str<'a, 'text>(values: &'a [Value<'text>]) -> Option<&'a str>
where
    'a: 'text,
{
    values.first()?.get_str()
}

fn library_has_app(folder: &Obj<'_>, app_id: &str) -> bool {
    folder
        .get("apps")
        .and_then(|values| first_obj(values))
        .map(|apps| apps.contains_key(app_id))
        .unwrap_or(false)
}

fn find_game_in_library_vdf(vdf_content: &str, app_id: &str) -> Option<String> {
    let parsed = Parser::new()
        .literal_special_chars(true)
        .parse(vdf_content)
        .ok()?;
    let libraries = parsed.value.get_obj()?;

    for values in libraries.values() {
        let Some(folder) = first_obj(values) else {
            continue;
        };
        let Some(library_path) = folder.get("path").and_then(|values| first_str(values)) else {
            continue;
        };

        if library_has_app(folder, app_id) {
            return Some(library_path.to_string());
        }
    }

    None
}

pub(super) fn get_steam_path() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let path = dirs::home_dir()?.join("Library/Application Support/Steam");
        if path.exists() {
            return Some(path);
        }
    }

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey(r"Software\Valve\Steam") {
            if let Ok(path) = key.get_value::<String, _>("SteamPath") {
                let path = PathBuf::from(path);
                if path.exists() {
                    return Some(path);
                }
            }
        }
    }

    None
}

pub(super) fn get_game_path(steam_path: &Path) -> Option<PathBuf> {
    // Primary: scan library VDF for app 1617400
    if let Some(path) = get_game_path_from_vdf(steam_path) {
        return Some(path);
    }

    // Fallback: The Bazaar might be in the default Steam library (same root as Steam itself).
    // This catches cases where VDF parsing fails or the default library is not listed.
    let candidate = steam_path.join("steamapps/common/The Bazaar");
    if candidate.exists() {
        return Some(candidate);
    }

    None
}

fn get_game_path_from_vdf(steam_path: &Path) -> Option<PathBuf> {
    let library_vdf =
        std::fs::read_to_string(steam_path.join("steamapps/libraryfolders.vdf")).ok()?;
    let library_root = find_game_in_library_vdf(&library_vdf, "1617400")?;
    let candidate = PathBuf::from(library_root).join("steamapps/common/The Bazaar");
    candidate.exists().then_some(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_game_in_library_vdf_returns_matching_library_path() {
        let vdf = r#"
"libraryfolders"
{
    "0"
    {
        "path"      "C:\Program Files (x86)\Steam"
        "apps"
        {
            "730"   "1"
        }
    }
    "1"
    {
        "path"      "D:\SteamLibrary"
        "apps"
        {
            "1617400"   "1"
        }
    }
}"#;

        let path = find_game_in_library_vdf(vdf, "1617400");

        assert_eq!(path.as_deref(), Some(r"D:\SteamLibrary"));
    }

    #[test]
    fn test_find_game_in_library_vdf_returns_none_when_app_missing() {
        let vdf = r#"
"libraryfolders"
{
    "0"
    {
        "path"      "C:\Program Files (x86)\Steam"
        "apps"
        {
            "730"   "1"
        }
    }
}"#;

        let path = find_game_in_library_vdf(vdf, "1617400");

        assert_eq!(path, None);
    }
}
