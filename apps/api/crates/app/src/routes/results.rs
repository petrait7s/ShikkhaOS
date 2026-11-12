use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    response::Response,
    routing::{get, post},
    Json, Router,
};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::{json, Value};
use shikkhaos_domain::{
    grading::{self, GradingScheme, SubjectInput},
    permissions::Role,
    results::{self, ResultAction, ResultStatus, TransitionError},
};
use std::collections::HashMap;
use uuid::Uuid;

use crate::{audit, auth::*, error::*, http::*, notify::Outbox, scope, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/result-sets", get(list).post(compile))
        .route("/result-sets/{id}", get(get_one))
        .route("/result-sets/{id}/approve", post(approve))
        .route("/result-sets/{id}/reject", post(reject))
        .route("/result-sets/{id}/publish", post(publish))
        .route(
            "/result-sets/{id}/revision-requests",
            get(list_revisions).post(create_revision),
        )
        .route(
            "/result-revision-requests/{id}/approve",
            post(approve_revision),
        )
        .route(
            "/result-revision-requests/{id}/reject",
            post(reject_revision),
        )
        .route("/result-revision-requests/{id}/apply", post(apply_revision))
        .route("/students/{id}/results", get(student_results))
}

fn terr(e: TransitionError) -> ApiError {
    match e {
        TransitionError::Invalid => {
            ApiError::invalid_transition("This action is not allowed in the current status")
        }
        TransitionError::SeparationOfDuties => ApiError::forbidden_code(
            "SEPARATION_OF_DUTIES",
            "You verified this work and cannot also approve it",
        ),
        TransitionError::ReasonRequired => {
            ApiError::field("reason", "REQUIRED", "A reason is required")
        }
        TransitionError::PublishNotPermitted => ApiError::forbidden_code(
            "PUBLISH_NOT_PERMITTED",
            "You are not permitted to publish these results",
        ),
    }
}

#[allow(dead_code)]
struct Rs {
    id: Uuid,
    exam: Uuid,
    class: Uuid,
    status: ResultStatus,
    published_rev: i32,
    current_rev: i32,
    scheme: GradingScheme,
    version: i32,
}

async fn load(db: &sqlx::PgPool, id: Uuid) -> ApiResult<Rs> {
    let r: Option<(Uuid, Uuid, Uuid, String, i32, i32, Value, i32)> = sqlx::query_as("SELECT id, exam_id, class_id, status, published_revision, current_revision, grading_snapshot, version FROM result_sets WHERE id=$1").bind(id).fetch_optional(db).await?;
    let r = r.ok_or_else(ApiError::not_found)?;
    Ok(Rs {
        id: r.0,
        exam: r.1,
        class: r.2,
        status: ResultStatus::parse(&r.3).ok_or_else(ApiError::internal)?,
        published_rev: r.4,
        current_rev: r.5,
        scheme: serde_json::from_value(r.6).map_err(|_| ApiError::internal())?,
        version: r.7,
    })
}

const RS_SELECT: &str = "SELECT rs.id, rs.exam_id, e.name AS exam_name, rs.class_id, c.name AS class_name, rs.status, rs.published_revision, rs.current_revision, rs.approved_by, rs.approved_at, rs.published_by, rs.published_at, rs.rejection_note, rs.version, rs.created_at, rs.updated_at \
    FROM result_sets rs JOIN exams e ON e.id = rs.exam_id JOIN classes c ON c.id = rs.class_id";

async fn list(
    State(s): State<AppState>,
    ctx: Ctx,
    Query(q): Query<PageQuery>,
    Query(f): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let published_only = match ctx.role {
        Role::Headmaster | Role::Registrar => {
            ctx.require_any(&[
                "marks.verify",
                "results.approve",
                "results.publish",
                "results.read_published",
            ])?;
            false
        }
        Role::Teacher => {
            ctx.require("results.read_published")?;
            true
        }
        Role::Student => {
            return Err(ApiError::forbidden(
                "Students read results through /students/{id}/results",
            ))
        }
    };
    let teacher = if ctx.role == Role::Teacher {
        Some(scope::require_teacher(&s.db, &ctx).await?)
    } else {
        None
    };
    let uid = |k: &str| f.get(k).and_then(|x| Uuid::parse_str(x).ok());
    let rows: Vec<Value> = sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM ({RS_SELECT} WHERE ($1::uuid IS NULL OR rs.exam_id=$1) AND ($2::uuid IS NULL OR rs.class_id=$2) AND ($3::text IS NULL OR rs.status=$3) AND (NOT $4 OR rs.status='PUBLISHED') \
        AND ($5::uuid IS NULL OR EXISTS (SELECT 1 FROM teacher_assignments a WHERE a.teacher_id=$5 AND a.class_id=rs.class_id AND a.session_id=e.session_id)) ORDER BY rs.created_at DESC, rs.id LIMIT $6 OFFSET $7) t"))
        .bind(uid("examId")).bind(uid("classId")).bind(f.get("status")).bind(published_only).bind(teacher).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(crate::http::list(rows, &q))
}

