use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, HeaderValue},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{audit, auth::*, error::*, http::*, notify::Outbox, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/login", post(login))
        .route("/auth/refresh", post(refresh))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(me))
        .route("/auth/change-password", post(change_password))
        .route("/auth/reauth", post(reauth))
        .route("/auth/forgot-password", post(forgot_password))
        .route("/auth/devices", get(devices))
        .route("/auth/devices/{id}", delete(revoke_device))
        .route("/devices/push-token", post(push_token))
        .route("/ws/tickets", post(ws_ticket))
}

const USER_COLS: &str = "id, role, username, email, display_name, status, must_change_password, last_login_at, avatar_file_id, version, created_at, updated_at";

async fn user_json(db: &sqlx::PgPool, id: Uuid) -> ApiResult<Value> {
    Ok(sqlx::query_scalar(&format!(
        "SELECT to_jsonb(u) FROM (SELECT {USER_COLS} FROM users WHERE id = $1) u"
    ))
    .bind(id)
    .fetch_one(db)
    .await?)
}

fn is_web(h: &HeaderMap) -> bool {
    h.get("x-client").and_then(|v| v.to_str().ok()) == Some("web")
}

fn origin_ok(state: &AppState, h: &HeaderMap) -> bool {
    match h.get("origin").and_then(|v| v.to_str().ok()) {
        Some(o) => state.cfg.allowed_origins.iter().any(|a| a == o),
        None => false,
    }
}

fn cookie_value(h: &HeaderMap, name: &str) -> Option<String> {
    h.get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .filter_map(|p| p.trim().split_once('='))
        .find(|(k, _)| *k == name)
        .map(|(_, v)| v.to_string())
}

