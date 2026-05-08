use reqwest::{Client, StatusCode};
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

#[cfg(test)]
mod tests {
    use super::{validate_token, ValidateOutcome};
    use axum::{routing::get, Json, Router};
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
}
