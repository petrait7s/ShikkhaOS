use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    response::Response,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use shikkhaos_domain::{permissions::Role, validation as v};
use std::collections::HashMap;
use uuid::Uuid;

use crate::{audit, auth::*, error::*, http::*, notify::Outbox, scope, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/exams", get(list).post(create))
        .route("/exams/{id}", get(get_one).patch(patch))
        .route("/exams/{id}/authorize", post(authorize))
        .route("/exams/{id}/close", post(close))
        .route("/exams/{id}/progress", get(progress))
        .route("/exam-papers", get(list_papers).post(create_paper))
        .route("/exam-papers/{id}", get(get_paper).patch(patch_paper))
}

const EXAM_COLS: &str = "id, session_id, name, type, start_date, end_date, status, authorized_by, authorized_at, registrar_may_publish, version, created_at, updated_at";

async fn fetch(db: &sqlx::PgPool, id: Uuid) -> ApiResult<Value> {
    sqlx::query_scalar(&format!(
        "SELECT to_jsonb(t) FROM (SELECT {EXAM_COLS} FROM exams WHERE id=$1) t"
    ))
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(ApiError::not_found)
}

async fn list(
    State(s): State<AppState>,
    ctx: Ctx,
    Query(q): Query<PageQuery>,
    Query(f): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    ctx.require("exams.read")?;
    let rows: Vec<Value> = sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM (SELECT {EXAM_COLS} FROM exams WHERE ($1::text IS NULL OR status=$1) AND ($2::uuid IS NULL OR session_id=$2) AND ($3::text IS NULL OR name ILIKE $3) ORDER BY start_date DESC, id LIMIT $4 OFFSET $5) t"))
        .bind(f.get("status")).bind(f.get("sessionId").and_then(|x| Uuid::parse_str(x).ok())).bind(q.like()).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(crate::http::list(rows, &q))
}

