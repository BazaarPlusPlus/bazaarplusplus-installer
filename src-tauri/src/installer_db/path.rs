use std::path::PathBuf;

pub fn default_installer_db_path() -> Option<PathBuf> {
    let base = dirs::data_local_dir()?;
    Some(base.join("BazaarPlusPlus").join("installer.db"))
}
