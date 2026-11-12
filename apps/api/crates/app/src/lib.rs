//! ShikkhaOS API library. Lint allowances below are deliberate: SQL rows are decoded as tuples (type_complexity),
//! and domain transitions take explicit context arguments (too_many_arguments).
#![allow(clippy::type_complexity, clippy::too_many_arguments)]
pub mod audit;
pub mod auth;
pub mod crud;
pub mod csv;
pub mod error;
pub mod groups;
pub mod http;
pub mod idempotency;
pub mod jobs;
pub mod notify;
pub mod pdf;
pub mod routes;
pub mod scope;
pub mod seed;
pub mod state;

use axum::{
    http::{header, HeaderName, HeaderValue, Method},
    Router,
};
use state::AppState;
use std::time::Duration;
use tower_http::{
    cors::CorsLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    set_header::SetResponseHeaderLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../../../database/migrations");

pub fn build_app(state: AppState) -> Router {
    let origins: Vec<HeaderValue> = state
        .cfg
        .allowed_origins
        .iter()
        .filter_map(|o| o.parse().ok())
        .collect();
    let cors = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::IF_MATCH,
            HeaderName::from_static("idempotency-key"),
            HeaderName::from_static("x-client"),
            HeaderName::from_static("x-device-id"),
            HeaderName::from_static("x-request-id"),
            HeaderName::from_static("x-reauth-token"),
        ])
        .expose_headers([
            HeaderName::from_static("x-request-id"),
            header::ETAG,
            header::RETRY_AFTER,
        ])
        .allow_credentials(true);
    let rid = HeaderName::from_static("x-request-id");
    Router::new()
        .nest(
            "/api/v1",
            routes::router().layer(axum::middleware::from_fn_with_state(
                state.clone(),
                idempotency::layer,
            )),
        )
        .with_state(state)
        .fallback(|| async { error::ApiError::not_found() })
        .layer(axum::middleware::from_fn(normalize_errors))
        .layer(TraceLayer::new_for_http())
        .layer(PropagateRequestIdLayer::new(rid.clone()))
        .layer(SetRequestIdLayer::new(rid, MakeRequestUuid))
        .layer(cors)
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("referrer-policy"),
            HeaderValue::from_static("no-referrer"),
        ))
        .layer(TimeoutLayer::with_status_code(
            axum::http::StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(30),
        ))
}

/// Turn framework rejections (plain-text 4xx from extractors, 405, 413, 415, ...) into the contract error envelope.
async fn normalize_errors(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    use axum::response::IntoResponse;
    let resp = next.run(req).await;
    let st = resp.status();
    if !(st.is_client_error() || st.is_server_error()) {
        return resp;
    }
    let is_json = resp
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.starts_with("application/json"))
        .unwrap_or(false);
    if is_json {
        return resp;
    }
    let (code, msg): (&'static str, &str) = match st.as_u16() {
        400 => ("BAD_REQUEST", "Malformed request"),
        401 => ("UNAUTHENTICATED", "Authentication required"),
        403 => ("FORBIDDEN", "Forbidden"),
        404 => ("NOT_FOUND", "Resource not found"),
        405 => ("METHOD_NOT_ALLOWED", "Method not allowed"),
        408 => ("TIMEOUT", "Request timed out"),
        413 => ("PAYLOAD_TOO_LARGE", "Payload too large"),
        415 => (
            "UNSUPPORTED_MEDIA_TYPE",
            "Content-Type must be application/json",
        ),
        422 => ("VALIDATION_FAILED", "Request body could not be processed"),
        s if s >= 500 => ("INTERNAL", "Internal server error"),
        _ => ("BAD_REQUEST", "Request rejected"),
    };
    error::ApiError::new(st.as_u16(), code, msg).into_response()
}
