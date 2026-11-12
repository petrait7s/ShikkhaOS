mod common;
use axum::http::StatusCode;
use common::TestApp;
use serde_json::{json, Value};
use shikkhaos_app::seed;

fn d(v: &Value) -> &Value { &v["data"] }

#[tokio::test]
async fn headmaster_rejects_result_set_register_fixes_and_recompiles_new_revision() {
    let t = TestApp::new().await;
    let ids = seed::demo_small(&t.db).await.unwrap();
    let (hm, reg, ayesha) = (t.login("headmaster").await, t.login("registrar").await, t.login("student.ayesha").await);
    let (_exam, rs) = common::compile_math_exam(&t, &ids).await;
    // reject needs re-auth, a reason and the Headmaster
    let re = t.reauth(&hm).await;
    assert_eq!(t.request("POST", &format!("/result-sets/{rs}/reject"), Some(&hm), Some(json!({ "reason": "x" }))).await.0, StatusCode::FORBIDDEN);
    let (s, _) = t.request_h("POST", &format!("/result-sets/{rs}/reject"), Some(&hm), Some(json!({ "reason": "  " })), &[("x-reauth-token", re.clone())]).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
    let rr = t.reauth(&reg).await;
    assert_eq!(t.request_h("POST", &format!("/result-sets/{rs}/reject"), Some(&reg), Some(json!({ "reason": "no" })), &[("x-reauth-token", rr)]).await.0, StatusCode::FORBIDDEN);
    let (s, v) = t.request_h("POST", &format!("/result-sets/{rs}/reject"), Some(&hm), Some(json!({ "reason": "Math marks for 6-B look inflated" })), &[("x-reauth-token", re.clone())]).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(d(&v)["status"], "REJECTED");
    assert_eq!(d(&v)["rejectionNote"], "Math marks for 6-B look inflated");
    // cannot approve / publish a rejected set; submissions were reopened; registrar was notified
    let re2 = t.reauth(&hm).await;
    assert_eq!(t.request_h("POST", &format!("/result-sets/{rs}/approve"), Some(&hm), None, &[("x-reauth-token", re2)]).await.0, StatusCode::CONFLICT);
    let reopened: i64 = sqlx::query_scalar("SELECT count(*) FROM mark_submissions WHERE status='UNDER_REVIEW'").fetch_one(&t.db).await.unwrap();
    assert_eq!(reopened, 2);
    let (_, n) = t.request("GET", "/notifications", Some(&reg), None).await;
    assert!(d(&n).as_array().unwrap().iter().any(|x| x["type"] == "RESULTS_REJECTED"));
    // recompile is blocked until every submission is verified again
    let (s, v) = t.request("POST", "/result-sets", Some(&reg), Some(json!({ "examId": _exam, "classId": ids.class6 }))).await;
    assert_eq!((s, v["error"]["code"].as_str()), (StatusCode::CONFLICT, Some("SUBMISSIONS_NOT_VERIFIED")), "{v}");
    let subs: Vec<String> = sqlx::query_scalar("SELECT id::text FROM mark_submissions").fetch_all(&t.db).await.unwrap();
    for sid in &subs { assert_eq!(t.request("POST", &format!("/mark-submissions/{sid}/verify"), Some(&reg), None).await.0, StatusCode::OK); }
    let (s, v) = t.request("POST", "/result-sets", Some(&reg), Some(json!({ "examId": _exam, "classId": ids.class6 }))).await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    assert_eq!(d(&v)["id"].as_str().unwrap(), rs, "recompiled in place");
    assert_eq!(d(&v)["currentRevision"], 2);
    assert_eq!(d(&v)["status"], "VERIFIED");
    assert!(d(&v)["rejectionNote"].is_null());
    let kept: i64 = sqlx::query_scalar("SELECT count(*) FROM student_results WHERE result_set_id=$1::uuid").bind(&rs).fetch_one(&t.db).await.unwrap();
    assert_eq!(kept, 16, "revision 1 rows are kept");
    // approve + publish now works and the student sees it
    let re3 = t.reauth(&hm).await;
    assert_eq!(t.request_h("POST", &format!("/result-sets/{rs}/approve"), Some(&hm), None, &[("x-reauth-token", re3)]).await.0, StatusCode::OK);
    let re4 = t.reauth(&hm).await;
    assert_eq!(t.request_h("POST", &format!("/result-sets/{rs}/publish"), Some(&hm), None, &[("x-reauth-token", re4)]).await.0, StatusCode::OK);
    let me = t.request("GET", "/students/me", Some(&ayesha), None).await.1;
    let (_, rv) = t.request("GET", &format!("/students/{}/results", d(&me)["id"].as_str().unwrap()), Some(&ayesha), None).await;
    assert_eq!(d(&rv).as_array().unwrap().len(), 1);
    assert_eq!(d(&rv)[0]["revision"], 2);
    t.drop_db().await;
}

