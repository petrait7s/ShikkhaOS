mod common;
use axum::http::StatusCode;
use common::TestApp;
use serde_json::{json, Value};
use shikkhaos_app::seed;

async fn setup() -> (TestApp, seed::Ids) {
    let t = TestApp::new().await;
    let ids = seed::demo_small(&t.db).await.unwrap();
    (t, ids)
}

fn data(v: &Value) -> &Value {
    &v["data"]
}

#[tokio::test]
async fn full_official_exam_workflow() {
    let (t, ids) = setup().await;
    let (hm, reg, rahim, ayesha) = (
        t.login("headmaster").await,
        t.login("registrar").await,
        t.login("teacher.rahim").await,
        t.login("student.ayesha").await,
    );

    // Registrar creates exam + paper (Math, Class 6)
    let (s, v) = t.request("POST", "/exams", Some(&reg), Some(json!({ "name": "Half Yearly 2026", "type": "MID_TERM", "startDate": "2026-06-01", "endDate": "2026-06-10" }))).await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    let exam = data(&v)["id"].as_str().unwrap().to_string();
    let (s, v) = t
        .request(
            "POST",
            "/exam-papers",
            Some(&reg),
            Some(json!({ "examId": exam, "classId": ids.class6, "subjectId": ids.subj_math })),
        )
        .await;
    assert_eq!(s, StatusCode::CREATED, "{v}");

    // Registrar cannot authorize; headmaster can
    let (s, _) = t
        .request(
            "POST",
            &format!("/exams/{exam}/authorize"),
            Some(&reg),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::FORBIDDEN);
    let (s, v) = t
        .request("POST", &format!("/exams/{exam}/authorize"), Some(&hm), None)
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(data(&v)["submissionsCreated"], 2, "{v}"); // sections A and B

    // Teacher sees own submissions only
    let (s, v) = t
        .request("GET", "/mark-submissions", Some(&rahim), None)
        .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(data(&v).as_array().unwrap().len(), 2);
    let sub_a = data(&v)
        .as_array()
        .unwrap()
        .iter()
        .find(|x| x["section_name"] == "A" || x["sectionName"] == "A")
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let (s, v) = t
        .request(
            "GET",
            &format!("/mark-submissions/{sub_a}"),
            Some(&rahim),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let roster = data(&v)["entries"].as_array().unwrap().clone();
    assert_eq!(roster.len(), 5);

    // Invalid marks rejected (422) with field error
    let bad: Vec<Value> = roster
        .iter()
        .map(|r| json!({ "studentId": r["studentId"], "marksObtained": 101, "absent": false }))
        .collect();
    let (s, v) = t
        .request(
            "PUT",
            &format!("/mark-submissions/{sub_a}/entries"),
            Some(&rahim),
            Some(json!({ "entries": bad })),
        )
        .await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY, "{v}");
    assert_eq!(v["error"]["code"], "VALIDATION_FAILED");

    // Incomplete submit rejected
    let (s, _) = t
        .request(
            "POST",
            &format!("/mark-submissions/{sub_a}/submit"),
            Some(&rahim),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);

    // Enter valid marks; one absent
    let entries = |m: i32| {
        roster.iter().enumerate().map(|(i, r)| if i == 4 { json!({ "studentId": r["studentId"], "absent": true }) } else { json!({ "studentId": r["studentId"], "marksObtained": m - i as i32, "absent": false }) }).collect::<Vec<_>>()
    };
    let (s, v) = t
        .request(
            "PUT",
            &format!("/mark-submissions/{sub_a}/entries"),
            Some(&rahim),
            Some(json!({ "entries": entries(90) })),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let (s, v) = t
        .request(
            "POST",
            &format!("/mark-submissions/{sub_a}/submit"),
            Some(&rahim),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(data(&v)["status"], "SUBMITTED");

    // Locked: teacher cannot edit after submit
    let (s, v) = t
        .request(
            "PUT",
            &format!("/mark-submissions/{sub_a}/entries"),
            Some(&rahim),
            Some(json!({ "entries": entries(80) })),
        )
        .await;
    assert_eq!(s, StatusCode::CONFLICT, "{v}");
    assert_eq!(v["error"]["code"], "SUBMISSION_LOCKED");

    // Registrar review -> correction -> teacher fixes -> resubmit
    let (s, v) = t
        .request(
            "POST",
            &format!("/mark-submissions/{sub_a}/verify"),
            Some(&reg),
            None,
        )
        .await;
    assert_eq!(
        s,
        StatusCode::CONFLICT,
        "verify before review must be invalid: {v}"
    );
    assert_eq!(v["error"]["code"], "INVALID_STATE_TRANSITION");
    let (s, v) = t
        .request(
            "POST",
            &format!("/mark-submissions/{sub_a}/start-review"),
            Some(&reg),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let (s, v) = t
        .request(
            "POST",
            &format!("/mark-submissions/{sub_a}/request-correction"),
            Some(&reg),
            Some(json!({ "reason": "  " })),
        )
        .await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY, "{v}");
    let (s, v) = t.request("POST", &format!("/mark-submissions/{sub_a}/request-correction"), Some(&reg), Some(json!({ "reason": "Roll 1 total looks wrong", "items": [{ "studentId": roster[0]["studentId"], "note": "check" }] }))).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(data(&v)["status"], "CORRECTION_REQUESTED");
    assert_eq!(
        data(&v)["current_revision"]
            .as_i64()
            .or(data(&v)["currentRevision"].as_i64()),
        Some(2)
    );
    assert_eq!(data(&v)["entries"][0]["flagged"], true);
    let (s, v) = t
        .request(
            "PUT",
            &format!("/mark-submissions/{sub_a}/entries"),
            Some(&rahim),
            Some(json!({ "entries": entries(85) })),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let (s, _) = t
        .request(
            "POST",
            &format!("/mark-submissions/{sub_a}/submit"),
            Some(&rahim),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::OK);
    let (s, _) = t
        .request(
            "POST",
            &format!("/mark-submissions/{sub_a}/start-review"),
            Some(&reg),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::OK);
    let (s, v) = t
        .request(
            "POST",
            &format!("/mark-submissions/{sub_a}/verify"),
            Some(&reg),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(data(&v)["status"], "VERIFIED");

    // History keeps both revisions
    let (s, v) = t
        .request(
            "GET",
            &format!("/mark-submissions/{sub_a}/history"),
            Some(&reg),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(data(&v)["revisions"].as_array().unwrap().len(), 2);
    assert!(data(&v)["history"].as_array().unwrap().len() >= 6);

    // Compile blocked until section B verified
    let (s, v) = t
        .request(
            "POST",
            "/result-sets",
            Some(&reg),
            Some(json!({ "examId": exam, "classId": ids.class6 })),
        )
        .await;
    assert_eq!(s, StatusCode::CONFLICT, "{v}");
    assert_eq!(v["error"]["code"], "SUBMISSIONS_NOT_VERIFIED");

    // Section B quickly
    let (_, v) = t
        .request("GET", "/mark-submissions?filter=x", Some(&rahim), None)
        .await;
    let sub_b = data(&v)
        .as_array()
        .unwrap()
        .iter()
        .find(|x| x["section_name"] == "B" || x["sectionName"] == "B")
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let (_, v) = t
        .request(
            "GET",
            &format!("/mark-submissions/{sub_b}"),
            Some(&rahim),
            None,
        )
        .await;
    let rb: Vec<Value> = data(&v)["entries"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| json!({ "studentId": r["studentId"], "marksObtained": 70, "absent": false }))
        .collect();
    assert_eq!(
        t.request(
            "PUT",
            &format!("/mark-submissions/{sub_b}/entries"),
            Some(&rahim),
            Some(json!({ "entries": rb }))
        )
        .await
        .0,
        StatusCode::OK
    );
    for a in ["submit"] {
        assert_eq!(
            t.request(
                "POST",
                &format!("/mark-submissions/{sub_b}/{a}"),
                Some(&rahim),
                None
            )
            .await
            .0,
            StatusCode::OK
        );
    }
    for a in ["start-review", "verify"] {
        let (s, v) = t
            .request(
                "POST",
                &format!("/mark-submissions/{sub_b}/{a}"),
                Some(&reg),
                None,
            )
            .await;
        assert_eq!(s, StatusCode::OK, "{a}: {v}");
    }

    // Compile -> VERIFIED result set with absent student failing
    let (s, v) = t
        .request(
            "POST",
            "/result-sets",
            Some(&reg),
            Some(json!({ "examId": exam, "classId": ids.class6 })),
        )
        .await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    assert_eq!(data(&v)["status"], "VERIFIED");
    let rs = data(&v)["id"].as_str().unwrap().to_string();
    assert_eq!(data(&v)["summary"]["students"], 8);
    assert_eq!(data(&v)["summary"]["failed"], 1); // the absent student
    assert_eq!(
        data(&v)["results"][0]["subjects"][0]["subjectName"],
        "Mathematics",
        "result sheets carry subject names, not ids"
    );
    let (_, prog) = t
        .request("GET", &format!("/exams/{exam}/progress"), Some(&reg), None)
        .await;
    assert!(
        data(&prog)["totals"]
            .as_array()
            .unwrap()
            .iter()
            .any(|x| x["status"] == "VERIFIED" && x["count"] == 2),
        "progress totals keep status names intact: {prog}"
    );

    // Students cannot see unpublished results
    let (_, sv) = t.request("GET", "/students/me", Some(&ayesha), None).await;
    let ay_id = data(&sv)["id"].as_str().unwrap().to_string();
    let (s, v) = t
        .request(
            "GET",
            &format!("/students/{ay_id}/results"),
            Some(&ayesha),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(data(&v).as_array().unwrap().len(), 0);

    // Approve needs re-auth and headmaster; registrar cannot
    let (s, v) = t
        .request(
            "POST",
            &format!("/result-sets/{rs}/approve"),
            Some(&hm),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::FORBIDDEN, "{v}");
    assert_eq!(v["error"]["code"], "REAUTH_REQUIRED");
    let (s, _) = t
        .request(
            "POST",
            &format!("/result-sets/{rs}/approve"),
            Some(&reg),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::FORBIDDEN);
    let hm_re = t.reauth(&hm).await;
    let (s, v) = t
        .request_h(
            "POST",
            &format!("/result-sets/{rs}/approve"),
            Some(&hm),
            None,
            &[("x-reauth-token", hm_re.clone())],
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(data(&v)["status"], "APPROVED");

    // Registrar cannot publish (not delegated); headmaster can
    let reg_re = t.reauth(&reg).await;
    let (s, v) = t
        .request_h(
            "POST",
            &format!("/result-sets/{rs}/publish"),
            Some(&reg),
            None,
            &[("x-reauth-token", reg_re)],
        )
        .await;
    assert_eq!(s, StatusCode::FORBIDDEN, "{v}");
    let hm_re = t.reauth(&hm).await;
    let (s, v) = t
        .request_h(
            "POST",
            &format!("/result-sets/{rs}/publish"),
            Some(&hm),
            None,
            &[("x-reauth-token", hm_re.clone())],
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(data(&v)["status"], "PUBLISHED");
    // publish twice -> invalid transition
    let (s, v) = t
        .request_h(
            "POST",
            &format!("/result-sets/{rs}/publish"),
            Some(&hm),
            None,
            &[("x-reauth-token", hm_re)],
        )
        .await;
    assert_eq!(s, StatusCode::CONFLICT, "{v}");

    // Student sees result + notification; other student's data is 404
    let (s, v) = t
        .request(
            "GET",
            &format!("/students/{ay_id}/results"),
            Some(&ayesha),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::OK);
    let res = data(&v).as_array().unwrap();
    assert_eq!(res.len(), 1);
    assert_eq!(res[0]["subjects"][0]["subjectName"], "Mathematics");
    let (_, nv) = t
        .request("GET", "/notifications", Some(&ayesha), None)
        .await;
    assert!(
        data(&nv)
            .as_array()
            .unwrap()
            .iter()
            .any(|n| n["type"] == "RESULT_PUBLISHED"),
        "{nv}"
    );
    let other: String =
        sqlx::query_scalar("SELECT id::text FROM students WHERE student_code='S-2026-002'")
            .fetch_one(&t.db)
            .await
            .unwrap();
    let (s, _) = t
        .request(
            "GET",
            &format!("/students/{other}/results"),
            Some(&ayesha),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::NOT_FOUND);

    // Published results are immutable at DB level
    let r = sqlx::query("UPDATE student_results SET total_marks = 1")
        .execute(&t.db)
        .await;
    assert!(r.is_err());
    let r = sqlx::query("UPDATE mark_entries SET marks_obtained = 1")
        .execute(&t.db)
        .await;
    assert!(r.is_err());

    // Revision: Register requests, Headmaster approves + applies -> revision 2, revision 1 retained
    let st1: String = sqlx::query_scalar("SELECT student_id::text FROM student_results WHERE result_set_id=$1::uuid AND revision=1 ORDER BY position NULLS LAST LIMIT 1").bind(&rs).fetch_one(&t.db).await.unwrap();
    let (s, v) = t.request("POST", &format!("/result-sets/{rs}/revision-requests"), Some(&reg), Some(json!({ "reason": "Marking error", "changes": [{ "studentId": st1, "subjectId": ids.subj_math, "newMarks": 99, "absent": false }] }))).await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    let rq = data(&v)["id"].as_str().unwrap().to_string();
    let hm_re = t.reauth(&hm).await;
    let h = [("x-reauth-token", hm_re)];
    assert_eq!(
        t.request_h(
            "POST",
            &format!("/result-revision-requests/{rq}/apply"),
            Some(&hm),
            None,
            &h
        )
        .await
        .0,
        StatusCode::CONFLICT
    ); // not approved yet
    assert_eq!(
        t.request_h(
            "POST",
            &format!("/result-revision-requests/{rq}/approve"),
            Some(&hm),
            None,
            &h
        )
        .await
        .0,
        StatusCode::OK
    );
    let (s, v) = t
        .request_h(
            "POST",
            &format!("/result-revision-requests/{rq}/apply"),
            Some(&hm),
            None,
            &h,
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(data(&v)["revision"], 2);
    let n: i64 =
        sqlx::query_scalar("SELECT count(*) FROM student_results WHERE result_set_id=$1::uuid")
            .bind(&rs)
            .fetch_one(&t.db)
            .await
            .unwrap();
    assert_eq!(n, 16);
    let (s, v) = t
        .request(
            "GET",
            &format!("/result-sets/{rs}?revision=1"),
            Some(&hm),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(data(&v)["results"].as_array().unwrap().len(), 8);

    // Audit trail exists for key transitions
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM audit_logs WHERE action IN ('result_set.approved','result_set.published','result_revision.applied','exam.authorized','marks.submitted')").fetch_one(&t.db).await.unwrap();
    assert!(n >= 6, "audit rows: {n}");
    t.drop_db().await;
}
