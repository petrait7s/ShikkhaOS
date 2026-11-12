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
use uuid::Uuid;

use crate::{audit, auth::*, error::*, groups, http::*, scope, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/students", get(list_students).post(create_student))
        .route("/students/me", get(my_student))
        .route("/students/{id}", get(get_student).patch(patch_student))
        .route("/students/{id}/archive", post(archive_student))
        .route("/students/{id}/academic-history", get(academic_history))
        .route("/teachers", get(list_teachers).post(create_teacher))
        .route("/teachers/me", get(my_teacher))
        .route("/teachers/{id}", get(get_teacher).patch(patch_teacher))
}

const STUDENT_SELECT: &str = "s.id, s.user_id, s.student_code, s.roll_no, s.full_name, s.full_name_bn, s.dob, s.gender, s.blood_group, s.address, s.guardian_name, s.guardian_phone, s.admission_date, s.status, s.photo_file_id, s.version, s.created_at, s.updated_at, \
    e.class_id, e.section_id, e.session_id, e.roll_no AS current_roll_no, c.name AS class_name, sec.name AS section_name";
const STUDENT_FROM: &str = "FROM students s LEFT JOIN academic_sessions cs ON cs.is_current LEFT JOIN enrollments e ON e.student_id = s.id AND e.session_id = cs.id LEFT JOIN classes c ON c.id = e.class_id LEFT JOIN sections sec ON sec.id = e.section_id";

fn redact_for_teacher(mut v: Value) -> Value {
    if let Some(o) = v.as_object_mut() {
        for k in [
            "address",
            "guardian_name",
            "guardian_phone",
            "dob",
            "blood_group",
        ] {
            o.remove(k);
        }
    }
    v
}

#[derive(Deserialize)]
struct StudentFilter {
    #[serde(rename = "classId")]
    class_id: Option<Uuid>,
    #[serde(rename = "sectionId")]
    section_id: Option<Uuid>,
    status: Option<String>,
}

async fn list_students(
    State(s): State<AppState>,
    ctx: Ctx,
    Query(q): Query<PageQuery>,
    Query(f): Query<StudentFilter>,
) -> ApiResult<Response> {
    ctx.require("students.read")?;
    let teacher = if ctx.role == Role::Teacher {
        Some(scope::require_teacher(&s.db, &ctx).await?)
    } else {
        None
    };
    let sql = format!("SELECT to_jsonb(t) FROM (SELECT {STUDENT_SELECT} {STUDENT_FROM} WHERE ($1::uuid IS NULL OR e.class_id = $1) AND ($2::uuid IS NULL OR e.section_id = $2) AND ($3::text IS NULL OR s.status = $3) \
        AND ($4::text IS NULL OR s.full_name ILIKE $4 OR s.student_code ILIKE $4) \
        AND ($5::uuid IS NULL OR EXISTS (SELECT 1 FROM teacher_assignments a WHERE a.teacher_id = $5 AND a.session_id = cs.id AND a.section_id = e.section_id)) \
        ORDER BY e.class_id, e.section_id, e.roll_no, s.full_name, s.id LIMIT $6 OFFSET $7) t");
    let rows: Vec<Value> = sqlx::query_scalar(&sql)
        .bind(f.class_id)
        .bind(f.section_id)
        .bind(f.status)
        .bind(q.like())
        .bind(teacher)
        .bind(q.limit() + 1)
        .bind(q.offset())
        .fetch_all(&s.db)
        .await?;
    let rows = if ctx.role == Role::Teacher {
        rows.into_iter().map(redact_for_teacher).collect()
    } else {
        rows
    };
    Ok(list(rows, &q))
}

async fn fetch_student(db: &sqlx::PgPool, id: Uuid) -> ApiResult<Value> {
    sqlx::query_scalar(&format!(
        "SELECT to_jsonb(t) FROM (SELECT {STUDENT_SELECT} {STUDENT_FROM} WHERE s.id = $1) t"
    ))
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(ApiError::not_found)
}

async fn my_student(State(s): State<AppState>, ctx: Ctx) -> ApiResult<Response> {
    let id = scope::require_student(&s.db, &ctx).await?;
    Ok(ok(fetch_student(&s.db, id).await?))
}

