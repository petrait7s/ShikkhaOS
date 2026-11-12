use std::collections::BTreeSet;
use argon2::{password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString}, Argon2};
use axum::{extract::FromRequestParts, http::{request::Parts, HeaderMap}};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use shikkhaos_domain::permissions::{self, Role};
use uuid::Uuid;

use crate::{error::{ApiError, ApiResult}, state::AppState};

pub fn hash_password(p: &str) -> ApiResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default().hash_password(p.as_bytes(), &salt).map(|h| h.to_string()).map_err(|_| ApiError::internal())
}
pub fn verify_password(p: &str, hash: &str) -> bool {
    PasswordHash::new(hash).map(|h| Argon2::default().verify_password(p.as_bytes(), &h).is_ok()).unwrap_or(false)
}
pub fn random_token() -> String { let mut b = [0u8; 32]; rand::thread_rng().fill_bytes(&mut b); B64.encode(b) }
pub fn sha256_hex(s: &str) -> String { hex::encode(Sha256::digest(s.as_bytes())) }
/// One-time temporary password (shown once to the admin, never stored in clear).
pub fn temp_password() -> String { let mut b = [0u8; 9]; rand::thread_rng().fill_bytes(&mut b); format!("Tmp{}9x", B64.encode(b)) }

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims { pub sub: Uuid, pub role: String, pub sid: Uuid, pub did: Uuid, pub iat: i64, pub exp: i64, pub jti: Uuid, #[serde(default)] pub purpose: Option<String> }

pub fn issue_access(state: &AppState, user: Uuid, role: &str, sid: Uuid, did: Uuid) -> ApiResult<String> {
    let now = chrono::Utc::now().timestamp();
    let c = Claims { sub: user, role: role.into(), sid, did, iat: now, exp: now + state.cfg.access_ttl_secs, jti: Uuid::new_v4(), purpose: None };
    encode(&Header::new(Algorithm::HS256), &c, &EncodingKey::from_secret(state.cfg.jwt_secret.as_bytes())).map_err(|_| ApiError::internal())
}
pub fn issue_reauth(state: &AppState, ctx: &Ctx) -> ApiResult<String> {
    let now = chrono::Utc::now().timestamp();
    let c = Claims { sub: ctx.user_id, role: ctx.role.as_str().into(), sid: ctx.session_id, did: ctx.device_id, iat: now, exp: now + 300, jti: Uuid::new_v4(), purpose: Some("reauth".into()) };
    encode(&Header::new(Algorithm::HS256), &c, &EncodingKey::from_secret(state.cfg.jwt_secret.as_bytes())).map_err(|_| ApiError::internal())
}
fn decode_claims(state: &AppState, tok: &str) -> ApiResult<Claims> {
    let mut v = Validation::new(Algorithm::HS256);
    v.leeway = 0; v.set_required_spec_claims(&["exp", "sub"]);
    decode::<Claims>(tok, &DecodingKey::from_secret(state.cfg.jwt_secret.as_bytes()), &v).map(|d| d.claims).map_err(|e| {
        use jsonwebtoken::errors::ErrorKind::*;
        if matches!(e.kind(), ExpiredSignature) { ApiError::token_expired() } else { ApiError::unauthenticated("Invalid token") }
    })
}

#[derive(Debug, Clone)]
pub struct Ctx {
    pub user_id: Uuid,
    pub role: Role,
    pub session_id: Uuid,
    pub device_id: Uuid,
    pub perms: BTreeSet<String>,
    pub ip: String,
    pub request_id: String,
}

impl Ctx {
    pub fn has(&self, p: &str) -> bool { self.perms.contains(p) }
    pub fn require(&self, p: &str) -> ApiResult<()> {
        if self.has(p) { Ok(()) } else { Err(ApiError::forbidden(format!("Missing permission {p}"))) }
    }
    pub fn require_any(&self, ps: &[&str]) -> ApiResult<()> {
        if ps.iter().any(|p| self.has(p)) { Ok(()) } else { Err(ApiError::forbidden(format!("Missing one of permissions: {}", ps.join(", ")))) }
    }
    pub fn is_staff(&self) -> bool { self.role.is_staff() }
    /// Sensitive actions need a fresh password confirmation (`POST /auth/reauth` -> `X-Reauth-Token`).
    pub fn require_reauth(&self, state: &AppState, headers: &HeaderMap) -> ApiResult<()> {
        let t = headers.get("x-reauth-token").and_then(|h| h.to_str().ok()).ok_or_else(|| ApiError::forbidden_code("REAUTH_REQUIRED", "Recent password confirmation required"))?;
        let c = decode_claims(state, t).map_err(|_| ApiError::forbidden_code("REAUTH_REQUIRED", "Re-authentication token invalid or expired"))?;
        if c.purpose.as_deref() != Some("reauth") || c.sub != self.user_id { return Err(ApiError::forbidden_code("REAUTH_REQUIRED", "Re-authentication token invalid")); }
        Ok(())
    }
}

pub async fn load_permissions(db: &sqlx::PgPool, user: Uuid, role: Role) -> ApiResult<BTreeSet<String>> {
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT permission, effect FROM permission_grants WHERE user_id = $1").bind(user).fetch_all(db).await?;
    let grants: Vec<(String, bool)> = rows.into_iter().map(|(p, e)| (p, e == "GRANT")).collect();
    Ok(permissions::effective(role, &grants))
}

impl FromRequestParts<AppState> for Ctx {
    type Rejection = ApiError;
    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let tok = parts.headers.get("authorization").and_then(|h| h.to_str().ok()).and_then(|h| h.strip_prefix("Bearer ")).ok_or_else(|| ApiError::unauthenticated("Missing bearer token"))?;
        let c = decode_claims(state, tok)?;
        if c.purpose.is_some() { return Err(ApiError::unauthenticated("Invalid token")); }
        let row: Option<(String, String)> = sqlx::query_as("SELECT role, status FROM users WHERE id = $1").bind(c.sub).fetch_optional(&state.db).await?;
        let (role, status) = row.ok_or_else(|| ApiError::unauthenticated("Unknown user"))?;
        if status != "ACTIVE" { return Err(ApiError::forbidden_code("ACCOUNT_SUSPENDED", "Account is not active")); }
        let alive: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL)").bind(c.sid).fetch_one(&state.db).await?;
        if !alive { return Err(ApiError::token_revoked()); }
        let role = Role::parse(&role).ok_or_else(ApiError::internal)?;
        let perms = load_permissions(&state.db, c.sub, role).await?;
        let ip = parts.headers.get("x-forwarded-for").and_then(|h| h.to_str().ok()).and_then(|s| s.split(',').next()).unwrap_or("").trim().to_string();
        let request_id = parts.headers.get("x-request-id").and_then(|h| h.to_str().ok()).unwrap_or("").to_string();
        Ok(Ctx { user_id: c.sub, role, session_id: c.sid, device_id: c.did, perms, ip, request_id })
    }
}
