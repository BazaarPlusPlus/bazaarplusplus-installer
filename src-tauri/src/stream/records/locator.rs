use std::path::{Path, PathBuf};

pub(crate) const DATA_DIRECTORY: &str = "BazaarPlusPlus";
pub(crate) const SCREENSHOTS_DIRECTORY: &str = "Screenshots";
pub(crate) const DATABASE_FILE_NAME: &str = "bazaarplusplus.db";

pub fn resolve_database_path(game_path: &Path) -> Result<PathBuf, String> {
    let data_dir = game_path.join(DATA_DIRECTORY);
    if !data_dir.exists() {
        return Err(format!(
            "BazaarPlusPlus data directory not found: {}",
            data_dir.display()
        ));
    }

    let candidate = data_dir.join(DATABASE_FILE_NAME);
    if candidate.exists() {
        return Ok(candidate);
    }

    Err(format!(
        "Expected stream database at {}, but bazaarplusplus.db was not found.",
        candidate.display()
    ))
}

pub(super) fn find_database_path_anywhere() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let candidates = [
            r"C:\Program Files (x86)\Steam\steamapps\common\The Bazaar",
            r"C:\Program Files\Steam\steamapps\common\The Bazaar",
            r"D:\Steam\steamapps\common\The Bazaar",
            r"D:\SteamLibrary\steamapps\common\The Bazaar",
            r"E:\Steam\steamapps\common\The Bazaar",
            r"E:\SteamLibrary\steamapps\common\The Bazaar",
        ];
        for candidate in &candidates {
            let db = PathBuf::from(candidate)
                .join(DATA_DIRECTORY)
                .join(DATABASE_FILE_NAME);
            if db.exists() {
                return Ok(db);
            }
        }
    }
    Err(
        "bazaarplusplus.db not found: game path is not configured and no known Steam library path contains it."
            .to_string(),
    )
}
