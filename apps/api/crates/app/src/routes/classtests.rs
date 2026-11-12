//! Class tests: internal, shareable with the class group. NEVER touches official result tables (contract C8).
use crate::{audit, auth::Ctx, error::*, http::*, notify::Outbox, scope, state::AppState};
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
use shikkhaos_domain::{permissions::Role, validation as v};
use uuid::Uuid;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/class-tests", get(list).post(create))
        .route("/class-tests/{id}", get(get_one).patch(patch))
        .route("/class-tests/{id}/marks", put(save_marks))
        .route("/class-tests/{id}/share", post(share))
        .route("/students/{id}/class-tests", get(student_tests))
}

#[allow(dead_code)]
struct T {
    id: Uuid,
    assignment: Uuid,
    section: Uuid,
    class: Uuid,
    subject: Option<Uuid>,
    status: String,
    full: Decimal,
    title: String,
    teacher_user: Uuid,
    session: Uuid,
}

async fn load(db: &sqlx::PgPool, id: Uuid) -> ApiResult<T> {
    let r: Option<(Uuid, Uuid, Uuid, Uuid, Option<Uuid>, String, Decimal, String, Uuid, Uuid)> = sqlx::query_as("SELECT ct.id, ct.teacher_assignment_id, a.section_id, a.class_id, a.subject_id, ct.status, ct.full_marks, ct.title, tc.user_id, a.session_id FROM class_tests ct JOIN teacher_assignments a ON a.id=ct.teacher_assignment_id JOIN teachers tc ON tc.id=a.teacher_id WHERE ct.id=$1").bind(id).fetch_optional(db).await?;
    let r = r.ok_or_else(ApiError::not_found)?;
    Ok(T {
        id: r.0,
        assignment: r.1,
        section: r.2,
        class: r.3,
        subject: r.4,
        status: r.5,
        full: r.6,
        title: r.7,
        teacher_user: r.8,
        session: r.9,
    })
}

fn own_or_admin(ctx: &Ctx, t: &T) -> ApiResult<()> {
    if ctx.user_id == t.teacher_user || ctx.role == Role::Headmaster {
        Ok(())
    } else {
        Err(ApiError::not_found())
    }
}

const SEL: &str = "SELECT ct.id, ct.teacher_assignment_id, a.class_id, a.section_id, a.subject_id, ct.title, ct.test_date, ct.full_marks, ct.status, ct.shared_at, ct.version, ct.created_at, ct.updated_at FROM class_tests ct JOIN teacher_assignments a ON a.id=ct.teacher_assignment_id JOIN teachers tc ON tc.id=a.teacher_id";

async fn list(
    State(s): State<AppState>,
    ctx: Ctx,
    Query(q): Query<PageQuery>,
) -> ApiResult<Response> {
    ctx.require("classtests.manage")?;
    let rows: Vec<Value> = sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM ({SEL} WHERE ($1::bool OR tc.user_id=$2) ORDER BY ct.test_date DESC, ct.id LIMIT $3 OFFSET $4) t")).bind(ctx.role == Role::Headmaster).bind(ctx.user_id).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(crate::http::list(rows, &q))
}

async fn render(db: &sqlx::PgPool, id: Uuid) -> ApiResult<Value> {
    let mut head: Value =
        sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM ({SEL} WHERE ct.id=$1) t"))
            .bind(id)
            .fetch_one(db)
            .await?;
    let t = load(db, id).await?;
    head["marks"] = json!(sqlx::query_scalar::<_, Value>("SELECT to_jsonb(t) FROM (SELECT st.id AS student_id, st.full_name, e.roll_no, m.marks, COALESCE(m.absent,false) AS absent FROM enrollments e JOIN students st ON st.id=e.student_id LEFT JOIN class_test_marks m ON m.class_test_id=$1 AND m.student_id=st.id WHERE e.section_id=$2 AND e.session_id=$3 AND e.status='ACTIVE' ORDER BY e.roll_no) t").bind(id).bind(t.section).bind(t.session).fetch_all(db).await?);
    Ok(head)
}

