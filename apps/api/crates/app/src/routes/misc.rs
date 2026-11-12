use crate::{error::*, http::ok, state::AppState};
use axum::{extract::State, response::Response, routing::get, Router};
use serde_json::json;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
}

async fn health(State(s): State<AppState>) -> Response {
    ok(json!({ "status": "ok", "version": s.cfg.version }))
}

async fn ready(State(s): State<AppState>) -> ApiResult<Response> {
    sqlx::query("SELECT 1")
        .execute(&s.db)
        .await
        .map_err(|_| ApiError::new(503, "UNAVAILABLE", "Database unavailable"))?;
    Ok(ok(json!({ "status": "ready" })))
}