async fn get_one(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    ctx.require("exams.read")?;
    Ok(ok(fetch(&s.db, id).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NewExam {
    name: String,
    #[serde(rename = "type")]
    ty: String,
    session_id: Option<Uuid>,
    start_date: chrono::NaiveDate,
    end_date: chrono::NaiveDate,
    registrar_may_publish: Option<bool>,
}

fn check_type(t: &str) -> ApiResult<()> {
    if matches!(t, "TERM" | "MID_TERM" | "FINAL" | "MODEL" | "OTHER") {
        Ok(())
    } else {
        Err(ApiError::field(
            "type",
            "INVALID_VALUE",
            "TERM, MID_TERM, FINAL, MODEL or OTHER",
        ))
    }
}

async fn create(
    State(s): State<AppState>,
    ctx: Ctx,
    Json(r): Json<NewExam>,
) -> ApiResult<Response> {
    ctx.require("exams.create")?;
    v::text("name", &r.name, 1, 200)?;
    check_type(&r.ty)?;
    if r.end_date < r.start_date {
        return Err(ApiError::field(
            "endDate",
            "OUT_OF_RANGE",
            "End date must not be before start date",
        ));
    }
    if r.registrar_may_publish.is_some() {
        ctx.require("exams.authorize")?;
    }
    let session = match r.session_id {
        Some(x) => x,
        None => scope::current_session(&s.db).await?,
    };
    let mut tx = s.db.begin().await?;
    let id: Uuid = sqlx::query_scalar("INSERT INTO exams (session_id, name, type, start_date, end_date, registrar_may_publish, created_by) VALUES ($1,$2,$3,$4,$5,COALESCE($6,false),$7) RETURNING id")
        .bind(session).bind(r.name.trim()).bind(&r.ty).bind(r.start_date).bind(r.end_date).bind(r.registrar_may_publish).bind(ctx.user_id).fetch_one(&mut *tx).await?;
    audit::log(
        &mut tx,
        &ctx,
        "exam.created",
        "exam",
        &id.to_string(),
        None,
        Some(json!({ "name": r.name })),
    )
    .await?;
    tx.commit().await?;
    Ok(created(fetch(&s.db, id).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PatchExam {
    name: Option<String>,
    #[serde(rename = "type")]
    ty: Option<String>,
    start_date: Option<chrono::NaiveDate>,
    end_date: Option<chrono::NaiveDate>,
    registrar_may_publish: Option<bool>,
    version: Option<i32>,
}

async fn patch(
    State(s): State<AppState>,
    ctx: Ctx,
    h: HeaderMap,
    Path(id): Path<Uuid>,
    Json(r): Json<PatchExam>,
) -> ApiResult<Response> {
    ctx.require("exams.update")?;
    if let Some(n) = &r.name {
        v::text("name", n, 1, 200)?;
    }
    if let Some(t) = &r.ty {
        check_type(t)?;
    }
    if r.registrar_may_publish.is_some() {
        ctx.require("exams.authorize")?;
    }
    let cur = fetch(&s.db, id).await?;
    if r.registrar_may_publish.is_none() && cur["status"] != "DRAFT" {
        return Err(ApiError::conflict(
            "EXAM_LOCKED",
            "Only draft exams can be edited",
        ));
    }
    let ver = parse_version(&h, r.version);
    let n = sqlx::query("UPDATE exams SET name=COALESCE($2,name), type=COALESCE($3,type), start_date=COALESCE($4,start_date), end_date=COALESCE($5,end_date), registrar_may_publish=COALESCE($6,registrar_may_publish), version=version+1, updated_at=now() WHERE id=$1 AND ($7::int IS NULL OR version=$7)")
        .bind(id).bind(r.name.map(|x| x.trim().to_string())).bind(r.ty).bind(r.start_date).bind(r.end_date).bind(r.registrar_may_publish).bind(ver).execute(&s.db).await.map_err(|e| { let a: ApiError = e.into(); if a.code == "VALIDATION_FAILED" { ApiError::field("endDate", "OUT_OF_RANGE", "End date must not be before start date") } else { a } })?.rows_affected();
    if n == 0 {
        return Err(scope::missing_or_conflict(&s.db, "exams", id).await);
    }
    audit::log(
        &mut *s.db.acquire().await?,
        &ctx,
        "exam.updated",
        "exam",
        &id.to_string(),
        Some(cur),
        None,
    )
    .await?;
    Ok(ok(fetch(&s.db, id).await?))
}

/// DRAFT -> AUTHORIZED. Creates one MarkSubmission per paper x section from teacher assignments; reports sections lacking a teacher.
async fn authorize(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    ctx.require("exams.authorize")?;
    let mut tx = s.db.begin().await?;
    let exam: Option<(String, Uuid)> =
        sqlx::query_as("SELECT status, session_id FROM exams WHERE id=$1 FOR UPDATE")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let (status, session) = exam.ok_or_else(ApiError::not_found)?;
    if status != "DRAFT" {
        return Err(ApiError::invalid_transition(format!(
            "Exam is {status}; only DRAFT exams can be authorized"
        )));
    }
    let papers: i64 = sqlx::query_scalar("SELECT count(*) FROM exam_papers WHERE exam_id=$1")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    if papers == 0 {
        return Err(ApiError::conflict(
            "NO_PAPERS",
            "Add at least one exam paper before authorizing",
        ));
    }
    // paper x section pairs for sections that have active students
    let pairs: Vec<(Uuid, Uuid, Uuid, Option<Uuid>)> = sqlx::query_as(
        "SELECT p.id, sec.id, sec.class_id, (SELECT a.teacher_id FROM teacher_assignments a WHERE a.session_id=$2 AND a.section_id=sec.id AND a.subject_id=p.subject_id LIMIT 1) \
         FROM exam_papers p JOIN sections sec ON sec.class_id = p.class_id WHERE p.exam_id=$1 AND EXISTS (SELECT 1 FROM enrollments e WHERE e.section_id=sec.id AND e.session_id=$2 AND e.status='ACTIVE')")
        .bind(id).bind(session).fetch_all(&mut *tx).await?;
    let mut created_n = 0;
    let mut missing = vec![];
    let mut teachers: Vec<Uuid> = vec![];
    for (paper, section, _class, teacher) in pairs {
        match teacher {
            Some(t) => {
                let sid: Option<Uuid> = sqlx::query_scalar("INSERT INTO mark_submissions (exam_paper_id, section_id, teacher_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id").bind(paper).bind(section).bind(t).fetch_optional(&mut *tx).await?;
                if let Some(sid) = sid {
                    sqlx::query("INSERT INTO mark_submission_revisions (submission_id, revision) VALUES ($1,1)").bind(sid).execute(&mut *tx).await?;
                    created_n += 1;
                    teachers.push(t);
                }
            }
            None => missing.push(json!({ "examPaperId": paper, "sectionId": section })),
        }
    }
    sqlx::query("UPDATE exams SET status='AUTHORIZED', authorized_by=$2, authorized_at=now(), version=version+1, updated_at=now() WHERE id=$1").bind(id).bind(ctx.user_id).execute(&mut *tx).await?;
    audit::log(
        &mut tx,
        &ctx,
        "exam.authorized",
        "exam",
        &id.to_string(),
        None,
        Some(json!({ "submissionsCreated": created_n, "missingAssignments": missing.len() })),
    )
    .await?;
    let users: Vec<Uuid> =
        sqlx::query_scalar("SELECT DISTINCT user_id FROM teachers WHERE id = ANY($1)")
            .bind(&teachers)
            .fetch_all(&mut *tx)
            .await?;
    let mut ob = Outbox::new();
    ob.notify(
        &mut tx,
        &users,
        "EXAM_AUTHORIZED",
        "Exam authorized",
        "Marks entry is now open for an exam you teach.",
        "exam",
        &id.to_string(),
        &format!("exams/{id}"),
    )
    .await?;
    tx.commit().await?;
    ob.flush(&s.hub);
    Ok(ok(
        json!({ "exam": fetch(&s.db, id).await?, "submissionsCreated": created_n, "missingAssignments": missing }),
    ))
}

async fn close(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    ctx.require("exams.authorize")?;
    let n = sqlx::query("UPDATE exams SET status='CLOSED', version=version+1, updated_at=now() WHERE id=$1 AND status IN ('AUTHORIZED','IN_PROGRESS')").bind(id).execute(&s.db).await?.rows_affected();
    if n == 0 {
        fetch(&s.db, id).await?;
        return Err(ApiError::invalid_transition(
            "Only authorized or in-progress exams can be closed",
        ));
    }
    audit::log(
        &mut *s.db.acquire().await?,
        &ctx,
        "exam.closed",
        "exam",
        &id.to_string(),
        None,
        None,
    )
    .await?;
    Ok(ok(fetch(&s.db, id).await?))
}

async fn progress(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    ctx.require_any(&["exams.create", "marks.review", "exams.authorize"])?;
    let exam = fetch(&s.db, id).await?;
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT p.id AS paper_id, p.class_id, p.subject_id, sub.name AS subject_name, c.name AS class_name, sec.id AS section_id, sec.name AS section_name, \
        ms.id AS submission_id, ms.status, ms.teacher_id, t.full_name AS teacher_name, ms.current_revision FROM exam_papers p JOIN classes c ON c.id=p.class_id JOIN subjects sub ON sub.id=p.subject_id \
        JOIN sections sec ON sec.class_id=p.class_id LEFT JOIN mark_submissions ms ON ms.exam_paper_id=p.id AND ms.section_id=sec.id LEFT JOIN teachers t ON t.id=ms.teacher_id WHERE p.exam_id=$1 ORDER BY c.\"order\", sub.code, sec.name) t").bind(id).fetch_all(&s.db).await?;
    // totals is a list (not a map): map keys would be mangled by the camelCase key conversion
    let mut counts: std::collections::BTreeMap<String, i64> = std::collections::BTreeMap::new();
    for r in &rows {
        *counts
            .entry(r["status"].as_str().unwrap_or("NOT_STARTED").to_string())
            .or_default() += 1;
    }
    let totals: Vec<Value> = counts
        .into_iter()
        .map(|(status, count)| json!({ "status": status, "count": count }))
        .collect();
    Ok(ok(json!({ "exam": exam, "cells": rows, "totals": totals })))
}

// ---- papers ----
const PAPER_COLS: &str = "id, exam_id, class_id, subject_id, full_marks, pass_marks, exam_date, version, created_at, updated_at";

async fn list_papers(
    State(s): State<AppState>,
    ctx: Ctx,
    Query(q): Query<PageQuery>,
    Query(f): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    ctx.require("exams.read")?;
    let teacher = if ctx.role == Role::Teacher {
        Some(scope::require_teacher(&s.db, &ctx).await?)
    } else {
        None
    };
    let uid = |k: &str| f.get(k).and_then(|x| Uuid::parse_str(x).ok());
    let rows: Vec<Value> = sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM (SELECT {PAPER_COLS} FROM exam_papers p WHERE ($1::uuid IS NULL OR exam_id=$1) AND ($2::uuid IS NULL OR class_id=$2) \
        AND ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM teacher_assignments a JOIN exams e ON e.id = p.exam_id WHERE a.teacher_id=$3 AND a.session_id=e.session_id AND a.class_id=p.class_id AND a.subject_id=p.subject_id)) ORDER BY exam_date NULLS LAST, id LIMIT $4 OFFSET $5) t"))
        .bind(uid("examId")).bind(uid("classId")).bind(teacher).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(crate::http::list(rows, &q))
}

async fn get_paper(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    ctx.require("exams.read")?;
    let r: Option<Value> = sqlx::query_scalar(&format!(
        "SELECT to_jsonb(t) FROM (SELECT {PAPER_COLS} FROM exam_papers WHERE id=$1) t"
    ))
    .bind(id)
    .fetch_optional(&s.db)
    .await?;
    Ok(ok(r.ok_or_else(ApiError::not_found)?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NewPaper {
    exam_id: Uuid,
    class_id: Uuid,
    subject_id: Uuid,
    full_marks: Option<rust_decimal::Decimal>,
    pass_marks: Option<rust_decimal::Decimal>,
    exam_date: Option<chrono::NaiveDate>,
}

async fn exam_draft_and_window(
    s: &AppState,
    exam: Uuid,
) -> ApiResult<(chrono::NaiveDate, chrono::NaiveDate)> {
    let row: Option<(String, chrono::NaiveDate, chrono::NaiveDate)> =
        sqlx::query_as("SELECT status, start_date, end_date FROM exams WHERE id=$1")
            .bind(exam)
            .fetch_optional(&s.db)
            .await?;
    let (st, a, b) = row.ok_or_else(|| ApiError::field("examId", "NOT_FOUND", "Exam not found"))?;
    if st != "DRAFT" {
        return Err(ApiError::conflict(
            "EXAM_LOCKED",
            "Papers can only be changed while the exam is a draft",
        ));
    }
    Ok((a, b))
}

async fn create_paper(
    State(s): State<AppState>,
    ctx: Ctx,
    Json(r): Json<NewPaper>,
) -> ApiResult<Response> {
    ctx.require_any(&["exams.create", "exams.update"])?;
    let (from, to) = exam_draft_and_window(&s, r.exam_id).await?;
    if let Some(d) = r.exam_date {
        if d < from || d > to {
            return Err(ApiError::field(
                "examDate",
                "OUT_OF_RANGE",
                "Paper date must be inside the exam window",
            ));
        }
    }
    let defaults: Option<(rust_decimal::Decimal, rust_decimal::Decimal)> = sqlx::query_as("SELECT cs.full_marks, cs.pass_marks FROM class_subjects cs JOIN exams e ON e.session_id = cs.session_id WHERE e.id=$1 AND cs.class_id=$2 AND cs.subject_id=$3").bind(r.exam_id).bind(r.class_id).bind(r.subject_id).fetch_optional(&s.db).await?;
    let (fm, pm) = match (
        r.full_marks.or(defaults.map(|d| d.0)),
        r.pass_marks.or(defaults.map(|d| d.1)),
    ) {
        (Some(a), Some(b)) => (a, b),
        _ => {
            return Err(ApiError::field(
                "fullMarks",
                "REQUIRED",
                "Provide marks or configure the class subject first",
            ))
        }
    };
    if pm > fm || fm <= rust_decimal::Decimal::ZERO {
        return Err(ApiError::field(
            "passMarks",
            "OUT_OF_RANGE",
            "Pass marks must not exceed full marks",
        ));
    }
    let mut tx = s.db.begin().await?;
    let id: Uuid = sqlx::query_scalar("INSERT INTO exam_papers (exam_id, class_id, subject_id, full_marks, pass_marks, exam_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id").bind(r.exam_id).bind(r.class_id).bind(r.subject_id).bind(fm).bind(pm).bind(r.exam_date).fetch_one(&mut *tx).await?;
    audit::log(
        &mut tx,
        &ctx,
        "exam_paper.created",
        "exam_paper",
        &id.to_string(),
        None,
        Some(json!({ "examId": r.exam_id })),
    )
    .await?;
    tx.commit().await?;
    let v: Value = sqlx::query_scalar(&format!(
        "SELECT to_jsonb(t) FROM (SELECT {PAPER_COLS} FROM exam_papers WHERE id=$1) t"
    ))
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    Ok(created(v))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PatchPaper {
    full_marks: Option<rust_decimal::Decimal>,
    pass_marks: Option<rust_decimal::Decimal>,
    exam_date: Option<chrono::NaiveDate>,
    version: Option<i32>,
}

async fn patch_paper(
    State(s): State<AppState>,
    ctx: Ctx,
    h: HeaderMap,
    Path(id): Path<Uuid>,
    Json(r): Json<PatchPaper>,
) -> ApiResult<Response> {
    ctx.require_any(&["exams.create", "exams.update"])?;
    let exam: Uuid = sqlx::query_scalar("SELECT exam_id FROM exam_papers WHERE id=$1")
        .bind(id)
        .fetch_optional(&s.db)
        .await?
        .ok_or_else(ApiError::not_found)?;
    exam_draft_and_window(&s, exam).await?;
    let ver = parse_version(&h, r.version);
    let n = sqlx::query("UPDATE exam_papers SET full_marks=COALESCE($2,full_marks), pass_marks=COALESCE($3,pass_marks), exam_date=COALESCE($4,exam_date), version=version+1, updated_at=now() WHERE id=$1 AND ($5::int IS NULL OR version=$5)")
        .bind(id).bind(r.full_marks).bind(r.pass_marks).bind(r.exam_date).bind(ver).execute(&s.db).await.map_err(|e| { let a: ApiError = e.into(); if a.code == "VALIDATION_FAILED" { ApiError::field("passMarks", "OUT_OF_RANGE", "Pass marks must not exceed full marks") } else { a } })?.rows_affected();
    if n == 0 {
        return Err(scope::missing_or_conflict(&s.db, "exam_papers", id).await);
    }
    get_paper(State(s), ctx, Path(id)).await
}