async fn get_one(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
    Query(f): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let rs = load(&s.db, id).await?;
    match ctx.role {
        Role::Student => return Err(ApiError::not_found()),
        Role::Teacher => {
            ctx.require("results.read_published")?;
            let t = scope::require_teacher(&s.db, &ctx).await?;
            let assigned: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM teacher_assignments a JOIN exams e ON e.id=$2 WHERE a.teacher_id=$1 AND a.class_id=$3 AND a.session_id=e.session_id)").bind(t).bind(rs.exam).bind(rs.class).fetch_one(&s.db).await?;
            if rs.status != ResultStatus::Published || !assigned {
                return Err(ApiError::not_found());
            }
        }
        _ => ctx.require_any(&[
            "marks.verify",
            "results.approve",
            "results.publish",
            "results.read_published",
        ])?,
    }
    let mut head: Value = sqlx::query_scalar(&format!(
        "SELECT to_jsonb(t) FROM ({RS_SELECT} WHERE rs.id=$1) t"
    ))
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    let rev: i32 = f
        .get("revision")
        .and_then(|r| r.parse().ok())
        .unwrap_or(rs.current_rev);
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT sr.student_id, st.full_name, st.student_code, sr.section_id, sec.name AS section_name, e.roll_no, sr.revision, sr.total_marks, sr.gpa, sr.grade, sr.passed, sr.position, sr.subjects \
        FROM student_results sr JOIN students st ON st.id = sr.student_id JOIN sections sec ON sec.id = sr.section_id JOIN result_sets rs ON rs.id = sr.result_set_id JOIN exams ex ON ex.id = rs.exam_id LEFT JOIN enrollments e ON e.student_id = sr.student_id AND e.session_id = ex.session_id \
        WHERE sr.result_set_id=$1 AND sr.revision=$2 ORDER BY sr.position NULLS LAST, e.roll_no) t").bind(id).bind(rev).fetch_all(&s.db).await?;
    let failed = rows
        .iter()
        .filter(|r| !r["passed"].as_bool().unwrap_or(true))
        .count();
    let absent = rows
        .iter()
        .filter(|r| {
            r["subjects"]
                .as_array()
                .map(|a| a.iter().any(|x| x["absent"] == true))
                .unwrap_or(false)
        })
        .count();
    head["summary"] = json!({ "students": rows.len(), "failed": failed, "withAbsence": absent, "passRate": if rows.is_empty() { 0.0 } else { 100.0 * (rows.len() - failed) as f64 / rows.len() as f64 } });
    head["revision"] = json!(rev);
    head["results"] = json!(rows);
    head["grading"] = serde_json::to_value(&rs.scheme).unwrap();
    Ok(ok(head))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CompileReq {
    exam_id: Uuid,
    class_id: Uuid,
}

