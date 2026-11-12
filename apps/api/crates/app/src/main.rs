use std::{sync::Arc, time::Duration};
use shikkhaos_app::{build_app, seed, state::{AppState, Config, Hub}, MIGRATOR};
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() -> anyhow_like::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let version = option_env!("SHIKKHAOS_VERSION").unwrap_or(env!("CARGO_PKG_VERSION"));
    if args.first().map(|a| a == "--version" || a == "-V").unwrap_or(false) { println!("shikkhaos-api {version}"); return Ok(()); }
    tracing_subscriber::fmt().with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,sqlx=warn".into())).json().init();
    let db_url = std::env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is required".to_string())?;
    let db = PgPoolOptions::new().max_connections(env_u32("DB_MAX_CONNECTIONS", 10)).acquire_timeout(Duration::from_secs(5)).connect(&db_url).await.map_err(|e| e.to_string())?;
    match args.first().map(String::as_str).unwrap_or("serve") {
        "migrate" => { MIGRATOR.run(&db).await.map_err(|e| e.to_string())?; println!("migrations applied"); Ok(()) }
        "bootstrap-admin" => { let user = args.get(1).cloned().ok_or("usage: bootstrap-admin <username> [display name]")?; let pw = seed::bootstrap_admin(&db, &user, args.get(2).map(String::as_str).unwrap_or("Headmaster")).await?; println!("Headmaster '{user}' created. One-time temporary password (shown once): {pw}"); Ok(()) }
        "seed-demo" => { if std::env::var("ALLOW_DEMO_SEED").as_deref() != Ok("true") { return Err("refusing: set ALLOW_DEMO_SEED=true (never in production)".to_string().into()); } seed::demo(&db).await?; println!("demo data seeded"); Ok(()) }
        "serve" => {
            let cfg = Config::from_env()?;
            MIGRATOR.run(&db).await.map_err(|e| e.to_string())?;
            let state = AppState { db, cfg: Arc::new(cfg), hub: Hub::default() };
            let addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into());
            let listener = tokio::net::TcpListener::bind(&addr).await.map_err(|e| e.to_string())?;
            tracing::info!(%addr, %version, "listening");
            axum::serve(listener, build_app(state)).with_graceful_shutdown(async { let _ = tokio::signal::ctrl_c().await; }).await.map_err(|e| e.to_string())?;
            Ok(())
        }
        other => Err(format!("unknown command '{other}' (serve | migrate | bootstrap-admin | seed-demo | --version)").into()),
    }
}

fn env_u32(k: &str, d: u32) -> u32 { std::env::var(k).ok().and_then(|v| v.parse().ok()).unwrap_or(d) }

mod anyhow_like {
    pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;
}