async fn get_one(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    ctx.require("classtests.manage")?;
    own_or_admin(&ctx, &load(&s.db, id).await?)?;
    Ok(ok(render(&s.db, id).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct New {
    teacher_assignment_id: Uuid,
    title: String,
    date: chrono::NaiveDate,
    full_marks: Decimal,
}

async fn create(State(s): State<AppState>, ctx: Ctx, Json(r): Json<New>) -> ApiResult<Response> {
    ctx.require("classtests.manage")?;
    v::text("title", &r.title, 1, 200)?;
    if r.full_marks <= Decimal::ZERO || r.full_marks > Decimal::from(1000) {
        return Err(ApiError::field(
            "fullMarks",
            "OUT_OF_RANGE",
            "Must be > 0 and <= 1000",
        ));
    }
    let t = scope::require_teacher(&s.db, &ctx).await?;
    let owns: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM teacher_assignments WHERE id=$1 AND teacher_id=$2)",
    )
    .bind(r.teacher_assignment_id)
    .bind(t)
    .fetch_one(&s.db)
    .await?;
    if !owns {
        return Err(ApiError::not_found());
    }
    let mut tx = s.db.begin().await?;
    let id: Uuid = sqlx::query_scalar("INSERT INTO class_tests (teacher_assignment_id, title, test_date, full_marks) VALUES ($1,$2,$3,$4) RETURNING id").bind(r.teacher_assignment_id).bind(r.title.trim()).bind(r.date).bind(r.full_marks).fetch_one(&mut *tx).await?;
    audit::log(
        &mut tx,
        &ctx,
        "class_test.created",
        "class_test",
        &id.to_string(),
        None,
        None,
    )
    .await?;
    tx.commit().await?;
    Ok(created(render(&s.db, id).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Patch {
    title: Option<String>,
    date: Option<chrono::NaiveDate>,
    version: Option<i32>,
}

async fn patch(
    State(s): State<AppState>,
    ctx: Ctx,
    h: HeaderMap,
    Path(id): Path<Uuid>,
    Json(r): Json<Patch>,
) -> ApiResult<Response> {
    ctx.require("classtests.manage")?;
    let t = load(&s.db, id).await?;
    own_or_admin(&ctx, &t)?;
    if t.status == "SHARED" {
        return Err(ApiError::conflict(
            "CLASS_TEST_SHARED",
            "Shared class tests cannot be edited",
        ));
    }
    if let Some(x) = &r.title {
        v::text("title", x, 1, 200)?;
    }
    let n = sqlx::query("UPDATE class_tests SET title=COALESCE($2,title), test_date=COALESCE($3,test_date), version=version+1, updated_at=now() WHERE id=$1 AND ($4::int IS NULL OR version=$4)").bind(id).bind(r.title.map(|x| x.trim().to_string())).bind(r.date).bind(parse_version(&h, r.version)).execute(&s.db).await?.rows_affected();
    if n == 0 {
        return Err(scope::missing_or_conflict(&s.db, "class_tests", id).await);
    }
    Ok(ok(render(&s.db, id).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct M {
    student_id: Uuid,
    marks: Option<Decimal>,
    #[serde(default)]
    absent: bool,
}
#[derive(Deserialize)]
struct SaveReq {
    marks: Vec<M>,
}

async fn save_marks(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
    Json(r): Json<SaveReq>,
) -> ApiResult<Response> {
    ctx.require("classtests.manage")?;
    let t = load(&s.db, id).await?;
    if ctx.user_id != t.teacher_user {
        return Err(ApiError::not_found());
    }
    if t.status == "SHARED" {
        return Err(ApiError::conflict(
            "CLASS_TEST_SHARED",
            "Shared class tests cannot be edited",
        ));
    }
    let enrolled: Vec<Uuid> = sqlx::query_scalar("SELECT student_id FROM enrollments WHERE section_id=$1 AND session_id=$2 AND status='ACTIVE'").bind(t.section).bind(t.session).fetch_all(&s.db).await?;
    let mut errs = vec![];
    for (i, m) in r.marks.iter().enumerate() {
        let e = |c: &str, msg: &str| FieldErr {
            field: format!("marks[{i}].marks"),
            code: c.into(),
            message: msg.into(),
        };
        if !enrolled.contains(&m.student_id) {
            errs.push(FieldErr {
                field: format!("marks[{i}].studentId"),
                code: "NOT_ENROLLED".into(),
                message: "Student is not in this section".into(),
            });
        }
        match (m.marks, m.absent) {
            (Some(_), true) => errs.push(e("ABSENT_HAS_MARKS", "Absent students have no marks")),
            (Some(x), false) if x < Decimal::ZERO || x > t.full => errs.push(e(
                "OUT_OF_RANGE",
                &format!("Must be between 0 and {}", t.full),
            )),
            (Some(x), false) if x.normalize().scale() > 2 => {
                errs.push(e("TOO_MANY_DECIMALS", "At most 2 decimals"))
            }
            _ => {}
        }
    }
    if !errs.is_empty() {
        return Err(ApiError::validation(errs));
    }
    let mut tx = s.db.begin().await?;
    for m in &r.marks {
        sqlx::query("INSERT INTO class_test_marks (class_test_id, student_id, marks, absent) VALUES ($1,$2,$3,$4) ON CONFLICT (class_test_id, student_id) DO UPDATE SET marks=EXCLUDED.marks, absent=EXCLUDED.absent").bind(id).bind(m.student_id).bind(if m.absent { None } else { m.marks }).bind(m.absent).execute(&mut *tx).await?;
    }
    sqlx::query("UPDATE class_tests SET version=version+1, updated_at=now() WHERE id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::log(
        &mut tx,
        &ctx,
        "class_test.marks_saved",
        "class_test",
        &id.to_string(),
        None,
        Some(json!({ "count": r.marks.len() })),
    )
    .await?;
    tx.commit().await?;
    Ok(ok(render(&s.db, id).await?))
}

/// Post into the class group + notify students. Does not read or write any official result table.
async fn share(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    ctx.require("classtests.share")?;
    let t = load(&s.db, id).await?;
    if ctx.user_id != t.teacher_user {
        return Err(ApiError::not_found());
    }
    if t.status == "SHARED" {
        return Err(ApiError::conflict("CLASS_TEST_SHARED", "Already shared"));
    }
    let entered: i64 =
        sqlx::query_scalar("SELECT count(*) FROM class_test_marks WHERE class_test_id=$1")
            .bind(id)
            .fetch_one(&s.db)
            .await?;
    if entered == 0 {
        return Err(ApiError::conflict("NO_MARKS", "Enter marks before sharing"));
    }
    let mut tx = s.db.begin().await?;
    crate::groups::sync_class_group(&mut tx, t.section).await?;
    let conv: Uuid = sqlx::query_scalar(
        "SELECT id FROM conversations WHERE type='CLASS_GROUP' AND section_id=$1",
    )
    .bind(t.section)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("UPDATE class_tests SET status='SHARED', shared_at=now(), version=version+1, updated_at=now() WHERE id=$1").bind(id).execute(&mut *tx).await?;
    let body = format!(
        "Class test shared: {} (full marks {}). Open Class tests to see your marks.",
        t.title, t.full
    );
    let mid: Uuid = sqlx::query_scalar("INSERT INTO messages (conversation_id, sender_id, body, kind) VALUES ($1,$2,$3,'CLASS_TEST_SHARED') RETURNING id").bind(conv).bind(ctx.user_id).bind(&body).fetch_one(&mut *tx).await?;
    sqlx::query("UPDATE conversations SET last_message_at=now() WHERE id=$1")
        .bind(conv)
        .execute(&mut *tx)
        .await?;
    audit::log(
        &mut tx,
        &ctx,
        "class_test.shared",
        "class_test",
        &id.to_string(),
        None,
        None,
    )
    .await?;
    let students: Vec<Uuid> = sqlx::query_scalar("SELECT st.user_id FROM class_test_marks m JOIN students st ON st.id=m.student_id WHERE m.class_test_id=$1").bind(id).fetch_all(&mut *tx).await?;
    let mut ob = Outbox::new();
    ob.notify(
        &mut tx,
        &students,
        "CLASS_TEST_SHARED",
        "Class test marks shared",
        "Your teacher shared class test marks.",
        "class_test",
        &id.to_string(),
        "class-tests",
    )
    .await?;
    for u in &students {
        ob.event(*u, "classtest.shared", json!({ "classTestId": id }));
        ob.event(
            *u,
            "message.created",
            json!({ "conversationId": conv, "messageId": mid }),
        );
    }
    tx.commit().await?;
    ob.flush(&s.hub);
    Ok(ok(render(&s.db, id).await?))
}

/// Students see only SHARED tests, only their own marks.
async fn student_tests(
    State(s): State<AppState>,
    ctx: Ctx,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    scope::can_view_student(&s.db, &ctx, id).await?;
    if ctx.role != Role::Student && ctx.role != Role::Headmaster && ctx.role != Role::Registrar {
        ctx.require("classtests.manage")?;
    }
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT ct.id, ct.title, ct.test_date, ct.full_marks, ct.shared_at, a.subject_id, sub.name AS subject_name, m.marks, m.absent, 'Class test (not an official result)' AS label \
        FROM class_test_marks m JOIN class_tests ct ON ct.id=m.class_test_id AND ct.status='SHARED' JOIN teacher_assignments a ON a.id=ct.teacher_assignment_id LEFT JOIN subjects sub ON sub.id=a.subject_id WHERE m.student_id=$1 ORDER BY ct.test_date DESC) t").bind(id).fetch_all(&s.db).await?;
    Ok(ok(Value::Array(rows)))
}
