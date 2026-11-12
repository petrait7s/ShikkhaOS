pub mod audit;
pub mod auth;
pub mod crud;
pub mod error;
pub mod groups;
pub mod http;
pub mod notify;
pub mod routes;
pub mod scope;
pub mod seed;
pub mod state;

use std::time::Duration;
use axum::{http::{header, HeaderName, HeaderValue, Method}, Router};
use tower_http::{cors::CorsLayer, limit::RequestBodyLimitLayer, request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer}, set_header::SetResponseHeaderLayer, timeout::TimeoutLayer, trace::TraceLayer};
use state::AppState;

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../../../database/migrations");

pub fn build_app(state: AppState) -> Router {
    let origins: Vec<HeaderValue> = state.cfg.allowed_origins.iter().filter_map(|o| o.parse().ok()).collect();
    let cors = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::PATCH, Method::DELETE, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::IF_MATCH, HeaderName::from_static("idempotency-key"), HeaderName::from_static("x-client"), HeaderName::from_static("x-device-id"), HeaderName::from_static("x-request-id"), HeaderName::from_static("x-reauth-token")])
        .expose_headers([HeaderName::from_static("x-request-id"), header::ETAG, header::RETRY_AFTER])
        .allow_credentials(true);
    let rid = HeaderName::from_static("x-request-id");
    Router::new()
        .nest("/api/v1", routes::router())
        .with_state(state)
        .layer(TraceLayer::new_for_http())
        .layer(PropagateRequestIdLayer::new(rid.clone()))
        .layer(SetRequestIdLayer::new(rid, MakeRequestUuid))
        .layer(cors)
        .layer(SetResponseHeaderLayer::overriding(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff")))
        .layer(SetResponseHeaderLayer::overriding(header::CACHE_CONTROL, HeaderValue::from_static("no-store")))
        .layer(SetResponseHeaderLayer::overriding(HeaderName::from_static("referrer-policy"), HeaderValue::from_static("no-referrer")))
        .layer(RequestBodyLimitLayer::new(2 * 1024 * 1024))
        .layer(TimeoutLayer::new(Duration::from_secs(30)))
}

