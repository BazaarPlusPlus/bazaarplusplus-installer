use serde::Serialize;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

const DEFAULT_HOST: &str = "127.0.0.1";
pub const DEFAULT_MAX_RECORDS: usize = 5;
const MAX_RECORDS_LIMIT: usize = 50;

#[derive(Clone, Debug, Serialize)]
pub struct StreamServiceStatus {
    pub running: bool,
    pub host: String,
    pub port: Option<u16>,
    pub overlay_url: Option<String>,
    pub using_fallback_port: bool,
    pub last_error: Option<String>,
    pub manual_from: Option<String>,
    pub started_at: Option<String>,
    pub effective_from: Option<String>,
    pub max_records: usize,
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
            manual_from: None,
            started_at: None,
            effective_from: None,
            max_records: DEFAULT_MAX_RECORDS,
        }
    }
}

fn clamp_max_records(value: usize) -> usize {
    value.clamp(1, MAX_RECORDS_LIMIT)
}

fn update_effective_from(status: &mut StreamServiceStatus) {
    status.effective_from = status.manual_from.clone();
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

    pub fn update_filters(
        &self,
        manual_from: Option<String>,
        max_records: usize,
    ) -> StreamServiceStatus {
        let mut inner = self.inner.lock().expect("stream runtime poisoned");
        inner.status.manual_from = manual_from.filter(|value| !value.trim().is_empty());
        inner.status.max_records = clamp_max_records(max_records);
        update_effective_from(&mut inner.status);
        inner.status.clone()
    }

    pub fn mark_started(&self, started_at: String) -> StreamServiceStatus {
        let mut inner = self.inner.lock().expect("stream runtime poisoned");
        inner.status.started_at = Some(started_at);
        update_effective_from(&mut inner.status);
        inner.status.clone()
    }

    pub fn set_idle(&self) -> StreamServiceStatus {
        let mut inner = self.inner.lock().expect("stream runtime poisoned");
        inner.status.running = false;
        inner.status.port = None;
        inner.status.overlay_url = None;
        inner.status.using_fallback_port = false;
        inner.status.started_at = None;
        update_effective_from(&mut inner.status);
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
        update_effective_from(&mut inner.status);
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
    use super::{StreamServiceStatus, DEFAULT_MAX_RECORDS};

    #[test]
    fn default_status_uses_default_record_limit() {
        let status = StreamServiceStatus::default();

        assert_eq!(status.max_records, DEFAULT_MAX_RECORDS);
        assert!(status.manual_from.is_none());
        assert!(status.started_at.is_none());
        assert!(status.effective_from.is_none());
    }

    #[test]
    fn status_can_represent_manual_filter_override() {
        let status = StreamServiceStatus {
            manual_from: Some("2026-04-11T20:00:00+08:00".to_string()),
            started_at: Some("2026-04-11T21:00:00+08:00".to_string()),
            effective_from: Some("2026-04-11T20:00:00+08:00".to_string()),
            max_records: 8,
            ..StreamServiceStatus::default()
        };

        assert_eq!(status.max_records, 8);
        assert_eq!(
            status.effective_from.as_deref(),
            Some("2026-04-11T20:00:00+08:00")
        );
    }

    #[test]
    fn runtime_state_uses_started_at_when_manual_filter_is_empty() {
        let state = super::StreamRuntimeState::default();

        state.update_filters(None, 9);
        state.mark_started("2026-04-11T21:00:00+08:00".to_string());

        let snapshot = state.snapshot();
        assert_eq!(snapshot.max_records, 9);
        assert_eq!(snapshot.effective_from, None);
    }
}