/// Compile an exam x class ResultSet from VERIFIED submissions (every paper x section must be verified).
async fn compile(
    State(s): State<AppState>,
    ctx: Ctx,
    Json(r): Json<CompileReq>,
) -> ApiResult<Response> {
    ctx.require_any(&["marks.verify", "results.approve"])?;
    let exam: Option<(Uuid, String)> =
        sqlx::query_as("SELECT session_id, status FROM exams WHERE id=$1")
            .bind(r.exam_id)
            .fetch_optional(&s.db)
            .await?;
    let (session, _status) =
        exam.ok_or_else(|| ApiError::field("examId", "NOT_FOUND", "Exam not found"))?;
    let papers: Vec<(Uuid, Uuid, Decimal, Decimal, bool)> = sqlx::query_as("SELECT p.id, p.subject_id, p.full_marks, p.pass_marks, sub.is_optional FROM exam_papers p JOIN subjects sub ON sub.id=p.subject_id WHERE p.exam_id=$1 AND p.class_id=$2").bind(r.exam_id).bind(r.class_id).fetch_all(&s.db).await?;
    if papers.is_empty() {
        return Err(ApiError::conflict(
            "NO_PAPERS",
            "This class has no papers in the exam",
        ));
    }
    let sections: Vec<Uuid> = sqlx::query_scalar("SELECT DISTINCT section_id FROM enrollments WHERE class_id=$1 AND session_id=$2 AND status='ACTIVE'").bind(r.class_id).bind(session).fetch_all(&s.db).await?;
    if sections.is_empty() {
        return Err(ApiError::conflict(
            "NO_STUDENTS",
            "No active students in this class",
        ));
    }
    // every paper x section must have a VERIFIED submission
    let mut not_ready = vec![];
    let mut verifiers: Vec<u128> = vec![];
    let mut subs: HashMap<(Uuid, Uuid), (Uuid, i32)> = HashMap::new(); // (paper, section) -> (submission, revision)
    for (paper, ..) in &papers {
        for sec in &sections {
            let row: Option<(Uuid, String, i32, Option<Uuid>)> = sqlx::query_as("SELECT id, status, current_revision, verified_by FROM mark_submissions WHERE exam_paper_id=$1 AND section_id=$2").bind(paper).bind(sec).fetch_optional(&s.db).await?;
            match row {
                Some((id, st, rev, vb)) if st == "VERIFIED" => { subs.insert((*paper, *sec), (id, rev)); if let Some(v) = vb { verifiers.push(v.as_u128()); } }
                other => not_ready.push(json!({ "examPaperId": paper, "sectionId": sec, "status": other.map(|o| o.1).unwrap_or_else(|| "MISSING".into()) })),
            }
        }
    }
    if !not_ready.is_empty() {
        let mut e = ApiError::conflict(
            "SUBMISSIONS_NOT_VERIFIED",
            "Every paper in every section must be VERIFIED before compiling",
        );
        e.details = json!({ "pending": not_ready });
        return Err(e);
    }
    let scheme_v: Value =
        sqlx::query_scalar("SELECT grading_scheme FROM school_profile WHERE id=1")
            .fetch_one(&s.db)
            .await?;
    let scheme: GradingScheme =
        serde_json::from_value(scheme_v.clone()).map_err(|_| ApiError::internal())?;
    // roster per section
    let mut students: Vec<(Uuid, Uuid)> = vec![]; // (student, section)
    for sec in &sections {
        let ids: Vec<Uuid> = sqlx::query_scalar("SELECT student_id FROM enrollments WHERE section_id=$1 AND session_id=$2 AND status='ACTIVE'").bind(sec).bind(session).fetch_all(&s.db).await?;
        students.extend(ids.into_iter().map(|i| (i, *sec)));
    }
    let mut computed = vec![];
    for (stu, sec) in &students {
        let mut inputs = vec![];
        for (paper, subject, full, pass, optional) in &papers {
            let (sub_id, rev) = subs[&(*paper, *sec)];
            let e: Option<(Option<Decimal>, bool)> = sqlx::query_as("SELECT marks_obtained, absent FROM mark_entries WHERE submission_id=$1 AND revision=$2 AND student_id=$3").bind(sub_id).bind(rev).bind(stu).fetch_optional(&s.db).await?;
            let (marks, absent) = e.ok_or_else(|| {
                ApiError::conflict(
                    "MISSING_ENTRY",
                    "A verified submission has no entry for an enrolled student",
                )
            })?;
            inputs.push(SubjectInput {
                subject_id: subject.to_string(),
                marks,
                absent,
                full_marks: *full,
                pass_marks: *pass,
                optional: *optional,
            });
        }
        computed.push(grading::compute_student(&scheme, &inputs));
    }
    let positions = grading::assign_positions(
        &computed
            .iter()
            .map(|c| (c.passed, c.gpa, c.total_marks))
            .collect::<Vec<_>>(),
    );
    let mut tx = s.db.begin().await?;
    // A previously REJECTED set is recompiled in place as the next revision; any other existing set is a duplicate.
    let existing: Option<(Uuid, String, i32)> = sqlx::query_as("SELECT id, status, current_revision FROM result_sets WHERE exam_id=$1 AND class_id=$2 FOR UPDATE").bind(r.exam_id).bind(r.class_id).fetch_optional(&mut *tx).await?;
    let (rs_id, rev): (Uuid, i32) = match existing {
        Some((id, st, cur)) if st == "REJECTED" => {
            sqlx::query("UPDATE result_sets SET status='VERIFIED', current_revision=$2, rejection_note=NULL, grading_snapshot=$3, compiled_by=$4, version=version+1, updated_at=now() WHERE id=$1").bind(id).bind(cur + 1).bind(&scheme_v).bind(ctx.user_id).execute(&mut *tx).await?;
            (id, cur + 1)
        }
        Some(_) => return Err(ApiError::conflict("DUPLICATE", "A result set already exists for this exam and class")),
        None => (sqlx::query_scalar("INSERT INTO result_sets (exam_id, class_id, grading_snapshot, compiled_by) VALUES ($1,$2,$3,$4) RETURNING id").bind(r.exam_id).bind(r.class_id).bind(&scheme_v).bind(ctx.user_id).fetch_one(&mut *tx).await?, 1),
    };
    for (((stu, sec), c), pos) in students.iter().zip(&computed).zip(&positions) {
        sqlx::query("INSERT INTO student_results (result_set_id, student_id, revision, section_id, total_marks, gpa, grade, passed, position, subjects) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
            .bind(rs_id).bind(stu).bind(rev).bind(sec).bind(c.total_marks).bind(c.gpa).bind(&c.grade).bind(c.passed).bind(pos.map(|p| p as i32)).bind(serde_json::to_value(&c.subjects).unwrap()).execute(&mut *tx).await?;
    }
    sqlx::query("INSERT INTO result_set_status_history (result_set_id, from_status, to_status, revision, actor_id) VALUES ($1,NULL,'VERIFIED',$3,$2)").bind(rs_id).bind(ctx.user_id).bind(rev).execute(&mut *tx).await?;
    audit::log(
        &mut tx,
        &ctx,
        "result_set.compiled",
        "result_set",
        &rs_id.to_string(),
        None,
        Some(json!({ "examId": r.exam_id, "classId": r.class_id, "students": students.len() })),
    )
    .await?;
    let _ = verifiers; // approver separation is evaluated at approval time from the live submissions
    let hms: Vec<Uuid> =
        sqlx::query_scalar("SELECT id FROM users WHERE role='HEADMASTER' AND status='ACTIVE'")
            .fetch_all(&mut *tx)
            .await?;
    let mut ob = Outbox::new();
    ob.notify(
        &mut tx,
        &hms,
        "RESULTS_AWAITING_APPROVAL",
        "Results awaiting approval",
        "A result set is ready for your approval.",
        "result_set",
        &rs_id.to_string(),
        &format!("result-sets/{rs_id}"),
    )
    .await?;
    tx.commit().await?;
    ob.flush(&s.hub);
    get_one(State(s), ctx, Path(rs_id), Query(HashMap::new()))
        .await
        .map(|mut r| {
            *r.status_mut() = axum::http::StatusCode::CREATED;
            r
        })
}

#[derive(Deserialize)]
struct RejectReq {
    reason: String,
}

/// Headmaster sends a compiled (VERIFIED) result set back: submissions of that exam x class return to UNDER_REVIEW so the
/// Register can request corrections or re-verify, then recompile as the next revision.
async fn reject(
    State(s): State<AppState>,
    ctx: Ctx,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(r): Json<RejectReq>,
) -> ApiResult<Response> {
    ctx.require("results.approve")?;
    ctx.require_reauth(&s, &headers)?;
    results::require_reason(&r.reason).map_err(terr)?;
    if r.reason.chars().count() > 2000 {
        return Err(ApiError::field(
            "reason",
            "OUT_OF_RANGE",
            "At most 2000 characters",
        ));
    }
    let rs = load(&s.db, id).await?;
    if rs.status != ResultStatus::Verified {
        return Err(ApiError::invalid_transition(
            "Only compiled (verified) results can be sent back",
        ));
    }
    let mut tx = s.db.begin().await?;
    let n = sqlx::query("UPDATE result_sets SET status='REJECTED', rejection_note=$2, version=version+1, updated_at=now() WHERE id=$1 AND status='VERIFIED'").bind(id).bind(r.reason.trim()).execute(&mut *tx).await?.rows_affected();
    if n == 0 {
        return Err(ApiError::version_conflict());
    }
    sqlx::query("INSERT INTO result_set_status_history (result_set_id, from_status, to_status, revision, actor_id, note) VALUES ($1,'VERIFIED','REJECTED',$2,$3,$4)").bind(id).bind(rs.current_rev).bind(ctx.user_id).bind(r.reason.trim()).execute(&mut *tx).await?;
    let reopened: Vec<Uuid> = sqlx::query_scalar("UPDATE mark_submissions ms SET status='UNDER_REVIEW', verified_by=NULL, verified_at=NULL, version=ms.version+1, updated_at=now() FROM exam_papers p WHERE p.id=ms.exam_paper_id AND p.exam_id=$1 AND p.class_id=$2 AND ms.status='VERIFIED' RETURNING ms.id").bind(rs.exam).bind(rs.class).fetch_all(&mut *tx).await?;
    for sid in &reopened {
        sqlx::query("INSERT INTO mark_submission_status_history (submission_id, from_status, to_status, revision, actor_id, note) SELECT id, 'VERIFIED', 'UNDER_REVIEW', current_revision, $2, $3 FROM mark_submissions WHERE id=$1").bind(sid).bind(ctx.user_id).bind(format!("Reopened: result set sent back by Headmaster — {}", r.reason.trim())).execute(&mut *tx).await?;
    }
    audit::log(
        &mut tx,
        &ctx,
        "result_set.rejected",
        "result_set",
        &id.to_string(),
        Some(json!({"status":"VERIFIED"})),
        Some(
            json!({"status":"REJECTED","reason": r.reason, "reopenedSubmissions": reopened.len()}),
        ),
    )
    .await?;
    let regs: Vec<Uuid> =
        sqlx::query_scalar("SELECT id FROM users WHERE role='REGISTRAR' AND status='ACTIVE'")
            .fetch_all(&mut *tx)
            .await?;
    let mut ob = Outbox::new();
    ob.notify(
        &mut tx,
        &regs,
        "RESULTS_REJECTED",
        "Results sent back",
        "The Headmaster sent a result set back for correction.",
        "result_set",
        &id.to_string(),
        &format!("result-sets/{id}"),
    )
    .await?;
    tx.commit().await?;
    ob.flush(&s.hub);
    get_one(State(s), ctx, Path(id), Query(HashMap::new())).await
}

async fn approve(
    State(s): State<AppState>,
    ctx: Ctx,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    ctx.require("results.approve")?;
    ctx.require_reauth(&s, &headers)?;
    let rs = load(&s.db, id).await?;
    let to = rs.status.next(ResultAction::Approve).map_err(terr)?;
    let verifiers: Vec<Uuid> = sqlx::query_scalar("SELECT DISTINCT ms.verified_by FROM mark_submissions ms JOIN exam_papers p ON p.id=ms.exam_paper_id WHERE p.exam_id=$1 AND p.class_id=$2 AND ms.verified_by IS NOT NULL").bind(rs.exam).bind(rs.class).fetch_all(&s.db).await?;
    results::check_approver(
        &verifiers.iter().map(|u| u.as_u128()).collect::<Vec<_>>(),
        ctx.user_id.as_u128(),
    )
    .map_err(terr)?;
    let mut tx = s.db.begin().await?;
    let n = sqlx::query("UPDATE result_sets SET status=$2, approved_by=$3, approved_at=now(), version=version+1, updated_at=now() WHERE id=$1 AND status='VERIFIED'").bind(id).bind(to.as_str()).bind(ctx.user_id).execute(&mut *tx).await?.rows_affected();
    if n == 0 {
        return Err(ApiError::version_conflict());
    }
    sqlx::query("INSERT INTO result_set_status_history (result_set_id, from_status, to_status, revision, actor_id) VALUES ($1,'VERIFIED','APPROVED',$2,$3)").bind(id).bind(rs.current_rev).bind(ctx.user_id).execute(&mut *tx).await?;
    audit::log(
        &mut tx,
        &ctx,
        "result_set.approved",
        "result_set",
        &id.to_string(),
        Some(json!({"status":"VERIFIED"})),
        Some(json!({"status":"APPROVED"})),
    )
    .await?;
    tx.commit().await?;
    get_one(State(s), ctx, Path(id), Query(HashMap::new())).await
}

async fn publish(
    State(s): State<AppState>,
    ctx: Ctx,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    ctx.require("results.publish")?;
    ctx.require_reauth(&s, &headers)?;
    let rs = load(&s.db, id).await?;
    let to = rs.status.next(ResultAction::Publish).map_err(terr)?;
    let feature: bool = sqlx::query_scalar("SELECT COALESCE((features->>'registrarCanPublishResults')::boolean, false) FROM school_profile WHERE id=1").fetch_one(&s.db).await?;
    let exam_flag: bool = sqlx::query_scalar("SELECT registrar_may_publish FROM exams WHERE id=$1")
        .bind(rs.exam)
        .fetch_one(&s.db)
        .await?;
    results::can_publish(ctx.role, ctx.has("results.publish"), feature, exam_flag).map_err(terr)?;
    let mut tx = s.db.begin().await?;
    let n = sqlx::query("UPDATE result_sets SET status=$2, published_revision=current_revision, published_by=$3, published_at=now(), version=version+1, updated_at=now() WHERE id=$1 AND status='APPROVED'").bind(id).bind(to.as_str()).bind(ctx.user_id).execute(&mut *tx).await?.rows_affected();
    if n == 0 {
        return Err(ApiError::version_conflict());
    }
    sqlx::query("INSERT INTO result_set_status_history (result_set_id, from_status, to_status, revision, actor_id) VALUES ($1,'APPROVED','PUBLISHED',$2,$3)").bind(id).bind(rs.current_rev).bind(ctx.user_id).execute(&mut *tx).await?;
    audit::log(
        &mut tx,
        &ctx,
        "result_set.published",
        "result_set",
        &id.to_string(),
        Some(json!({"status":"APPROVED"})),
        Some(json!({"status":"PUBLISHED","revision": rs.current_rev})),
    )
    .await?;
    let users: Vec<Uuid> = sqlx::query_scalar("SELECT st.user_id FROM student_results sr JOIN students st ON st.id = sr.student_id WHERE sr.result_set_id=$1 AND sr.revision=$2").bind(id).bind(rs.current_rev).fetch_all(&mut *tx).await?;
    let mut ob = Outbox::new();
    ob.notify(
        &mut tx,
        &users,
        "RESULT_PUBLISHED",
        "New result published",
        "A new result is available.",
        "result_set",
        &id.to_string(),
        &format!("results/{id}"),
    )
    .await?;
    for u in &users {
        ob.event(*u, "result.published", json!({ "resultSetId": id }));
    }
    tx.commit().await?;
    ob.flush(&s.hub);
    get_one(State(s), ctx, Path(id), Query(HashMap::new())).await
}

// ---- Post-publication revisions ----
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Change {
    student_id: Uuid,
    subject_id: Uuid,
    new_marks: Option<Decimal>,
    #[serde(default)]
    absent: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RevReq {
    reason: String,
    changes: Vec<Change>,
}

async fn create_revision(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
    Json(r): Json<RevReq>,
) -> ApiResult<Response> {
    ctx.require_any(&["marks.review", "results.revise_published"])?;
    results::require_reason(&r.reason).map_err(terr)?;
    if r.changes.is_empty() || r.changes.len() > 500 {
        return Err(ApiError::field(
            "changes",
            "OUT_OF_RANGE",
            "Provide 1-500 changes",
        ));
    }
    let rs = load(&s.db, id).await?;
    if rs.status != ResultStatus::Published {
        return Err(ApiError::invalid_transition(
            "Only published results can be revised",
        ));
    }
    let open: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM result_revision_requests WHERE result_set_id=$1 AND status IN ('PENDING','APPROVED'))").bind(id).fetch_one(&s.db).await?;
    if open {
        return Err(ApiError::conflict(
            "REVISION_IN_PROGRESS",
            "Another revision request is still open",
        ));
    }
    let mut tx = s.db.begin().await?;
    let rid: Uuid = sqlx::query_scalar("INSERT INTO result_revision_requests (result_set_id, requested_by, reason, proposed_changes) VALUES ($1,$2,$3,$4) RETURNING id").bind(id).bind(ctx.user_id).bind(r.reason.trim()).bind(json!(r.changes.iter().map(|c| json!({ "studentId": c.student_id, "subjectId": c.subject_id, "newMarks": c.new_marks, "absent": c.absent })).collect::<Vec<_>>())).fetch_one(&mut *tx).await?;
    audit::log(
        &mut tx,
        &ctx,
        "result_revision.requested",
        "result_set",
        &id.to_string(),
        None,
        Some(json!({ "requestId": rid, "reason": r.reason, "changes": r.changes.len() })),
    )
    .await?;
    tx.commit().await?;
    let v: Value = sqlx::query_scalar(
        "SELECT to_jsonb(t) FROM (SELECT * FROM result_revision_requests WHERE id=$1) t",
    )
    .bind(rid)
    .fetch_one(&s.db)
    .await?;
    Ok(created(v))
}

async fn list_revisions(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    ctx.require_any(&[
        "marks.review",
        "results.revise_published",
        "results.approve",
    ])?;
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT * FROM result_revision_requests WHERE result_set_id=$1 ORDER BY created_at DESC) t").bind(id).fetch_all(&s.db).await?;
    Ok(ok(Value::Array(rows)))
}

