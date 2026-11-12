use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    response::Response,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use uuid::Uuid;

use crate::{
    audit,
    auth::Ctx,
    crud::{self, c, ci, Spec, K::*},
    error::*,
    groups,
    http::*,
    scope,
    state::AppState,
};

macro_rules! crud_mod {
    ($m:ident, $spec:expr, $manage:expr) => {
        mod $m {
            #![allow(dead_code)]
            use super::*;
            pub static SPEC: Spec = $spec;
            pub async fn list(
                State(s): State<AppState>,
                _ctx: Ctx,
                Query(q): Query<PageQuery>,
                Query(f): Query<HashMap<String, String>>,
            ) -> ApiResult<Response> {
                crud::list(&s.db, &SPEC, &q, &f).await
            }
            pub async fn get_one(
                State(s): State<AppState>,
                _ctx: Ctx,
                Path(id): Path<Uuid>,
            ) -> ApiResult<Response> {
                Ok(ok(crud::get(&s.db, &SPEC, id).await?))
            }
            pub async fn create(
                State(s): State<AppState>,
                ctx: Ctx,
                Json(b): Json<Value>,
            ) -> ApiResult<Response> {
                ctx.require($manage)?;
                let id = crud::create(&s.db, &ctx, &SPEC, b, vec![]).await?;
                Ok(created(crud::get(&s.db, &SPEC, id).await?))
            }
            pub async fn patch(
                State(s): State<AppState>,
                ctx: Ctx,
                h: HeaderMap,
                Path(id): Path<Uuid>,
                Json(b): Json<Value>,
            ) -> ApiResult<Response> {
                ctx.require($manage)?;
                crud::patch(&s.db, &ctx, &SPEC, id, b, &h).await?;
                Ok(ok(crud::get(&s.db, &SPEC, id).await?))
            }
        }
    };
}

crud_mod!(
    sessions,
    Spec {
        table: "academic_sessions",
        entity: "academic_session",
        cols: &[
            c("name", "name", Text, true),
            c("startDate", "start_date", Date, true),
            c("endDate", "end_date", Date, true)
        ],
        select: "id, name, start_date, end_date, is_current, version, created_at, updated_at",
        order: "start_date DESC, id",
        search_cols: &["name"],
        filters: &[],
    },
    "academic.sessions.manage"
);

crud_mod!(
    classes,
    Spec {
        table: "classes",
        entity: "class",
        cols: &[
            c("name", "name", Text, true),
            c("level", "level", Int, true),
            c("order", "order", Int, false)
        ],
        select: "id, name, level, \"order\", version, created_at, updated_at",
        order: "\"order\", level, id",
        search_cols: &["name"],
        filters: &[],
    },
    "academic.classes.manage"
);

crud_mod!(sections, Spec {
    table: "sections", entity: "section",
    cols: &[ci("classId", "class_id", Uuid, true), c("name", "name", Text, true), c("capacity", "capacity", Int, false)],
    select: "id, class_id, name, capacity, (SELECT count(*) FROM enrollments e JOIN academic_sessions s ON s.id = e.session_id AND s.is_current WHERE e.section_id = sections.id AND e.status = 'ACTIVE') AS student_count, version, created_at, updated_at",
    order: "class_id, name", search_cols: &["name"], filters: &[("classId", "class_id")],
}, "academic.sections.manage");

crud_mod!(subjects, Spec {
    table: "subjects", entity: "subject",
    cols: &[c("code", "code", Text, true), c("name", "name", Text, true), c("nameBn", "name_bn", Text, false), c("isOptional", "is_optional", Bool, false), c("fullMarksDefault", "full_marks_default", Dec, false)],
    select: "id, code, name, name_bn, is_optional, full_marks_default, version, created_at, updated_at", order: "code", search_cols: &["code", "name"], filters: &[],
}, "academic.subjects.manage");

