use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    response::Response,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use shikkhaos_domain::{
    permissions::{self, Role},
    validation as v,
};
use uuid::Uuid;

use crate::{audit, auth::*, error::*, http::*, notify::Outbox, scope, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/users", get(list).post(create))
        .route("/users/{id}", get(get_one).patch(update))
        .route("/users/{id}/deactivate", post(deactivate))
        .route("/users/{id}/reset-password", post(reset_password))
        .route("/users/{id}/permissions", get(get_perms).put(put_perms))
        .route("/permissions/catalog", get(catalog))
        .route("/school", get(get_school).patch(patch_school))
        .route("/settings", get(get_settings).patch(patch_settings))
}

const COLS: &str = "id, role, username, email, display_name, status, must_change_password, last_login_at, messaging_suspended_until, version, created_at, updated_at";

#[derive(Deserialize)]
struct UserFilter {
    role: Option<String>,
    status: Option<String>,
}

async fn list(
    State(s): State<AppState>,
    ctx: Ctx,
    Query(q): Query<PageQuery>,
    Query(f): Query<UserFilter>,
) -> ApiResult<Response> {
    ctx.require("users.read")?;
    let rows: Vec<Value> = sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM (SELECT {COLS} FROM users WHERE ($1::text IS NULL OR role = $1) AND ($2::text IS NULL OR status = $2) AND ($3::text IS NULL OR username::text ILIKE $3 OR display_name ILIKE $3) ORDER BY created_at DESC, id LIMIT $4 OFFSET $5) t"))
        .bind(f.role).bind(f.status).bind(q.like()).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(list_resp(rows, &q))
}
fn list_resp(r: Vec<Value>, q: &PageQuery) -> Response {
    crate::http::list(r, q)
}

