use std::collections::HashMap;
use axum::{extract::{Path, Query, State}, response::Response, routing::{get, put}, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use shikkhaos_domain::permissions::Role;
use uuid::Uuid;
use crate::{audit, auth::Ctx, error::*, http::*, notify::Outbox, scope, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/attendance-sessions", get(list).post(open))
        .route("/attendance-sessions/{id}", get(get_one))
        .route("/attendance-sessions/{id}/records", put(save))
        .route("/students/{id}/attendance", get(student_attendance))
        .route("/attendance/summary", get(summary))
}

struct Sess { id: Uuid, section: Uuid, date: chrono::NaiveDate, subject: Option<Uuid>, session: Uuid }

async fn load(db: &sqlx::PgPool, id: Uuid) -> ApiResult<Sess> {
    let r: Option<(Uuid, Uuid, chrono::NaiveDate, Option<Uuid>)> = sqlx::query_as("SELECT id, section_id, date, subject_id FROM attendance_sessions WHERE id=$1").bind(id).fetch_optional(db).await?;
    let r = r.ok_or_else(ApiError::not_found)?;
    let session: Uuid = sqlx::query_scalar("SELECT s.id FROM academic_sessions s WHERE $1 BETWEEN s.start_date AND s.end_date ORDER BY s.is_current DESC LIMIT 1").bind(r.2).fetch_optional(db).await?.unwrap_or(scope::current_session(db).await?);
    Ok(Sess { id: r.0, section: r.1, date: r.2, subject: r.3, session })
}

/// Teacher must be assigned to the section (class teacher, or the subject for subject attendance). Registrar/Headmaster may correct.
async fn check_scope(s: &AppState, ctx: &Ctx, sess: &Sess, write: bool) -> ApiResult<()> {
    if ctx.role == Role::Teacher {
        let t = scope::require_teacher(&s.db, ctx).await.map_err(|_| ApiError::not_found())?;
        let ok = if sess.subject.is_some() { scope::teacher_assigned(&s.db, t, sess.session, sess.section, sess.subject).await? } else {
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM teacher_assignments WHERE teacher_id=$1 AND session_id=$2 AND section_id=$3 AND is_class_teacher)").bind(t).bind(sess.session).bind(sess.section).fetch_one(&s.db).await?
        };
        return if ok { Ok(()) } else { Err(ApiError::not_found()) };
    }
    if write { ctx.require("attendance.correct") } else { ctx.require("attendance.read") }
}

async fn roster(db: &sqlx::PgPool, sess: &Sess) -> ApiResult<Vec<Value>> {
    Ok(sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT st.id AS student_id, st.full_name, e.roll_no, r.status, r.note FROM enrollments e JOIN students st ON st.id=e.student_id LEFT JOIN attendance_records r ON r.session_id=$1 AND r.student_id=st.id WHERE e.section_id=$2 AND e.session_id=$3 AND e.status='ACTIVE' ORDER BY e.roll_no) t").bind(sess.id).bind(sess.section).bind(sess.session).fetch_all(db).await?)
}

async fn render(s: &AppState, id: Uuid) -> ApiResult<Value> {
    let sess = load(&s.db, id).await?;
    let mut head: Value = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT id, section_id, date, taken_by, subject_id, version, created_at, updated_at FROM attendance_sessions WHERE id=$1) t").bind(id).fetch_one(&s.db).await?;
    head["records"] = json!(roster(&s.db, &sess).await?);
    Ok(head)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OpenReq { section_id: Uuid, date: chrono::NaiveDate, subject_id: Option<Uuid> }

async fn open(State(s): State<AppState>, ctx: Ctx, Json(r): Json<OpenReq>) -> ApiResult<Response> {
    ctx.require("attendance.mark")?;
    if r.date > chrono::Utc::now().date_naive() { return Err(ApiError::field("date", "OUT_OF_RANGE", "Attendance date cannot be in the future")); }
    let session = scope::current_session(&s.db).await?;
    let probe = Sess { id: Uuid::nil(), section: r.section_id, date: r.date, subject: r.subject_id, session };
    check_scope(&s, &ctx, &probe, false).await?;
    let existing: Option<Uuid> = sqlx::query_scalar("SELECT id FROM attendance_sessions WHERE section_id=$1 AND date=$2 AND subject_id IS NOT DISTINCT FROM $3").bind(r.section_id).bind(r.date).bind(r.subject_id).fetch_optional(&s.db).await?;
    let (id, is_new) = match existing { Some(i) => (i, false), None => {
        let i: Uuid = sqlx::query_scalar("INSERT INTO attendance_sessions (section_id, date, taken_by, subject_id) VALUES ($1,$2,$3,$4) RETURNING id").bind(r.section_id).bind(r.date).bind(ctx.user_id).bind(r.subject_id).fetch_one(&s.db).await?; (i, true) } };
    let v = render(&s, id).await?;
    Ok(if is_new { created(v) } else { ok(v) })
}

