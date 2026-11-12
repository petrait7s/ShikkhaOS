use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    response::Response,
    routing::{get, post, put},
    Json, Router,
};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::{json, Value};
use shikkhaos_domain::{
    permissions::Role,
    results::{self, SubmissionAction, SubmissionStatus, TransitionError},
};
use std::collections::HashMap;
use uuid::Uuid;

use crate::{audit, auth::*, error::*, http::*, notify::Outbox, scope, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/mark-submissions", get(list))
        .route("/mark-submissions/{id}", get(get_one))
        .route("/mark-submissions/{id}/entries", put(save_entries))
        .route("/mark-submissions/{id}/submit", post(submit))
        .route("/mark-submissions/{id}/start-review", post(start_review))
        .route(
            "/mark-submissions/{id}/request-correction",
            post(request_correction),
        )
        .route("/mark-submissions/{id}/verify", post(verify))
        .route("/mark-submissions/{id}/history", get(history))
}

fn trans_err(e: TransitionError) -> ApiError {
    match e {
        TransitionError::Invalid => {
            ApiError::invalid_transition("This action is not allowed in the current status")
        }
        TransitionError::SeparationOfDuties => ApiError::forbidden_code(
            "SEPARATION_OF_DUTIES",
            "The person who submitted the marks cannot verify them",
        ),
        TransitionError::ReasonRequired => {
            ApiError::field("reason", "REQUIRED", "A reason is required")
        }
        TransitionError::PublishNotPermitted => ApiError::forbidden("Publishing not permitted"),
    }
}
fn uid128(u: Uuid) -> u128 {
    u.as_u128()
}

#[allow(dead_code)]
struct Sub {
    id: Uuid,
    paper: Uuid,
    section: Uuid,
    teacher: Uuid,
    status: SubmissionStatus,
    revision: i32,
    version: i32,
    submitted_by: Option<Uuid>,
    exam: Uuid,
    exam_status: String,
    session: Uuid,
    class: Uuid,
    subject: Uuid,
    full_marks: Decimal,
}

async fn load(db: &sqlx::PgPool, id: Uuid) -> ApiResult<Sub> {
    let r: Option<(Uuid, Uuid, Uuid, Uuid, String, i32, i32, Option<Uuid>, Uuid, String, Uuid, Uuid, Uuid, Decimal)> = sqlx::query_as(
        "SELECT ms.id, ms.exam_paper_id, ms.section_id, ms.teacher_id, ms.status, ms.current_revision, ms.version, ms.submitted_by, e.id, e.status, e.session_id, p.class_id, p.subject_id, p.full_marks \
         FROM mark_submissions ms JOIN exam_papers p ON p.id = ms.exam_paper_id JOIN exams e ON e.id = p.exam_id WHERE ms.id = $1").bind(id).fetch_optional(db).await?;
    let r = r.ok_or_else(ApiError::not_found)?;
    Ok(Sub {
        id: r.0,
        paper: r.1,
        section: r.2,
        teacher: r.3,
        status: SubmissionStatus::parse(&r.4).ok_or_else(ApiError::internal)?,
        revision: r.5,
        version: r.6,
        submitted_by: r.7,
        exam: r.8,
        exam_status: r.9,
        session: r.10,
        class: r.11,
        subject: r.12,
        full_marks: r.13,
    })
}

/// Teachers: only own submissions and only while still assigned. Staff with review perms: all. Others: 404.
async fn authorize_view(s: &AppState, ctx: &Ctx, sub: &Sub) -> ApiResult<()> {
    if ctx.role == Role::Teacher || ctx.has("marks.enter") && !ctx.has("marks.review") {
        let t = scope::teacher_id(&s.db, ctx.user_id)
            .await?
            .ok_or_else(ApiError::not_found)?;
        if t != sub.teacher {
            return Err(ApiError::not_found());
        }
        return Ok(());
    }
    ctx.require_any(&[
        "marks.review",
        "marks.verify",
        "marks.request_correction",
        "results.approve",
    ])
    .map_err(|_| ApiError::not_found())
}

