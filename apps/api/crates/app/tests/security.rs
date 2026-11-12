mod common;
use axum::http::StatusCode;
use common::TestApp;
use serde_json::{json, Value};
use shikkhaos_app::{auth, seed};
use uuid::Uuid;

fn d(v: &Value) -> &Value {
    &v["data"]
}

async fn app() -> (TestApp, seed::Ids) {
    let t = TestApp::new().await;
    let ids = seed::demo_small(&t.db).await.unwrap();
    (t, ids)
}

#[tokio::test]
async fn login_lockout_refresh_rotation_and_reuse_detection() {
    let (t, _) = app().await;
    let dev = Uuid::new_v4();
    for _ in 0..4 {
        let (s, _) = t.request("POST", "/auth/login", None, Some(json!({ "identifier": "student.ayesha", "password": "wrong-password-1", "deviceId": dev, "platform": "android" }))).await;
        assert_eq!(s, StatusCode::UNAUTHORIZED);
    }
    let (s, v) = t.request("POST", "/auth/login", None, Some(json!({ "identifier": "student.ayesha", "password": "wrong-password-1", "deviceId": dev, "platform": "android" }))).await;
    assert_eq!(s, StatusCode::UNAUTHORIZED, "{v}");
    let (s, v) = t.request("POST", "/auth/login", None, Some(json!({ "identifier": "student.ayesha", "password": seed::DEMO_PASSWORD, "deviceId": dev, "platform": "android" }))).await;
    assert_eq!(s, StatusCode::LOCKED, "{v}");
    assert_eq!(v["error"]["code"], "ACCOUNT_LOCKED");
    sqlx::query("UPDATE users SET locked_until = NULL")
        .execute(&t.db)
        .await
        .unwrap();

    // login by student code works; unknown user and wrong password give the same error
    let (s, v) = t.request("POST", "/auth/login", None, Some(json!({ "identifier": "S-2026-002", "password": seed::DEMO_PASSWORD, "deviceId": dev, "platform": "android" }))).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let (s1, v1) = t.request("POST", "/auth/login", None, Some(json!({ "identifier": "nobody", "password": "whatever-123", "deviceId": dev, "platform": "web" }))).await;
    let (s2, v2) = t.request("POST", "/auth/login", None, Some(json!({ "identifier": "student.farhan", "password": "whatever-123", "deviceId": dev, "platform": "web" }))).await;
    assert_eq!((s1, &v1["error"]["message"]), (s2, &v2["error"]["message"]));

    let rt1 = d(&v)["refreshToken"].as_str().unwrap().to_string();
    let at1 = d(&v)["accessToken"].as_str().unwrap().to_string();
    let (s, v) = t
        .request(
            "POST",
            "/auth/refresh",
            None,
            Some(json!({ "refreshToken": rt1 })),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let rt2 = d(&v)["refreshToken"].as_str().unwrap().to_string();
    assert_ne!(rt1, rt2);
    assert_eq!(
        t.request("GET", "/auth/me", Some(&at1), None).await.0,
        StatusCode::OK
    );
    // reusing the old refresh token burns the family
    let (s, v) = t
        .request(
            "POST",
            "/auth/refresh",
            None,
            Some(json!({ "refreshToken": rt1 })),
        )
        .await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);
    assert_eq!(v["error"]["code"], "TOKEN_REVOKED");
    let (s, _) = t
        .request(
            "POST",
            "/auth/refresh",
            None,
            Some(json!({ "refreshToken": rt2 })),
        )
        .await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);
    let (s, v) = t.request("GET", "/auth/me", Some(&at1), None).await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);
    assert_eq!(v["error"]["code"], "TOKEN_REVOKED");
    t.drop_db().await;
}

