use super::{
    http,
    overlay_settings::OverlaySettingsStore,
    records::OverlayRecordRepository,
    state::{StreamRuntimeState, StreamServiceStatus, StreamTaskHandle},
};
use crate::commands::detect;
use chrono::{Local, SecondsFormat};
use std::path::PathBuf;
use tokio::{net::TcpListener, sync::oneshot};

const HOST: &str = "127.0.0.1";
const PREFERRED_PORT: u16 = 17654;
const MAX_PORT: u16 = 17674;

#[cfg_attr(not(test), allow(dead_code))]
pub fn choose_bind_port(host: &str, start: u16, end: u16) -> Result<u16, String> {
    for port in start..=end {
        if std::net::TcpListener::bind((host, port)).is_ok() {
            return Ok(port);
        }
    }

    Err(format!(
        "No available localhost port in range {start}-{end}"
    ))
}

pub async fn start(
    app: tauri::AppHandle,
    state: &StreamRuntimeState,
) -> Result<StreamServiceStatus, String> {
    let snapshot = state.snapshot();
    if snapshot.running {
        return Ok(snapshot);
    }

    state.clear_error();

    let (listener, port) = match bind_listener(HOST, PREFERRED_PORT, MAX_PORT).await {
        Ok(listener) => listener,
        Err(err) => {
            state.set_error(err.clone());
            return Err(err);
        }
    };
    let using_fallback_port = port != PREFERRED_PORT;
    let overlay_url = format!("http://{HOST}:{port}/overlay");
    let status_with_start = state.mark_started(current_timestamp());
    let game_path = match resolve_game_path(&app) {
        Ok(game_path) => game_path,
        Err(err) => {
            state.set_error(err.clone());
            return Err(err);
        }
    };
    let overlay_record_repository = OverlayRecordRepository::new(game_path.clone());
    let overlay_settings = OverlaySettingsStore::default();
    let router = http::router(overlay_record_repository, state.clone(), overlay_settings);
    let (shutdown_tx, shutdown_rx) = oneshot::channel();

    let join_handle = tauri::async_runtime::spawn(async move {
        let server = axum::serve(listener, router).with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        });

        if let Err(err) = server.await {
            eprintln!("stream service stopped with error: {err}");
        }
    });

    let status = StreamServiceStatus {
        running: true,
        host: HOST.to_string(),
        port: Some(port),
        overlay_url: Some(overlay_url),
        using_fallback_port,
        last_error: None,
        started_at: status_with_start.started_at,
    };
    state.set_running(
        status.clone(),
        StreamTaskHandle {
            shutdown: shutdown_tx,
            join_handle,
        },
        game_path.clone(),
    );

    Ok(status)
}

pub async fn stop(state: &StreamRuntimeState) -> Result<StreamServiceStatus, String> {
    if let Some(task) = state.take_task() {
        let _ = task.shutdown.send(());
        let _ = task.join_handle.await;
    }

    Ok(state.set_idle())
}

async fn bind_listener(host: &str, start: u16, end: u16) -> Result<(TcpListener, u16), String> {
    for port in start..=end {
        match TcpListener::bind((host, port)).await {
            Ok(listener) => return Ok((listener, port)),
            Err(_) => continue,
        }
    }

    Err(format!(
        "No available localhost port in range {start}-{end}"
    ))
}

fn resolve_game_path(app: &tauri::AppHandle) -> Result<Option<PathBuf>, String> {
    let env = detect::detect_environment(app.clone(), None)?;
    if let Some(path) = env.game_path.map(PathBuf::from) {
        return Ok(Some(path));
    }

    // Fallback: check well-known Windows Steam paths for the BazaarPlusPlus DB
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
            let path = PathBuf::from(candidate);
            if path
                .join("BazaarPlusPlus")
                .join("bazaarplusplus.db")
                .exists()
            {
                return Ok(Some(path));
            }
        }
    }

    Ok(None)
}

fn current_timestamp() -> String {
    Local::now().to_rfc3339_opts(SecondsFormat::Secs, false)
}

#[cfg(test)]
mod tests {
    use super::choose_bind_port;

    #[test]
    fn binds_fallback_port_when_preferred_port_is_occupied() {
        let occupied = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let occupied_port = occupied.local_addr().unwrap().port();
        let chosen = choose_bind_port("127.0.0.1", occupied_port, occupied_port + 10).unwrap();

        assert_ne!(chosen, occupied_port);
        drop(occupied);
    }
}