async fn list(State(s): State<AppState>, ctx: Ctx, Query(q): Query<PageQuery>, Query(f): Query<HashMap<String, String>>) -> ApiResult<Response> {
    ctx.require("attendance.read")?;
    let teacher = if ctx.role == Role::Teacher { Some(scope::require_teacher(&s.db, &ctx).await?) } else { None };
    let d = |k: &str| f.get(k).and_then(|v| chrono::NaiveDate::parse_from_str(v, "%Y-%m-%d").ok());
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT a.id, a.section_id, a.date, a.taken_by, a.subject_id, a.version, (SELECT count(*) FROM attendance_records r WHERE r.session_id=a.id AND r.status='ABSENT') AS absent_count, (SELECT count(*) FROM attendance_records r WHERE r.session_id=a.id) AS marked_count FROM attendance_sessions a \
        WHERE ($1::uuid IS NULL OR a.section_id=$1) AND ($2::date IS NULL OR a.date >= $2) AND ($3::date IS NULL OR a.date <= $3) AND ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM teacher_assignments x WHERE x.teacher_id=$4 AND x.section_id=a.section_id)) ORDER BY a.date DESC, a.id LIMIT $5 OFFSET $6) t")
        .bind(f.get("sectionId").and_then(|v| Uuid::parse_str(v).ok())).bind(d("from")).bind(d("to")).bind(teacher).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(crate::http::list(rows, &q))
}