fn rt_cookie(state: &AppState, token: &str, max_age: i64) -> HeaderValue {
    let secure = if state.cfg.cookie_secure {
        "; Secure"
    } else {
        ""
    };
    HeaderValue::from_str(&format!(
        "sos_rt={token}; HttpOnly; SameSite=Strict; Path=/api/v1/auth; Max-Age={max_age}{secure}"
    ))
    .unwrap()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LoginReq {
    identifier: String,
    password: String,
    device_id: Uuid,
    platform: String,
}

async fn new_refresh(
    state: &AppState,
    user: Uuid,
    family: Uuid,
    device: Uuid,
) -> ApiResult<String> {
    let tok = random_token();
    sqlx::query("INSERT INTO refresh_tokens (family_id, user_id, device_id, token_hash, expires_at) VALUES ($1,$2,$3,$4, now() + make_interval(days => $5))")
        .bind(family).bind(user).bind(device).bind(sha256_hex(&tok)).bind(state.cfg.refresh_ttl_days as i32).execute(&state.db).await?;
    Ok(tok)
}

fn token_response(
    state: &AppState,
    headers: &HeaderMap,
    mut data: Value,
    refresh: &str,
) -> Response {
    let mut resp_headers = HeaderMap::new();
    if is_web(headers) {
        resp_headers.insert(
            header::SET_COOKIE,
            rt_cookie(state, refresh, state.cfg.refresh_ttl_days * 86400),
        );
    } else {
        data["refreshToken"] = json!(refresh);
    }
    (resp_headers, ok(data)).into_response()
}

async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<LoginReq>,
) -> ApiResult<Response> {
    if !matches!(req.platform.as_str(), "web" | "desktop" | "android") {
        return Err(ApiError::field(
            "platform",
            "INVALID_VALUE",
            "Unknown platform",
        ));
    }
    let ident = req.identifier.trim().to_lowercase();
    let row: Option<(Uuid, String, String, String, i32, Option<chrono::DateTime<chrono::Utc>>, bool)> = sqlx::query_as(
        "SELECT u.id, u.role, u.password_hash, u.status, u.failed_attempts, u.locked_until, u.must_change_password FROM users u LEFT JOIN students s ON s.user_id = u.id \
         WHERE u.username = $1::citext OR u.email = $1::citext OR lower(s.student_code) = $1 LIMIT 1").bind(&ident).fetch_optional(&state.db).await?;
    let Some((id, role, hash, status, failed, locked_until, must_change)) = row else {
        let _ = verify_password(&req.password, "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Z3h4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg"); // timing equalization
        return Err(ApiError::unauthenticated("Invalid credentials"));
    };
    if let Some(l) = locked_until {
        if l > chrono::Utc::now() {
            let mut e = ApiError::new(
                423,
                "ACCOUNT_LOCKED",
                "Account temporarily locked after repeated failures",
            );
            e.retry_after = Some((l - chrono::Utc::now()).num_seconds().max(1) as u64);
            return Err(e);
        }
    }
    if !verify_password(&req.password, &hash) {
        let lock = failed + 1 >= 5;
        sqlx::query("UPDATE users SET failed_attempts = CASE WHEN $2 THEN 0 ELSE failed_attempts + 1 END, locked_until = CASE WHEN $2 THEN now() + interval '15 minutes' ELSE locked_until END WHERE id = $1").bind(id).bind(lock).execute(&state.db).await?;
        audit::log_system(
            &mut *state.db.acquire().await?,
            Some(id),
            "auth.login_failed",
            "user",
            &id.to_string(),
            None,
        )
        .await?;
        return Err(ApiError::unauthenticated("Invalid credentials"));
    }
    if status != "ACTIVE" {
        return Err(ApiError::forbidden_code(
            "ACCOUNT_SUSPENDED",
            "Account is not active",
        ));
    }
    sqlx::query("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1").bind(id).execute(&state.db).await?;
    let known: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM devices WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL)").bind(req.device_id).bind(id).fetch_one(&state.db).await?;
    sqlx::query("INSERT INTO devices (id, user_id, platform) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET user_id = $2, platform = $3, revoked_at = NULL, last_seen_at = now()")
        .bind(req.device_id).bind(id).bind(&req.platform).execute(&state.db).await?;
    let family = Uuid::new_v4();
    let refresh = new_refresh(&state, id, family, req.device_id).await?;
    let access = issue_access(&state, id, &role, family, req.device_id)?;
    let role_e =
        shikkhaos_domain::permissions::Role::parse(&role).ok_or_else(ApiError::internal)?;
    let perms = load_permissions(&state.db, id, role_e).await?;
    let mut tx = state.db.begin().await?;
    audit::log_system(
        &mut tx,
        Some(id),
        "auth.login",
        "user",
        &id.to_string(),
        Some(json!({"platform": req.platform})),
    )
    .await?;
    let mut ob = Outbox::new();
    if !known {
        ob.notify(
            &mut tx,
            &[id],
            "ACCOUNT_SECURITY",
            "New sign-in",
            "Your account was signed in on a new device.",
            "device",
            &req.device_id.to_string(),
            "settings/devices",
        )
        .await?;
    }
    tx.commit().await?;
    ob.flush(&state.hub);
    let data = json!({ "accessToken": access, "expiresIn": state.cfg.access_ttl_secs, "user": user_json(&state.db, id).await?, "permissions": perms, "mustChangePassword": must_change });
    Ok(token_response(&state, &headers, data, &refresh))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RefreshReq {
    refresh_token: Option<String>,
}

