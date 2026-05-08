use crate::bazaardb::payload::ScreenshotMetadata;
use reqwest::{multipart, Client, StatusCode};
use serde::Deserialize;

#[derive(Debug)]
pub enum ValidateOutcome {
    Ok { account_name: String },
    Unauthorized,
}

#[derive(Deserialize)]
struct AuthMeResponse {
    account_name: String,
}

pub async fn validate_token(base_url: &str, pat: &str) -> Result<ValidateOutcome, String> {
    let client = Client::builder()
        .user_agent(concat!("bppinstaller/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|err| err.to_string())?;

    let response = client
        .get(format!("{base_url}/api/auth/me"))
        .bearer_auth(pat)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    match response.status() {
        StatusCode::OK => {
            let parsed: AuthMeResponse =
                response.json().await.map_err(|err| err.to_string())?;
            Ok(ValidateOutcome::Ok { account_name: parsed.account_name })
        }
        StatusCode::UNAUTHORIZED => Ok(ValidateOutcome::Unauthorized),
        other => Err(format!("unexpected status {other}")),
    }
}

#[derive(Deserialize)]
struct UploadResponse {
    id: String,
}

fn metadata_to_form(metadata: &ScreenshotMetadata) -> Result<multipart::Form, String> {
    let value = serde_json::to_value(metadata).map_err(|err| err.to_string())?;
    let object = value
        .as_object()
        .ok_or_else(|| "metadata did not serialize to a JSON object".to_string())?;

    let mut form = multipart::Form::new();
    for (key, value) in object {
        let text = match value {
            serde_json::Value::Null => continue,
            serde_json::Value::String(s) => s.clone(),
            serde_json::Value::Number(n) => n.to_string(),
            serde_json::Value::Bool(b) => b.to_string(),
            other => {
                return Err(format!(
                    "metadata field '{key}' has unsupported type for multipart text: {other}"
                ))
            }
        };
        form = form.text(key.clone(), text);
    }
    Ok(form)
}

pub async fn upload_screenshot(
    base_url: &str,
    pat: &str,
    metadata: &ScreenshotMetadata,
    image_bytes: &[u8],
) -> Result<String, String> {
    let image_part = multipart::Part::bytes(image_bytes.to_vec())
        .file_name("screenshot.jpg")
        .mime_str("image/jpeg")
        .map_err(|err| err.to_string())?;
    let form = metadata_to_form(metadata)?.part("image", image_part);

    let client = Client::builder()
        .user_agent(concat!("bppinstaller/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|err| err.to_string())?;

    let response = client
        .post(format!("{base_url}/api/uploads/screenshot"))
        .bearer_auth(pat)
        .multipart(form)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    let status = response.status();
    if status.is_success() {
        let parsed: UploadResponse = response.json().await.map_err(|err| err.to_string())?;
        Ok(parsed.id)
    } else if status == StatusCode::TOO_MANY_REQUESTS {
        let retry_after = response
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        Err(format!("rate_limited:{}", retry_after.unwrap_or_default()))
    } else if status.is_client_error() {
        Err(format!("client_error:{}", status.as_u16()))
    } else {
        Err(format!("server_error:{}", status.as_u16()))
    }
}

#[cfg(test)]
mod tests {
    use super::{validate_token, ValidateOutcome};
    use axum::{routing::get, Json, Router};
    use axum::extract::Multipart;
    use axum::routing::post;
    use crate::bazaardb::payload::ScreenshotMetadata;
    use serde_json::json;
    use std::net::SocketAddr;
    use tokio::net::TcpListener;

    async fn spawn_mock(handler: Router) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, handler).await.unwrap();
        });
        format!("http://{}", addr)
    }

    #[tokio::test]
    async fn validate_token_returns_account_name_on_200() {
        let app = Router::new().route("/api/auth/me", get(|| async {
            Json(json!({ "account_name": "Xinyu" }))
        }));
        let base = spawn_mock(app).await;

        let result = validate_token(&base, "pat-abc").await.unwrap();
        match result {
            ValidateOutcome::Ok { account_name } => assert_eq!(account_name, "Xinyu"),
            other => panic!("expected Ok, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn validate_token_returns_unauthorized_on_401() {
        let app = Router::new().route("/api/auth/me", get(|| async {
            (axum::http::StatusCode::UNAUTHORIZED, Json(json!({"error":"bad"})))
        }));
        let base = spawn_mock(app).await;

        let result = validate_token(&base, "pat-bad").await.unwrap();
        assert!(matches!(result, ValidateOutcome::Unauthorized));
    }

    #[tokio::test]
    async fn upload_screenshot_sends_flat_multipart_fields() {
        let app = Router::new().route(
            "/api/uploads/screenshot",
            post(|mut multipart: Multipart| async move {
                let mut saw_image = false;
                let mut text_fields: std::collections::HashMap<String, String> =
                    std::collections::HashMap::new();
                while let Some(field) = multipart.next_field().await.unwrap() {
                    let name = field.name().map(|s| s.to_string());
                    match name.as_deref() {
                        Some("image") => {
                            let _ = field.bytes().await.unwrap();
                            saw_image = true;
                        }
                        Some(other) => {
                            let key = other.to_string();
                            let value = field.text().await.unwrap();
                            text_fields.insert(key, value);
                        }
                        None => {}
                    }
                }

                assert!(saw_image, "image part missing");
                assert!(
                    !text_fields.contains_key("metadata"),
                    "metadata should not be a nested JSON field; got {:?}",
                    text_fields.keys().collect::<Vec<_>>()
                );
                assert_eq!(text_fields.get("screenshot_id").map(String::as_str), Some("snap-1"));
                assert_eq!(text_fields.get("player_account_id").map(String::as_str), Some("acct-9"));
                assert_eq!(
                    text_fields.get("captured_at_utc").map(String::as_str),
                    Some("2026-04-10T20:30:05+00:00")
                );
                assert_eq!(text_fields.get("schema_version").map(String::as_str), Some("1"));
                assert_eq!(text_fields.get("auto_uploaded").map(String::as_str), Some("false"));
                assert_eq!(text_fields.get("image_format").map(String::as_str), Some("jpeg"));
                // Optional fields with None defaults must not be sent.
                assert!(!text_fields.contains_key("run_id"));
                assert!(!text_fields.contains_key("hero_name"));
                assert!(!text_fields.contains_key("player_name"));

                Json(json!({"id": "remote-id-1"}))
            }),
        );
        let base = spawn_mock(app).await;

        let metadata = ScreenshotMetadata {
            screenshot_id: "snap-1".into(),
            player_account_id: "acct-9".into(),
            captured_at_utc: "2026-04-10T20:30:05+00:00".into(),
            ..Default::default()
        };
        let bytes = vec![0u8; 1024];

        let id = super::upload_screenshot(&base, "pat-abc", &metadata, &bytes)
            .await
            .unwrap();
        assert_eq!(id, "remote-id-1");
    }
}