#[tokio::test]
async fn csv_student_import_validates_then_creates() {
    let t = TestApp::new().await;
    let ids = seed::demo_small(&t.db).await.unwrap();
    let (reg, rahim) = (t.login("registrar").await, t.login("teacher.rahim").await);
    let good = "studentCode,fullName,dob,gender,guardianName,guardianPhone,address,className,sectionName,rollNo\nS-2026-201,\"Rahman, Imran\",2014-02-03,male,Mr Rahman,01712345678,Sylhet,Class 6,A,21\nS-2026-202,Sadia Islam,2014-05-06,FEMALE,,,,Class 6,B,22\n";
    // teachers cannot import
    assert_eq!(t.request("POST", "/students/import", Some(&rahim), Some(json!({ "csv": good }))).await.0, StatusCode::FORBIDDEN);
    // missing column / empty / bad rows
    let (s, v) = t.request("POST", "/students/import", Some(&reg), Some(json!({ "csv": "studentCode,fullName\nS-1,A" }))).await;
    assert_eq!((s, v["error"]["fieldErrors"][0]["code"].as_str()), (StatusCode::UNPROCESSABLE_ENTITY, Some("MISSING_COLUMN")));
    let bad = "studentCode,fullName,dob,gender,guardianPhone,className,sectionName,rollNo\nS-2026-001,Dup,2014-01-01,MALE,,Class 6,A,30\nabc,Bad Code,2014-01-01,MALE,,,,\nS-2026-203,Future,2999-01-01,X,0171,Class 9,Z,1\nS-2026-204,Roll Clash,2014-01-01,MALE,,Class 6,A,1\n";
    let (s, v) = t.request("POST", "/students/import", Some(&reg), Some(json!({ "csv": bad, "dryRun": false }))).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(d(&v)["created"], 0);
    let errs = d(&v)["errors"].as_array().unwrap();
    let has = |line: i64, field: &str| errs.iter().any(|e| e["line"] == line && e["field"] == field);
    assert!(has(2, "studentCode") && has(3, "studentCode") && has(4, "dob") && has(4, "gender") && has(4, "guardianPhone") && has(4, "className") && has(5, "rollNo"), "{errs:?}");
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM students").fetch_one(&t.db).await.unwrap();
    assert_eq!(n, 8, "nothing is created when any row is invalid");
    // dry run on good data creates nothing
    let (_, v) = t.request("POST", "/students/import", Some(&reg), Some(json!({ "csv": good }))).await;
    assert_eq!((d(&v)["valid"].as_i64(), d(&v)["created"].as_i64(), d(&v)["dryRun"].as_bool()), (Some(2), Some(0), Some(true)));
    assert_eq!(sqlx::query_scalar::<_, i64>("SELECT count(*) FROM students").fetch_one(&t.db).await.unwrap(), 8);
    // commit creates students, enrollments, class-group membership, and one-time credentials that work
    let (s, v) = t.request("POST", "/students/import", Some(&reg), Some(json!({ "csv": good, "dryRun": false }))).await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    assert_eq!(d(&v)["created"], 2);
    let creds = d(&v)["credentials"].as_array().unwrap();
    assert_eq!(creds[0]["fullName"], "Rahman, Imran");
    let pw = creds[0]["temporaryPassword"].as_str().unwrap();
    let (s, lv) = t.request("POST", "/auth/login", None, Some(json!({ "identifier": "s-2026-201", "password": pw, "deviceId": uuid::Uuid::new_v4(), "platform": "android" }))).await;
    assert_eq!(s, StatusCode::OK, "{lv}");
    assert_eq!(d(&lv)["mustChangePassword"], true);
    let enrolled: i64 = sqlx::query_scalar("SELECT count(*) FROM enrollments WHERE session_id=$1 AND roll_no IN (21,22)").bind(ids.session).fetch_one(&t.db).await.unwrap();
    assert_eq!(enrolled, 2);
    // importing the same file again fails on duplicate codes/rolls
    let (_, v) = t.request("POST", "/students/import", Some(&reg), Some(json!({ "csv": good, "dryRun": false }))).await;
    assert_eq!(d(&v)["created"], 0); assert!(!d(&v)["errors"].as_array().unwrap().is_empty());
    t.drop_db().await;
}
