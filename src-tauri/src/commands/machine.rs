use std::fs;
use std::path::{Path, PathBuf};

#[tauri::command]
pub async fn load_machine_id() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let path = machine_id_file_path().ok_or_else(|| "machine id directory is unavailable".to_string())?;
        load_or_create_machine_id_at(&path)
    })
    .await
    .map_err(|err| format!("failed to join machine id loader: {err}"))?
}

pub fn machine_id_file_path() -> Option<PathBuf> {
    dirs::data_local_dir()
        .or_else(dirs::config_dir)
        .map(|dir| dir.join("BazaarPlusPlusInstaller").join("machine-id"))
}

pub fn load_or_create_machine_id_at(path: &Path) -> Result<String, String> {
    if let Ok(existing) = fs::read_to_string(path) {
        let machine_id = existing.trim();
        if !machine_id.is_empty() {
            return Ok(machine_id.to_string());
        }
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("failed to create machine id directory: {err}"))?;
    }

    let machine_id = uuid::Uuid::new_v4().to_string();
    fs::write(path, format!("{machine_id}\n"))
        .map_err(|err| format!("failed to write machine id file: {err}"))?;

    Ok(machine_id)
}

#[cfg(test)]
mod tests {
    use super::{load_or_create_machine_id_at, machine_id_file_path};

    #[test]
    fn machine_id_file_path_uses_app_specific_filename() {
        let path = machine_id_file_path().expect("expected path");
        assert_eq!(path.file_name().and_then(|name| name.to_str()), Some("machine-id"));
        assert!(path.to_string_lossy().contains("BazaarPlusPlusInstaller"));
    }

    #[test]
    fn load_or_create_machine_id_at_reuses_existing_file() {
        let temp_dir = tempfile::tempdir().expect("tempdir");
        let machine_id_path = temp_dir.path().join("machine-id");

        let first_id = load_or_create_machine_id_at(&machine_id_path).expect("first id");
        let second_id = load_or_create_machine_id_at(&machine_id_path).expect("second id");

        assert_eq!(first_id, second_id);
        assert!(!first_id.is_empty());
    }
}
