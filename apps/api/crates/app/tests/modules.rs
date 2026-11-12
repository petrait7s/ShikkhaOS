mod common;
use axum::http::StatusCode;
use common::TestApp;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use shikkhaos_app::seed;

fn d(v: &Value) -> &Value {
    &v["data"]
}
async fn app() -> (TestApp, seed::Ids) {
    let t = TestApp::new().await;
    let ids = seed::demo_small(&t.db).await.unwrap();
    (t, ids)
}

async fn upload(
    t: &TestApp,
    tok: &str,
    kind: &str,
    mime: &str,
    bytes: &[u8],
    name: &str,
) -> (StatusCode, Value) {
    use axum::{body::Body, http::Request};
    use tower::ServiceExt;
    let (s, v) = t.request("POST", "/files/uploads", Some(tok), Some(json!({ "filename": name, "mimeType": mime, "sizeBytes": bytes.len(), "kind": kind, "checksumSha256": hex::encode(Sha256::digest(bytes)) }))).await;
    if s != StatusCode::CREATED {
        return (s, v);
    }
    let id = d(&v)["fileId"].as_str().unwrap().to_string();
    let req = Request::builder()
        .method("PUT")
        .uri(format!("/api/v1/files/{id}/content"))
        .header("authorization", format!("Bearer {tok}"))
        .header("content-type", mime)
        .body(Body::from(bytes.to_vec()))
        .unwrap();
    let r = t.app.clone().oneshot(req).await.unwrap();
    assert_eq!(r.status(), StatusCode::NO_CONTENT);
    t.request("POST", &format!("/files/{id}/complete"), Some(tok), None)
        .await
}

