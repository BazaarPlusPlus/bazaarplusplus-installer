//! Canonical Tauri IPC registration. Edit the command list only inside `with_commands!`.

macro_rules! with_commands {
    ($macro:ident) => {
        $macro! {
            (commands::app, get_app_bootstrap),
            (tray, set_app_locale),
            (commands::install, get_install_state),
            (commands::install, choose_game_directory),
            (commands::install, install_mod),
            (commands::install, reset_bpp_data),
            (commands::install, reset_bepinex),
            (commands::install, uninstall_mod),
            (commands::install, launch_game),
            (commands::stream, get_stream_status),
            (commands::stream, ensure_stream_session),
            (commands::stream, restart_stream_session),
            (commands::stream, set_stream_window),
            (commands::stream, get_overlay_settings),
            (commands::stream, save_overlay_display_mode),
            (commands::stream, apply_overlay_crop_code),
            (commands::stream, reset_overlay_crop),
            (commands::history, list_history_runs),
            (commands::history, get_history_run_detail),
            (commands::history, reveal_run_screenshot),
            (commands::history, reveal_battle_video),
            (commands::history, delete_battle_video),
            (commands::history, delete_run_videos),
            (commands::history, preview_screenshot_cleanup),
            (commands::history, execute_screenshot_cleanup),
            (commands::history, preview_run_data_cleanup),
            (commands::history, execute_run_data_cleanup)
        }
    };
}

macro_rules! bpp_command_names {
    ($(($mod:path, $name:ident)),* $(,)?) => {
        /// Exported to the frontend by the `export_bindings_tauri_command_names`
        /// test; `scripts/generate-bindings.mjs` consumes that artifact.
        #[allow(dead_code)]
        pub const TAURI_COMMAND_NAMES: &[&str] = &[$(stringify!($name)),*];
    };
}

macro_rules! bpp_invoke_handler {
    ($(($mod:path, $name:ident)),* $(,)?) => {
        #[macro_export]
        macro_rules! invoke_handler {
            () => {
                tauri::generate_handler![$($crate::$mod::$name),*]
            };
        }
    };
}

with_commands! { bpp_command_names }
with_commands! { bpp_invoke_handler }

#[cfg(test)]
mod tests {
    use super::TAURI_COMMAND_NAMES;

    /// Newline-delimited artifact consumed by scripts/generate-bindings.mjs.
    fn command_names_artifact() -> String {
        let mut contents = TAURI_COMMAND_NAMES.join("\n");
        contents.push('\n');
        contents
    }

    #[test]
    fn command_names_artifact_is_complete_and_terminated() {
        let artifact = command_names_artifact();
        assert!(artifact.ends_with('\n'));
        assert_eq!(artifact.lines().count(), TAURI_COMMAND_NAMES.len());
    }

    /// Producer. `export_bindings` prefix is load-bearing: it matches the
    /// `cargo test export_bindings` filter generate-bindings.mjs already runs
    /// for ts-rs, so one cargo invocation emits both the .ts files and this
    /// artifact. Env-gated: plain `cargo test` (npm run test:rust) writes nothing.
    #[test]
    fn export_bindings_tauri_command_names() {
        let Ok(path) = std::env::var("BPP_TAURI_COMMAND_NAMES_FILE") else {
            return;
        };
        std::fs::write(&path, command_names_artifact())
            .unwrap_or_else(|err| panic!("write command names artifact {path}: {err}"));
    }
}
