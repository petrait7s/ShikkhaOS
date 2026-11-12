use crate::{auth::Ctx, error::ApiResult};
use serde_json::Value;
use sqlx::PgConnection;

pub async fn log(
    conn: &mut PgConnection,
    ctx: &Ctx,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    before: Option<Value>,
    after: Option<Value>,
) -> ApiResult<()> {
    sqlx::query("INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, before, after, ip, device_id, request_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
        .bind(ctx.user_id).bind(ctx.role.as_str()).bind(action).bind(entity_type).bind(entity_id).bind(before).bind(after)
        .bind(&ctx.ip).bind(ctx.device_id.to_string()).bind(&ctx.request_id)
        .execute(conn).await?;
    Ok(())
}

pub async fn log_system(
    conn: &mut PgConnection,
    actor: Option<uuid::Uuid>,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    after: Option<Value>,
) -> ApiResult<()> {
    sqlx::query("INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after) VALUES ($1,$2,$3,$4,$5)")
        .bind(actor).bind(action).bind(entity_type).bind(entity_id).bind(after).execute(conn).await?;
    Ok(())
}