async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Option<Json<RefreshReq>>,
) -> ApiResult<Response> {
    let web = is_web(&headers);
    let tok = if web {
        if !origin_ok(&state, &headers) {
            return Err(ApiError::forbidden_code(
                "CSRF_REJECTED",
                "Origin not allowed",
            ));
        }
        cookie_value(&headers, "sos_rt")
    } else {
        body.and_then(|b| b.0.refresh_token)
    }
    .ok_or_else(|| ApiError::unauthenticated("Missing refresh token"))?;
    let mut tx = state.db.begin().await?;
    let row: Option<(Uuid, Uuid, Uuid, Uuid, Option<chrono::DateTime<chrono::Utc>>, Option<chrono::DateTime<chrono::Utc>>, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        "SELECT id, family_id, user_id, device_id, used_at, revoked_at, expires_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE").bind(sha256_hex(&tok)).fetch_optional(&mut *tx).await?;
    let Some((id, family, user, device, used, revoked, expires)) = row else {
        return Err(ApiError::token_revoked());
    };
    if used.is_some() || revoked.is_some() {
        // reuse detection: burn the whole family
        sqlx::query("UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL").bind(family).execute(&mut *tx).await?;
        audit::log_system(
            &mut tx,
            Some(user),
            "auth.refresh_reuse_detected",
            "user",
            &user.to_string(),
            None,
        )
        .await?;
        tx.commit().await?;
        return Err(ApiError::token_revoked());
    }
    if expires < chrono::Utc::now() {
        return Err(ApiError::token_expired());
    }
    let status: String = sqlx::query_scalar("SELECT status FROM users WHERE id = $1")
        .bind(user)
        .fetch_one(&mut *tx)
        .await?;
    if status != "ACTIVE" {
        return Err(ApiError::forbidden_code(
            "ACCOUNT_SUSPENDED",
            "Account is not active",
        ));
    }
    sqlx::query("UPDATE refresh_tokens SET used_at = now() WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    let new_tok = random_token();
    sqlx::query("INSERT INTO refresh_tokens (family_id, user_id, device_id, token_hash, expires_at) VALUES ($1,$2,$3,$4, now() + make_interval(days => $5))")
        .bind(family).bind(user).bind(device).bind(sha256_hex(&new_tok)).bind(state.cfg.refresh_ttl_days as i32).execute(&mut *tx).await?;
    let role: String = sqlx::query_scalar("SELECT role FROM users WHERE id = $1")
        .bind(user)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    let access = issue_access(&state, user, &role, family, device)?;
    Ok(token_response(
        &state,
        &headers,
        json!({ "accessToken": access, "expiresIn": state.cfg.access_ttl_secs }),
        &new_tok,
    ))
}

async fn logout(
    State(state): State<AppState>,
    ctx: Ctx,
    headers: HeaderMap,
) -> ApiResult<Response> {
    sqlx::query(
        "UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL",
    )
    .bind(ctx.session_id)
    .execute(&state.db)
    .await?;
    audit::log_system(
        &mut *state.db.acquire().await?,
        Some(ctx.user_id),
        "auth.logout",
        "user",
        &ctx.user_id.to_string(),
        None,
    )
    .await?;
    let mut h = HeaderMap::new();
    if is_web(&headers) {
        h.insert(header::SET_COOKIE, rt_cookie(&state, "", 0));
    }
    Ok((h, ok(json!({ "loggedOut": true }))).into_response())
}

async fn me(State(state): State<AppState>, ctx: Ctx) -> ApiResult<Response> {
    Ok(ok(
        json!({ "user": user_json(&state.db, ctx.user_id).await?, "permissions": ctx.perms, "sessionId": ctx.session_id }),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ChangePw {
    current_password: String,
    new_password: String,
}

async fn change_password(
    State(state): State<AppState>,
    ctx: Ctx,
    Json(req): Json<ChangePw>,
) -> ApiResult<Response> {
    shikkhaos_domain::validation::password(&req.new_password)
        .map_err(ApiError::from)
        .map_err(|mut e| {
            for f in &mut e.fields {
                f.field = "newPassword".into();
            }
            e
        })?;
    let hash: String = sqlx::query_scalar("SELECT password_hash FROM users WHERE id = $1")
        .bind(ctx.user_id)
        .fetch_one(&state.db)
        .await?;
    if !verify_password(&req.current_password, &hash) {
        return Err(ApiError::field(
            "currentPassword",
            "INCORRECT",
            "Current password is incorrect",
        ));
    }
    if req.current_password == req.new_password {
        return Err(ApiError::field(
            "newPassword",
            "UNCHANGED",
            "New password must differ",
        ));
    }
    let new_hash = hash_password(&req.new_password)?;
    let mut tx = state.db.begin().await?;
    sqlx::query("UPDATE users SET password_hash = $2, must_change_password = false, updated_at = now(), version = version + 1 WHERE id = $1").bind(ctx.user_id).bind(new_hash).execute(&mut *tx).await?;
    sqlx::query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND family_id <> $2 AND revoked_at IS NULL").bind(ctx.user_id).bind(ctx.session_id).execute(&mut *tx).await?;
    audit::log(
        &mut tx,
        &ctx,
        "auth.password_changed",
        "user",
        &ctx.user_id.to_string(),
        None,
        None,
    )
    .await?;
    let mut ob = Outbox::new();
    ob.notify(
        &mut tx,
        &[ctx.user_id],
        "ACCOUNT_SECURITY",
        "Password changed",
        "Your password was changed. Other devices were signed out.",
        "user",
        &ctx.user_id.to_string(),
        "settings/security",
    )
    .await?;
    tx.commit().await?;
    ob.flush(&state.hub);
    Ok(ok(json!({ "changed": true })))
}

#[derive(Deserialize)]
struct ReauthReq {
    password: String,
}
async fn reauth(
    State(state): State<AppState>,
    ctx: Ctx,
    Json(req): Json<ReauthReq>,
) -> ApiResult<Response> {
    let hash: String = sqlx::query_scalar("SELECT password_hash FROM users WHERE id = $1")
        .bind(ctx.user_id)
        .fetch_one(&state.db)
        .await?;
    if !verify_password(&req.password, &hash) {
        return Err(ApiError::field(
            "password",
            "INCORRECT",
            "Password is incorrect",
        ));
    }
    Ok(ok(
        json!({ "reauthToken": issue_reauth(&state, &ctx)?, "expiresIn": 300 }),
    ))
}

async fn forgot_password() -> Response {
    // v1: recovery is admin-assisted; never reveal whether an account exists.
    (axum::http::StatusCode::ACCEPTED, Json(json!({ "data": { "accepted": true, "message": "Contact the school office to reset your password." } }))).into_response()
}

async fn devices(State(state): State<AppState>, ctx: Ctx) -> ApiResult<Response> {
    let v: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(d) FROM (SELECT id, platform, last_seen_at, created_at, (id = $2) AS current FROM devices WHERE user_id = $1 AND revoked_at IS NULL ORDER BY last_seen_at DESC) d").bind(ctx.user_id).bind(ctx.device_id).fetch_all(&state.db).await?;
    Ok(ok(Value::Array(v)))
}

async fn revoke_device(
    State(state): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    let n = sqlx::query("UPDATE devices SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL").bind(id).bind(ctx.user_id).execute(&state.db).await?.rows_affected();
    if n == 0 {
        return Err(ApiError::not_found());
    }
    sqlx::query("UPDATE refresh_tokens SET revoked_at = now() WHERE device_id = $1 AND user_id = $2 AND revoked_at IS NULL").bind(id).bind(ctx.user_id).execute(&state.db).await?;
    state
        .hub
        .send(ctx.user_id, "session.revoked", json!({ "deviceId": id }));
    Ok(ok(json!({ "revoked": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PushReq {
    device_id: Uuid,
    push_token: String,
}
async fn push_token(
    State(state): State<AppState>,
    ctx: Ctx,
    Json(req): Json<PushReq>,
) -> ApiResult<Response> {
    if req.push_token.is_empty() || req.push_token.len() > 4096 {
        return Err(ApiError::field("pushToken", "INVALID", "Invalid token"));
    }
    let n = sqlx::query(
        "UPDATE devices SET push_token = $3 WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
    )
    .bind(req.device_id)
    .bind(ctx.user_id)
    .bind(req.push_token)
    .execute(&state.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(ApiError::not_found());
    }
    Ok(ok(json!({ "registered": true })))
}

async fn ws_ticket(State(state): State<AppState>, ctx: Ctx) -> ApiResult<Response> {
    let t = random_token();
    state.hub.issue_ticket(ctx.user_id, t.clone());
    Ok(ok(json!({ "ticket": t, "expiresIn": 30 })))
}
