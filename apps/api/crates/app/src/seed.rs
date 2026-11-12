use sqlx::PgPool;
use crate::{auth::{hash_password, temp_password}, error::ApiResult};

pub async fn bootstrap_admin(db: &PgPool, username: &str, name: &str) -> Result<String, String> {
    shikkhaos_domain::validation::username(username).map_err(|e| e.message)?;
    let pw = temp_password();
    let hash = hash_password(&pw).map_err(|_| "hash failed".to_string())?;
    sqlx::query("INSERT INTO users (role, username, display_name, password_hash, must_change_password) VALUES ('HEADMASTER',$1,$2,$3,true)").bind(username).bind(name).bind(hash).execute(db).await.map_err(|e| e.to_string())?;
    ensure_school(db).await.map_err(|_| "school profile failed".to_string())?;
    Ok(pw)
}

pub async fn ensure_school(db: &PgPool) -> ApiResult<()> {
    let scheme = serde_json::to_value(shikkhaos_domain::grading::GradingScheme::default_scheme()).unwrap();
    sqlx::query("INSERT INTO school_profile (id, name, grading_scheme) VALUES (1, 'ShikkhaOS School', $1) ON CONFLICT DO NOTHING").bind(scheme).execute(db).await?;
    Ok(())
}

pub async fn demo(_db: &PgPool) -> Result<(), String> { Ok(()) }