async fn load_req(db: &sqlx::PgPool, id: Uuid) -> ApiResult<(Uuid, Uuid, String, Value)> {
    sqlx::query_as("SELECT result_set_id, requested_by, status, proposed_changes FROM result_revision_requests WHERE id=$1").bind(id).fetch_optional(db).await?.ok_or_else(ApiError::not_found)
}

async fn decide(
    s: &AppState,
    ctx: &Ctx,
    headers: &HeaderMap,
    id: Uuid,
    approve: bool,
) -> ApiResult<Response> {
    ctx.require("results.revise_published")?;
    if ctx.role != Role::Headmaster {
        return Err(ApiError::forbidden(
            "Only the Headmaster can decide revision requests",
        ));
    }
    ctx.require_reauth(s, headers)?;
    let (rs, requester, status, _) = load_req(&s.db, id).await?;
    if status != "PENDING" {
        return Err(ApiError::invalid_transition("Request is not pending"));
    }
    if requester == ctx.user_id {
        return Err(ApiError::forbidden_code(
            "SEPARATION_OF_DUTIES",
            "You cannot approve your own request",
        ));
    }
    let to = if approve { "APPROVED" } else { "REJECTED" };
    sqlx::query("UPDATE result_revision_requests SET status=$2, decided_by=$3, decided_at=now(), version=version+1, updated_at=now() WHERE id=$1").bind(id).bind(to).bind(ctx.user_id).execute(&s.db).await?;
    audit::log(
        &mut *s.db.acquire().await?,
        ctx,
        &format!("result_revision.{}", to.to_lowercase()),
        "result_set",
        &rs.to_string(),
        None,
        Some(json!({ "requestId": id })),
    )
    .await?;
    let v: Value = sqlx::query_scalar(
        "SELECT to_jsonb(t) FROM (SELECT * FROM result_revision_requests WHERE id=$1) t",
    )
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    Ok(ok(v))
}
async fn approve_revision(
    State(s): State<AppState>,
    ctx: Ctx,
    h: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    decide(&s, &ctx, &h, id, true).await
}
async fn reject_revision(
    State(s): State<AppState>,
    ctx: Ctx,
    h: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    decide(&s, &ctx, &h, id, false).await
}