async fn require_owner_teacher(s: &AppState, ctx: &Ctx, sub: &Sub) -> ApiResult<()> {
    let t = scope::require_teacher(&s.db, ctx)
        .await
        .map_err(|_| ApiError::not_found())?;
    if t != sub.teacher {
        return Err(ApiError::not_found());
    }
    if !scope::teacher_assigned(&s.db, t, sub.session, sub.section, Some(sub.subject)).await? {
        return Err(ApiError::forbidden_code(
            "NOT_ASSIGNED",
            "You are no longer assigned to this class and subject",
        ));
    }
    Ok(())
}

async fn status_change(
    tx: &mut sqlx::PgConnection,
    sub: &Sub,
    from: SubmissionStatus,
    to: SubmissionStatus,
    actor: Uuid,
    note: Option<&str>,
) -> ApiResult<()> {
    sqlx::query("INSERT INTO mark_submission_status_history (submission_id, from_status, to_status, revision, actor_id, note) VALUES ($1,$2,$3,$4,$5,$6)")
        .bind(sub.id).bind(from.as_str()).bind(to.as_str()).bind(sub.revision).bind(actor).bind(note).execute(&mut *tx).await?;
    Ok(())
}

const LIST_SQL: &str = "SELECT ms.id, ms.exam_paper_id, ms.section_id, ms.teacher_id, ms.status, ms.current_revision, ms.submitted_at, ms.version, p.exam_id, e.name AS exam_name, p.class_id, c.name AS class_name, sec.name AS section_name, p.subject_id, sub.name AS subject_name, sub.code AS subject_code, t.full_name AS teacher_name, p.full_marks, p.pass_marks \
    FROM mark_submissions ms JOIN exam_papers p ON p.id=ms.exam_paper_id JOIN exams e ON e.id=p.exam_id JOIN classes c ON c.id=p.class_id JOIN sections sec ON sec.id=ms.section_id JOIN subjects sub ON sub.id=p.subject_id JOIN teachers t ON t.id=ms.teacher_id";

async fn list(
    State(s): State<AppState>,
    ctx: Ctx,
    Query(q): Query<PageQuery>,
    Query(f): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let teacher = if ctx.role == Role::Teacher {
        Some(scope::require_teacher(&s.db, &ctx).await?)
    } else {
        ctx.require_any(&["marks.review", "marks.verify", "results.approve"])?;
        None
    };
    let uid = |k: &str| f.get(k).and_then(|x| Uuid::parse_str(x).ok());
    let rows: Vec<Value> = sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM ({LIST_SQL} WHERE ($1::uuid IS NULL OR p.exam_id=$1) AND ($2::text IS NULL OR ms.status=$2) AND ($3::uuid IS NULL OR ms.teacher_id=$3) AND ($4::uuid IS NULL OR p.class_id=$4) AND ($5::uuid IS NULL OR ms.section_id=$5) AND ($6::uuid IS NULL OR ms.teacher_id=$6) \
        ORDER BY ms.updated_at DESC, ms.id LIMIT $7 OFFSET $8) t"))
        .bind(uid("examId")).bind(f.get("status")).bind(uid("teacherId")).bind(uid("classId")).bind(uid("sectionId")).bind(teacher).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(crate::http::list(rows, &q))
}

async fn roster(db: &sqlx::PgPool, sub: &Sub, revision: i32) -> ApiResult<Vec<Value>> {
    Ok(sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT st.id AS student_id, st.full_name, st.student_code, e.roll_no, me.marks_obtained, COALESCE(me.absent,false) AS absent, me.remark, COALESCE(me.flagged,false) AS flagged, me.flag_note, (me.student_id IS NOT NULL) AS entered \
        FROM enrollments e JOIN students st ON st.id = e.student_id LEFT JOIN mark_entries me ON me.submission_id=$1 AND me.revision=$2 AND me.student_id = st.id \
        WHERE e.section_id=$3 AND e.session_id=$4 AND e.status='ACTIVE' ORDER BY e.roll_no) t").bind(sub.id).bind(revision).bind(sub.section).bind(sub.session).fetch_all(db).await?)
}