crud_mod!(class_subjects, Spec {
    table: "class_subjects", entity: "class_subject",
    cols: &[ci("classId", "class_id", Uuid, true), ci("subjectId", "subject_id", Uuid, true), ci("sessionId", "session_id", Uuid, true), c("fullMarks", "full_marks", Dec, true), c("passMarks", "pass_marks", Dec, true)],
    select: "id, class_id, subject_id, session_id, full_marks, pass_marks, version, created_at, updated_at", order: "class_id, subject_id", search_cols: &[],
    filters: &[("classId", "class_id"), ("sessionId", "session_id")],
}, "academic.subjects.manage");

crud_mod!(assignments, Spec {
    table: "teacher_assignments", entity: "teacher_assignment",
    cols: &[ci("teacherId", "teacher_id", Uuid, true), ci("sessionId", "session_id", Uuid, true), ci("classId", "class_id", Uuid, true), ci("sectionId", "section_id", Uuid, true), c("subjectId", "subject_id", Uuid, false), c("isClassTeacher", "is_class_teacher", Bool, false)],
    select: "id, teacher_id, session_id, class_id, section_id, subject_id, is_class_teacher, version, created_at, updated_at", order: "created_at DESC, id", search_cols: &[],
    filters: &[("teacherId", "teacher_id"), ("sessionId", "session_id"), ("sectionId", "section_id"), ("classId", "class_id")],
}, "academic.assignments.manage");

crud_mod!(enrollments, Spec {
    table: "enrollments", entity: "enrollment",
    cols: &[ci("studentId", "student_id", Uuid, true), ci("sessionId", "session_id", Uuid, true), c("classId", "class_id", Uuid, true), c("sectionId", "section_id", Uuid, true), c("rollNo", "roll_no", Int, true), c("status", "status", Text, false)],
    select: "id, student_id, session_id, class_id, section_id, roll_no, status, version, created_at, updated_at", order: "class_id, section_id, roll_no", search_cols: &[],
    filters: &[("studentId", "student_id"), ("sessionId", "session_id"), ("sectionId", "section_id"), ("classId", "class_id"), ("status", "status")],
}, "academic.enrollments.manage");

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/academic-sessions",
            get(sessions::list).post(sessions::create),
        )
        .route(
            "/academic-sessions/{id}",
            get(sessions::get_one).patch(sessions::patch),
        )
        .route("/academic-sessions/{id}/set-current", post(set_current))
        .route("/classes", get(classes::list).post(classes::create))
        .route("/classes/{id}", get(classes::get_one).patch(classes::patch))
        .route("/sections", get(sections::list).post(sections::create))
        .route(
            "/sections/{id}",
            get(sections::get_one).patch(sections::patch),
        )
        .route("/subjects", get(subjects::list).post(subjects::create))
        .route(
            "/subjects/{id}",
            get(subjects::get_one).patch(subjects::patch),
        )
        .route(
            "/class-subjects",
            get(class_subjects::list).post(class_subjects::create),
        )
        .route(
            "/class-subjects/{id}",
            get(class_subjects::get_one).patch(class_subjects::patch),
        )
        .route("/teacher-assignments", get(assign_list).post(assign_create))
        .route(
            "/teacher-assignments/{id}",
            get(assignments::get_one).patch(assign_patch),
        )
        .route("/enrollments", get(enroll_list).post(enroll_create))
        .route(
            "/enrollments/{id}",
            get(enrollments::get_one).patch(enroll_patch),
        )
        .route("/enrollments/bulk-promote", post(bulk_promote))
}

async fn set_current(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    ctx.require("academic.sessions.manage")?;
    let mut tx = s.db.begin().await?;
    sqlx::query("UPDATE academic_sessions SET is_current = false, version = version + 1 WHERE is_current AND id <> $1").bind(id).execute(&mut *tx).await?;
    let n = sqlx::query(
        "UPDATE academic_sessions SET is_current = true, version = version + 1 WHERE id = $1",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(ApiError::not_found());
    }
    audit::log(
        &mut tx,
        &ctx,
        "academic_session.set_current",
        "academic_session",
        &id.to_string(),
        None,
        None,
    )
    .await?;
    tx.commit().await?;
    Ok(ok(crud::get(&s.db, &sessions::SPEC, id).await?))
}