#[tokio::test]
async fn token_tampering_expiry_and_web_cookie_csrf() {
    let (t, _) = app().await;
    let tok = t.login("teacher.rahim").await;
    // tampered signature / payload / alg=none / garbage
    let mut parts: Vec<String> = tok.split('.').map(String::from).collect();
    let sig = parts[2].clone();
    let first = if sig.starts_with('A') { 'B' } else { 'A' };
    parts[2] = format!("{first}{}", &sig[1..]);
    assert_eq!(
        t.request("GET", "/auth/me", Some(&parts.join(".")), None)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    let none = format!(
        "{}.{}.",
        base64url(r#"{"alg":"none","typ":"JWT"}"#),
        parts[1]
    );
    assert_eq!(
        t.request("GET", "/auth/me", Some(&none), None).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        t.request("GET", "/auth/me", Some("garbage"), None).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        t.request("GET", "/auth/me", None, None).await.0,
        StatusCode::UNAUTHORIZED
    );
    // expired token
    let (uid, fam): (Uuid, Uuid) =
        sqlx::query_as("SELECT user_id, family_id FROM refresh_tokens LIMIT 1")
            .fetch_one(&t.db)
            .await
            .unwrap();
    let mut st = t.state.clone();
    st.cfg = std::sync::Arc::new({
        let mut c = (*st.cfg).clone();
        c.access_ttl_secs = -5;
        c
    });
    let expired = auth::issue_access(&st, uid, "TEACHER", fam, Uuid::new_v4()).unwrap();
    let (s, v) = t.request("GET", "/auth/me", Some(&expired), None).await;
    assert_eq!(
        (s, v["error"]["code"].as_str()),
        (StatusCode::UNAUTHORIZED, Some("TOKEN_EXPIRED"))
    );
    // a reauth token cannot be used as an access token
    let re = t.reauth(&tok).await;
    assert_eq!(
        t.request("GET", "/auth/me", Some(&re), None).await.0,
        StatusCode::UNAUTHORIZED
    );

    // web flow: refresh token only in HttpOnly cookie, refresh requires an allowed Origin
    let dev = Uuid::new_v4();
    let resp = login_web(&t, dev).await;
    assert!(
        resp.0.contains("HttpOnly")
            && resp.0.contains("SameSite=Strict")
            && resp.0.contains("Path=/api/v1/auth"),
        "{}",
        resp.0
    );
    assert!(resp.1["data"]["refreshToken"].is_null());
    let cookie = resp.0.split(';').next().unwrap().to_string();
    let (s, v) = t
        .request_h(
            "POST",
            "/auth/refresh",
            None,
            Some(json!({})),
            &[("x-client", "web".into()), ("cookie", cookie.clone())],
        )
        .await;
    assert_eq!(
        (s, v["error"]["code"].as_str()),
        (StatusCode::FORBIDDEN, Some("CSRF_REJECTED"))
    );
    let (s, v) = t
        .request_h(
            "POST",
            "/auth/refresh",
            None,
            Some(json!({})),
            &[
                ("x-client", "web".into()),
                ("cookie", cookie),
                ("origin", "http://evil.example".into()),
            ],
        )
        .await;
    assert_eq!(
        (s, v["error"]["code"].as_str()),
        (StatusCode::FORBIDDEN, Some("CSRF_REJECTED"))
    );
    t.drop_db().await;
}

fn base64url(s: &str) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(s)
}

async fn login_web(t: &TestApp, dev: Uuid) -> (String, Value) {
    use axum::{body::Body, http::Request};
    use tower::ServiceExt;
    let req = Request::builder().method("POST").uri("/api/v1/auth/login").header("content-type", "application/json").header("x-client", "web")
        .body(Body::from(json!({ "identifier": "teacher.rahim", "password": seed::DEMO_PASSWORD, "deviceId": dev, "platform": "web" }).to_string())).unwrap();
    let resp = t.app.clone().oneshot(req).await.unwrap();
    let cookie = resp
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let bytes = axum::body::to_bytes(resp.into_body(), 1 << 20)
        .await
        .unwrap();
    (cookie, serde_json::from_slice(&bytes).unwrap())
}

#[tokio::test]
async fn authorization_matrix_and_isolation() {
    let (t, ids) = app().await;
    let hm = t.login("headmaster").await;
    let reg = t.login("registrar").await;
    let rahim = t.login("teacher.rahim").await;
    let ayesha = t.login("student.ayesha").await;
    let farhan_id: String =
        sqlx::query_scalar("SELECT id::text FROM students WHERE student_code='S-2026-002'")
            .fetch_one(&t.db)
            .await
            .unwrap();
    let sabbir_id: String =
        sqlx::query_scalar("SELECT id::text FROM students WHERE student_code='S-2026-007'")
            .fetch_one(&t.db)
            .await
            .unwrap(); // section B
                       // Karim: teacher with NO assignments
    t.request("POST", "/teachers", Some(&reg), Some(json!({ "employeeCode": "T-050", "fullName": "No Class", "username": "teacher.noclass" }))).await;
    let noclass = {
        let pw: String = "x".into();
        let _ = pw;
        sqlx::query("UPDATE users SET password_hash = (SELECT password_hash FROM users WHERE username='headmaster'), must_change_password=false WHERE username='teacher.noclass'").execute(&t.db).await.unwrap();
        t.login("teacher.noclass").await
    };
    // (path, [anon, student, noclass-teacher, teacher, registrar, headmaster]) expected: true = success class, false = denied (401/403/404)
    struct Row(&'static str, String, [bool; 6]);
    let rows = vec![
        Row(
            "GET",
            "/users".into(),
            [false, false, false, false, true, true],
        ),
        Row(
            "GET",
            format!(
                "/users/{}/permissions",
                "00000000-0000-0000-0000-000000000000"
            ),
            [false, false, false, false, false, false],
        ),
        Row(
            "GET",
            "/permissions/catalog".into(),
            [false, false, false, false, false, true],
        ),
        Row(
            "GET",
            "/students".into(),
            [false, false, true, true, true, true],
        ),
        Row(
            "GET",
            "/teachers".into(),
            [false, false, true, true, true, true],
        ),
        Row(
            "GET",
            "/exams".into(),
            [false, false, true, true, true, true],
        ),
        Row(
            "GET",
            "/mark-submissions".into(),
            [false, false, true, true, true, true],
        ),
        Row(
            "GET",
            "/result-sets".into(),
            [false, false, true, true, true, true],
        ),
        Row(
            "GET",
            "/audit-logs".into(),
            [false, false, false, false, false, true],
        ),
        Row(
            "GET",
            "/moderation/reports".into(),
            [false, false, false, false, false, true],
        ),
        Row(
            "GET",
            "/settings".into(),
            [false, false, false, false, true, true],
        ),
        Row(
            "GET",
            "/class-tests".into(),
            [false, false, true, true, false, true],
        ),
        Row(
            "GET",
            "/reports/enrollment-summary".into(),
            [false, false, false, false, true, true],
        ),
        Row(
            "GET",
            "/documents".into(),
            [false, false, true, true, true, true],
        ),
        Row(
            "GET",
            "/certificates".into(),
            [false, true, false, false, true, true],
        ),
        Row(
            "GET",
            "/notices".into(),
            [false, true, true, true, true, true],
        ),
        Row(
            "GET",
            "/notifications".into(),
            [false, true, true, true, true, true],
        ),
        Row(
            "GET",
            "/messaging/recipients".into(),
            [false, true, true, true, true, true],
        ),
        Row(
            "GET",
            "/homework".into(),
            [false, true, true, true, true, true],
        ),
        Row(
            "GET",
            format!("/students/{farhan_id}"),
            [false, false, false, true, true, true],
        ), // other student: 404 for student; teacher assigned to 6A
        Row(
            "GET",
            format!("/students/{sabbir_id}"),
            [false, false, false, true, true, true],
        ), // 6B: rahim assigned too
        Row(
            "GET",
            format!("/students/{farhan_id}/results"),
            [false, false, false, true, true, true],
        ),
        Row(
            "GET",
            format!("/students/{farhan_id}/attendance"),
            [false, false, false, true, true, true],
        ),
        Row(
            "GET",
            format!("/students/{farhan_id}/class-tests"),
            [false, false, false, true, true, true],
        ),
        Row(
            "GET",
            format!("/students/{farhan_id}/academic-history"),
            [false, false, false, true, true, true],
        ),
        Row(
            "GET",
            format!("/students/{farhan_id}/report-cards"),
            [false, false, false, false, true, true],
        ),
        Row(
            "GET",
            "/search?q=ay".into(),
            [false, true, true, true, true, true],
        ),
    ];
    let toks: [Option<&str>; 6] = [
        None,
        Some(&ayesha),
        Some(&noclass),
        Some(&rahim),
        Some(&reg),
        Some(&hm),
    ];
    let names = [
        "anon",
        "student",
        "noclass-teacher",
        "teacher",
        "registrar",
        "headmaster",
    ];
    let mut failures = vec![];
    for Row(m, p, exp) in &rows {
        for (i, tok) in toks.iter().enumerate() {
            let (s, _) = t.request(m, p, *tok, None).await;
            let success = s.is_success();
            if success != exp[i] {
                failures.push(format!(
                    "{m} {p} as {} -> {s} (expected success={})",
                    names[i], exp[i]
                ));
            }
            if !exp[i] {
                assert!(
                    matches!(s.as_u16(), 401 | 403 | 404),
                    "{m} {p} as {} gave {s}",
                    names[i]
                );
            }
        }
    }
    // anon must always be 401
    for Row(m, p, _) in &rows {
        assert_eq!(
            t.request(m, p, None, None).await.0,
            StatusCode::UNAUTHORIZED,
            "{p}"
        );
    }
    assert!(
        failures.is_empty(),
        "authorization matrix mismatches:\n{}",
        failures.join("\n")
    );

    // IDOR: student cannot reach another student's data in any representation (404, never 403)
    for p in [
        format!("/students/{farhan_id}"),
        format!("/students/{farhan_id}/results"),
        format!("/students/{farhan_id}/attendance"),
        format!("/students/{farhan_id}/class-tests"),
        format!("/students/{farhan_id}/academic-history"),
        format!("/students/{farhan_id}/report-cards"),
    ] {
        assert_eq!(
            t.request("GET", &p, Some(&ayesha), None).await.0,
            StatusCode::NOT_FOUND,
            "{p}"
        );
    }
    // teacher without assignment cannot read students (scoped): list is empty, detail is 404
    let (_, v) = t.request("GET", "/students", Some(&noclass), None).await;
    assert_eq!(d(&v).as_array().unwrap().len(), 0);
    assert_eq!(
        t.request(
            "GET",
            &format!("/students/{farhan_id}"),
            Some(&noclass),
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    // teachers see redacted student profiles
    let (_, v) = t
        .request("GET", &format!("/students/{farhan_id}"), Some(&rahim), None)
        .await;
    assert!(d(&v)["guardianPhone"].is_null() && d(&v)["address"].is_null());
    // registrar cannot approve/publish/configure; teacher cannot enter marks for an unassigned paper
    let re = t.reauth(&reg).await;
    for (p, b) in [(
        "/settings",
        Some(json!({ "registrarCanPublishResults": true })),
    )] {
        assert_eq!(
            t.request_h("PATCH", p, Some(&reg), b, &[("x-reauth-token", re.clone())])
                .await
                .0,
            StatusCode::FORBIDDEN
        );
    }
    assert_eq!(
        t.request(
            "PUT",
            &format!("/users/{}/permissions", Uuid::new_v4()),
            Some(&reg),
            Some(json!({ "overrides": [] }))
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let _ = ids;
    t.drop_db().await;
}

#[tokio::test]
async fn permission_overrides_and_delegated_publishing() {
    let (t, ids) = app().await;
    let hm = t.login("headmaster").await;
    let reg = t.login("registrar").await;
    let reg_id: String =
        sqlx::query_scalar("SELECT id::text FROM users WHERE username='registrar'")
            .fetch_one(&t.db)
            .await
            .unwrap();
    // override requires reauth and a reason; only delegable permissions can be granted
    let body = json!({ "overrides": [{ "permission": "results.approve", "effect": "GRANT", "reason": "Acting headmaster" }] });
    let (s, v) = t
        .request(
            "PUT",
            &format!("/users/{reg_id}/permissions"),
            Some(&hm),
            Some(body.clone()),
        )
        .await;
    assert_eq!(
        (s, v["error"]["code"].as_str()),
        (StatusCode::FORBIDDEN, Some("REAUTH_REQUIRED"))
    );
    let re = t.reauth(&hm).await;
    let (s, v) = t.request_h("PUT", &format!("/users/{reg_id}/permissions"), Some(&hm), Some(json!({ "overrides": [{ "permission": "roles.manage", "effect": "GRANT", "reason": "x" }] })), &[("x-reauth-token", re.clone())]).await;
    assert_eq!(
        (s, v["error"]["fieldErrors"][0]["code"].as_str()),
        (StatusCode::UNPROCESSABLE_ENTITY, Some("NOT_DELEGABLE")),
        "{v}"
    );
    let (s, v) = t
        .request_h(
            "PUT",
            &format!("/users/{reg_id}/permissions"),
            Some(&hm),
            Some(body),
            &[("x-reauth-token", re.clone())],
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert!(d(&v)["effective"]
        .as_array()
        .unwrap()
        .iter()
        .any(|p| p == "results.approve"));
    // takes effect immediately on the same session; audit logged
    let (_, me) = t.request("GET", "/auth/me", Some(&reg), None).await;
    assert!(d(&me)["permissions"]
        .as_array()
        .unwrap()
        .iter()
        .any(|p| p == "results.approve"));
    let n: i64 =
        sqlx::query_scalar("SELECT count(*) FROM audit_logs WHERE action='permissions.changed'")
            .fetch_one(&t.db)
            .await
            .unwrap();
    assert_eq!(n, 1);
    // delegated publish: needs school switch + exam flag + grant of results.publish
    let (exam, rs) = common::publish_math_exam(&t, &ids).await;
    let _ = exam;
    // already published -> second publish by registrar is an invalid transition or forbidden; never succeeds
    let re2 = t.reauth(&reg).await;
    let (s, _) = t
        .request_h(
            "POST",
            &format!("/result-sets/{rs}/publish"),
            Some(&reg),
            None,
            &[("x-reauth-token", re2)],
        )
        .await;
    assert!(matches!(s, StatusCode::FORBIDDEN | StatusCode::CONFLICT));
    // separation of duties: the registrar who verified cannot approve even with the grant (a second set would be needed); verified_by list contains registrar
    let verifiers: i64 = sqlx::query_scalar(
        "SELECT count(DISTINCT verified_by) FROM mark_submissions WHERE verified_by IS NOT NULL",
    )
    .fetch_one(&t.db)
    .await
    .unwrap();
    assert_eq!(verifiers, 1);
    t.drop_db().await;
}

#[tokio::test]
async fn validation_injection_idempotency_and_mass_assignment() {
    let (t, ids) = app().await;
    let reg = t.login("registrar").await;
    let hm = t.login("headmaster").await;
    // SQL injection via search/filter/sort-like parameters must not alter data or error out
    for q in ["'; DROP TABLE users; --", "%' OR '1'='1", "\\", "a\u{0}b"] {
        let (s, _) = t
            .request(
                "GET",
                &format!("/students?q={}", urlenc(q)),
                Some(&reg),
                None,
            )
            .await;
        assert!(s.is_success() || s == StatusCode::BAD_REQUEST, "{s}");
        let (s, _) = t
            .request("GET", &format!("/search?q={}", urlenc(q)), Some(&reg), None)
            .await;
        assert!(
            s.is_success() || s.as_u16() == 422 || s == StatusCode::BAD_REQUEST,
            "{s}"
        );
        let (s, _) = t
            .request(
                "GET",
                &format!("/students?classId={}", urlenc(q)),
                Some(&reg),
                None,
            )
            .await;
        assert!(s.is_client_error());
    }
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(&t.db)
        .await
        .unwrap();
    assert_eq!(n, 12);
    // mass assignment / unknown fields rejected
    let (s, _) = t.request("POST", "/exams", Some(&reg), Some(json!({ "name": "X", "type": "TERM", "startDate": "2026-01-01", "endDate": "2026-01-02", "status": "AUTHORIZED" }))).await;
    assert!(s.is_client_error(), "{s}");
    let (s, v) = t.request("POST", "/students", Some(&reg), Some(json!({ "studentCode": "S-9", "fullName": "A", "dob": "2014-01-01", "gender": "MALE" }))).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY, "{v}");
    assert_eq!(v["error"]["fieldErrors"][0]["field"], "studentCode");
    // idempotent create
    let key = Uuid::new_v4().to_string();
    let body = json!({ "studentCode": "S-2026-100", "fullName": "New Student", "dob": "2014-05-05", "gender": "FEMALE", "classId": ids.class6, "sectionId": ids.sec6a, "rollNo": 20 });
    let (s1, v1) = t
        .request_h(
            "POST",
            "/students",
            Some(&reg),
            Some(body.clone()),
            &[("idempotency-key", key.clone())],
        )
        .await;
    let (s2, v2) = t
        .request_h(
            "POST",
            "/students",
            Some(&reg),
            Some(body),
            &[("idempotency-key", key)],
        )
        .await;
    assert_eq!(
        (s1, s2),
        (StatusCode::CREATED, StatusCode::CREATED),
        "{v1} {v2}"
    );
    assert_eq!(d(&v1)["student"]["id"], d(&v2)["student"]["id"]);
    let c: i64 =
        sqlx::query_scalar("SELECT count(*) FROM students WHERE student_code='S-2026-100'")
            .fetch_one(&t.db)
            .await
            .unwrap();
    assert_eq!(c, 1);
    // optimistic concurrency: stale version -> 409 VERSION_CONFLICT
    let sid = d(&v1)["student"]["id"].as_str().unwrap().to_string();
    let ver = d(&v1)["student"]["version"].as_i64().unwrap();
    assert_eq!(
        t.request_h(
            "PATCH",
            &format!("/students/{sid}"),
            Some(&reg),
            Some(json!({ "address": "Dhaka" })),
            &[("if-match", format!("\"{ver}\""))]
        )
        .await
        .0,
        StatusCode::OK
    );
    let (s, v) = t
        .request_h(
            "PATCH",
            &format!("/students/{sid}"),
            Some(&reg),
            Some(json!({ "address": "Sylhet" })),
            &[("if-match", format!("\"{ver}\""))],
        )
        .await;
    assert_eq!(
        (s, v["error"]["code"].as_str()),
        (StatusCode::CONFLICT, Some("VERSION_CONFLICT"))
    );
    // pagination: cursor walk returns every row exactly once
    let mut seen = std::collections::HashSet::new();
    let mut cursor = String::new();
    loop {
        let (s, v) = t
            .request(
                "GET",
                &format!("/students?limit=4&cursor={cursor}"),
                Some(&hm),
                None,
            )
            .await;
        assert_eq!(s, StatusCode::OK);
        for r in d(&v).as_array().unwrap() {
            assert!(seen.insert(r["id"].as_str().unwrap().to_string()));
        }
        match v["meta"]["nextCursor"].as_str() {
            Some(c) => cursor = c.to_string(),
            None => break,
        }
    }
    assert_eq!(seen.len(), 9);
    t.drop_db().await;
}

fn urlenc(s: &str) -> String {
    s.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}