async fn get_one(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    let sub = load(&s.db, id).await?;
    authorize_view(&s, &ctx, &sub).await?;
    let head: Value = sqlx::query_scalar(&format!(
        "SELECT to_jsonb(t) FROM ({LIST_SQL} WHERE ms.id=$1) t"
    ))
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    let mut head = head;
    let extra: (Option<String>, Option<Uuid>, Option<Uuid>) =
        sqlx::query_as("SELECT note, reviewed_by, verified_by FROM mark_submissions WHERE id=$1")
            .bind(id)
            .fetch_one(&s.db)
            .await?;
    head["note"] = json!(extra.0);
    head["reviewed_by"] = json!(extra.1);
    head["verified_by"] = json!(extra.2);
    head["exam_status"] = json!(sub.exam_status);
    head["editable"] = json!(
        sub.status.teacher_editable()
            && matches!(sub.exam_status.as_str(), "AUTHORIZED" | "IN_PROGRESS")
    );
    head["entries"] = json!(roster(&s.db, &sub, sub.revision).await?);
    Ok(ok(head))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EntryIn {
    student_id: Uuid,
    marks_obtained: Option<Decimal>,
    #[serde(default)]
    absent: bool,
    remark: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SaveReq {
    entries: Vec<EntryIn>,
    version: Option<i32>,
}

fn validate_entry(i: usize, e: &EntryIn, full: Decimal) -> Option<FieldErr> {
    let f = |code: &str, m: &str| {
        Some(FieldErr {
            field: format!("entries[{i}].marksObtained"),
            code: code.into(),
            message: m.into(),
        })
    };
    match (e.marks_obtained, e.absent) {
        (Some(_), true) => f("ABSENT_HAS_MARKS", "Absent students must have no marks"),
        (None, _) => None, // not yet entered (draft) or absent
        (Some(m), false) => {
            if m < Decimal::ZERO || m > full {
                f("OUT_OF_RANGE", &format!("Must be between 0 and {full}"))
            } else if m.normalize().scale() > 2 {
                f("TOO_MANY_DECIMALS", "At most 2 decimals")
            } else {
                None
            }
        }
    }
}

async fn save_entries(
    State(s): State<AppState>,
    ctx: Ctx,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(r): Json<SaveReq>,
) -> ApiResult<Response> {
    ctx.require("marks.enter")?;
    let sub = load(&s.db, id).await?;
    require_owner_teacher(&s, &ctx, &sub).await?;
    if !sub.status.teacher_editable() {
        return Err(ApiError::conflict(
            "SUBMISSION_LOCKED",
            "Marks cannot be edited in the current status",
        ));
    }
    if !matches!(sub.exam_status.as_str(), "AUTHORIZED" | "IN_PROGRESS") {
        return Err(ApiError::conflict(
            "EXAM_NOT_OPEN",
            "The exam is not open for marks entry",
        ));
    }
    if r.entries.is_empty() || r.entries.len() > 1000 {
        return Err(ApiError::field(
            "entries",
            "OUT_OF_RANGE",
            "Provide between 1 and 1000 entries",
        ));
    }
    let mut errs: Vec<FieldErr> = r
        .entries
        .iter()
        .enumerate()
        .filter_map(|(i, e)| validate_entry(i, e, sub.full_marks))
        .collect();
    for (i, e) in r.entries.iter().enumerate() {
        if e.remark
            .as_ref()
            .map(|x| x.chars().count() > 500)
            .unwrap_or(false)
        {
            errs.push(FieldErr {
                field: format!("entries[{i}].remark"),
                code: "OUT_OF_RANGE".into(),
                message: "At most 500 characters".into(),
            });
        }
    }
    let mut seen = std::collections::HashSet::new();
    for (i, e) in r.entries.iter().enumerate() {
        if !seen.insert(e.student_id) {
            errs.push(FieldErr {
                field: format!("entries[{i}].studentId"),
                code: "DUPLICATE".into(),
                message: "Duplicate student".into(),
            });
        }
    }
    if !errs.is_empty() {
        return Err(ApiError::validation(errs));
    }
    let enrolled: Vec<Uuid> = sqlx::query_scalar("SELECT student_id FROM enrollments WHERE section_id=$1 AND session_id=$2 AND status='ACTIVE'").bind(sub.section).bind(sub.session).fetch_all(&s.db).await?;
    for (i, e) in r.entries.iter().enumerate() {
        if !enrolled.contains(&e.student_id) {
            return Err(ApiError::field(
                &format!("entries[{i}].studentId"),
                "NOT_ENROLLED",
                "Student is not enrolled in this section",
            ));
        }
    }
    let ver = parse_version(&headers, r.version);
    let mut tx = s.db.begin().await?;
    let n = sqlx::query("UPDATE mark_submissions SET version = version + 1, updated_at = now() WHERE id=$1 AND ($2::int IS NULL OR version=$2) AND status IN ('DRAFT','CORRECTION_REQUESTED')").bind(id).bind(ver).execute(&mut *tx).await?.rows_affected();
    if n == 0 {
        drop(tx);
        return Err(scope::missing_or_conflict(&s.db, "mark_submissions", id).await);
    }
    sqlx::query("DELETE FROM mark_entries WHERE submission_id=$1 AND revision=$2")
        .bind(id)
        .bind(sub.revision)
        .execute(&mut *tx)
        .await?;
    for e in &r.entries {
        sqlx::query("INSERT INTO mark_entries (submission_id, revision, student_id, marks_obtained, absent, remark) VALUES ($1,$2,$3,$4,$5,$6)").bind(id).bind(sub.revision).bind(e.student_id).bind(if e.absent { None } else { e.marks_obtained }).bind(e.absent).bind(&e.remark).execute(&mut *tx).await?;
    }
    sqlx::query("UPDATE exams SET status='IN_PROGRESS', version=version+1, updated_at=now() WHERE id=$1 AND status='AUTHORIZED'").bind(sub.exam).execute(&mut *tx).await?;
    audit::log(
        &mut tx,
        &ctx,
        "marks.entries_saved",
        "mark_submission",
        &id.to_string(),
        None,
        Some(json!({ "count": r.entries.len(), "revision": sub.revision })),
    )
    .await?;
    tx.commit().await?;
    get_one(State(s), ctx, Path(id)).await
}

async fn transition(
    s: &AppState,
    ctx: &Ctx,
    sub: &Sub,
    action: SubmissionAction,
    note: Option<&str>,
    set_sql: &str,
) -> ApiResult<SubmissionStatus> {
    let to = sub.status.next(action).map_err(trans_err)?;
    let sql = format!("UPDATE mark_submissions SET status=$2, version=version+1, updated_at=now(){set_sql} WHERE id=$1 AND status=$3");
    let mut tx = s.db.begin().await?;
    let n = sqlx::query(&sql)
        .bind(sub.id)
        .bind(to.as_str())
        .bind(sub.status.as_str())
        .bind(ctx.user_id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(ApiError::version_conflict());
    }
    status_change(&mut tx, sub, sub.status, to, ctx.user_id, note).await?;
    audit::log(
        &mut tx,
        ctx,
        &format!("marks.{}", to.as_str().to_lowercase()),
        "mark_submission",
        &sub.id.to_string(),
        Some(json!({ "status": sub.status.as_str() })),
        Some(json!({ "status": to.as_str(), "note": note })),
    )
    .await?;
    tx.commit().await?;
    Ok(to)
}

async fn submit(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    ctx.require("marks.submit")?;
    let sub = load(&s.db, id).await?;
    require_owner_teacher(&s, &ctx, &sub).await?;
    sub.status
        .next(SubmissionAction::Submit)
        .map_err(trans_err)?;
    if !matches!(sub.exam_status.as_str(), "AUTHORIZED" | "IN_PROGRESS") {
        return Err(ApiError::conflict(
            "EXAM_NOT_OPEN",
            "The exam is not open for marks entry",
        ));
    }
    let ros = roster(&s.db, &sub, sub.revision).await?;
    let incomplete: Vec<FieldErr> = ros
        .iter()
        .filter(|r| {
            !r["entered"].as_bool().unwrap_or(false)
                || (r["marks_obtained"].is_null() && !r["absent"].as_bool().unwrap_or(false))
        })
        .map(|r| FieldErr {
            field: "entries".into(),
            code: "INCOMPLETE".into(),
            message: format!(
                "Marks missing for {}",
                r["full_name"].as_str().unwrap_or("a student")
            ),
        })
        .collect();
    if !incomplete.is_empty() {
        return Err(ApiError::validation(incomplete));
    }
    // lock revision + transition atomically
    let mut tx = s.db.begin().await?;
    sqlx::query(
        "UPDATE mark_submission_revisions SET locked = true WHERE submission_id=$1 AND revision=$2",
    )
    .bind(id)
    .bind(sub.revision)
    .execute(&mut *tx)
    .await?;
    let to = SubmissionStatus::Submitted;
    let n = sqlx::query("UPDATE mark_submissions SET status='SUBMITTED', submitted_at=now(), submitted_by=$2, version=version+1, updated_at=now() WHERE id=$1 AND status=$3").bind(id).bind(ctx.user_id).bind(sub.status.as_str()).execute(&mut *tx).await?.rows_affected();
    if n == 0 {
        return Err(ApiError::version_conflict());
    }
    status_change(&mut tx, &sub, sub.status, to, ctx.user_id, None).await?;
    audit::log(
        &mut tx,
        &ctx,
        "marks.submitted",
        "mark_submission",
        &id.to_string(),
        None,
        Some(json!({ "revision": sub.revision })),
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
        "MARKS_SUBMITTED",
        "Marks submitted",
        "A teacher submitted marks for review.",
        "mark_submission",
        &id.to_string(),
        &format!("mark-submissions/{id}"),
    )
    .await?;
    for u in &regs {
        ob.event(
            *u,
            "mark-submission.status_changed",
            json!({ "submissionId": id, "status": "SUBMITTED" }),
        );
    }
    tx.commit().await?;
    ob.flush(&s.hub);
    get_one(State(s), ctx, Path(id)).await
}

async fn start_review(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    ctx.require("marks.review")?;
    let sub = load(&s.db, id).await?;
    transition(
        &s,
        &ctx,
        &sub,
        SubmissionAction::StartReview,
        None,
        ", reviewed_by=$4",
    )
    .await?;
    get_one(State(s), ctx, Path(id)).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CorrectionReq {
    reason: String,
    #[serde(default)]
    items: Vec<CorrectionItem>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CorrectionItem {
    student_id: Uuid,
    note: Option<String>,
}

async fn request_correction(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
    Json(r): Json<CorrectionReq>,
) -> ApiResult<Response> {
    ctx.require("marks.request_correction")?;
    results::require_reason(&r.reason).map_err(trans_err)?;
    if r.reason.chars().count() > 2000 {
        return Err(ApiError::field(
            "reason",
            "OUT_OF_RANGE",
            "At most 2000 characters",
        ));
    }
    let sub = load(&s.db, id).await?;
    let to = sub
        .status
        .next(SubmissionAction::RequestCorrection)
        .map_err(trans_err)?;
    let new_rev = sub.revision + 1;
    let mut tx = s.db.begin().await?;
    let n = sqlx::query("UPDATE mark_submissions SET status=$2, current_revision=$3, note=$4, version=version+1, updated_at=now() WHERE id=$1 AND status='UNDER_REVIEW'").bind(id).bind(to.as_str()).bind(new_rev).bind(r.reason.trim()).execute(&mut *tx).await?.rows_affected();
    if n == 0 {
        return Err(ApiError::version_conflict());
    }
    sqlx::query("INSERT INTO mark_submission_revisions (submission_id, revision) VALUES ($1,$2)")
        .bind(id)
        .bind(new_rev)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO mark_entries (submission_id, revision, student_id, marks_obtained, absent, remark) SELECT submission_id, $2, student_id, marks_obtained, absent, remark FROM mark_entries WHERE submission_id=$1 AND revision=$3").bind(id).bind(new_rev).bind(sub.revision).execute(&mut *tx).await?;
    for it in &r.items {
        let n = sqlx::query("UPDATE mark_entries SET flagged=true, flag_note=$4 WHERE submission_id=$1 AND revision=$2 AND student_id=$3").bind(id).bind(new_rev).bind(it.student_id).bind(&it.note).execute(&mut *tx).await?.rows_affected();
        if n == 0 {
            return Err(ApiError::field(
                "items",
                "NOT_FOUND",
                "Flagged student is not part of this submission",
            ));
        }
    }
    let after = Sub {
        revision: new_rev,
        ..sub
    };
    status_change(
        &mut tx,
        &after,
        SubmissionStatus::UnderReview,
        to,
        ctx.user_id,
        Some(r.reason.trim()),
    )
    .await?;
    audit::log(
        &mut tx,
        &ctx,
        "marks.correction_requested",
        "mark_submission",
        &id.to_string(),
        None,
        Some(json!({ "reason": r.reason, "flagged": r.items.len() })),
    )
    .await?;
    let tu: Uuid = sqlx::query_scalar("SELECT user_id FROM teachers WHERE id=$1")
        .bind(after.teacher)
        .fetch_one(&mut *tx)
        .await?;
    let mut ob = Outbox::new();
    ob.notify(
        &mut tx,
        &[tu],
        "CORRECTION_REQUESTED",
        "Correction requested",
        "The Register asked you to correct submitted marks.",
        "mark_submission",
        &id.to_string(),
        &format!("mark-submissions/{id}"),
    )
    .await?;
    ob.event(tu, "correction.requested", json!({ "submissionId": id }));
    ob.event(
        tu,
        "mark-submission.status_changed",
        json!({ "submissionId": id, "status": "CORRECTION_REQUESTED" }),
    );
    tx.commit().await?;
    ob.flush(&s.hub);
    get_one(State(s), ctx, Path(id)).await
}

async fn verify(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    ctx.require("marks.verify")?;
    let sub = load(&s.db, id).await?;
    results::check_verifier(sub.submitted_by.map(uid128), uid128(ctx.user_id))
        .map_err(trans_err)?;
    // the user who entered (teacher user) must never be the verifier either
    let teacher_user: Uuid = sqlx::query_scalar("SELECT user_id FROM teachers WHERE id=$1")
        .bind(sub.teacher)
        .fetch_one(&s.db)
        .await?;
    results::check_verifier(Some(uid128(teacher_user)), uid128(ctx.user_id)).map_err(trans_err)?;
    transition(
        &s,
        &ctx,
        &sub,
        SubmissionAction::Verify,
        None,
        ", verified_by=$4, verified_at=now()",
    )
    .await?;
    let mut ob = Outbox::new();
    let mut conn = s.db.acquire().await?;
    ob.notify(
        &mut conn,
        &[teacher_user],
        "SUBMISSION_VERIFIED",
        "Marks verified",
        "Your submitted marks were verified.",
        "mark_submission",
        &id.to_string(),
        &format!("mark-submissions/{id}"),
    )
    .await?;
    ob.event(
        teacher_user,
        "mark-submission.status_changed",
        json!({ "submissionId": id, "status": "VERIFIED" }),
    );
    ob.flush(&s.hub);
    get_one(State(s), ctx, Path(id)).await
}

async fn history(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    let sub = load(&s.db, id).await?;
    authorize_view(&s, &ctx, &sub).await?;
    let hist: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT h.id, h.from_status, h.to_status, h.revision, h.actor_id, u.display_name AS actor_name, h.note, h.created_at FROM mark_submission_status_history h JOIN users u ON u.id = h.actor_id WHERE h.submission_id=$1 ORDER BY h.created_at, h.id) t").bind(id).fetch_all(&s.db).await?;
    let revs: Vec<(i32, bool)> = sqlx::query_as("SELECT revision, locked FROM mark_submission_revisions WHERE submission_id=$1 ORDER BY revision").bind(id).fetch_all(&s.db).await?;
    let mut revisions = vec![];
    for (rev, locked) in revs {
        revisions.push(json!({ "revision": rev, "locked": locked, "entries": roster(&s.db, &sub, rev).await? }));
    }
    Ok(ok(json!({ "history": hist, "revisions": revisions })))
}
