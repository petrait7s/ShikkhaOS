use axum::{extract::{Path, Query, State}, http::HeaderMap, response::Response, routing::{get, patch as patch_r, post}, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use shikkhaos_domain::{permissions::Role, validation as v};
use uuid::Uuid;
use crate::{audit, auth::Ctx, error::*, http::*, notify::Outbox, scope, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/homework", get(list).post(create))
        .route("/homework/{id}", get(get_one).patch(patch))
        .route("/homework/{id}/publish", post(publish))
        .route("/homework/{id}/submissions", get(list_submissions).post(submit))
        .route("/homework-submissions/{id}", patch_r(grade))
}

struct H { id: Uuid, assignment: Uuid, section: Uuid, class: Uuid, subject: Option<Uuid>, teacher_user: Uuid, status: String, due: chrono::DateTime<chrono::Utc>, title: String }

async fn load(db: &sqlx::PgPool, id: Uuid) -> ApiResult<H> {
    let r: Option<(Uuid, Uuid, Uuid, Uuid, Option<Uuid>, Uuid, String, chrono::DateTime<chrono::Utc>, String)> = sqlx::query_as("SELECT h.id, h.teacher_assignment_id, a.section_id, a.class_id, a.subject_id, t.user_id, h.status, h.due_at, h.title FROM homework h JOIN teacher_assignments a ON a.id=h.teacher_assignment_id JOIN teachers t ON t.id=a.teacher_id WHERE h.id=$1").bind(id).fetch_optional(db).await?;
    let r = r.ok_or_else(ApiError::not_found)?;
    Ok(H { id: r.0, assignment: r.1, section: r.2, class: r.3, subject: r.4, teacher_user: r.5, status: r.6, due: r.7, title: r.8 })
}

const SEL: &str = "SELECT h.id, h.teacher_assignment_id, a.class_id, a.section_id, a.subject_id, sub.name AS subject_name, h.title, h.description, h.due_at, h.attachment_file_ids, h.status, h.version, h.created_at, h.updated_at FROM homework h JOIN teacher_assignments a ON a.id=h.teacher_assignment_id LEFT JOIN subjects sub ON sub.id=a.subject_id JOIN teachers t ON t.id=a.teacher_id";

async fn list(State(s): State<AppState>, ctx: Ctx, Query(q): Query<PageQuery>) -> ApiResult<Response> {
    ctx.require("homework.read")?;
    let rows: Vec<Value> = match ctx.role {
        Role::Student => sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM (SELECT x.*, (SELECT to_jsonb(sb) FROM (SELECT id, submitted_at, late, grade, feedback FROM homework_submissions WHERE homework_id=x.id AND student_id=me.id) sb) AS my_submission FROM ({SEL} WHERE h.status IN ('PUBLISHED','CLOSED')) x JOIN students me ON me.user_id=$1 \
            WHERE EXISTS (SELECT 1 FROM enrollments e JOIN academic_sessions s ON s.id=e.session_id AND s.is_current WHERE e.student_id=me.id AND e.status='ACTIVE' AND e.section_id=x.section_id) ORDER BY x.due_at DESC LIMIT $2 OFFSET $3) t")).bind(ctx.user_id).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?,
        Role::Teacher => sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM ({SEL} WHERE t.user_id=$1 ORDER BY h.due_at DESC LIMIT $2 OFFSET $3) t")).bind(ctx.user_id).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?,
        _ => { sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM ({SEL} ORDER BY h.due_at DESC LIMIT $1 OFFSET $2) t")).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await? }
    };
    Ok(crate::http::list(rows, &q))
}

async fn can_see(s: &AppState, ctx: &Ctx, h: &H) -> ApiResult<()> {
    match ctx.role {
        Role::Teacher => if ctx.user_id == h.teacher_user { Ok(()) } else { Err(ApiError::not_found()) },
        Role::Student => {
            let ok_: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM students st JOIN enrollments e ON e.student_id=st.id AND e.status='ACTIVE' JOIN academic_sessions s ON s.id=e.session_id AND s.is_current WHERE st.user_id=$1 AND e.section_id=$2)").bind(ctx.user_id).bind(h.section).fetch_one(&s.db).await?;
            if ok_ && h.status != "DRAFT" { Ok(()) } else { Err(ApiError::not_found()) }
        }
        _ => ctx.require("homework.read").map_err(|_| ApiError::not_found()),
    }
}

async fn get_one(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    ctx.require("homework.read")?;
    let h = load(&s.db, id).await?; can_see(&s, &ctx, &h).await?;
    let mut v: Value = sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM ({SEL} WHERE h.id=$1) t")).bind(id).fetch_one(&s.db).await?;
    if ctx.role == Role::Student { v["my_submission"] = sqlx::query_scalar("SELECT to_jsonb(sb) FROM (SELECT sb.id, sb.text, sb.file_ids, sb.submitted_at, sb.late, sb.grade, sb.feedback FROM homework_submissions sb JOIN students st ON st.id=sb.student_id WHERE sb.homework_id=$1 AND st.user_id=$2) sb").bind(id).bind(ctx.user_id).fetch_optional(&s.db).await?.unwrap_or(Value::Null); }
    Ok(ok(v))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct New { teacher_assignment_id: Uuid, title: String, #[serde(default)] description: String, due_at: chrono::DateTime<chrono::Utc>, #[serde(default)] attachment_file_ids: Vec<Uuid> }

async fn create(State(s): State<AppState>, ctx: Ctx, Json(r): Json<New>) -> ApiResult<Response> {
    ctx.require("homework.manage")?;
    v::text("title", &r.title, 1, 200)?; v::text("description", &r.description, 0, 5000)?;
    if r.due_at <= chrono::Utc::now() { return Err(ApiError::field("dueAt", "OUT_OF_RANGE", "Due date must be in the future")); }
    let t = scope::require_teacher(&s.db, &ctx).await?;
    let owns: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM teacher_assignments WHERE id=$1 AND teacher_id=$2)").bind(r.teacher_assignment_id).bind(t).fetch_one(&s.db).await?;
    if !owns { return Err(ApiError::not_found()); }
    let id: Uuid = sqlx::query_scalar("INSERT INTO homework (teacher_assignment_id, title, description, due_at, attachment_file_ids) VALUES ($1,$2,$3,$4,$5) RETURNING id").bind(r.teacher_assignment_id).bind(r.title.trim()).bind(r.description.trim()).bind(r.due_at).bind(&r.attachment_file_ids).fetch_one(&s.db).await?;
    audit::log(&mut *s.db.acquire().await?, &ctx, "homework.created", "homework", &id.to_string(), None, None).await?;
    let v: Value = sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM ({SEL} WHERE h.id=$1) t")).bind(id).fetch_one(&s.db).await?;
    Ok(created(v))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Patch { title: Option<String>, description: Option<String>, due_at: Option<chrono::DateTime<chrono::Utc>>, status: Option<String>, version: Option<i32> }

async fn patch(State(s): State<AppState>, ctx: Ctx, hd: HeaderMap, Path(id): Path<Uuid>, Json(r): Json<Patch>) -> ApiResult<Response> {
    ctx.require("homework.manage")?;
    let h = load(&s.db, id).await?;
    if ctx.user_id != h.teacher_user { return Err(ApiError::not_found()); }
    if let Some(t) = &r.title { v::text("title", t, 1, 200)?; }
    if let Some(st) = &r.status { if st != "CLOSED" { return Err(ApiError::field("status", "INVALID_VALUE", "Use /publish to publish; only CLOSED is accepted here")); } if h.status != "PUBLISHED" { return Err(ApiError::invalid_transition("Only published homework can be closed")); } }
    let n = sqlx::query("UPDATE homework SET title=COALESCE($2,title), description=COALESCE($3,description), due_at=COALESCE($4,due_at), status=COALESCE($5,status), version=version+1, updated_at=now() WHERE id=$1 AND ($6::int IS NULL OR version=$6)")
        .bind(id).bind(r.title.map(|x| x.trim().to_string())).bind(r.description).bind(r.due_at).bind(r.status).bind(parse_version(&hd, r.version)).execute(&s.db).await?.rows_affected();
    if n == 0 { return Err(scope::missing_or_conflict(&s.db, "homework", id).await); }
    get_one(State(s), ctx, Path(id)).await
}

async fn publish(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    ctx.require("homework.manage")?;
    let h = load(&s.db, id).await?;
    if ctx.user_id != h.teacher_user { return Err(ApiError::not_found()); }
    if h.status != "DRAFT" { return Err(ApiError::invalid_transition("Only draft homework can be published")); }
    let mut tx = s.db.begin().await?;
    sqlx::query("UPDATE homework SET status='PUBLISHED', version=version+1, updated_at=now() WHERE id=$1").bind(id).execute(&mut *tx).await?;
    let users: Vec<Uuid> = sqlx::query_scalar("SELECT st.user_id FROM enrollments e JOIN students st ON st.id=e.student_id JOIN academic_sessions s ON s.id=e.session_id AND s.is_current WHERE e.section_id=$1 AND e.status='ACTIVE'").bind(h.section).fetch_all(&mut *tx).await?;
    audit::log(&mut tx, &ctx, "homework.published", "homework", &id.to_string(), None, None).await?;
    let mut ob = Outbox::new();
    ob.notify(&mut tx, &users, "HOMEWORK_ASSIGNED", "New homework", "New homework was assigned.", "homework", &id.to_string(), &format!("homework/{id}")).await?;
    for u in &users { ob.event(*u, "homework.assigned", json!({ "homeworkId": id })); }
    tx.commit().await?;
    ob.flush(&s.hub);
    get_one(State(s), ctx, Path(id)).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Submit { text: Option<String>, #[serde(default)] file_ids: Vec<Uuid> }

async fn submit(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>, Json(r): Json<Submit>) -> ApiResult<Response> {
    ctx.require("homework.submit")?;
    let h = load(&s.db, id).await?; can_see(&s, &ctx, &h).await?;
    if h.status != "PUBLISHED" { return Err(ApiError::conflict("HOMEWORK_CLOSED", "This homework is closed")); }
    if r.text.as_deref().unwrap_or("").trim().is_empty() && r.file_ids.is_empty() { return Err(ApiError::field("text", "REQUIRED", "Provide text or at least one file")); }
    if let Some(t) = &r.text { v::text("text", t, 0, 5000)?; }
    if r.file_ids.len() > 5 { return Err(ApiError::field("fileIds", "OUT_OF_RANGE", "At most 5 files")); }
    if !r.file_ids.is_empty() { let n: i64 = sqlx::query_scalar("SELECT count(*) FROM files WHERE id = ANY($1) AND owner_id=$2 AND status='READY'").bind(&r.file_ids).bind(ctx.user_id).fetch_one(&s.db).await?; if n != r.file_ids.len() as i64 { return Err(ApiError::field("fileIds", "INVALID_FILE", "Files must be your own uploaded, ready files")); } }
    let student = scope::require_student(&s.db, &ctx).await?;
    let graded: Option<Option<String>> = sqlx::query_scalar("SELECT grade FROM homework_submissions WHERE homework_id=$1 AND student_id=$2").bind(id).bind(student).fetch_optional(&s.db).await?;
    if matches!(graded, Some(Some(_))) { return Err(ApiError::conflict("ALREADY_GRADED", "Graded submissions cannot be changed")); }
    let late = chrono::Utc::now() > h.due;
    let sid: Uuid = sqlx::query_scalar("INSERT INTO homework_submissions (homework_id, student_id, file_ids, text, late) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (homework_id, student_id) DO UPDATE SET file_ids=EXCLUDED.file_ids, text=EXCLUDED.text, late=EXCLUDED.late, submitted_at=now(), updated_at=now(), version=homework_submissions.version+1 RETURNING id")
        .bind(id).bind(student).bind(&r.file_ids).bind(r.text.map(|x| x.trim().to_string())).bind(late).fetch_one(&s.db).await?;
    audit::log(&mut *s.db.acquire().await?, &ctx, "homework.submitted", "homework_submission", &sid.to_string(), None, None).await?;
    let v: Value = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT id, homework_id, student_id, file_ids, text, submitted_at, late, grade, feedback, version FROM homework_submissions WHERE id=$1) t").bind(sid).fetch_one(&s.db).await?;
    Ok(created(v))
}

async fn list_submissions(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>, Query(q): Query<PageQuery>) -> ApiResult<Response> {
    ctx.require("homework.manage")?;
    let h = load(&s.db, id).await?;
    if ctx.role == Role::Teacher && ctx.user_id != h.teacher_user { return Err(ApiError::not_found()); }
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT e.student_id, st.full_name, e.roll_no, sb.id AS submission_id, sb.text, sb.file_ids, sb.submitted_at, sb.late, sb.grade, sb.feedback, sb.version, (sb.id IS NOT NULL) AS submitted \
        FROM enrollments e JOIN students st ON st.id=e.student_id JOIN academic_sessions s ON s.id=e.session_id AND s.is_current LEFT JOIN homework_submissions sb ON sb.homework_id=$1 AND sb.student_id=st.id WHERE e.section_id=$2 AND e.status='ACTIVE' ORDER BY e.roll_no LIMIT $3 OFFSET $4) t").bind(id).bind(h.section).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(crate::http::list(rows, &q))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Grade { grade: String, feedback: Option<String>, version: Option<i32> }

async fn grade(State(s): State<AppState>, ctx: Ctx, hd: HeaderMap, Path(id): Path<Uuid>, Json(r): Json<Grade>) -> ApiResult<Response> {
    ctx.require("homework.manage")?;
    v::text("grade", &r.grade, 1, 20)?;
    if let Some(f) = &r.feedback { v::text("feedback", f, 0, 2000)?; }
    let row: Option<(Uuid, Uuid, Uuid)> = sqlx::query_as("SELECT sb.homework_id, st.user_id, sb.id FROM homework_submissions sb JOIN students st ON st.id=sb.student_id WHERE sb.id=$1").bind(id).fetch_optional(&s.db).await?;
    let (hid, student_user, _) = row.ok_or_else(ApiError::not_found)?;
    let h = load(&s.db, hid).await?;
    if ctx.user_id != h.teacher_user { return Err(ApiError::not_found()); }
    let mut tx = s.db.begin().await?;
    let n = sqlx::query("UPDATE homework_submissions SET grade=$2, feedback=$3, version=version+1, updated_at=now() WHERE id=$1 AND ($4::int IS NULL OR version=$4)").bind(id).bind(r.grade.trim()).bind(&r.feedback).bind(parse_version(&hd, r.version)).execute(&mut *tx).await?.rows_affected();
    if n == 0 { drop(tx); return Err(scope::missing_or_conflict(&s.db, "homework_submissions", id).await); }
    audit::log(&mut tx, &ctx, "homework.graded", "homework_submission", &id.to_string(), None, None).await?;
    let mut ob = Outbox::new();
    ob.notify(&mut tx, &[student_user], "HOMEWORK_GRADED", "Homework graded", "Your homework was graded.", "homework", &hid.to_string(), &format!("homework/{hid}")).await?;
    ob.event(student_user, "homework.graded", json!({ "homeworkId": hid }));
    tx.commit().await?;
    ob.flush(&s.hub);
    let v: Value = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT id, homework_id, student_id, grade, feedback, version FROM homework_submissions WHERE id=$1) t").bind(id).fetch_one(&s.db).await?;
    Ok(ok(v))
}