// Teachers may list only their own assignments; managers see all.
async fn assign_list(
    State(s): State<AppState>,
    ctx: Ctx,
    Query(q): Query<PageQuery>,
    Query(mut f): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    if !ctx.has("academic.assignments.manage") {
        let t = scope::require_teacher(&s.db, &ctx).await?;
        f.insert("teacherId".into(), t.to_string());
    }
    crud::list(&s.db, &assignments::SPEC, &q, &f).await
}

async fn check_class_teacher(
    s: &AppState,
    session: Uuid,
    section: Uuid,
    exclude: Option<Uuid>,
) -> ApiResult<()> {
    let dup: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM teacher_assignments WHERE session_id=$1 AND section_id=$2 AND is_class_teacher AND ($3::uuid IS NULL OR id <> $3))").bind(session).bind(section).bind(exclude).fetch_one(&s.db).await?;
    if dup {
        Err(ApiError::conflict(
            "CLASS_TEACHER_EXISTS",
            "This section already has a class teacher for the session",
        ))
    } else {
        Ok(())
    }
}

async fn assign_create(
    State(s): State<AppState>,
    ctx: Ctx,
    Json(b): Json<Value>,
) -> ApiResult<Response> {
    ctx.require("academic.assignments.manage")?;
    let sec = b
        .get("sectionId")
        .and_then(|v| v.as_str())
        .and_then(|v| Uuid::parse_str(v).ok());
    let ses = b
        .get("sessionId")
        .and_then(|v| v.as_str())
        .and_then(|v| Uuid::parse_str(v).ok());
    let cls = b
        .get("classId")
        .and_then(|v| v.as_str())
        .and_then(|v| Uuid::parse_str(v).ok());
    if let (Some(sec), Some(cls)) = (sec, cls) {
        let ok_: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM sections WHERE id=$1 AND class_id=$2)")
                .bind(sec)
                .bind(cls)
                .fetch_one(&s.db)
                .await?;
        if !ok_ {
            return Err(ApiError::field(
                "sectionId",
                "MISMATCH",
                "Section does not belong to the class",
            ));
        }
    }
    if b.get("isClassTeacher").and_then(|v| v.as_bool()) == Some(true) {
        if let (Some(ses), Some(sec)) = (ses, sec) {
            check_class_teacher(&s, ses, sec, None).await?;
        }
    }
    let id = crud::create(&s.db, &ctx, &assignments::SPEC, b, vec![]).await?;
    let mut conn = s.db.acquire().await?;
    if let Some(sec) = sec {
        groups::sync_class_group(&mut conn, sec).await?;
    }
    Ok(created(crud::get(&s.db, &assignments::SPEC, id).await?))
}

async fn assign_patch(
    State(s): State<AppState>,
    ctx: Ctx,
    h: HeaderMap,
    Path(id): Path<Uuid>,
    Json(b): Json<Value>,
) -> ApiResult<Response> {
    ctx.require("academic.assignments.manage")?;
    let cur = crud::get(&s.db, &assignments::SPEC, id).await?;
    if b.get("isClassTeacher").and_then(|v| v.as_bool()) == Some(true) {
        let (ses, sec) = (
            Uuid::parse_str(cur["session_id"].as_str().unwrap()).unwrap(),
            Uuid::parse_str(cur["section_id"].as_str().unwrap()).unwrap(),
        );
        check_class_teacher(&s, ses, sec, Some(id)).await?;
    }
    crud::patch(&s.db, &ctx, &assignments::SPEC, id, b, &h).await?;
    let mut conn = s.db.acquire().await?;
    groups::sync_class_group(
        &mut conn,
        Uuid::parse_str(cur["section_id"].as_str().unwrap()).unwrap(),
    )
    .await?;
    Ok(ok(crud::get(&s.db, &assignments::SPEC, id).await?))
}

