use crate::{auth::Ctx, error::*, http::*, scope, state::AppState};
use axum::{
    extract::{Query, State},
    response::Response,
    routing::get,
    Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use shikkhaos_domain::permissions::Role;

pub fn router() -> Router<AppState> {
    Router::new().route("/search", get(search))
}

#[derive(Deserialize)]
struct Q {
    q: String,
}

/// Global search across entities the caller may see (scoped like the list endpoints).
async fn search(State(s): State<AppState>, ctx: Ctx, Query(q): Query<Q>) -> ApiResult<Response> {
    let term = q.q.trim();
    if term.chars().count() < 2 {
        return Err(ApiError::field(
            "q",
            "TOO_SHORT",
            "Type at least 2 characters",
        ));
    }
    let like = crate::http::like_pattern(term);
    let students: Vec<Value> = if ctx.has("students.read") {
        let teacher = if ctx.role == Role::Teacher {
            Some(scope::require_teacher(&s.db, &ctx).await?)
        } else {
            None
        };
        sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT st.id, st.full_name, st.student_code, c.name AS class_name, sec.name AS section_name FROM students st LEFT JOIN academic_sessions cs ON cs.is_current LEFT JOIN enrollments e ON e.student_id=st.id AND e.session_id=cs.id LEFT JOIN classes c ON c.id=e.class_id LEFT JOIN sections sec ON sec.id=e.section_id \
            WHERE (st.full_name ILIKE $1 OR st.student_code ILIKE $1) AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM teacher_assignments a WHERE a.teacher_id=$2 AND a.section_id=e.section_id AND a.session_id=cs.id)) ORDER BY st.full_name LIMIT 8) t").bind(&like).bind(teacher).fetch_all(&s.db).await?
    } else {
        vec![]
    };
    let teachers: Vec<Value> = if ctx.has("teachers.read") {
        sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT id, full_name, employee_code, designation FROM teachers WHERE full_name ILIKE $1 OR employee_code ILIKE $1 ORDER BY full_name LIMIT 8) t").bind(&like).fetch_all(&s.db).await?
    } else {
        vec![]
    };
    let notices: Vec<Value> = if ctx.has("notices.read") {
        sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT id, title, status, published_at FROM notices n WHERE title ILIKE $1 AND (n.created_by=$2 OR n.status='PUBLISHED' AND ($3 OR (jsonb_array_length(n.audience->'classIds') + jsonb_array_length(n.audience->'sectionIds') = 0 AND (n.audience->'roles' ? $4 OR jsonb_array_length(n.audience->'roles') = 0)))) ORDER BY COALESCE(published_at, created_at) DESC LIMIT 8) t").bind(&like).bind(ctx.user_id).bind(matches!(ctx.role, Role::Headmaster | Role::Registrar)).bind(ctx.role.as_str()).fetch_all(&s.db).await?
    } else {
        vec![]
    };
    let documents: Vec<Value> = if ctx.has("documents.read") {
        sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT id, title, category FROM documents WHERE title ILIKE $1 AND (visibility='ALL' OR $2) ORDER BY created_at DESC LIMIT 8) t").bind(&like).bind(ctx.is_staff()).fetch_all(&s.db).await?
    } else {
        vec![]
    };
    let exams: Vec<Value> = if ctx.has("exams.read") {
        sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT id, name, status FROM exams WHERE name ILIKE $1 ORDER BY start_date DESC LIMIT 8) t").bind(&like).fetch_all(&s.db).await?
    } else {
        vec![]
    };
    Ok(ok(
        json!({ "students": students, "teachers": teachers, "notices": notices, "documents": documents, "exams": exams }),
    ))
}
