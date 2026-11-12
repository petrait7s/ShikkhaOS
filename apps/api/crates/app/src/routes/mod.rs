use axum::Router;
use crate::state::AppState;

pub mod academic;
pub mod auth;
pub mod exams;
pub mod marks;
pub mod attendance;
pub mod audit;
pub mod classtests;
pub mod messaging;
pub mod misc;
pub mod notifications;
pub mod results;
pub mod ws;
pub mod people;
pub mod users;

pub fn router() -> Router<AppState> {
    Router::new().merge(auth::router()).merge(misc::router()).merge(users::router()).merge(academic::router()).merge(people::router()).merge(exams::router()).merge(marks::router()).merge(results::router()).merge(notifications::router()).merge(audit::router()).merge(attendance::router()).merge(classtests::router()).merge(messaging::router()).merge(ws::router())
}
