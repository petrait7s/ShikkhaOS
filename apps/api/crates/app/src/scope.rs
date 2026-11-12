//! Data-scope helpers (contract C5).
use crate::{auth::Ctx, error::*};
use sqlx::PgPool;
use uuid::Uuid;

pub async fn teacher_id(db: &PgPool, user: Uuid) -> ApiResult<Option<Uuid>> {
    Ok(
        sqlx::query_scalar("SELECT id FROM teachers WHERE user_id = $1")
            .bind(user)
            .fetch_optional(db)
            .await?,
    )
}
pub async fn student_id(db: &PgPool, user: Uuid) -> ApiResult<Option<Uuid>> {
    Ok(
        sqlx::query_scalar("SELECT id FROM students WHERE user_id = $1")
            .bind(user)
            .fetch_optional(db)
            .await?,
    )
}
pub async fn require_teacher(db: &PgPool, ctx: &Ctx) -> ApiResult<Uuid> {
    teacher_id(db, ctx.user_id)
        .await?
        .ok_or_else(|| ApiError::forbidden("No teacher profile"))
}
pub async fn require_student(db: &PgPool, ctx: &Ctx) -> ApiResult<Uuid> {
    student_id(db, ctx.user_id)
        .await?
        .ok_or_else(ApiError::not_found)
}
pub async fn current_session(db: &PgPool) -> ApiResult<Uuid> {
    sqlx::query_scalar("SELECT id FROM academic_sessions WHERE is_current")
        .fetch_optional(db)
        .await?
        .ok_or_else(|| {
            ApiError::conflict(
                "NO_CURRENT_SESSION",
                "No current academic session configured",
            )
        })
}
/// Teacher assigned to (section, subject) in the given session.
pub async fn teacher_assigned(
    db: &PgPool,
    teacher: Uuid,
    session: Uuid,
    section: Uuid,
    subject: Option<Uuid>,
) -> ApiResult<bool> {
    Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM teacher_assignments WHERE teacher_id=$1 AND session_id=$2 AND section_id=$3 AND ($4::uuid IS NULL OR subject_id = $4 OR is_class_teacher))")
        .bind(teacher).bind(session).bind(section).bind(subject).fetch_one(db).await?)
}
/// Can this user see the student's records? Staff: school-wide (teacher: only own sections). Student: only self. Else 404.
pub async fn can_view_student(db: &PgPool, ctx: &Ctx, student: Uuid) -> ApiResult<()> {
    use shikkhaos_domain::permissions::Role::*;
    let ok = match ctx.role {
        Headmaster | Registrar => sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM students WHERE id=$1)").bind(student).fetch_one(db).await?,
        Teacher => sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM enrollments e JOIN teacher_assignments a ON a.section_id = e.section_id AND a.session_id = e.session_id JOIN teachers t ON t.id = a.teacher_id \
                    JOIN academic_sessions s ON s.id = e.session_id AND s.is_current WHERE e.student_id=$1 AND t.user_id=$2 AND e.status='ACTIVE')").bind(student).bind(ctx.user_id).fetch_one(db).await?,
        Student => sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM students WHERE id=$1 AND user_id=$2)").bind(student).bind(ctx.user_id).fetch_one(db).await?,
    };
    if ok {
        Ok(())
    } else {
        Err(ApiError::not_found())
    }
}

/// Map an UPDATE that matched no row to 404 or VERSION_CONFLICT.
pub async fn missing_or_conflict(db: &PgPool, table: &str, id: Uuid) -> ApiError {
    let q = format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id = $1)");
    match sqlx::query_scalar::<_, bool>(&q)
        .bind(id)
        .fetch_one(db)
        .await
    {
        Ok(true) => ApiError::version_conflict(),
        Ok(false) => ApiError::not_found(),
        Err(e) => e.into(),
    }
}