async fn get_one(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    if id != ctx.user_id {
        ctx.require("users.read")?;
    }
    let r: Option<Value> = sqlx::query_scalar(&format!(
        "SELECT to_jsonb(t) FROM (SELECT {COLS} FROM users WHERE id = $1) t"
    ))
    .bind(id)
    .fetch_optional(&s.db)
    .await?;
    Ok(ok(r.ok_or_else(ApiError::not_found)?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateUser {
    role: String,
    username: String,
    display_name: String,
    email: Option<String>,
}

async fn create(
    State(s): State<AppState>,
    ctx: Ctx,
    Json(r): Json<CreateUser>,
) -> ApiResult<Response> {
    ctx.require("users.create")?;
    let role = Role::parse(&r.role)
        .ok_or_else(|| ApiError::field("role", "INVALID_VALUE", "Unknown role"))?;
    // Staff accounts only here; students/teachers are created via their own endpoints with profiles.
    if !matches!(role, Role::Headmaster | Role::Registrar) {
        return Err(ApiError::field(
            "role",
            "INVALID_VALUE",
            "Create teachers via /teachers and students via /students",
        ));
    }
    if ctx.role != Role::Headmaster {
        return Err(ApiError::forbidden(
            "Only the Headmaster can create administrative accounts",
        ));
    }
    v::username(&r.username)?;
    v::text("displayName", &r.display_name, 1, 200)?;
    if let Some(e) = &r.email {
        v::email(e)?;
    }
    let pw = temp_password();
    let mut tx = s.db.begin().await?;
    let id: Uuid = sqlx::query_scalar("INSERT INTO users (role, username, email, display_name, password_hash, must_change_password) VALUES ($1,$2,$3,$4,$5,true) RETURNING id")
        .bind(role.as_str()).bind(&r.username).bind(&r.email).bind(r.display_name.trim()).bind(hash_password(&pw)?).fetch_one(&mut *tx).await?;
    audit::log(
        &mut tx,
        &ctx,
        "user.created",
        "user",
        &id.to_string(),
        None,
        Some(json!({"role": r.role, "username": r.username})),
    )
    .await?;
    tx.commit().await?;
    let u: Value = sqlx::query_scalar(&format!(
        "SELECT to_jsonb(t) FROM (SELECT {COLS} FROM users WHERE id=$1) t"
    ))
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    Ok(created(json!({ "user": u, "temporaryPassword": pw })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateUser {
    display_name: Option<String>,
    email: Option<String>,
    version: Option<i32>,
}

async fn update(
    State(s): State<AppState>,
    ctx: Ctx,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(r): Json<UpdateUser>,
) -> ApiResult<Response> {
    if id != ctx.user_id {
        ctx.require("users.update")?;
    }
    if let Some(n) = &r.display_name {
        v::text("displayName", n, 1, 200)?;
    }
    if let Some(e) = &r.email {
        v::email(e)?;
    }
    let ver = parse_version(&headers, r.version);
    let row: Option<Value> = sqlx::query_scalar(&format!("UPDATE users SET display_name = COALESCE($2, display_name), email = COALESCE($3, email), version = version + 1, updated_at = now() WHERE id = $1 AND ($4::int IS NULL OR version = $4) RETURNING to_jsonb((SELECT t FROM (SELECT {COLS} FROM users WHERE id = $1) t))"))
        .bind(id).bind(r.display_name.map(|s| s.trim().to_string())).bind(r.email).bind(ver).fetch_optional(&s.db).await?;
    match row {
        Some(_) => get_one(State(s), ctx, Path(id)).await,
        None => Err(scope::missing_or_conflict(&s.db, "users", id).await),
    }
}

async fn deactivate(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    ctx.require("users.deactivate")
        .or_else(|_| ctx.require("teachers.deactivate"))?;
    if id == ctx.user_id {
        return Err(ApiError::conflict(
            "CONFLICT",
            "You cannot deactivate yourself",
        ));
    }
    let target_role: String = sqlx::query_scalar("SELECT role FROM users WHERE id=$1")
        .bind(id)
        .fetch_optional(&s.db)
        .await?
        .ok_or_else(ApiError::not_found)?;
    if matches!(target_role.as_str(), "HEADMASTER" | "REGISTRAR") && ctx.role != Role::Headmaster {
        return Err(ApiError::forbidden(
            "Only the Headmaster can deactivate administrative accounts",
        ));
    }
    let mut tx = s.db.begin().await?;
    sqlx::query(
        "UPDATE users SET status='SUSPENDED', version = version+1, updated_at=now() WHERE id=$1",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id=$1 AND revoked_at IS NULL",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    audit::log(
        &mut tx,
        &ctx,
        "user.deactivated",
        "user",
        &id.to_string(),
        None,
        None,
    )
    .await?;
    tx.commit().await?;
    s.hub.send(id, "session.revoked", json!({}));
    Ok(ok(json!({ "status": "SUSPENDED" })))
}

async fn reset_password(
    State(s): State<AppState>,
    ctx: Ctx,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    ctx.require("users.reset_password")?;
    let target_role: String = sqlx::query_scalar("SELECT role FROM users WHERE id=$1")
        .bind(id)
        .fetch_optional(&s.db)
        .await?
        .ok_or_else(ApiError::not_found)?;
    if matches!(target_role.as_str(), "HEADMASTER" | "REGISTRAR") && ctx.role != Role::Headmaster {
        return Err(ApiError::forbidden(
            "Only the Headmaster can reset administrative accounts",
        ));
    }
    ctx.require_reauth(&s, &headers)?;
    let pw = temp_password();
    let mut tx = s.db.begin().await?;
    sqlx::query("UPDATE users SET password_hash=$2, must_change_password=true, failed_attempts=0, locked_until=NULL, version=version+1, updated_at=now() WHERE id=$1").bind(id).bind(hash_password(&pw)?).execute(&mut *tx).await?;
    sqlx::query(
        "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id=$1 AND revoked_at IS NULL",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    audit::log(
        &mut tx,
        &ctx,
        "user.password_reset",
        "user",
        &id.to_string(),
        None,
        None,
    )
    .await?;
    tx.commit().await?;
    s.hub.send(id, "session.revoked", json!({}));
    Ok(ok(
        json!({ "temporaryPassword": pw, "mustChangePassword": true }),
    ))
}

async fn catalog(ctx: Ctx) -> ApiResult<Response> {
    ctx.require_any(&["roles.read", "roles.manage"])?;
    let roles: Vec<Value> = [
        Role::Headmaster,
        Role::Registrar,
        Role::Teacher,
        Role::Student,
    ]
    .iter()
    .map(|r| json!({ "role": r.as_str(), "defaults": permissions::role_defaults(*r) }))
    .collect();
    Ok(ok(
        json!({ "permissions": permissions::ALL_PERMISSIONS, "delegable": permissions::DELEGABLE, "roles": roles }),
    ))
}

async fn get_perms(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    ctx.require("roles.read")?;
    let role: String = sqlx::query_scalar("SELECT role FROM users WHERE id=$1")
        .bind(id)
        .fetch_optional(&s.db)
        .await?
        .ok_or_else(ApiError::not_found)?;
    let grants: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(g) FROM (SELECT permission, effect, granted_by, reason, created_at FROM permission_grants WHERE user_id=$1 ORDER BY permission) g").bind(id).fetch_all(&s.db).await?;
    let eff = load_permissions(
        &s.db,
        id,
        Role::parse(&role).ok_or_else(ApiError::internal)?,
    )
    .await?;
    Ok(ok(
        json!({ "role": role, "overrides": grants, "effective": eff }),
    ))
}

#[derive(Deserialize)]
struct PermOverride {
    permission: String,
    effect: String,
    reason: Option<String>,
}
#[derive(Deserialize)]
struct PutPerms {
    overrides: Vec<PermOverride>,
}

async fn put_perms(
    State(s): State<AppState>,
    ctx: Ctx,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(r): Json<PutPerms>,
) -> ApiResult<Response> {
    ctx.require("roles.manage")?;
    if ctx.role != Role::Headmaster {
        return Err(ApiError::forbidden(
            "Only the Headmaster configures permissions",
        ));
    }
    ctx.require_reauth(&s, &headers)?;
    let role: String = sqlx::query_scalar("SELECT role FROM users WHERE id=$1")
        .bind(id)
        .fetch_optional(&s.db)
        .await?
        .ok_or_else(ApiError::not_found)?;
    let role_e = Role::parse(&role).ok_or_else(ApiError::internal)?;
    if role_e == Role::Headmaster {
        return Err(ApiError::conflict(
            "CONFLICT",
            "Headmaster permissions are fixed",
        ));
    }
    let mut errs = vec![];
    for (i, o) in r.overrides.iter().enumerate() {
        if !permissions::is_known(&o.permission) {
            errs.push(FieldErr {
                field: format!("overrides[{i}].permission"),
                code: "UNKNOWN_PERMISSION".into(),
                message: "Unknown permission".into(),
            });
        } else if o.effect == "GRANT"
            && !permissions::DELEGABLE.contains(&o.permission.as_str())
            && !permissions::role_defaults(role_e).contains(o.permission.as_str())
        {
            errs.push(FieldErr {
                field: format!("overrides[{i}].permission"),
                code: "NOT_DELEGABLE".into(),
                message: "This permission cannot be granted to this user".into(),
            });
        } else if !matches!(o.effect.as_str(), "GRANT" | "REVOKE") {
            errs.push(FieldErr {
                field: format!("overrides[{i}].effect"),
                code: "INVALID_VALUE".into(),
                message: "GRANT or REVOKE".into(),
            });
        } else if o.effect == "REVOKE" && o.reason.as_deref().unwrap_or("").trim().is_empty()
            || o.effect == "GRANT" && o.reason.as_deref().unwrap_or("").trim().is_empty()
        {
            errs.push(FieldErr {
                field: format!("overrides[{i}].reason"),
                code: "REQUIRED".into(),
                message: "A reason is required".into(),
            });
        }
    }
    if !errs.is_empty() {
        return Err(ApiError::validation(errs));
    }
    let before: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(g) FROM (SELECT permission, effect FROM permission_grants WHERE user_id=$1) g").bind(id).fetch_all(&s.db).await?;
    let mut tx = s.db.begin().await?;
    sqlx::query("DELETE FROM permission_grants WHERE user_id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    for o in &r.overrides {
        sqlx::query("INSERT INTO permission_grants (user_id, permission, effect, granted_by, reason) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, permission) DO UPDATE SET effect = EXCLUDED.effect, reason = EXCLUDED.reason")
            .bind(id).bind(&o.permission).bind(&o.effect).bind(ctx.user_id).bind(o.reason.clone().unwrap_or_default()).execute(&mut *tx).await?;
    }
    audit::log(
        &mut tx,
        &ctx,
        "permissions.changed",
        "user",
        &id.to_string(),
        Some(json!(before)),
        Some(json!(r
            .overrides
            .iter()
            .map(|o| json!({"permission": o.permission, "effect": o.effect}))
            .collect::<Vec<_>>())),
    )
    .await?;
    let mut ob = Outbox::new();
    ob.notify(
        &mut tx,
        &[id],
        "ACCOUNT_SECURITY",
        "Permissions updated",
        "Your access permissions were changed by the Headmaster.",
        "user",
        &id.to_string(),
        "settings/security",
    )
    .await?;
    ob.event(id, "permissions.changed", json!({}));
    tx.commit().await?;
    ob.flush(&s.hub);
    get_perms(State(s), ctx, Path(id)).await
}

const SCHOOL_COLS: &str = "name, name_bn, eiin, address, phone, email, logo_file_id, motto, timezone, grading_scheme, academic_year_start_month, features, version, updated_at";

async fn get_school(State(s): State<AppState>, ctx: Ctx) -> ApiResult<Response> {
    let _ = ctx;
    let v: Value = sqlx::query_scalar(&format!(
        "SELECT to_jsonb(t) FROM (SELECT {SCHOOL_COLS} FROM school_profile WHERE id=1) t"
    ))
    .fetch_optional(&s.db)
    .await?
    .ok_or_else(ApiError::not_found)?;
    Ok(ok(v))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PatchSchool {
    name: Option<String>,
    name_bn: Option<String>,
    eiin: Option<String>,
    address: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    motto: Option<String>,
    grading_scheme: Option<Value>,
    version: Option<i32>,
}

async fn patch_school(
    State(s): State<AppState>,
    ctx: Ctx,
    headers: HeaderMap,
    Json(r): Json<PatchSchool>,
) -> ApiResult<Response> {
    ctx.require("school.settings.update")?;
    if let Some(n) = &r.name {
        v::text("name", n, 1, 200)?;
    }
    if let Some(p) = &r.phone {
        v::phone_bd(p)?;
    }
    if let Some(e) = &r.email {
        if !e.is_empty() {
            v::email(e)?;
        }
    }
    let scheme = match &r.grading_scheme {
        Some(g) => {
            let gs: shikkhaos_domain::grading::GradingScheme = serde_json::from_value(g.clone())
                .map_err(|e| ApiError::field("gradingScheme", "INVALID_SCHEME", &e.to_string()))?;
            gs.validate()
                .map_err(|m| ApiError::field("gradingScheme", "INVALID_SCHEME", m))?;
            Some(serde_json::to_value(gs).unwrap())
        }
        None => None,
    };
    let ver = parse_version(&headers, r.version);
    let mut tx = s.db.begin().await?;
    let before: Value = sqlx::query_scalar(&format!(
        "SELECT to_jsonb(t) FROM (SELECT {SCHOOL_COLS} FROM school_profile WHERE id=1) t"
    ))
    .fetch_one(&mut *tx)
    .await?;
    let n = sqlx::query("UPDATE school_profile SET name=COALESCE($1,name), name_bn=COALESCE($2,name_bn), eiin=COALESCE($3,eiin), address=COALESCE($4,address), phone=COALESCE($5,phone), email=COALESCE($6,email), motto=COALESCE($7,motto), grading_scheme=COALESCE($8,grading_scheme), version=version+1, updated_at=now() WHERE id=1 AND ($9::int IS NULL OR version=$9)")
        .bind(r.name).bind(r.name_bn).bind(r.eiin).bind(r.address).bind(r.phone).bind(r.email).bind(r.motto).bind(scheme).bind(ver).execute(&mut *tx).await?.rows_affected();
    if n == 0 {
        return Err(ApiError::version_conflict());
    }
    audit::log(
        &mut tx,
        &ctx,
        "school.updated",
        "school",
        "1",
        Some(before),
        None,
    )
    .await?;
    tx.commit().await?;
    get_school(State(s), ctx).await
}

async fn get_settings(State(s): State<AppState>, ctx: Ctx) -> ApiResult<Response> {
    ctx.require_any(&["school.settings.read", "settings.system.manage"])?;
    let f: Value = sqlx::query_scalar("SELECT features FROM school_profile WHERE id=1")
        .fetch_one(&s.db)
        .await?;
    Ok(ok(json!({ "features": f })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PatchSettings {
    registrar_can_publish_results: Option<bool>,
    student_to_teacher_messaging: Option<bool>,
    student_to_admin_messaging: Option<bool>,
}

async fn patch_settings(
    State(s): State<AppState>,
    ctx: Ctx,
    headers: HeaderMap,
    Json(r): Json<PatchSettings>,
) -> ApiResult<Response> {
    ctx.require("settings.system.manage")?;
    if r.registrar_can_publish_results.is_some() {
        ctx.require_reauth(&s, &headers)?;
    }
    let mut tx = s.db.begin().await?;
    let before: Value =
        sqlx::query_scalar("SELECT features FROM school_profile WHERE id=1 FOR UPDATE")
            .fetch_one(&mut *tx)
            .await?;
    let mut f = before.clone();
    if let Some(b) = r.registrar_can_publish_results {
        f["registrarCanPublishResults"] = json!(b);
    }
    if let Some(b) = r.student_to_teacher_messaging {
        f["studentToTeacherMessaging"] = json!(b);
    }
    if let Some(b) = r.student_to_admin_messaging {
        f["studentToAdminMessaging"] = json!(b);
    }
    f["studentDirectMessaging"] = json!(false); // permanently disabled in v1
    sqlx::query(
        "UPDATE school_profile SET features=$1, version=version+1, updated_at=now() WHERE id=1",
    )
    .bind(&f)
    .execute(&mut *tx)
    .await?;
    audit::log(
        &mut tx,
        &ctx,
        "settings.updated",
        "school",
        "1",
        Some(before),
        Some(f.clone()),
    )
    .await?;
    tx.commit().await?;
    Ok(ok(json!({ "features": f })))
}