async fn enroll_list(
    State(s): State<AppState>,
    ctx: Ctx,
    Query(q): Query<PageQuery>,
    Query(mut f): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    if ctx.role == shikkhaos_domain::permissions::Role::Student {
        f.insert(
            "studentId".into(),
            scope::require_student(&s.db, &ctx).await?.to_string(),
        );
    } else if !ctx.has("students.read") {
        return Err(ApiError::forbidden("Missing permission students.read"));
    } else if ctx.role == shikkhaos_domain::permissions::Role::Teacher {
        // teachers: only sections they are assigned to
        let t = scope::require_teacher(&s.db, &ctx).await?;
        let sec = f
            .get("sectionId")
            .and_then(|v| Uuid::parse_str(v).ok())
            .ok_or_else(|| {
                ApiError::field(
                    "sectionId",
                    "REQUIRED",
                    "Teachers must filter by an assigned section",
                )
            })?;
        let ses = scope::current_session(&s.db).await?;
        if !scope::teacher_assigned(&s.db, t, ses, sec, None).await? {
            return Err(ApiError::not_found());
        }
    }
    crud::list(&s.db, &enrollments::SPEC, &q, &f).await
}

async fn validate_enrollment(
    s: &AppState,
    class: Uuid,
    section: Uuid,
    session: Uuid,
    exclude_student: Option<Uuid>,
) -> ApiResult<()> {
    let info: Option<(Uuid, i32)> =
        sqlx::query_as("SELECT class_id, capacity FROM sections WHERE id=$1")
            .bind(section)
            .fetch_optional(&s.db)
            .await?;
    let (cid, cap) =
        info.ok_or_else(|| ApiError::field("sectionId", "NOT_FOUND", "Section not found"))?;
    if cid != class {
        return Err(ApiError::field(
            "sectionId",
            "MISMATCH",
            "Section does not belong to the class",
        ));
    }
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM enrollments WHERE section_id=$1 AND session_id=$2 AND status='ACTIVE' AND ($3::uuid IS NULL OR student_id <> $3)").bind(section).bind(session).bind(exclude_student).fetch_one(&s.db).await?;
    if n >= cap as i64 {
        return Err(ApiError::conflict(
            "SECTION_FULL",
            "Section capacity reached",
        ));
    }
    Ok(())
}

async fn enroll_create(
    State(s): State<AppState>,
    ctx: Ctx,
    Json(b): Json<Value>,
) -> ApiResult<Response> {
    ctx.require("academic.enrollments.manage")?;
    let uid = |k: &str| {
        b.get(k)
            .and_then(|v| v.as_str())
            .and_then(|v| Uuid::parse_str(v).ok())
    };
    if let (Some(cl), Some(se), Some(ss)) = (uid("classId"), uid("sectionId"), uid("sessionId")) {
        validate_enrollment(&s, cl, se, ss, uid("studentId")).await?;
    }
    let id = crud::create(&s.db, &ctx, &enrollments::SPEC, b.clone(), vec![]).await.map_err(|e| if e.code == "DUPLICATE" { ApiError::conflict("DUPLICATE", "Student already enrolled in this session, or roll number already used in this section") } else { e })?;
    let mut conn = s.db.acquire().await?;
    if let Some(se) = uid("sectionId") {
        groups::sync_class_group(&mut conn, se).await?;
    }
    Ok(created(crud::get(&s.db, &enrollments::SPEC, id).await?))
}

