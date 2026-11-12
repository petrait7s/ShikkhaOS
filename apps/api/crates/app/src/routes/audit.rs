use crate::{audit, auth::Ctx, error::*, http::*, state::AppState};
use axum::{
    extract::{Query, State},
    response::Response,
    routing::{get, post},
    Router,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use uuid::Uuid;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/audit-logs", get(list))
        .route("/audit-logs/export", post(export))
}

const SEL: &str = "SELECT a.id, a.actor_id, u.display_name AS actor_name, a.actor_role, a.action, a.entity_type, a.entity_id, a.before, a.after, a.ip, a.device_id, a.request_id, a.created_at FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id";
const WHERE: &str = "WHERE ($1::uuid IS NULL OR a.actor_id=$1) AND ($2::text IS NULL OR a.action ILIKE $2) AND ($3::text IS NULL OR a.entity_type=$3) AND ($4::text IS NULL OR a.entity_id=$4) AND ($5::timestamptz IS NULL OR a.created_at >= $5) AND ($6::timestamptz IS NULL OR a.created_at < $6)";

struct Filt {
    actor: Option<Uuid>,
    action: Option<String>,
    entity_type: Option<String>,
    entity_id: Option<String>,
    from: Option<chrono::DateTime<chrono::Utc>>,
    to: Option<chrono::DateTime<chrono::Utc>>,
}
fn filt(f: &HashMap<String, String>) -> Filt {
    let d = |k: &str| {
        f.get(k)
            .and_then(|v| chrono::DateTime::parse_from_rfc3339(v).ok())
            .map(|d| d.with_timezone(&chrono::Utc))
    };
    Filt {
        actor: f.get("actorId").and_then(|v| Uuid::parse_str(v).ok()),
        action: f.get("action").map(|a| format!("{}%", a.replace('%', ""))),
        entity_type: f.get("entityType").cloned(),
        entity_id: f.get("entityId").cloned(),
        from: d("from"),
        to: d("to"),
    }
}

async fn list(
    State(s): State<AppState>,
    ctx: Ctx,
    Query(q): Query<PageQuery>,
    Query(f): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    ctx.require("audit.read")?;
    let x = filt(&f);
    let rows: Vec<Value> = sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM ({SEL} {WHERE} ORDER BY a.created_at DESC, a.id DESC LIMIT $7 OFFSET $8) t"))
        .bind(x.actor).bind(x.action).bind(x.entity_type).bind(x.entity_id).bind(x.from).bind(x.to).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(crate::http::list(rows, &q))
}

fn csv_cell(v: &str) -> String {
    let safe = if v.starts_with(['=', '+', '-', '@']) {
        format!("'{v}")
    } else {
        v.to_string()
    }; // CSV-injection guard
    format!("\"{}\"", safe.replace('"', "\"\""))
}

async fn export(
    State(s): State<AppState>,
    ctx: Ctx,
    Query(f): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    ctx.require("audit.export")?;
    let x = filt(&f);
    let rows: Vec<(chrono::DateTime<chrono::Utc>, Option<String>, Option<String>, String, String, Option<String>)> = sqlx::query_as(&format!("SELECT a.created_at, u.display_name, a.actor_role, a.action, a.entity_type, a.entity_id FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id {WHERE} ORDER BY a.created_at DESC LIMIT 10000"))
        .bind(x.actor).bind(x.action).bind(x.entity_type).bind(x.entity_id).bind(x.from).bind(x.to).fetch_all(&s.db).await?;
    let mut csv = String::from("time,actor,role,action,entityType,entityId\n");
    for r in &rows {
        csv.push_str(&format!(
            "{},{},{},{},{},{}\n",
            csv_cell(&r.0.to_rfc3339()),
            csv_cell(r.1.as_deref().unwrap_or("")),
            csv_cell(r.2.as_deref().unwrap_or("")),
            csv_cell(&r.3),
            csv_cell(&r.4),
            csv_cell(r.5.as_deref().unwrap_or(""))
        ));
    }
    audit::log(
        &mut *s.db.acquire().await?,
        &ctx,
        "audit.exported",
        "audit_log",
        "export",
        None,
        Some(json!({ "rows": rows.len() })),
    )
    .await?;
    Ok(ok(
        json!({ "filename": "audit-log.csv", "mimeType": "text/csv", "rows": rows.len(), "content": csv }),
    ))
}
