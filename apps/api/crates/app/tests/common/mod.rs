#![allow(dead_code)]
use std::sync::Arc;
use axum::{body::Body, http::{Request, StatusCode}, Router};
use serde_json::{json, Value};
use shikkhaos_app::{build_app, state::{AppState, Config, Hub}, MIGRATOR};
use sqlx::{postgres::PgPoolOptions, PgPool};
use tower::ServiceExt;
use uuid::Uuid;

pub struct TestApp { pub app: Router, pub db: PgPool, pub state: AppState, pub name: String }

fn base_url() -> String { std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432".into()) }

impl TestApp {
    pub async fn new() -> Self {
        let name = format!("t_{}", Uuid::new_v4().simple());
        let admin = PgPoolOptions::new().max_connections(1).connect(&format!("{}/postgres", base_url())).await.expect("admin connect");
        sqlx::query(&format!("CREATE DATABASE {name}")).execute(&admin).await.unwrap();
        let db = PgPoolOptions::new().max_connections(8).connect(&format!("{}/{name}", base_url())).await.unwrap();
        MIGRATOR.run(&db).await.unwrap();
        let cfg = Config { jwt_secret: "test-secret-test-secret-test-secret-123".into(), access_ttl_secs: 900, refresh_ttl_days: 30, allowed_origins: vec!["http://localhost:3000".into()], cookie_secure: false, storage_dir: std::env::temp_dir().join(&name).to_string_lossy().into(), version: "test".into() };
        let state = AppState { db: db.clone(), cfg: Arc::new(cfg), hub: Hub::default() };
        TestApp { app: build_app(state.clone()), db, state, name }
    }

    pub async fn request(&self, method: &str, path: &str, token: Option<&str>, body: Option<Value>) -> (StatusCode, Value) {
        self.request_h(method, path, token, body, &[]).await
    }

    pub async fn request_h(&self, method: &str, path: &str, token: Option<&str>, body: Option<Value>, headers: &[(&str, String)]) -> (StatusCode, Value) {
        let mut b = Request::builder().method(method).uri(format!("/api/v1{path}")).header("content-type", "application/json");
        if let Some(t) = token { b = b.header("authorization", format!("Bearer {t}")); }
        for (k, v) in headers { b = b.header(*k, v); }
        let req = b.body(body.map(|v| Body::from(v.to_string())).unwrap_or_else(Body::empty)).unwrap();
        let resp = self.app.clone().oneshot(req).await.unwrap();
        let status = resp.status();
        let bytes = axum::body::to_bytes(resp.into_body(), 10 * 1024 * 1024).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    pub async fn login(&self, user: &str) -> String {
        let (s, v) = self.request("POST", "/auth/login", None, Some(json!({ "identifier": user, "password": shikkhaos_app::seed::DEMO_PASSWORD, "deviceId": Uuid::new_v4(), "platform": "android" }))).await;
        assert_eq!(s, StatusCode::OK, "login {user}: {v}");
        v["data"]["accessToken"].as_str().unwrap().to_string()
    }

    pub async fn reauth(&self, tok: &str) -> String {
        let (s, v) = self.request("POST", "/auth/reauth", Some(tok), Some(json!({ "password": shikkhaos_app::seed::DEMO_PASSWORD }))).await;
        assert_eq!(s, StatusCode::OK, "{v}");
        v["data"]["reauthToken"].as_str().unwrap().to_string()
    }

    pub async fn drop_db(self) {
        drop(self.app); self.db.close().await;
        if let Ok(admin) = PgPoolOptions::new().max_connections(1).connect(&format!("{}/postgres", base_url())).await {
            let _ = sqlx::query(&format!("DROP DATABASE IF EXISTS {} WITH (FORCE)", self.name)).execute(&admin).await;
        }
    }
}

use shikkhaos_app::seed::Ids;

/// Drive the whole official workflow through the API and return the published result set id.
pub async fn publish_math_exam(t: &TestApp, ids: &Ids) -> (String, String) {
    let (hm, reg, rahim) = (t.login("headmaster").await, t.login("registrar").await, t.login("teacher.rahim").await);
    let (_, v) = t.request("POST", "/exams", Some(&reg), Some(json!({ "name": "Annual 2026", "type": "FINAL", "startDate": "2026-11-01", "endDate": "2026-11-10" }))).await;
    let exam = v["data"]["id"].as_str().unwrap().to_string();
    t.request("POST", "/exam-papers", Some(&reg), Some(json!({ "examId": exam, "classId": ids.class6, "subjectId": ids.subj_math }))).await;
    let (s, v) = t.request("POST", &format!("/exams/{exam}/authorize"), Some(&hm), None).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let (_, list) = t.request("GET", "/mark-submissions", Some(&rahim), None).await;
    for sub in list["data"].as_array().unwrap() {
        let id = sub["id"].as_str().unwrap();
        let (_, d) = t.request("GET", &format!("/mark-submissions/{id}"), Some(&rahim), None).await;
        let entries: Vec<Value> = d["data"]["entries"].as_array().unwrap().iter().enumerate().map(|(i, r)| json!({ "studentId": r["studentId"], "marksObtained": 90 - i as i32, "absent": false })).collect();
        assert_eq!(t.request("PUT", &format!("/mark-submissions/{id}/entries"), Some(&rahim), Some(json!({ "entries": entries }))).await.0, StatusCode::OK);
        assert_eq!(t.request("POST", &format!("/mark-submissions/{id}/submit"), Some(&rahim), None).await.0, StatusCode::OK);
        assert_eq!(t.request("POST", &format!("/mark-submissions/{id}/start-review"), Some(&reg), None).await.0, StatusCode::OK);
        assert_eq!(t.request("POST", &format!("/mark-submissions/{id}/verify"), Some(&reg), None).await.0, StatusCode::OK);
    }
    let (s, v) = t.request("POST", "/result-sets", Some(&reg), Some(json!({ "examId": exam, "classId": ids.class6 }))).await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    let rs = v["data"]["id"].as_str().unwrap().to_string();
    let re = t.reauth(&hm).await;
    assert_eq!(t.request_h("POST", &format!("/result-sets/{rs}/approve"), Some(&hm), None, &[("x-reauth-token", re.clone())]).await.0, StatusCode::OK);
    let re = t.reauth(&hm).await;
    assert_eq!(t.request_h("POST", &format!("/result-sets/{rs}/publish"), Some(&hm), None, &[("x-reauth-token", re)]).await.0, StatusCode::OK);
    (exam, rs)
}
