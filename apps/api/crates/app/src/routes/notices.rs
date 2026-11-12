use std::collections::HashMap;
use axum::{extract::{Path, Query, State}, http::HeaderMap, response::Response, routing::{get, post}, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use shikkhaos_domain::{permissions::Role, validation as v};
use uuid::Uuid;
use crate::{audit, auth::Ctx, error::*, http::*, notify::Outbox, scope, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/notices", get(list).post(create))
        .route("/notices/{id}", get(get_one).patch(patch))
        .route("/notices/{id}/publish", post(publish))
        .route("/notices/{id}/archive", post(archive))
}

#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct Audience { #[serde(default)] roles: Vec<String>, #[serde(default)] class_ids: Vec<Uuid>, #[serde(default)] section_ids: Vec<Uuid> }

const SEL: &str = "SELECT n.id, n.title, n.body, n.audience, n.status, n.published_at, n.pinned, n.attachment_file_ids, n.created_by, u.display_name AS created_by_name, n.version, n.created_at, n.updated_at FROM notices n JOIN users u ON u.id = n.created_by";

/// Audience semantics: no roles + no scope = everyone; roles only = every user of those roles; scope (classes/sections)
/// only = students enrolled and teachers assigned there; roles + scope = that scope narrowed to those roles.
async fn audience_users(conn: &mut sqlx::PgConnection, a: &Audience) -> ApiResult<Vec<Uuid>> {
    let scope_empty = a.class_ids.is_empty() && a.section_ids.is_empty();
    if scope_empty {
        return Ok(sqlx::query_scalar("SELECT id FROM users WHERE status='ACTIVE' AND (cardinality($1::text[]) = 0 OR role = ANY($1))").bind(&a.roles).fetch_all(conn).await?);
    }
    Ok(sqlx::query_scalar("SELECT DISTINCT u.id FROM (
        SELECT st.user_id AS id FROM enrollments e JOIN students st ON st.id=e.student_id JOIN academic_sessions s ON s.id=e.session_id AND s.is_current WHERE e.status='ACTIVE' AND (e.class_id = ANY($2) OR e.section_id = ANY($3))
        UNION SELECT t.user_id FROM teacher_assignments x JOIN teachers t ON t.id=x.teacher_id JOIN academic_sessions s ON s.id=x.session_id AND s.is_current WHERE (x.class_id = ANY($2) OR x.section_id = ANY($3))) q
        JOIN users u ON u.id = q.id AND u.status='ACTIVE' WHERE cardinality($1::text[]) = 0 OR u.role = ANY($1)")
        .bind(&a.roles).bind(&a.class_ids).bind(&a.section_ids).fetch_all(conn).await?)
}

async fn list(State(s): State<AppState>, ctx: Ctx, Query(q): Query<PageQuery>, Query(f): Query<HashMap<String, String>>) -> ApiResult<Response> {
    ctx.require("notices.read")?;
    let staff_all = matches!(ctx.role, Role::Headmaster | Role::Registrar);
    let rows: Vec<Value> = sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM ({SEL} WHERE ($1::text IS NULL OR n.status=$1) AND ($2::text IS NULL OR n.title ILIKE $2) AND ( $3 OR n.created_by=$4 OR (n.status='PUBLISHED' AND ( \
        (jsonb_array_length(n.audience->'roles') + jsonb_array_length(n.audience->'classIds') + jsonb_array_length(n.audience->'sectionIds') = 0) \
        OR (jsonb_array_length(n.audience->'classIds') + jsonb_array_length(n.audience->'sectionIds') = 0 AND n.audience->'roles' ? $5) \
        OR (jsonb_array_length(n.audience->'classIds') + jsonb_array_length(n.audience->'sectionIds') > 0 AND (jsonb_array_length(n.audience->'roles') = 0 OR n.audience->'roles' ? $5) AND ( \
            EXISTS (SELECT 1 FROM enrollments e JOIN students st ON st.id=e.student_id JOIN academic_sessions s ON s.id=e.session_id AND s.is_current WHERE st.user_id=$4 AND e.status='ACTIVE' AND (n.audience->'classIds' ? e.class_id::text OR n.audience->'sectionIds' ? e.section_id::text)) \
            OR EXISTS (SELECT 1 FROM teacher_assignments x JOIN teachers t ON t.id=x.teacher_id JOIN academic_sessions s ON s.id=x.session_id AND s.is_current WHERE t.user_id=$4 AND (n.audience->'classIds' ? x.class_id::text OR n.audience->'sectionIds' ? x.section_id::text))))))) \
        ORDER BY n.pinned DESC, COALESCE(n.published_at, n.created_at) DESC, n.id LIMIT $6 OFFSET $7) t"))
        .bind(f.get("status")).bind(q.like()).bind(staff_all).bind(ctx.user_id).bind(ctx.role.as_str()).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    // students never see unpublished notices (guarded in SQL: created_by never matches a student-authored draft)
    Ok(crate::http::list(rows, &q))
}

async fn fetch(db: &sqlx::PgPool, id: Uuid) -> ApiResult<Value> { sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM ({SEL} WHERE n.id=$1) t")).bind(id).fetch_optional(db).await?.ok_or_else(ApiError::not_found) }

async fn get_one(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    ctx.require("notices.read")?;
    let n = fetch(&s.db, id).await?;
    let visible = ctx.role == Role::Headmaster || ctx.role == Role::Registrar || n["created_by"].as_str() == Some(&ctx.user_id.to_string()) || n["status"] == "PUBLISHED";
    if !visible { return Err(ApiError::not_found()); }
    // published notice must target the reader
    if n["status"] == "PUBLISHED" && !matches!(ctx.role, Role::Headmaster | Role::Registrar) && n["created_by"].as_str() != Some(&ctx.user_id.to_string()) {
        let mut conn = s.db.acquire().await?;
        let aud: Audience = serde_json::from_value(n["audience"].clone()).unwrap_or_default();
        let empty = aud.roles.is_empty() && aud.class_ids.is_empty() && aud.section_ids.is_empty();
        if !empty && !audience_users(&mut conn, &aud).await?.contains(&ctx.user_id) { return Err(ApiError::not_found()); }
    }
    Ok(ok(n))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct New { title: String, body: String, #[serde(default)] audience: Audience, #[serde(default)] pinned: bool, #[serde(default)] attachment_file_ids: Vec<Uuid> }

fn check_audience(a: &Audience) -> ApiResult<()> {
    for r in &a.roles { if !matches!(r.as_str(), "HEADMASTER" | "REGISTRAR" | "TEACHER" | "STUDENT") { return Err(ApiError::field("audience.roles", "INVALID_VALUE", "Unknown role")); } }
    Ok(())
}

async fn create(State(s): State<AppState>, ctx: Ctx, Json(r): Json<New>) -> ApiResult<Response> {
    ctx.require("notices.create")?;
    v::text("title", &r.title, 1, 200)?; v::text("body", &r.body, 1, 5000)?; check_audience(&r.audience)?;
    if r.pinned { ctx.require("notices.publish")?; }
    let id: Uuid = sqlx::query_scalar("INSERT INTO notices (title, body, audience, pinned, attachment_file_ids, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id")
        .bind(r.title.trim()).bind(r.body.trim()).bind(json!({ "roles": r.audience.roles, "classIds": r.audience.class_ids, "sectionIds": r.audience.section_ids })).bind(r.pinned).bind(&r.attachment_file_ids).bind(ctx.user_id).fetch_one(&s.db).await?;
    audit::log(&mut *s.db.acquire().await?, &ctx, "notice.created", "notice", &id.to_string(), None, None).await?;
    Ok(created(fetch(&s.db, id).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Patch { title: Option<String>, body: Option<String>, audience: Option<Audience>, pinned: Option<bool>, version: Option<i32> }

async fn patch(State(s): State<AppState>, ctx: Ctx, h: HeaderMap, Path(id): Path<Uuid>, Json(r): Json<Patch>) -> ApiResult<Response> {
    ctx.require("notices.create")?;
    let cur = fetch(&s.db, id).await?;
    let own = cur["created_by"].as_str() == Some(&ctx.user_id.to_string());
    if !own && !ctx.has("notices.publish") { return Err(ApiError::not_found()); }
    if cur["status"] != "DRAFT" && cur["status"] != "PENDING_APPROVAL" && (r.title.is_some() || r.body.is_some() || r.audience.is_some()) { return Err(ApiError::conflict("NOTICE_LOCKED", "Published notices cannot be edited; archive and create a new one")); }
    if r.pinned.is_some() { ctx.require("notices.publish")?; }
    if let Some(t) = &r.title { v::text("title", t, 1, 200)?; }
    if let Some(b) = &r.body { v::text("body", b, 1, 5000)?; }
    if let Some(a) = &r.audience { check_audience(a)?; }
    let aud = r.audience.map(|a| json!({ "roles": a.roles, "classIds": a.class_ids, "sectionIds": a.section_ids }));
    let n = sqlx::query("UPDATE notices SET title=COALESCE($2,title), body=COALESCE($3,body), audience=COALESCE($4,audience), pinned=COALESCE($5,pinned), version=version+1, updated_at=now() WHERE id=$1 AND ($6::int IS NULL OR version=$6)")
        .bind(id).bind(r.title.map(|x| x.trim().to_string())).bind(r.body.map(|x| x.trim().to_string())).bind(aud).bind(r.pinned).bind(parse_version(&h, r.version)).execute(&s.db).await?.rows_affected();
    if n == 0 { return Err(scope::missing_or_conflict(&s.db, "notices", id).await); }
    Ok(ok(fetch(&s.db, id).await?))
}

/// Publishing: `notices.publish` holders may publish anything; teachers may publish their own notice only when it targets
/// sections they are assigned to; otherwise it goes to PENDING_APPROVAL.
async fn publish(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    ctx.require("notices.create")?;
    let cur = fetch(&s.db, id).await?;
    let own = cur["created_by"].as_str() == Some(&ctx.user_id.to_string());
    if !own && !ctx.has("notices.publish") { return Err(ApiError::not_found()); }
    if !matches!(cur["status"].as_str(), Some("DRAFT") | Some("PENDING_APPROVAL")) { return Err(ApiError::invalid_transition("Only draft or pending notices can be published")); }
    let aud: Audience = serde_json::from_value(cur["audience"].clone()).unwrap_or_default();
    let mut direct = ctx.has("notices.publish");
    if !direct && ctx.role == Role::Teacher && !aud.section_ids.is_empty() && aud.roles.is_empty() && aud.class_ids.is_empty() {
        let t = scope::require_teacher(&s.db, &ctx).await?;
        let ses = scope::current_session(&s.db).await?;
        direct = true;
        for sec in &aud.section_ids { if !scope::teacher_assigned(&s.db, t, ses, *sec, None).await? { direct = false; } }
    }
    if !direct {
        sqlx::query("UPDATE notices SET status='PENDING_APPROVAL', version=version+1, updated_at=now() WHERE id=$1").bind(id).execute(&s.db).await?;
        audit::log(&mut *s.db.acquire().await?, &ctx, "notice.submitted_for_approval", "notice", &id.to_string(), None, None).await?;
        return Ok(ok(fetch(&s.db, id).await?));
    }
    let mut tx = s.db.begin().await?;
    sqlx::query("UPDATE notices SET status='PUBLISHED', published_at=now(), version=version+1, updated_at=now() WHERE id=$1").bind(id).execute(&mut *tx).await?;
    let users: Vec<Uuid> = audience_users(&mut tx, &aud).await?;
    let users: Vec<Uuid> = users.into_iter().filter(|u| *u != ctx.user_id).collect();
    audit::log(&mut tx, &ctx, "notice.published", "notice", &id.to_string(), None, Some(json!({ "recipients": users.len() }))).await?;
    let mut ob = Outbox::new();
    ob.notify(&mut tx, &users, "NOTICE_PUBLISHED", "New notice", "A new notice was published.", "notice", &id.to_string(), &format!("notices/{id}")).await?;
    for u in &users { ob.event(*u, "notice.published", json!({ "noticeId": id })); }
    tx.commit().await?;
    ob.flush(&s.hub);
    Ok(ok(fetch(&s.db, id).await?))
}

async fn archive(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    ctx.require("notices.create")?;
    let cur = fetch(&s.db, id).await?;
    if cur["created_by"].as_str() != Some(&ctx.user_id.to_string()) && !ctx.has("notices.publish") { return Err(ApiError::not_found()); }
    if cur["status"] == "ARCHIVED" { return Err(ApiError::invalid_transition("Already archived")); }
    sqlx::query("UPDATE notices SET status='ARCHIVED', pinned=false, version=version+1, updated_at=now() WHERE id=$1").bind(id).execute(&s.db).await?;
    audit::log(&mut *s.db.acquire().await?, &ctx, "notice.archived", "notice", &id.to_string(), None, None).await?;
    Ok(ok(fetch(&s.db, id).await?))
}