async fn get_student(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    if ctx.role == Role::Student {
        ctx.require("students.read_own")?;
    } else {
        ctx.require("students.read")?;
    }
    scope::can_view_student(&s.db, &ctx, id).await?;
    let v = fetch_student(&s.db, id).await?;
    if ctx.role != Role::Student {
        audit::log(
            &mut *s.db.acquire().await?,
            &ctx,
            "student.viewed",
            "student",
            &id.to_string(),
            None,
            None,
        )
        .await?;
    }
    Ok(ok(if ctx.role == Role::Teacher {
        redact_for_teacher(v)
    } else {
        v
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NewStudent {
    student_code: String,
    full_name: String,
    full_name_bn: Option<String>,
    dob: chrono::NaiveDate,
    gender: String,
    blood_group: Option<String>,
    #[serde(default)]
    address: String,
    #[serde(default)]
    guardian_name: String,
    #[serde(default)]
    guardian_phone: String,
    admission_date: Option<chrono::NaiveDate>,
    session_id: Option<Uuid>,
    class_id: Option<Uuid>,
    section_id: Option<Uuid>,
    roll_no: Option<i32>,
}

async fn create_student(
    State(s): State<AppState>,
    ctx: Ctx,
    Json(r): Json<NewStudent>,
) -> ApiResult<Response> {
    ctx.require("students.create")?;
    v::student_code(&r.student_code)?;
    v::text("fullName", &r.full_name, 1, 200)?;
    if !matches!(r.gender.as_str(), "MALE" | "FEMALE" | "OTHER") {
        return Err(ApiError::field(
            "gender",
            "INVALID_VALUE",
            "MALE, FEMALE or OTHER",
        ));
    }
    if !r.guardian_phone.is_empty() {
        v::phone_bd(&r.guardian_phone).map_err(|mut e| {
            e.field = "guardianPhone";
            e
        })?;
    }
    if r.dob >= chrono::Utc::now().date_naive() {
        return Err(ApiError::field(
            "dob",
            "INVALID_VALUE",
            "Date of birth must be in the past",
        ));
    }
    let enroll = match (r.class_id, r.section_id, r.roll_no) {
        (Some(c), Some(sc), Some(rn)) => {
            if rn <= 0 {
                return Err(ApiError::field(
                    "rollNo",
                    "OUT_OF_RANGE",
                    "Roll must be positive",
                ));
            }
            Some((c, sc, rn))
        }
        (None, None, None) => None,
        _ => {
            return Err(ApiError::field(
                "classId",
                "INCOMPLETE",
                "classId, sectionId and rollNo go together",
            ))
        }
    };
    let username = r.student_code.to_lowercase();
    let pw = temp_password();
    let mut tx = s.db.begin().await?;
    let uid: Uuid = sqlx::query_scalar("INSERT INTO users (role, username, display_name, password_hash, must_change_password) VALUES ('STUDENT',$1,$2,$3,true) RETURNING id").bind(&username).bind(r.full_name.trim()).bind(hash_password(&pw)?).fetch_one(&mut *tx).await
        .map_err(|e| { let a: ApiError = e.into(); if a.code == "DUPLICATE" { ApiError::field("studentCode", "DUPLICATE", "Student code already exists") } else { a } })?;
    let sid: Uuid = sqlx::query_scalar("INSERT INTO students (user_id, student_code, roll_no, full_name, full_name_bn, dob, gender, blood_group, address, guardian_name, guardian_phone, admission_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12, current_date)) RETURNING id")
        .bind(uid).bind(&r.student_code).bind(r.roll_no).bind(r.full_name.trim()).bind(&r.full_name_bn).bind(r.dob).bind(&r.gender).bind(&r.blood_group).bind(&r.address).bind(&r.guardian_name).bind(&r.guardian_phone).bind(r.admission_date).fetch_one(&mut *tx).await?;
    if let Some((class, section, roll)) = enroll {
        let session = match r.session_id {
            Some(x) => x,
            None => scope::current_session(&s.db).await?,
        };
        let cap: Option<(Uuid, i32)> =
            sqlx::query_as("SELECT class_id, capacity FROM sections WHERE id=$1")
                .bind(section)
                .fetch_optional(&mut *tx)
                .await?;
        let (cid, cap) =
            cap.ok_or_else(|| ApiError::field("sectionId", "NOT_FOUND", "Section not found"))?;
        if cid != class {
            return Err(ApiError::field(
                "sectionId",
                "MISMATCH",
                "Section does not belong to the class",
            ));
        }
        let n: i64 = sqlx::query_scalar("SELECT count(*) FROM enrollments WHERE section_id=$1 AND session_id=$2 AND status='ACTIVE'").bind(section).bind(session).fetch_one(&mut *tx).await?;
        if n >= cap as i64 {
            return Err(ApiError::conflict(
                "SECTION_FULL",
                "Section capacity reached",
            ));
        }
        sqlx::query("INSERT INTO enrollments (student_id, session_id, class_id, section_id, roll_no) VALUES ($1,$2,$3,$4,$5)").bind(sid).bind(session).bind(class).bind(section).bind(roll).execute(&mut *tx).await
            .map_err(|e| { let a: ApiError = e.into(); if a.code == "DUPLICATE" { ApiError::field("rollNo", "DUPLICATE", "Roll number already used in this section") } else { a } })?;
        groups::sync_class_group(&mut tx, section).await?;
    }
    audit::log(
        &mut tx,
        &ctx,
        "student.created",
        "student",
        &sid.to_string(),
        None,
        Some(json!({ "studentCode": r.student_code })),
    )
    .await?;
    tx.commit().await?;
    Ok(created(
        json!({ "student": fetch_student(&s.db, sid).await?, "temporaryPassword": pw }),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PatchStudent {
    full_name: Option<String>,
    full_name_bn: Option<String>,
    dob: Option<chrono::NaiveDate>,
    gender: Option<String>,
    blood_group: Option<String>,
    address: Option<String>,
    guardian_name: Option<String>,
    guardian_phone: Option<String>,
    version: Option<i32>,
}

async fn patch_student(
    State(s): State<AppState>,
    ctx: Ctx,
    h: HeaderMap,
    Path(id): Path<Uuid>,
    Json(r): Json<PatchStudent>,
) -> ApiResult<Response> {
    ctx.require("students.update")?;
    if let Some(n) = &r.full_name {
        v::text("fullName", n, 1, 200)?;
    }
    if let Some(g) = &r.gender {
        if !matches!(g.as_str(), "MALE" | "FEMALE" | "OTHER") {
            return Err(ApiError::field(
                "gender",
                "INVALID_VALUE",
                "MALE, FEMALE or OTHER",
            ));
        }
    }
    if let Some(p) = &r.guardian_phone {
        if !p.is_empty() {
            v::phone_bd(p).map_err(|mut e| {
                e.field = "guardianPhone";
                e
            })?;
        }
    }
    let before = fetch_student(&s.db, id).await?;
    let ver = parse_version(&h, r.version);
    let n = sqlx::query("UPDATE students SET full_name=COALESCE($2,full_name), full_name_bn=COALESCE($3,full_name_bn), dob=COALESCE($4,dob), gender=COALESCE($5,gender), blood_group=COALESCE($6,blood_group), address=COALESCE($7,address), guardian_name=COALESCE($8,guardian_name), guardian_phone=COALESCE($9,guardian_phone), version=version+1, updated_at=now() WHERE id=$1 AND ($10::int IS NULL OR version=$10)")
        .bind(id).bind(r.full_name).bind(r.full_name_bn).bind(r.dob).bind(r.gender).bind(r.blood_group).bind(r.address).bind(r.guardian_name).bind(r.guardian_phone).bind(ver).execute(&s.db).await?.rows_affected();
    if n == 0 {
        return Err(scope::missing_or_conflict(&s.db, "students", id).await);
    }
    let after = fetch_student(&s.db, id).await?;
    audit::log(
        &mut *s.db.acquire().await?,
        &ctx,
        "student.updated",
        "student",
        &id.to_string(),
        Some(before),
        Some(after.clone()),
    )
    .await?;
    Ok(ok(after))
}

async fn archive_student(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    ctx.require("students.archive")?;
    let mut tx = s.db.begin().await?;
    let uid: Uuid = sqlx::query_scalar("UPDATE students SET status='ARCHIVED', archived_at=now(), version=version+1, updated_at=now() WHERE id=$1 AND status <> 'ARCHIVED' RETURNING user_id").bind(id).fetch_optional(&mut *tx).await?.ok_or_else(ApiError::not_found)?;
    sqlx::query(
        "UPDATE users SET status='ARCHIVED', version=version+1, updated_at=now() WHERE id=$1",
    )
    .bind(uid)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
    )
    .bind(uid)
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE enrollments SET status='WITHDRAWN', version=version+1, updated_at=now() WHERE student_id=$1 AND status='ACTIVE'").bind(id).execute(&mut *tx).await?;
    let sections: Vec<Uuid> =
        sqlx::query_scalar("SELECT DISTINCT section_id FROM enrollments WHERE student_id=$1")
            .bind(id)
            .fetch_all(&mut *tx)
            .await?;
    for sec in sections {
        groups::sync_class_group(&mut tx, sec).await?;
    }
    audit::log(
        &mut tx,
        &ctx,
        "student.archived",
        "student",
        &id.to_string(),
        None,
        None,
    )
    .await?;
    tx.commit().await?;
    s.hub.send(uid, "session.revoked", json!({}));
    Ok(ok(fetch_student(&s.db, id).await?))
}

async fn academic_history(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    scope::can_view_student(&s.db, &ctx, id).await?;
    if ctx.role == Role::Student {
        ctx.require("students.read_own")?;
    } else {
        ctx.require_any(&["students.read"])?;
    }
    let enr: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT e.id, e.session_id, ses.name AS session_name, e.class_id, c.name AS class_name, e.section_id, sec.name AS section_name, e.roll_no, e.status \
        FROM enrollments e JOIN academic_sessions ses ON ses.id = e.session_id JOIN classes c ON c.id = e.class_id JOIN sections sec ON sec.id = e.section_id WHERE e.student_id = $1 ORDER BY ses.start_date DESC) t").bind(id).fetch_all(&s.db).await?;
    // Only PUBLISHED results (latest published revision) are exposed here, for every role.
    let res: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT rs.id AS result_set_id, ex.name AS exam_name, ex.session_id, sr.revision, sr.gpa, sr.grade, sr.total_marks, sr.passed, sr.position, rs.published_at \
        FROM student_results sr JOIN result_sets rs ON rs.id = sr.result_set_id AND rs.status = 'PUBLISHED' AND sr.revision = rs.published_revision JOIN exams ex ON ex.id = rs.exam_id WHERE sr.student_id = $1 ORDER BY rs.published_at DESC) t").bind(id).fetch_all(&s.db).await?;
    Ok(ok(json!({ "enrollments": enr, "results": res })))
}

// ---------------- Teachers ----------------
const TEACHER_COLS: &str = "id, user_id, employee_code, full_name, designation, phone, join_date, status, version, created_at, updated_at";

async fn list_teachers(
    State(s): State<AppState>,
    ctx: Ctx,
    Query(q): Query<PageQuery>,
) -> ApiResult<Response> {
    ctx.require("teachers.read")?;
    let rows: Vec<Value> = sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM (SELECT {TEACHER_COLS} FROM teachers WHERE ($1::text IS NULL OR full_name ILIKE $1 OR employee_code ILIKE $1) ORDER BY full_name, id LIMIT $2 OFFSET $3) t")).bind(q.like()).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(list(rows, &q))
}
async fn fetch_teacher(db: &sqlx::PgPool, id: Uuid) -> ApiResult<Value> {
    sqlx::query_scalar(&format!(
        "SELECT to_jsonb(t) FROM (SELECT {TEACHER_COLS} FROM teachers WHERE id=$1) t"
    ))
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(ApiError::not_found)
}
async fn my_teacher(State(s): State<AppState>, ctx: Ctx) -> ApiResult<Response> {
    let id = scope::require_teacher(&s.db, &ctx).await?;
    Ok(ok(fetch_teacher(&s.db, id).await?))
}
async fn get_teacher(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    ctx.require("teachers.read")?;
    Ok(ok(fetch_teacher(&s.db, id).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NewTeacher {
    employee_code: String,
    full_name: String,
    username: String,
    email: Option<String>,
    designation: Option<String>,
    #[serde(default)]
    phone: String,
    join_date: Option<chrono::NaiveDate>,
}

async fn create_teacher(
    State(s): State<AppState>,
    ctx: Ctx,
    Json(r): Json<NewTeacher>,
) -> ApiResult<Response> {
    ctx.require("teachers.create")?;
    v::username(&r.username)?;
    v::text("fullName", &r.full_name, 1, 200)?;
    v::text("employeeCode", &r.employee_code, 2, 30)?;
    if !r.phone.is_empty() {
        v::phone_bd(&r.phone)?;
    }
    if let Some(e) = &r.email {
        v::email(e)?;
    }
    let pw = temp_password();
    let mut tx = s.db.begin().await?;
    let uid: Uuid = sqlx::query_scalar("INSERT INTO users (role, username, email, display_name, password_hash, must_change_password) VALUES ('TEACHER',$1,$2,$3,$4,true) RETURNING id").bind(&r.username).bind(&r.email).bind(r.full_name.trim()).bind(hash_password(&pw)?).fetch_one(&mut *tx).await
        .map_err(|e| { let a: ApiError = e.into(); if a.code == "DUPLICATE" { ApiError::field("username", "DUPLICATE", "Username or email already exists") } else { a } })?;
    let tid: Uuid = sqlx::query_scalar("INSERT INTO teachers (user_id, employee_code, full_name, designation, phone, join_date) VALUES ($1,$2,$3,COALESCE($4,'Assistant Teacher'),$5,COALESCE($6,current_date)) RETURNING id")
        .bind(uid).bind(&r.employee_code).bind(r.full_name.trim()).bind(&r.designation).bind(&r.phone).bind(r.join_date).fetch_one(&mut *tx).await
        .map_err(|e| { let a: ApiError = e.into(); if a.code == "DUPLICATE" { ApiError::field("employeeCode", "DUPLICATE", "Employee code already exists") } else { a } })?;
    audit::log(
        &mut tx,
        &ctx,
        "teacher.created",
        "teacher",
        &tid.to_string(),
        None,
        Some(json!({ "username": r.username })),
    )
    .await?;
    tx.commit().await?;
    Ok(created(
        json!({ "teacher": fetch_teacher(&s.db, tid).await?, "temporaryPassword": pw }),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PatchTeacher {
    full_name: Option<String>,
    designation: Option<String>,
    phone: Option<String>,
    status: Option<String>,
    version: Option<i32>,
}

async fn patch_teacher(
    State(s): State<AppState>,
    ctx: Ctx,
    h: HeaderMap,
    Path(id): Path<Uuid>,
    Json(r): Json<PatchTeacher>,
) -> ApiResult<Response> {
    ctx.require("teachers.update")?;
    if let Some(p) = &r.phone {
        if !p.is_empty() {
            v::phone_bd(p)?;
        }
    }
    if let Some(st) = &r.status {
        if !matches!(st.as_str(), "ACTIVE" | "ON_LEAVE" | "INACTIVE") {
            return Err(ApiError::field(
                "status",
                "INVALID_VALUE",
                "ACTIVE, ON_LEAVE or INACTIVE",
            ));
        }
        if st == "INACTIVE" {
            ctx.require("teachers.deactivate")?;
        }
    }
    let ver = parse_version(&h, r.version);
    let before = fetch_teacher(&s.db, id).await?;
    let mut tx = s.db.begin().await?;
    let uid: Option<Uuid> = sqlx::query_scalar("UPDATE teachers SET full_name=COALESCE($2,full_name), designation=COALESCE($3,designation), phone=COALESCE($4,phone), status=COALESCE($5,status), version=version+1, updated_at=now() WHERE id=$1 AND ($6::int IS NULL OR version=$6) RETURNING user_id")
        .bind(id).bind(&r.full_name).bind(&r.designation).bind(&r.phone).bind(&r.status).bind(ver).fetch_optional(&mut *tx).await?;
    let Some(uid) = uid else {
        drop(tx);
        return Err(scope::missing_or_conflict(&s.db, "teachers", id).await);
    };
    if r.status.as_deref() == Some("INACTIVE") {
        sqlx::query(
            "UPDATE users SET status='SUSPENDED', updated_at=now(), version=version+1 WHERE id=$1",
        )
        .bind(uid)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
        )
        .bind(uid)
        .execute(&mut *tx)
        .await?;
    } else if r.status.as_deref() == Some("ACTIVE") {
        sqlx::query("UPDATE users SET status='ACTIVE', updated_at=now(), version=version+1 WHERE id=$1 AND status='SUSPENDED'").bind(uid).execute(&mut *tx).await?;
    }
    if let Some(n) = &r.full_name {
        sqlx::query("UPDATE users SET display_name=$2 WHERE id=$1")
            .bind(uid)
            .bind(n.trim())
            .execute(&mut *tx)
            .await?;
    }
    audit::log(
        &mut tx,
        &ctx,
        "teacher.updated",
        "teacher",
        &id.to_string(),
        Some(before),
        None,
    )
    .await?;
    let sections: Vec<Uuid> = sqlx::query_scalar(
        "SELECT DISTINCT section_id FROM teacher_assignments WHERE teacher_id=$1",
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;
    for sec in sections {
        groups::sync_class_group(&mut tx, sec).await?;
    }
    tx.commit().await?;
    Ok(ok(fetch_teacher(&s.db, id).await?))
}
