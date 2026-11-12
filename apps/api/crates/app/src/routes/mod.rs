use axum::Router;
use crate::state::AppState;

pub mod academic;
pub mod auth;
pub mod docs;
pub mod exams;
pub mod files;
pub mod homework;
pub mod marks;
pub mod attendance;
pub mod audit;
pub mod classtests;
pub mod messaging;
pub mod misc;
pub mod notices;
pub mod notifications;
pub mod results;
pub mod ws;
pub mod people;
pub mod reports;
pub mod search;
pub mod users;

pub fn router() -> Router<AppState> {
    let rest: Router<AppState> = Router::new().merge(auth::router()).merge(misc::router()).merge(users::router()).merge(academic::router()).merge(people::router()).merge(exams::router()).merge(marks::router()).merge(results::router()).merge(notifications::router()).merge(audit::router()).merge(attendance::router()).merge(classtests::router()).merge(messaging::router()).merge(ws::router()).merge(notices::router()).merge(homework::router()).merge(docs::router()).merge(reports::router()).merge(search::router());
    rest.layer(tower_http::limit::RequestBodyLimitLayer::new(2 * 1024 * 1024)).merge(files::router())
}