/// Apply an approved revision: creates revision+1 for the whole result set (earlier revisions stay readable by staff).
async fn apply_revision(
    State(s): State<AppState>,
    ctx: Ctx,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    ctx.require("results.revise_published")?;
    ctx.require_reauth(&s, &headers)?;
    let (rs_id, _req, status, changes) = load_req(&s.db, id).await?;
    if status != "APPROVED" {
        return Err(ApiError::invalid_transition(
            "Only approved requests can be applied",
        ));
    }
    let rs = load(&s.db, rs_id).await?;
    let base = rs.current_rev;
    let new_rev = base + 1;
    let rows: Vec<(Uuid, Uuid, Decimal, Value)> = sqlx::query_as("SELECT student_id, section_id, total_marks, subjects FROM student_results WHERE result_set_id=$1 AND revision=$2").bind(rs_id).bind(base).fetch_all(&s.db).await?;
    let papers: Vec<(Uuid, Decimal, Decimal, bool)> = sqlx::query_as("SELECT p.subject_id, p.full_marks, p.pass_marks, sub.is_optional FROM exam_papers p JOIN subjects sub ON sub.id=p.subject_id WHERE p.exam_id=$1 AND p.class_id=$2").bind(rs.exam).bind(rs.class).fetch_all(&s.db).await?;
    let ch: Vec<(Uuid, Uuid, Option<Decimal>, bool)> = changes
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|c| {
            (
                Uuid::parse_str(c["studentId"].as_str().unwrap_or_default()).unwrap_or_default(),
                Uuid::parse_str(c["subjectId"].as_str().unwrap_or_default()).unwrap_or_default(),
                c["newMarks"]
                    .as_f64()
                    .and_then(|f| Decimal::try_from(f).ok()),
                c["absent"].as_bool().unwrap_or(false),
            )
        })
        .collect();
    let mut computed = vec![];
    let mut affected = vec![];
    for (stu, _sec, _t, subjects) in &rows {
        let arr = subjects.as_array().cloned().unwrap_or_default();
        let mut inputs = vec![];
        for p in &papers {
            let cur = arr
                .iter()
                .find(|x| x["subjectId"].as_str() == Some(&p.0.to_string()));
            let (mut marks, mut absent) = (
                cur.and_then(|x| x["marks"].as_f64())
                    .and_then(|f| Decimal::try_from(f).ok()),
                cur.map(|x| x["absent"] == true).unwrap_or(false),
            );
            if let Some(c) = ch.iter().find(|c| c.0 == *stu && c.1 == p.0) {
                if !c.3 {
                    let m = c.2.ok_or_else(|| {
                        ApiError::field("changes", "REQUIRED", "newMarks required unless absent")
                    })?;
                    if m < Decimal::ZERO || m > p.1 {
                        return Err(ApiError::field(
                            "changes",
                            "OUT_OF_RANGE",
                            "New marks outside 0..full marks",
                        ));
                    }
                    marks = Some(m);
                    absent = false;
                } else {
                    marks = None;
                    absent = true;
                }
                affected.push(*stu);
            }
            inputs.push(SubjectInput {
                subject_id: p.0.to_string(),
                marks,
                absent,
                full_marks: p.1,
                pass_marks: p.2,
                optional: p.3,
            });
        }
        computed.push(grading::compute_student(&rs.scheme, &inputs));
    }
    for c in &ch {
        if !rows.iter().any(|r| r.0 == c.0) {
            return Err(ApiError::field(
                "changes",
                "NOT_FOUND",
                "A changed student is not part of this result set",
            ));
        }
    }
    let positions = grading::assign_positions(
        &computed
            .iter()
            .map(|c| (c.passed, c.gpa, c.total_marks))
            .collect::<Vec<_>>(),
    );
    let mut tx = s.db.begin().await?;
    for (((stu, sec, ..), c), pos) in rows.iter().zip(&computed).zip(&positions) {
        sqlx::query("INSERT INTO student_results (result_set_id, student_id, revision, section_id, total_marks, gpa, grade, passed, position, subjects) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
            .bind(rs_id).bind(stu).bind(new_rev).bind(sec).bind(c.total_marks).bind(c.gpa).bind(&c.grade).bind(c.passed).bind(pos.map(|p| p as i32)).bind(serde_json::to_value(&c.subjects).unwrap()).execute(&mut *tx).await?;
    }
    sqlx::query("UPDATE result_sets SET current_revision=$2, published_revision=$2, version=version+1, updated_at=now() WHERE id=$1").bind(rs_id).bind(new_rev).execute(&mut *tx).await?;
    sqlx::query("UPDATE result_revision_requests SET status='APPLIED', version=version+1, updated_at=now() WHERE id=$1").bind(id).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO result_set_status_history (result_set_id, from_status, to_status, revision, actor_id, note) VALUES ($1,'PUBLISHED','PUBLISHED',$2,$3,'revision applied')").bind(rs_id).bind(new_rev).bind(ctx.user_id).execute(&mut *tx).await?;
    audit::log(
        &mut tx,
        &ctx,
        "result_revision.applied",
        "result_set",
        &rs_id.to_string(),
        Some(json!({"revision": base})),
        Some(json!({"revision": new_rev})),
    )
    .await?;
    let all_users: Vec<Uuid> =
        sqlx::query_scalar("SELECT user_id FROM students WHERE id = ANY($1)")
            .bind(&affected)
            .fetch_all(&mut *tx)
            .await?;
    let mut ob = Outbox::new();
    ob.notify(
        &mut tx,
        &all_users,
        "RESULT_REVISED",
        "Result revised",
        "A published result was revised.",
        "result_set",
        &rs_id.to_string(),
        &format!("results/{rs_id}"),
    )
    .await?;
    for u in &all_users {
        ob.event(
            *u,
            "result.published",
            json!({ "resultSetId": rs_id, "revision": new_rev }),
        );
    }
    tx.commit().await?;
    ob.flush(&s.hub);
    get_one(State(s), ctx, Path(rs_id), Query(HashMap::new())).await
}

