//! `Idempotency-Key` support for POST requests (contract C9): replays return the original 2xx response.
use axum::{body::{to_bytes, Body}, extract::{Request, State}, http::{HeaderValue, Method}, middleware::Next, response::{IntoResponse, Response}};
use serde_json::Value;
use uuid::Uuid;
use crate::state::AppState;

pub async fn layer(State(s): State<AppState>, req: Request, next: Next) -> Response {
    let key = req.headers().get("idempotency-key").and_then(|h| h.to_str().ok()).filter(|k| Uuid::parse_str(k).is_ok()).map(String::from);
    let user = req.headers().get("authorization").and_then(|h| h.to_str().ok()).and_then(|h| h.strip_prefix("Bearer ")).and_then(|t| crate::auth::subject_of(&s, t));
    let (Some(key), Some(user), true) = (key, user, req.method() == Method::POST) else { return next.run(req).await };
    let path = req.uri().path().to_string();
    if let Ok(Some((status, body, p))) = sqlx::query_as::<_, (i32, Value, String)>("SELECT status, response, path FROM idempotency_keys WHERE user_id=$1 AND key=$2").bind(user).bind(&key).fetch_optional(&s.db).await {
        if p != path { return crate::error::ApiError::conflict("IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was used for a different request").into_response(); }
        let mut r = (axum::http::StatusCode::from_u16(status as u16).unwrap_or(axum::http::StatusCode::OK), axum::Json(body)).into_response();
        r.headers_mut().insert("idempotent-replayed", HeaderValue::from_static("true"));
        return r;
    }
    let resp = next.run(req).await;
    if !resp.status().is_success() { return resp; }
    let (parts, body) = resp.into_parts();
    let Ok(bytes) = to_bytes(body, 2 * 1024 * 1024).await else { return crate::error::ApiError::internal().into_response() };
    if let Ok(v) = serde_json::from_slice::<Value>(&bytes) {
        let _ = sqlx::query("INSERT INTO idempotency_keys (user_id, key, method, path, status, response) VALUES ($1,$2,'POST',$3,$4,$5) ON CONFLICT DO NOTHING").bind(user).bind(&key).bind(&path).bind(parts.status.as_u16() as i32).bind(v).execute(&s.db).await;
    }
    Response::from_parts(parts, Body::from(bytes))
}
