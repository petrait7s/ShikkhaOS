use std::{collections::HashMap, sync::{Arc, RwLock}};
use serde_json::{json, Value};
use sqlx::PgPool;
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Clone)]
pub struct Config {
    pub jwt_secret: String,
    pub access_ttl_secs: i64,
    pub refresh_ttl_days: i64,
    pub allowed_origins: Vec<String>,
    pub cookie_secure: bool,
    pub storage_dir: String,
    pub version: String,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let jwt_secret = std::env::var("JWT_SECRET").map_err(|_| "JWT_SECRET is required (>= 32 chars)".to_string())?;
        if jwt_secret.len() < 32 { return Err("JWT_SECRET must be at least 32 characters".into()); }
        Ok(Config {
            jwt_secret,
            access_ttl_secs: env_or("ACCESS_TTL_SECS", 900),
            refresh_ttl_days: env_or("REFRESH_TTL_DAYS", 30),
            allowed_origins: std::env::var("CORS_ORIGINS").unwrap_or_default().split(',').filter(|s| !s.is_empty()).map(String::from).collect(),
            cookie_secure: std::env::var("COOKIE_SECURE").map(|v| v != "false").unwrap_or(true),
            storage_dir: std::env::var("STORAGE_DIR").unwrap_or_else(|_| "./data/files".into()),
            version: option_env!("SHIKKHAOS_VERSION").unwrap_or(env!("CARGO_PKG_VERSION")).to_string(),
        })
    }
}
fn env_or<T: std::str::FromStr>(k: &str, d: T) -> T { std::env::var(k).ok().and_then(|v| v.parse().ok()).unwrap_or(d) }

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub cfg: Arc<Config>,
    pub hub: Hub,
}

/// In-process realtime hub: per-user bounded channels; slow consumers are dropped.
#[derive(Clone, Default)]
pub struct Hub {
    inner: Arc<RwLock<HashMap<Uuid, Vec<(Uuid, mpsc::Sender<String>)>>>>,
    tickets: Arc<std::sync::Mutex<HashMap<String, (Uuid, std::time::Instant)>>>,
}

impl Hub {
    pub fn issue_ticket(&self, user: Uuid, ticket: String) {
        let mut t = self.tickets.lock().unwrap();
        t.retain(|_, (_, at)| at.elapsed().as_secs() < 30);
        t.insert(ticket, (user, std::time::Instant::now()));
    }
    /// Single-use: consumed on redemption.
    pub fn redeem_ticket(&self, ticket: &str) -> Option<Uuid> {
        let mut t = self.tickets.lock().unwrap();
        t.remove(ticket).filter(|(_, at)| at.elapsed().as_secs() < 30).map(|(u, _)| u)
    }
    pub fn register(&self, user: Uuid) -> (Uuid, mpsc::Receiver<String>) {
        let (tx, rx) = mpsc::channel(256);
        let id = Uuid::new_v4();
        self.inner.write().unwrap().entry(user).or_default().push((id, tx));
        (id, rx)
    }
    pub fn unregister(&self, user: Uuid, conn: Uuid) {
        let mut g = self.inner.write().unwrap();
        if let Some(v) = g.get_mut(&user) { v.retain(|(i, _)| *i != conn); if v.is_empty() { g.remove(&user); } }
    }
    pub fn online_users(&self) -> Vec<Uuid> { self.inner.read().unwrap().keys().copied().collect() }
    pub fn connections(&self, user: Uuid) -> usize { self.inner.read().unwrap().get(&user).map(|v| v.len()).unwrap_or(0) }
    pub fn send(&self, user: Uuid, ty: &str, payload: Value) {
        let msg = json!({ "id": Uuid::new_v4(), "type": ty, "ts": chrono::Utc::now().to_rfc3339(), "payload": crate::http::camel(payload) }).to_string();
        let mut dead = vec![];
        if let Some(v) = self.inner.read().unwrap().get(&user) {
            for (id, tx) in v { if tx.try_send(msg.clone()).is_err() { dead.push(*id); } }
        }
        for d in dead { self.unregister(user, d); }
    }
    pub fn send_many(&self, users: &[Uuid], ty: &str, payload: &Value) { for u in users { self.send(*u, ty, payload.clone()); } }
}