#[tokio::test]
async fn files_lifecycle_and_validation() {
    let (t, _) = app().await;
    let (ayesha, farhan, rahim) = (
        t.login("student.ayesha").await,
        t.login("student.farhan").await,
        t.login("teacher.rahim").await,
    );
    let png: Vec<u8> = [
        &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A][..],
        &[0u8; 64],
    ]
    .concat();
    let (s, v) = upload(
        &t,
        &ayesha,
        "AVATAR",
        "image/png",
        &png,
        "../../etc/passwd.png",
    )
    .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(d(&v)["status"], "READY");
    assert_eq!(d(&v)["filename"], "passwd.png"); // path stripped
    let fid = d(&v)["id"].as_str().unwrap().to_string();
    // wrong type / oversize / disguised content rejected
    let (s, v) = t.request("POST", "/files/uploads", Some(&ayesha), Some(json!({ "filename": "a.exe", "mimeType": "application/x-msdownload", "sizeBytes": 10, "kind": "ATTACHMENT" }))).await;
    assert_eq!(
        (s, v["error"]["code"].as_str()),
        (
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            Some("UNSUPPORTED_MEDIA_TYPE")
        )
    );
    let (s, v) = t.request("POST", "/files/uploads", Some(&ayesha), Some(json!({ "filename": "a.png", "mimeType": "image/png", "sizeBytes": 3_000_000, "kind": "AVATAR" }))).await;
    assert_eq!(
        (s, v["error"]["code"].as_str()),
        (StatusCode::PAYLOAD_TOO_LARGE, Some("PAYLOAD_TOO_LARGE"))
    );
    let (s, v) = upload(
        &t,
        &ayesha,
        "AVATAR",
        "image/png",
        b"<?php echo 1; ?>padding-padding",
        "evil.png",
    )
    .await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY, "{v}");
    assert_eq!(t.request("POST", "/files/uploads", Some(&ayesha), Some(json!({ "filename": "r.pdf", "mimeType": "application/pdf", "sizeBytes": 10, "kind": "REPORT_CARD" }))).await.0, StatusCode::FORBIDDEN);
    assert_eq!(t.request("POST", "/files/uploads", Some(&ayesha), Some(json!({ "filename": "d.pdf", "mimeType": "application/pdf", "sizeBytes": 10, "kind": "DOCUMENT" }))).await.0, StatusCode::FORBIDDEN);
    // download link: owner OK, short-lived signed url, others 404 for private kinds
    let (s, v) = t
        .request(
            "GET",
            &format!("/files/{fid}/download-url"),
            Some(&ayesha),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::OK);
    let url = d(&v)["url"].as_str().unwrap().replace("/api/v1", "");
    let (s, _) = t.request("GET", &url, None, None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(
        t.request(
            "GET",
            &format!("/files/{fid}/download?token=bogus"),
            None,
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    // attachments are readable only by members of the conversation they were sent in
    let pdf = b"%PDF-1.4\n%test content padding".to_vec();
    let (s, v) = upload(
        &t,
        &ayesha,
        "ATTACHMENT",
        "application/pdf",
        &pdf,
        "note.pdf",
    )
    .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let att = d(&v)["id"].as_str().unwrap().to_string();
    assert_eq!(
        t.request(
            "GET",
            &format!("/files/{att}/download-url"),
            Some(&farhan),
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let rahim_id: String =
        sqlx::query_scalar("SELECT id::text FROM users WHERE username='teacher.rahim'")
            .fetch_one(&t.db)
            .await
            .unwrap();
    let (_, c) = t
        .request(
            "POST",
            "/conversations",
            Some(&ayesha),
            Some(json!({ "type": "DIRECT", "recipientId": rahim_id })),
        )
        .await;
    let conv = d(&c)["id"].as_str().unwrap().to_string();
    assert_eq!(
        t.request(
            "POST",
            &format!("/conversations/{conv}/messages"),
            Some(&ayesha),
            Some(json!({ "body": "see attached", "attachmentFileIds": [att] }))
        )
        .await
        .0,
        StatusCode::CREATED
    );
    assert_eq!(
        t.request(
            "GET",
            &format!("/files/{att}/download-url"),
            Some(&rahim),
            None
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        t.request(
            "GET",
            &format!("/files/{att}/download-url"),
            Some(&farhan),
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    // can't attach someone else's file
    assert_eq!(
        t.request(
            "POST",
            &format!("/conversations/{conv}/messages"),
            Some(&rahim),
            Some(json!({ "body": "x", "attachmentFileIds": [att] }))
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    t.drop_db().await;
}

#[tokio::test]
async fn attendance_classtests_notices_homework_reports_and_report_cards() {
    let (t, ids) = app().await;
    let (hm, reg, rahim, salma, ayesha, sabbir) = (
        t.login("headmaster").await,
        t.login("registrar").await,
        t.login("teacher.rahim").await,
        t.login("teacher.salma").await,
        t.login("student.ayesha").await,
        t.login("student.sabbir").await,
    );
    let today = chrono::Utc::now().date_naive().to_string();

    // ---- attendance: class teacher (rahim, 6A) can take it; salma (not class teacher) cannot; future date rejected
    let (s, v) = t
        .request(
            "POST",
            "/attendance-sessions",
            Some(&rahim),
            Some(json!({ "sectionId": ids.sec6a, "date": today })),
        )
        .await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    let sess = d(&v)["id"].as_str().unwrap().to_string();
    let roster = d(&v)["records"].as_array().unwrap().clone();
    assert_eq!(roster.len(), 5);
    assert_eq!(
        t.request(
            "POST",
            "/attendance-sessions",
            Some(&salma),
            Some(json!({ "sectionId": ids.sec6a, "date": today }))
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        t.request(
            "POST",
            "/attendance-sessions",
            Some(&rahim),
            Some(json!({ "sectionId": ids.sec6a, "date": "2999-01-01" }))
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let recs: Vec<Value> = roster.iter().enumerate().map(|(i, r)| json!({ "studentId": r["studentId"], "status": if i == 0 { "ABSENT" } else { "PRESENT" } })).collect();
    let (s, v) = t
        .request(
            "PUT",
            &format!("/attendance-sessions/{sess}/records"),
            Some(&rahim),
            Some(json!({ "records": recs })),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let (_, n) = t
        .request("GET", "/notifications", Some(&ayesha), None)
        .await;
    assert!(
        d(&n)
            .as_array()
            .unwrap()
            .iter()
            .any(|x| x["type"] == "ATTENDANCE_ABSENT"),
        "{n}"
    );
    // correcting a recorded value later needs a reason (registrar correction)
    let fix = vec![json!({ "studentId": roster[0]["studentId"], "status": "EXCUSED" })];
    assert_eq!(
        t.request(
            "PUT",
            &format!("/attendance-sessions/{sess}/records"),
            Some(&reg),
            Some(json!({ "records": fix }))
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        t.request(
            "PUT",
            &format!("/attendance-sessions/{sess}/records"),
            Some(&reg),
            Some(json!({ "records": fix, "reason": "Medical note" }))
        )
        .await
        .0,
        StatusCode::OK
    );
    let ay: String =
        sqlx::query_scalar("SELECT id::text FROM students WHERE student_code='S-2026-001'")
            .fetch_one(&t.db)
            .await
            .unwrap();
    let (s, v) = t
        .request(
            "GET",
            &format!("/students/{ay}/attendance"),
            Some(&ayesha),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(d(&v)["summary"]["total"], 1);
    assert_eq!(
        t.request(
            "GET",
            &format!("/attendance-sessions/{sess}"),
            Some(&ayesha),
            None
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );

    // ---- class tests: shared into class group, never touches official results
    let assign: String = sqlx::query_scalar(
        "SELECT id::text FROM teacher_assignments WHERE teacher_id=$1 AND section_id=$2",
    )
    .bind(ids.teacher_rahim)
    .bind(ids.sec6a)
    .fetch_one(&t.db)
    .await
    .unwrap();
    let (s, v) = t.request("POST", "/class-tests", Some(&rahim), Some(json!({ "teacherAssignmentId": assign, "title": "Unit test 1", "date": today, "fullMarks": 20 }))).await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    let ct = d(&v)["id"].as_str().unwrap().to_string();
    let marks: Vec<Value> = d(&v)["marks"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| json!({ "studentId": m["studentId"], "marks": 17.5, "absent": false }))
        .collect();
    assert_eq!(
        t.request(
            "PUT",
            &format!("/class-tests/{ct}/marks"),
            Some(&rahim),
            Some(json!({ "marks": [{ "studentId": marks[0]["studentId"], "marks": 21 }] }))
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        t.request(
            "PUT",
            &format!("/class-tests/{ct}/marks"),
            Some(&rahim),
            Some(json!({ "marks": marks }))
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        t.request(
            "GET",
            &format!("/students/{ay}/class-tests"),
            Some(&ayesha),
            None
        )
        .await
        .1["data"]
            .as_array()
            .unwrap()
            .len(),
        0
    ); // not shared yet
    let before: (i64, i64, i64) = sqlx::query_as("SELECT (SELECT count(*) FROM result_sets), (SELECT count(*) FROM student_results), (SELECT count(*) FROM mark_entries)").fetch_one(&t.db).await.unwrap();
    assert_eq!(
        t.request(
            "POST",
            &format!("/class-tests/{ct}/share"),
            Some(&salma),
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let (s, v) = t
        .request(
            "POST",
            &format!("/class-tests/{ct}/share"),
            Some(&rahim),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let after: (i64, i64, i64) = sqlx::query_as("SELECT (SELECT count(*) FROM result_sets), (SELECT count(*) FROM student_results), (SELECT count(*) FROM mark_entries)").fetch_one(&t.db).await.unwrap();
    assert_eq!(
        before, after,
        "class test sharing must not change official result tables"
    );
    let (_, v) = t
        .request(
            "GET",
            &format!("/students/{ay}/class-tests"),
            Some(&ayesha),
            None,
        )
        .await;
    assert_eq!(d(&v)[0]["marks"], 17.5);
    assert!(d(&v)[0]["label"]
        .as_str()
        .unwrap()
        .contains("not an official result"));
    assert_eq!(
        t.request(
            "PUT",
            &format!("/class-tests/{ct}/marks"),
            Some(&rahim),
            Some(json!({ "marks": marks }))
        )
        .await
        .0,
        StatusCode::CONFLICT
    ); // locked after share
    let (_, g) = t
        .request("GET", "/conversations", Some(&ayesha), None)
        .await;
    let gid = d(&g)
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["type"] == "CLASS_GROUP")
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let (_, m) = t
        .request(
            "GET",
            &format!("/conversations/{gid}/messages"),
            Some(&ayesha),
            None,
        )
        .await;
    assert!(d(&m)
        .as_array()
        .unwrap()
        .iter()
        .any(|x| x["kind"] == "CLASS_TEST_SHARED"));
    // student in the other section never sees it
    let sab: String =
        sqlx::query_scalar("SELECT id::text FROM students WHERE student_code='S-2026-007'")
            .fetch_one(&t.db)
            .await
            .unwrap();
    assert!(d(&t
        .request(
            "GET",
            &format!("/students/{sab}/class-tests"),
            Some(&sabbir),
            None
        )
        .await
        .1)
    .as_array()
    .unwrap()
    .is_empty());

    // ---- notices: audience targeting, teacher approval flow
    let (s, v) = t.request("POST", "/notices", Some(&hm), Some(json!({ "title": "Exam routine", "body": "Half yearly starts Sunday", "audience": { "roles": ["STUDENT"], "classIds": [], "sectionIds": [ids.sec6a] } }))).await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    let nid = d(&v)["id"].as_str().unwrap().to_string();
    assert!(
        d(&t.request("GET", "/notices", Some(&ayesha), None).await.1)
            .as_array()
            .unwrap()
            .is_empty()
    ); // draft invisible
    assert_eq!(
        t.request("POST", &format!("/notices/{nid}/publish"), Some(&hm), None)
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        d(&t.request("GET", "/notices", Some(&ayesha), None).await.1)
            .as_array()
            .unwrap()
            .len(),
        1
    );
    // teacher notice to whole school -> goes to approval; teacher notice to own section publishes directly
    let (_, v) = t.request("POST", "/notices", Some(&rahim), Some(json!({ "title": "Whole school", "body": "x", "audience": { "roles": ["STUDENT"] } }))).await;
    let n2 = d(&v)["id"].as_str().unwrap().to_string();
    assert_eq!(
        t.request(
            "POST",
            &format!("/notices/{n2}/publish"),
            Some(&rahim),
            None
        )
        .await
        .1["data"]["status"],
        "PENDING_APPROVAL"
    );
    assert_eq!(
        t.request("POST", &format!("/notices/{n2}/publish"), Some(&hm), None)
            .await
            .1["data"]["status"],
        "PUBLISHED"
    );
    let (_, v) = t.request("POST", "/notices", Some(&rahim), Some(json!({ "title": "6A only", "body": "x", "audience": { "sectionIds": [ids.sec6a] } }))).await;
    let n3 = d(&v)["id"].as_str().unwrap().to_string();
    assert_eq!(
        t.request(
            "POST",
            &format!("/notices/{n3}/publish"),
            Some(&rahim),
            None
        )
        .await
        .1["data"]["status"],
        "PUBLISHED"
    );
    assert_eq!(
        t.request(
            "POST",
            &format!("/notices/{n3}/publish"),
            Some(&rahim),
            None
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let titles = |v: &Value| {
        d(v).as_array()
            .unwrap()
            .iter()
            .map(|n| n["title"].as_str().unwrap().to_string())
            .collect::<Vec<_>>()
    };
    assert!(
        titles(&t.request("GET", "/notices", Some(&sabbir), None).await.1)
            .iter()
            .all(|t| t != "6A only" && t != "Exam routine")
    ); // section B student: not targeted

    // ---- homework: create -> publish -> student submit -> grade; reminders job
    let (s, v) = t.request("POST", "/homework", Some(&rahim), Some(json!({ "teacherAssignmentId": assign, "title": "Algebra set 1", "description": "Ex 1.1", "dueAt": (chrono::Utc::now() + chrono::Duration::hours(5)).to_rfc3339() }))).await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    let hw = d(&v)["id"].as_str().unwrap().to_string();
    assert_eq!(
        t.request("GET", &format!("/homework/{hw}"), Some(&ayesha), None)
            .await
            .0,
        StatusCode::NOT_FOUND
    ); // draft hidden
    assert_eq!(t.request("POST", "/homework", Some(&rahim), Some(json!({ "teacherAssignmentId": assign, "title": "Past", "dueAt": "2020-01-01T00:00:00Z" }))).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        t.request(
            "POST",
            &format!("/homework/{hw}/publish"),
            Some(&salma),
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        t.request(
            "POST",
            &format!("/homework/{hw}/publish"),
            Some(&rahim),
            None
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        t.request("GET", &format!("/homework/{hw}"), Some(&sabbir), None)
            .await
            .0,
        StatusCode::NOT_FOUND
    ); // other section
    assert_eq!(
        d(&t.request("GET", "/homework", Some(&ayesha), None).await.1)
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        t.request(
            "POST",
            &format!("/homework/{hw}/submissions"),
            Some(&ayesha),
            Some(json!({}))
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let (s, v) = t
        .request(
            "POST",
            &format!("/homework/{hw}/submissions"),
            Some(&ayesha),
            Some(json!({ "text": "My answers" })),
        )
        .await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    let sub = d(&v)["id"].as_str().unwrap().to_string();
    assert_eq!(d(&v)["late"], false);
    let (_, list) = t
        .request(
            "GET",
            &format!("/homework/{hw}/submissions"),
            Some(&rahim),
            None,
        )
        .await;
    assert_eq!(
        d(&list)
            .as_array()
            .unwrap()
            .iter()
            .filter(|r| r["submitted"] == true)
            .count(),
        1
    );
    assert_eq!(
        t.request(
            "PATCH",
            &format!("/homework-submissions/{sub}"),
            Some(&salma),
            Some(json!({ "grade": "A" }))
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        t.request(
            "PATCH",
            &format!("/homework-submissions/{sub}"),
            Some(&rahim),
            Some(json!({ "grade": "A", "feedback": "Good" }))
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        t.request(
            "POST",
            &format!("/homework/{hw}/submissions"),
            Some(&ayesha),
            Some(json!({ "text": "again" }))
        )
        .await
        .0,
        StatusCode::CONFLICT
    ); // graded
    let reminded = shikkhaos_app::jobs::homework_due_soon(&t.state)
        .await
        .unwrap();
    assert_eq!(
        reminded, 4,
        "4 section-A students without submissions get a reminder"
    );
    assert_eq!(
        shikkhaos_app::jobs::homework_due_soon(&t.state)
            .await
            .unwrap(),
        0
    ); // only once

    // ---- official results -> report cards, reports, certificates
    let (exam, rs) = common::publish_math_exam(&t, &ids).await;
    let (s, v) = t
        .request(
            "POST",
            &format!("/result-sets/{rs}/report-cards"),
            Some(&reg),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(d(&v)["generated"], 8);
    assert_eq!(
        d(&t.request(
            "POST",
            &format!("/result-sets/{rs}/report-cards"),
            Some(&reg),
            None
        )
        .await
        .1)["generated"],
        0
    ); // idempotent
    let (_, rc) = t
        .request(
            "GET",
            &format!("/students/{ay}/report-cards"),
            Some(&ayesha),
            None,
        )
        .await;
    let file = d(&rc)[0]["fileId"].as_str().unwrap().to_string();
    let (_, u) = t
        .request(
            "GET",
            &format!("/files/{file}/download-url"),
            Some(&ayesha),
            None,
        )
        .await;
    let url = d(&u)["url"].as_str().unwrap().replace("/api/v1", "");
    {
        use axum::{body::Body, http::Request};
        use tower::ServiceExt;
        let resp = t
            .app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1{url}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(resp.headers()["content-type"], "application/pdf");
        let b = axum::body::to_bytes(resp.into_body(), 1 << 20)
            .await
            .unwrap();
        assert!(b.starts_with(b"%PDF-1.4") && b.windows(5).any(|w| w == b"%%EOF"));
    }
    assert_eq!(
        t.request(
            "GET",
            &format!("/files/{file}/download-url"),
            Some(&sabbir),
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let (s, v) = t
        .request("GET", "/reports/exam-analysis", Some(&reg), None)
        .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(d(&v)["rows"][0]["students"], 8);
    let (s, v) = t
        .request(
            "POST",
            &format!("/reports/result-distribution/export?examId={exam}"),
            Some(&reg),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::OK);
    assert!(d(&v)["content"]
        .as_str()
        .unwrap()
        .starts_with("className,examName,grade,students"));
    for k in [
        "enrollment-summary",
        "attendance-summary",
        "teacher-submission-status",
    ] {
        assert_eq!(
            t.request("GET", &format!("/reports/{k}"), Some(&reg), None)
                .await
                .0,
            StatusCode::OK,
            "{k}"
        );
    }
    assert_eq!(
        t.request("GET", "/reports/unknown", Some(&reg), None)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    let (s, v) = t
        .request(
            "POST",
            "/certificates/issue",
            Some(&reg),
            Some(json!({ "studentId": ay, "type": "STUDYING", "remarks": "For bank" })),
        )
        .await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    assert!(d(&v)["serialNo"].as_str().unwrap().starts_with("CERT-"));
    assert_eq!(
        t.request(
            "POST",
            "/certificates/issue",
            Some(&rahim),
            Some(json!({ "studentId": ay, "type": "STUDYING" }))
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        d(&t.request("GET", "/certificates", Some(&ayesha), None)
            .await
            .1)
        .as_array()
        .unwrap()
        .len(),
        1
    );
    // audit export is permissioned and CSV-injection-safe
    assert_eq!(
        t.request("POST", "/audit-logs/export", Some(&reg), None)
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        t.request("POST", "/audit-logs/export", Some(&hm), None)
            .await
            .0,
        StatusCode::OK
    );
    t.drop_db().await;
}
