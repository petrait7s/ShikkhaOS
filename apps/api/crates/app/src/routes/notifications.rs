use axum::{extract::{Path, Query, State}, response::Response, routing::{get, post}, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;
use crate::{auth::Ctx, error::*, http::*, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/notifications", get(list))
        .route("/notifications/unread-count", get(unread))
        .route("/notifications/read-all", post(read_all))
        .route("/notifications/{id}/read", post(read_one))
}

#[derive(Deserialize)]
struct F { unread: Option<bool>, #[serde(rename = "type")] ty: Option<String> }

async fn list(State(s): State<AppState>, ctx: Ctx, Query(q): Query<PageQuery>, Query(f): Query<F>) -> ApiResult<Response> {
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT id, type, title, body, data, read_at, created_at FROM notifications WHERE user_id=$1 AND ($2::bool IS NOT TRUE OR read_at IS NULL) AND ($3::text IS NULL OR type=$3) ORDER BY created_at DESC, id LIMIT $4 OFFSET $5) t")
        .bind(ctx.user_id).bind(f.unread).bind(f.ty).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(crate::http::list(rows, &q))
}
async fn unread(State(s): State<AppState>, ctx: Ctx) -> ApiResult<Response> {
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM notifications WHERE user_id=$1 AND read_at IS NULL").bind(ctx.user_id).fetch_one(&s.db).await?;
    Ok(ok(json!({ "count": n })))
}
async fn read_all(State(s): State<AppState>, ctx: Ctx) -> ApiResult<Response> {
    let n = sqlx::query("UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL").bind(ctx.user_id).execute(&s.db).await?.rows_affected();
    Ok(ok(json!({ "updated": n })))
}
async fn read_one(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    let n = sqlx::query("UPDATE notifications SET read_at=COALESCE(read_at, now()) WHERE id=$1 AND user_id=$2").bind(id).bind(ctx.user_id).execute(&s.db).await?.rows_affected();
    if n == 0 { return Err(ApiError::not_found()); }
    Ok(ok(json!({ "read": true })))
}
