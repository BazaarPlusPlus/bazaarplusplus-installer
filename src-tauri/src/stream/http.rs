use super::records::{RecordRepository, StreamRecord};
use super::state::StreamRuntimeState;
use axum::{
    extract::{Path, State},
    http::{header, HeaderValue},
    response::{Html, IntoResponse, Response},
    routing::get,
    Json, Router,
};
use axum::http::StatusCode;
use serde::Serialize;

const OVERLAY_HTML: &str = include_str!("../../resources/stream/overlay.html");
const OVERLAY_CSS: &str = include_str!("../../resources/stream/overlay.css");
const OVERLAY_JS: &str = include_str!("../../resources/stream/overlay.js");

#[derive(Clone)]
pub struct HttpAppState {
    pub records: RecordRepository,
    pub runtime: StreamRuntimeState,
}

#[derive(Serialize)]
struct HealthResponse {
    ok: bool,
}

pub fn router(records: RecordRepository, runtime: StreamRuntimeState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/overlay", get(overlay_page))
        .route("/api/records/latest", get(latest_record))
        .route("/api/records/recent", get(recent_records))
        .route("/images/{record_id}", get(record_image))
        .route("/assets/overlay.css", get(overlay_css))
        .route("/assets/overlay.js", get(overlay_js))
        .with_state(HttpAppState { records, runtime })
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { ok: true })
}

async fn overlay_page() -> Html<&'static str> {
    Html(OVERLAY_HTML)
}

async fn latest_record(State(app_state): State<HttpAppState>) -> Json<Option<StreamRecord>> {
    let status = app_state.runtime.snapshot();
    Json(
        app_state
            .records
            .load_latest_filtered(status.effective_from.as_deref())
            .unwrap_or(None),
    )
}

async fn recent_records(State(app_state): State<HttpAppState>) -> Json<Vec<StreamRecord>> {
    let status = app_state.runtime.snapshot();
    Json(
        app_state
            .records
            .load_recent_filtered(status.effective_from.as_deref(), status.max_records)
            .unwrap_or_default(),
    )
}

async fn record_image(
    Path(record_id): Path<String>,
    State(app_state): State<HttpAppState>,
) -> Response {
    let Ok(Some((path, bytes))) = app_state.records.load_image(&record_id) else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let content_type = match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        _ => "application/octet-stream",
    };

    (
        [(
            header::CONTENT_TYPE,
            HeaderValue::from_str(content_type)
                .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
        )],
        bytes,
    )
        .into_response()
}

async fn overlay_css() -> Response {
    (
        [(
            header::CONTENT_TYPE,
            HeaderValue::from_static("text/css; charset=utf-8"),
        )],
        OVERLAY_CSS,
    )
        .into_response()
}

async fn overlay_js() -> Response {
    (
        [(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/javascript; charset=utf-8"),
        )],
        OVERLAY_JS,
    )
        .into_response()
}