async fn get_one(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    let sess = load(&s.db, id).await?;
    ctx.require("attendance.read")?;
    check_scope(&s, &ctx, &sess, false).await?;
    Ok(ok(render(&s, id).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Rec { student_id: Uuid, status: String, note: Option<String> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SaveReq { records: Vec<Rec>, reason: Option<String> }

async fn save(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>, Json(r): Json<SaveReq>) -> ApiResult<Response> {
    let sess = load(&s.db, id).await?;
    ctx.require_any(&["attendance.mark", "attendance.correct"])?;
    check_scope(&s, &ctx, &sess, ctx.role != Role::Teacher).await?;
    let mut errs = vec![];
    for (i, x) in r.records.iter().enumerate() { if !matches!(x.status.as_str(), "PRESENT" | "ABSENT" | "LATE" | "EXCUSED") { errs.push(FieldErr { field: format!("records[{i}].status"), code: "INVALID_VALUE".into(), message: "PRESENT, ABSENT, LATE or EXCUSED".into() }); } }
    if !errs.is_empty() { return Err(ApiError::validation(errs)); }
    let enrolled: Vec<Uuid> = sqlx::query_scalar("SELECT student_id FROM enrollments WHERE section_id=$1 AND session_id=$2 AND status='ACTIVE'").bind(sess.section).bind(sess.session).fetch_all(&s.db).await?;
    for (i, x) in r.records.iter().enumerate() { if !enrolled.contains(&x.student_id) { return Err(ApiError::field(&format!("records[{i}].studentId"), "NOT_ENROLLED", "Student is not enrolled in this section")); } }
    let prior: Vec<(Uuid, String)> = sqlx::query_as("SELECT student_id, status FROM attendance_records WHERE session_id=$1").bind(id).fetch_all(&s.db).await?;
    let changes_existing = r.records.iter().any(|x| prior.iter().any(|p| p.0 == x.student_id && p.1 != x.status));
    // Same-day edits by the taker are allowed; changing recorded values on a past day requires a reason (correction).
    let is_correction = changes_existing && (sess.date < chrono::Utc::now().date_naive() || ctx.role != Role::Teacher);
    if is_correction && r.reason.as_deref().unwrap_or("").trim().is_empty() { return Err(ApiError::field("reason", "REQUIRED", "A reason is required to correct recorded attendance")); }
    let mut tx = s.db.begin().await?;
    let mut newly_absent: Vec<Uuid> = vec![];
    for x in &r.records {
        sqlx::query("INSERT INTO attendance_records (session_id, student_id, status, note) VALUES ($1,$2,$3,$4) ON CONFLICT (session_id, student_id) DO UPDATE SET status=EXCLUDED.status, note=EXCLUDED.note").bind(id).bind(x.student_id).bind(&x.status).bind(&x.note).execute(&mut *tx).await?;
        if x.status == "ABSENT" && !prior.iter().any(|p| p.0 == x.student_id && p.1 == "ABSENT") { newly_absent.push(x.student_id); }
    }
    sqlx::query("UPDATE attendance_sessions SET version=version+1, updated_at=now() WHERE id=$1").bind(id).execute(&mut *tx).await?;
    audit::log(&mut tx, &ctx, if is_correction { "attendance.corrected" } else { "attendance.recorded" }, "attendance_session", &id.to_string(), None, Some(json!({ "records": r.records.len(), "reason": r.reason }))).await?;
    let users: Vec<Uuid> = sqlx::query_scalar("SELECT user_id FROM students WHERE id = ANY($1)").bind(&newly_absent).fetch_all(&mut *tx).await?;
    let mut ob = Outbox::new();
    ob.notify(&mut tx, &users, "ATTENDANCE_ABSENT", "Marked absent", &format!("You were marked absent on {}.", sess.date), "attendance_session", &id.to_string(), "attendance").await?;
    for u in &users { ob.event(*u, "attendance.recorded", json!({ "date": sess.date })); }
    tx.commit().await?;
    ob.flush(&s.hub);
    Ok(ok(render(&s, id).await?))
}

async fn student_attendance(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>, Query(f): Query<HashMap<String, String>>) -> ApiResult<Response> {
    scope::can_view_student(&s.db, &ctx, id).await?;
    if ctx.role == Role::Student { ctx.require("attendance.read_own")?; } else { ctx.require("attendance.read")?; }
    let d = |k: &str| f.get(k).and_then(|v| chrono::NaiveDate::parse_from_str(v, "%Y-%m-%d").ok());
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT a.date, a.subject_id, r.status, r.note FROM attendance_records r JOIN attendance_sessions a ON a.id=r.session_id WHERE r.student_id=$1 AND ($2::date IS NULL OR a.date >= $2) AND ($3::date IS NULL OR a.date <= $3) ORDER BY a.date DESC) t").bind(id).bind(d("from")).bind(d("to")).fetch_all(&s.db).await?;
    let count = |st: &str| rows.iter().filter(|r| r["status"] == st).count();
    let total = rows.len();
    let attended = count("PRESENT") + count("LATE");
    Ok(ok(json!({ "records": rows, "summary": { "total": total, "present": count("PRESENT"), "absent": count("ABSENT"), "late": count("LATE"), "excused": count("EXCUSED"), "percentage": if total == 0 { 0.0 } else { (1000.0 * attended as f64 / total as f64).round() / 10.0 } } })))
}

async fn summary(State(s): State<AppState>, ctx: Ctx, Query(f): Query<HashMap<String, String>>) -> ApiResult<Response> {
    ctx.require("attendance.read")?;
    let teacher = if ctx.role == Role::Teacher { Some(scope::require_teacher(&s.db, &ctx).await?) } else { None };
    let d = |k: &str| f.get(k).and_then(|v| chrono::NaiveDate::parse_from_str(v, "%Y-%m-%d").ok());
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT a.section_id, sec.name AS section_name, c.name AS class_name, count(DISTINCT a.id) AS days, count(*) FILTER (WHERE r.status='PRESENT') AS present, count(*) FILTER (WHERE r.status='ABSENT') AS absent, count(*) FILTER (WHERE r.status='LATE') AS late, \
        round(100.0 * count(*) FILTER (WHERE r.status IN ('PRESENT','LATE')) / NULLIF(count(*),0), 1) AS percentage FROM attendance_sessions a JOIN sections sec ON sec.id=a.section_id JOIN classes c ON c.id=sec.class_id JOIN attendance_records r ON r.session_id=a.id \
        WHERE ($1::uuid IS NULL OR a.section_id=$1) AND ($2::date IS NULL OR a.date >= $2) AND ($3::date IS NULL OR a.date <= $3) AND ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM teacher_assignments x WHERE x.teacher_id=$4 AND x.section_id=a.section_id)) GROUP BY a.section_id, sec.name, c.name ORDER BY c.name, sec.name) t")
        .bind(f.get("sectionId").and_then(|v| Uuid::parse_str(v).ok())).bind(d("from")).bind(d("to")).bind(teacher).fetch_all(&s.db).await?;
    Ok(ok(Value::Array(rows)))
}
