use serde::Serialize;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

const DEFAULT_HOST: &str = "127.0.0.1";

#[derive(Clone, Debug, Serialize)]
pub struct StreamServiceStatus {
    pub running: bool,
    pub host: String,
    pub port: Option<u16>,
    pub overlay_url: Option<String>,
    pub using_fallback_port: bool,
    pub last_error: Option<String>,
    pub started_at: Option<String>,
}

impl Default for StreamServiceStatus {
    fn default() -> Self {
        Self {
            running: false,
            host: DEFAULT_HOST.to_string(),
            port: None,
            overlay_url: None,
            using_fallback_port: false,
            last_error: None,
            started_at: None,
        }
    }
}

pub struct StreamTaskHandle {
    pub shutdown: oneshot::Sender<()>,
    pub join_handle: tauri::async_runtime::JoinHandle<()>,
}

#[derive(Clone, Default)]
pub struct StreamRuntimeState {
    inner: Arc<Mutex<StreamRuntimeInner>>,
}

#[derive(Default)]
struct StreamRuntimeInner {
    status: StreamServiceStatus,
    task: Option<StreamTaskHandle>,
}

impl StreamRuntimeState {
    pub fn snapshot(&self) -> StreamServiceStatus {
        self.inner
            .lock()
            .expect("stream runtime poisoned")
            .status
            .clone()
    }

    pub fn set_running(&self, status: StreamServiceStatus, task: StreamTaskHandle) {
        let mut inner = self.inner.lock().expect("stream runtime poisoned");
        inner.status = status;
        inner.task = Some(task);
    }

    pub fn mark_started(&self, started_at: String) -> StreamServiceStatus {
        let mut inner = self.inner.lock().expect("stream runtime poisoned");
        inner.status.started_at = Some(started_at);
        inner.status.clone()
    }

    pub fn set_idle(&self) -> StreamServiceStatus {
        let mut inner = self.inner.lock().expect("stream runtime poisoned");
        inner.status.running = false;
        inner.status.port = None;
        inner.status.overlay_url = None;
        inner.status.using_fallback_port = false;
        inner.status.started_at = None;
        inner.task = None;
        inner.status.clone()
    }

    pub fn set_error(&self, message: String) {
        let mut inner = self.inner.lock().expect("stream runtime poisoned");
        inner.status.running = false;
        inner.status.port = None;
        inner.status.overlay_url = None;
        inner.status.using_fallback_port = false;
        inner.status.started_at = None;
        inner.status.last_error = Some(message);
        inner.task = None;
    }

    pub fn clear_error(&self) {
        let mut inner = self.inner.lock().expect("stream runtime poisoned");
        inner.status.last_error = None;
    }

    pub fn take_task(&self) -> Option<StreamTaskHandle> {
        self.inner
            .lock()
            .expect("stream runtime poisoned")
            .task
            .take()
    }
}

#[cfg(test)]
mod tests {
    use super::StreamServiceStatus;

    #[test]
    fn default_status_starts_idle_without_start_time() {
        let status = StreamServiceStatus::default();

        assert!(!status.running);
        assert!(status.started_at.is_none());
    }

    #[test]
    fn status_can_represent_running_service() {
        let status = StreamServiceStatus {
            running: true,
            port: Some(17654),
            overlay_url: Some("http://127.0.0.1:17654/overlay".to_string()),
            started_at: Some("2026-04-11T20:00:00+08:00".to_string()),
            ..StreamServiceStatus::default()
        };

        assert!(status.running);
        assert_eq!(status.port, Some(17654));
        assert_eq!(
            status.overlay_url.as_deref(),
            Some("http://127.0.0.1:17654/overlay")
        );
    }

    #[test]
    fn runtime_state_marks_started_time() {
        let state = super::StreamRuntimeState::default();

        state.mark_started("2026-04-11T21:00:00+08:00".to_string());

        let snapshot = state.snapshot();
        assert_eq!(
            snapshot.started_at.as_deref(),
            Some("2026-04-11T21:00:00+08:00")
        );
    }
}