/// Published results only (latest published revision), for the student themself or scoped staff.
async fn student_results(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    scope::can_view_student(&s.db, &ctx, id).await?;
    if ctx.role == Role::Student {
        ctx.require("results.read_own")?;
    } else {
        ctx.require("results.read_published")?;
    }
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT rs.id AS result_set_id, rs.exam_id, ex.name AS exam_name, ex.type AS exam_type, sr.revision, sr.total_marks, sr.gpa, sr.grade, sr.passed, sr.position, rs.published_at, \
        (SELECT jsonb_agg(jsonb_build_object('subjectId', x->>'subjectId', 'subjectName', sub.name, 'subjectCode', sub.code, 'marks', x->'marks', 'fullMarks', x->'fullMarks', 'grade', x->>'grade', 'gradePoint', x->'gradePoint', 'absent', x->'absent', 'passed', x->'passed')) \
           FROM jsonb_array_elements(sr.subjects) x JOIN subjects sub ON sub.id = (x->>'subjectId')::uuid) AS subjects \
        FROM student_results sr JOIN result_sets rs ON rs.id = sr.result_set_id AND rs.status='PUBLISHED' AND sr.revision = rs.published_revision JOIN exams ex ON ex.id = rs.exam_id WHERE sr.student_id=$1 ORDER BY rs.published_at DESC) t").bind(id).fetch_all(&s.db).await?;
    Ok(ok(Value::Array(rows)))
}
