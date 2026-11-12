use std::collections::HashMap;
use axum::{extract::{Path, Query, State}, response::Response, routing::{get, post}, Router};
use serde_json::{json, Value};
use uuid::Uuid;
use crate::{audit, auth::Ctx, error::*, http::*, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new().route("/reports/{key}", get(run)).route("/reports/{key}/export", post(export))
}

async fn compute(s: &AppState, key: &str, f: &HashMap<String, String>) -> ApiResult<Vec<Value>> {
    let uid = |k: &str| f.get(k).and_then(|x| Uuid::parse_str(x).ok());
    let date = |k: &str| f.get(k).and_then(|v| chrono::NaiveDate::parse_from_str(v, "%Y-%m-%d").ok());
    let q = match key {
        "enrollment-summary" => "SELECT to_jsonb(t) FROM (SELECT c.name AS class_name, sec.name AS section_name, count(*) FILTER (WHERE e.status='ACTIVE') AS students, count(*) FILTER (WHERE e.status='ACTIVE' AND st.gender='MALE') AS male, count(*) FILTER (WHERE e.status='ACTIVE' AND st.gender='FEMALE') AS female, sec.capacity \
            FROM sections sec JOIN classes c ON c.id=sec.class_id LEFT JOIN enrollments e ON e.section_id=sec.id AND e.session_id = COALESCE($1, (SELECT id FROM academic_sessions WHERE is_current)) LEFT JOIN students st ON st.id=e.student_id GROUP BY c.name, c.\"order\", sec.name, sec.capacity ORDER BY c.\"order\", sec.name) t",
        "attendance-summary" => "SELECT to_jsonb(t) FROM (SELECT c.name AS class_name, sec.name AS section_name, count(DISTINCT a.id) AS days, count(*) FILTER (WHERE r.status='PRESENT') AS present, count(*) FILTER (WHERE r.status='ABSENT') AS absent, count(*) FILTER (WHERE r.status='LATE') AS late, round(100.0 * count(*) FILTER (WHERE r.status IN ('PRESENT','LATE')) / NULLIF(count(*),0), 1) AS percentage \
            FROM attendance_sessions a JOIN sections sec ON sec.id=a.section_id JOIN classes c ON c.id=sec.class_id JOIN attendance_records r ON r.session_id=a.id WHERE ($2::date IS NULL OR a.date >= $2) AND ($3::date IS NULL OR a.date <= $3) GROUP BY c.name, c.\"order\", sec.name ORDER BY c.\"order\", sec.name) t",
        "exam-analysis" => "SELECT to_jsonb(t) FROM (SELECT ex.name AS exam_name, c.name AS class_name, rs.status, count(*) AS students, count(*) FILTER (WHERE sr.passed) AS passed, round(100.0 * count(*) FILTER (WHERE sr.passed) / NULLIF(count(*),0), 1) AS pass_rate, round(avg(sr.gpa), 2) AS avg_gpa, max(sr.gpa) AS top_gpa \
            FROM result_sets rs JOIN exams ex ON ex.id=rs.exam_id JOIN classes c ON c.id=rs.class_id JOIN student_results sr ON sr.result_set_id=rs.id AND sr.revision=rs.current_revision WHERE ($4::uuid IS NULL OR rs.exam_id=$4) GROUP BY ex.name, ex.start_date, c.name, rs.status ORDER BY ex.start_date DESC, c.name) t",
        "teacher-submission-status" => "SELECT to_jsonb(t) FROM (SELECT tc.full_name AS teacher_name, ex.name AS exam_name, count(*) AS total, count(*) FILTER (WHERE ms.status='DRAFT') AS draft, count(*) FILTER (WHERE ms.status='SUBMITTED') AS submitted, count(*) FILTER (WHERE ms.status='UNDER_REVIEW') AS under_review, count(*) FILTER (WHERE ms.status='CORRECTION_REQUESTED') AS correction_requested, count(*) FILTER (WHERE ms.status='VERIFIED') AS verified \
            FROM mark_submissions ms JOIN teachers tc ON tc.id=ms.teacher_id JOIN exam_papers p ON p.id=ms.exam_paper_id JOIN exams ex ON ex.id=p.exam_id WHERE ($4::uuid IS NULL OR ex.id=$4) GROUP BY tc.full_name, ex.name, ex.start_date ORDER BY ex.start_date DESC, tc.full_name) t",
        "result-distribution" => "SELECT to_jsonb(t) FROM (SELECT ex.name AS exam_name, c.name AS class_name, sr.grade, count(*) AS students FROM result_sets rs JOIN exams ex ON ex.id=rs.exam_id JOIN classes c ON c.id=rs.class_id JOIN student_results sr ON sr.result_set_id=rs.id AND sr.revision=rs.current_revision WHERE ($4::uuid IS NULL OR rs.exam_id=$4) GROUP BY ex.name, ex.start_date, c.name, sr.grade ORDER BY ex.start_date DESC, c.name, sr.grade) t",
        _ => return Err(ApiError::not_found()),
    };
    Ok(sqlx::query_scalar(q).bind(uid("sessionId")).bind(date("from")).bind(date("to")).bind(uid("examId")).fetch_all(&s.db).await?)
}

async fn run(State(s): State<AppState>, ctx: Ctx, Path(key): Path<String>, Query(f): Query<HashMap<String, String>>) -> ApiResult<Response> {
    ctx.require("reports.read")?;
    Ok(ok(json!({ "key": key, "rows": compute(&s, &key, &f).await? })))
}

fn cell(v: &Value) -> String {
    let t = match v { Value::Null => String::new(), Value::String(s) => s.clone(), o => o.to_string() };
    let t = if t.starts_with(['=', '+', '-', '@']) { format!("'{t}") } else { t };
    format!("\"{}\"", t.replace('"', "\"\""))
}

async fn export(State(s): State<AppState>, ctx: Ctx, Path(key): Path<String>, Query(f): Query<HashMap<String, String>>) -> ApiResult<Response> {
    ctx.require("reports.read")?;
    let rows = compute(&s, &key, &f).await?;
    let cols: Vec<String> = rows.first().and_then(|r| r.as_object()).map(|o| o.keys().cloned().collect()).unwrap_or_default();
    let mut csv = cols.iter().map(|c| camel_key(c)).collect::<Vec<_>>().join(",") + "\n";
    for r in &rows { csv.push_str(&cols.iter().map(|c| cell(&r[c])).collect::<Vec<_>>().join(",")); csv.push('\n'); }
    audit::log(&mut *s.db.acquire().await?, &ctx, "report.exported", "report", &key, None, Some(json!({ "rows": rows.len() }))).await?;
    Ok(ok(json!({ "filename": format!("{key}.csv"), "mimeType": "text/csv", "rows": rows.len(), "content": csv })))
}
