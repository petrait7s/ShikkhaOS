use axum::Router;
use crate::state::AppState;

pub mod auth;
pub mod misc;

pub fn router() -> Router<AppState> {
    Router::new().merge(auth::router()).merge(misc::router())
}