async fn enroll_patch(
    State(s): State<AppState>,
    ctx: Ctx,
    h: HeaderMap,
    Path(id): Path<Uuid>,
    Json(b): Json<Value>,
) -> ApiResult<Response> {
    ctx.require("academic.enrollments.manage")?;
    let cur = crud::get(&s.db, &enrollments::SPEC, id).await?;
    let g = |v: &Value, k: &str| {
        v.get(k)
            .and_then(|x| x.as_str())
            .and_then(|x| Uuid::parse_str(x).ok())
    };
    let class = g(&b, "classId").or(g(&cur, "class_id")).unwrap();
    let section = g(&b, "sectionId").or(g(&cur, "section_id")).unwrap();
    if b.get("classId").is_some() || b.get("sectionId").is_some() {
        validate_enrollment(
            &s,
            class,
            section,
            g(&cur, "session_id").unwrap(),
            g(&cur, "student_id"),
        )
        .await?;
    }
    crud::patch(&s.db, &ctx, &enrollments::SPEC, id, b, &h)
        .await
        .map_err(|e| {
            if e.code == "DUPLICATE" {
                ApiError::conflict("DUPLICATE", "Roll number already used in this section")
            } else {
                e
            }
        })?;
    let mut conn = s.db.acquire().await?;
    groups::sync_class_group(&mut conn, g(&cur, "section_id").unwrap()).await?;
    groups::sync_class_group(&mut conn, section).await?;
    Ok(ok(crud::get(&s.db, &enrollments::SPEC, id).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Mapping {
    from_class_id: Uuid,
    to_class_id: Uuid,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Promote {
    from_session_id: Uuid,
    to_session_id: Uuid,
    mappings: Vec<Mapping>,
    #[serde(default)]
    dry_run: bool,
}

/// Promote active students section-by-section (same section name in the target class). Dry run returns a preview.
async fn bulk_promote(
    State(s): State<AppState>,
    ctx: Ctx,
    Json(r): Json<Promote>,
) -> ApiResult<Response> {
    ctx.require("academic.enrollments.manage")?;
    if r.from_session_id == r.to_session_id {
        return Err(ApiError::field(
            "toSessionId",
            "INVALID_VALUE",
            "Sessions must differ",
        ));
    }
    let mut tx = s.db.begin().await?;
    let mut preview = vec![];
    let mut problems = vec![];
    let mut total = 0i64;
    let mut touched = vec![];
    for m in &r.mappings {
        let rows: Vec<(Uuid, Uuid, String, i32)> = sqlx::query_as("SELECT e.student_id, e.section_id, sec.name, e.roll_no FROM enrollments e JOIN sections sec ON sec.id = e.section_id WHERE e.session_id=$1 AND e.class_id=$2 AND e.status='ACTIVE' ORDER BY sec.name, e.roll_no")
            .bind(r.from_session_id).bind(m.from_class_id).fetch_all(&mut *tx).await?;
        for (student, _sec, sec_name, roll) in rows {
            let target: Option<Uuid> =
                sqlx::query_scalar("SELECT id FROM sections WHERE class_id=$1 AND name=$2")
                    .bind(m.to_class_id)
                    .bind(&sec_name)
                    .fetch_optional(&mut *tx)
                    .await?;
            let Some(target) = target else {
                problems.push(json!({ "studentId": student, "problem": format!("No section '{sec_name}' in target class") }));
                continue;
            };
            total += 1;
            if !r.dry_run {
                let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM enrollments WHERE student_id=$1 AND session_id=$2)").bind(student).bind(r.to_session_id).fetch_one(&mut *tx).await?;
                if exists {
                    problems.push(json!({ "studentId": student, "problem": "Already enrolled in target session" }));
                    continue;
                }
                sqlx::query("INSERT INTO enrollments (student_id, session_id, class_id, section_id, roll_no) VALUES ($1,$2,$3,$4,$5)").bind(student).bind(r.to_session_id).bind(m.to_class_id).bind(target).bind(roll).execute(&mut *tx).await?;
                sqlx::query("UPDATE enrollments SET status='PROMOTED', version=version+1, updated_at=now() WHERE student_id=$1 AND session_id=$2").bind(student).bind(r.from_session_id).execute(&mut *tx).await?;
                touched.push(target);
            }
        }
        preview.push(json!({ "fromClassId": m.from_class_id, "toClassId": m.to_class_id }));
    }
    if r.dry_run {
        return Ok(ok(
            json!({ "dryRun": true, "eligible": total, "problems": problems, "mappings": preview }),
        ));
    }
    audit::log(
        &mut tx,
        &ctx,
        "enrollment.bulk_promoted",
        "academic_session",
        &r.to_session_id.to_string(),
        None,
        Some(json!({ "promoted": total - problems.len() as i64 })),
    )
    .await?;
    for sec in touched.iter().collect::<std::collections::HashSet<_>>() {
        groups::sync_class_group(&mut tx, *sec).await?;
    }
    tx.commit().await?;
    Ok(ok(
        json!({ "dryRun": false, "promoted": total - problems.len() as i64, "problems": problems }),
    ))
}
