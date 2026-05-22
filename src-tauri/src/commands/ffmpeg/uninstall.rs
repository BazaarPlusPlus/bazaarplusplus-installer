// Removal of the installer-managed `tools/ffmpeg/` subtree. Intentionally
// scoped to that single subdirectory — `tools/` is shared real estate for any
// future installer-managed binaries.
use std::path::Path;

use super::state;

/// Delete `tools/ffmpeg/` if present. Best-effort cleanup: the parent
/// `tools/` directory is removed only when it's empty after the FFmpeg subtree
/// goes away, otherwise we leave it for whatever sibling tool lives there.
pub(crate) fn remove_ffmpeg_dir(game_path: &Path) -> Result<(), String> {
    let ffmpeg_dir = state::ffmpeg_dir(game_path);
    if ffmpeg_dir.exists() {
        std::fs::remove_dir_all(&ffmpeg_dir).map_err(|err| {
            format!("Cannot remove {}: {err}", ffmpeg_dir.display())
        })?;
    }

    let tools_dir = state::tools_root_dir(game_path);
    if tools_dir.exists() {
        // `read_dir` succeeds even when the directory is empty; if it errors
        // we just leave the directory alone — removing it is opportunistic.
        if let Ok(mut entries) = std::fs::read_dir(&tools_dir) {
            if entries.next().is_none() {
                let _ = std::fs::remove_dir(&tools_dir);
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch_ffmpeg_layout(game: &Path) {
        let dir = state::ffmpeg_dir(game);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(state::ffmpeg_binary_name()), b"binary").unwrap();
        std::fs::write(dir.join("LICENSE.txt"), b"license").unwrap();
    }

    #[test]
    fn removes_tools_ffmpeg_subtree() {
        let tmp = tempfile::tempdir().unwrap();
        touch_ffmpeg_layout(tmp.path());

        remove_ffmpeg_dir(tmp.path()).unwrap();

        assert!(!state::ffmpeg_dir(tmp.path()).exists());
    }

    #[test]
    fn removes_empty_tools_parent_after_cleanup() {
        let tmp = tempfile::tempdir().unwrap();
        touch_ffmpeg_layout(tmp.path());

        remove_ffmpeg_dir(tmp.path()).unwrap();

        assert!(!state::tools_root_dir(tmp.path()).exists());
    }

    #[test]
    fn keeps_tools_parent_when_other_tool_exists() {
        let tmp = tempfile::tempdir().unwrap();
        touch_ffmpeg_layout(tmp.path());
        let other_tool_dir = state::tools_root_dir(tmp.path()).join("other-tool");
        std::fs::create_dir_all(&other_tool_dir).unwrap();
        std::fs::write(other_tool_dir.join("marker"), b"x").unwrap();

        remove_ffmpeg_dir(tmp.path()).unwrap();

        assert!(!state::ffmpeg_dir(tmp.path()).exists());
        assert!(other_tool_dir.exists());
        assert!(state::tools_root_dir(tmp.path()).exists());
    }

    #[test]
    fn noop_when_ffmpeg_dir_missing() {
        let tmp = tempfile::tempdir().unwrap();

        remove_ffmpeg_dir(tmp.path()).unwrap();
    }
}
