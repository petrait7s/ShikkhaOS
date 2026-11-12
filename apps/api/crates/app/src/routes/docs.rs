//! Documents, certificates and report cards (server-generated PDFs).
use axum::{extract::{Path, Query, State}, response::Response, routing::{get, post}, Json, Router};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::{json, Value};
use shikkhaos_domain::{permissions::Role, validation as v};
use uuid::Uuid;
use crate::{audit, auth::Ctx, error::*, http::*, notify::Outbox, pdf::Pdf, routes::files::FsStorage, scope, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/documents", get(list_docs).post(create_doc))
        .route("/certificates", get(list_certs))
        .route("/certificates/issue", post(issue_cert))
        .route("/certificates/{id}", get(get_cert))
        .route("/result-sets/{id}/report-cards", post(generate_report_cards))
        .route("/report-cards/{id}", get(get_report_card))
        .route("/students/{id}/report-cards", get(student_report_cards))
}

async fn list_docs(State(s): State<AppState>, ctx: Ctx, Query(q): Query<PageQuery>) -> ApiResult<Response> {
    ctx.require("documents.read")?;
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT d.id, d.title, d.category, d.file_id, d.visibility, d.created_by, d.created_at, f.filename, f.mime_type, f.size_bytes FROM documents d JOIN files f ON f.id=d.file_id WHERE ($1::text IS NULL OR d.title ILIKE $1) AND (d.visibility='ALL' OR $2) ORDER BY d.created_at DESC, d.id LIMIT $3 OFFSET $4) t")
        .bind(q.like()).bind(ctx.is_staff()).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(crate::http::list(rows, &q))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NewDoc { title: String, category: String, file_id: Uuid, #[serde(default = "staff")] visibility: String }
fn staff() -> String { "STAFF".into() }

async fn create_doc(State(s): State<AppState>, ctx: Ctx, Json(r): Json<NewDoc>) -> ApiResult<Response> {
    ctx.require("documents.manage")?;
    v::text("title", &r.title, 1, 200)?; v::text("category", &r.category, 1, 60)?;
    if !matches!(r.visibility.as_str(), "STAFF" | "ALL") { return Err(ApiError::field("visibility", "INVALID_VALUE", "STAFF or ALL")); }
    let ok_: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM files WHERE id=$1 AND owner_id=$2 AND kind='DOCUMENT' AND status='READY')").bind(r.file_id).bind(ctx.user_id).fetch_one(&s.db).await?;
    if !ok_ { return Err(ApiError::field("fileId", "INVALID_FILE", "Upload a DOCUMENT file first and complete it")); }
    let id: Uuid = sqlx::query_scalar("INSERT INTO documents (title, category, file_id, visibility, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id").bind(r.title.trim()).bind(r.category.trim()).bind(r.file_id).bind(&r.visibility).bind(ctx.user_id).fetch_one(&s.db).await?;
    audit::log(&mut *s.db.acquire().await?, &ctx, "document.created", "document", &id.to_string(), None, None).await?;
    Ok(created(json!({ "id": id })))
}

async fn store_pdf(s: &AppState, owner: Uuid, kind: &str, name: &str, bytes: Vec<u8>) -> ApiResult<Uuid> {
    let id = Uuid::new_v4();
    FsStorage::new(&s.cfg.storage_dir).put(&id.to_string(), &bytes).await?;
    sqlx::query("INSERT INTO files (id, owner_id, kind, filename, mime_type, size_bytes, status, checksum_sha256, storage_key) VALUES ($1,$2,$3,$4,'application/pdf',$5,'READY',$6,$7)")
        .bind(id).bind(owner).bind(kind).bind(name).bind(bytes.len() as i64).bind(crate::auth::sha256_hex(&String::from_utf8_lossy(&bytes))).bind(id.to_string()).execute(&s.db).await?;
    Ok(id)
}

struct School { name: String, address: String }
async fn school(db: &sqlx::PgPool) -> ApiResult<School> { let r: (String, String) = sqlx::query_as("SELECT name, address FROM school_profile WHERE id=1").fetch_one(db).await?; Ok(School { name: r.0, address: r.1 }) }

fn report_card_pdf(sc: &School, exam: &str, student: &(String, String, String, i32), row: &(Decimal, Option<Decimal>, String, bool, Option<i32>, i32, Value), subjects: &[(String, Value)]) -> Vec<u8> {
    let mut pdf = Pdf::new();
    let p = pdf.page();
    p.text(50.0, 790.0, 18.0, true, &sc.name);
    p.text(50.0, 774.0, 10.0, false, &sc.address);
    p.text(50.0, 746.0, 14.0, true, &format!("Report Card - {exam}"));
    p.line(50.0, 738.0, 545.0, 738.0);
    p.text(50.0, 720.0, 11.0, false, &format!("Student: {}", student.0));
    p.text(320.0, 720.0, 11.0, false, &format!("ID: {}", student.1));
    p.text(50.0, 704.0, 11.0, false, &format!("Class/Section: {}", student.2));
    p.text(320.0, 704.0, 11.0, false, &format!("Roll: {}", student.3));
    let mut y = 676.0;
    for (x, h) in [(50.0, "Subject"), (300.0, "Full"), (360.0, "Marks"), (430.0, "Grade"), (490.0, "GP")] { p.text(x, y, 11.0, true, h); }
    p.line(50.0, y - 6.0, 545.0, y - 6.0);
    y -= 22.0;
    for (name, x) in subjects {
        let marks = if x["absent"] == true { "ABS".to_string() } else { format!("{}", x["marks"].as_f64().unwrap_or(0.0)) };
        p.text(50.0, y, 11.0, false, name);
        p.text(300.0, y, 11.0, false, &format!("{}", x["fullMarks"].as_f64().unwrap_or(0.0)));
        p.text(360.0, y, 11.0, false, &marks);
        p.text(430.0, y, 11.0, false, x["grade"].as_str().unwrap_or("-"));
        p.text(490.0, y, 11.0, false, &format!("{:.2}", x["gradePoint"].as_f64().unwrap_or(0.0)));
        y -= 18.0;
    }
    p.line(50.0, y + 8.0, 545.0, y + 8.0);
    y -= 14.0;
    p.text(50.0, y, 12.0, true, &format!("Total: {}   GPA: {}   Grade: {}   Position: {}", row.0, row.1.map(|g| format!("{g:.2}")).unwrap_or("-".into()), row.2, row.4.map(|x| x.to_string()).unwrap_or("-".into())));
    y -= 20.0;
    p.text(50.0, y, 12.0, true, if row.3 { "Result: PASSED" } else { "Result: FAILED" });
    p.text(50.0, 70.0, 9.0, false, &format!("Official result revision {}. Generated by ShikkhaOS. Signature: ____________________", row.5));
    pdf.finish()
}

/// Generate (or return existing) report cards for every student of a PUBLISHED result set, for the published revision.
async fn generate_report_cards(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    ctx.require("reportcards.generate")?;
    let rs: Option<(String, i32, String, Uuid)> = sqlx::query_as("SELECT rs.status, rs.published_revision, e.name, e.session_id FROM result_sets rs JOIN exams e ON e.id=rs.exam_id WHERE rs.id=$1").bind(id).fetch_optional(&s.db).await?;
    let (status, rev, exam, session) = rs.ok_or_else(ApiError::not_found)?;
    if status != "PUBLISHED" { return Err(ApiError::conflict("NOT_PUBLISHED", "Report cards are generated only for published results")); }
    let sc = school(&s.db).await?;
    let rows: Vec<(Uuid, Uuid, String, String, String, i32, Decimal, Option<Decimal>, String, bool, Option<i32>, Value)> = sqlx::query_as(
        "SELECT st.id, st.user_id, st.full_name, st.student_code, c.name || '-' || sec.name, COALESCE(e.roll_no,0), sr.total_marks, sr.gpa, sr.grade, sr.passed, sr.position, sr.subjects FROM student_results sr JOIN students st ON st.id=sr.student_id JOIN sections sec ON sec.id=sr.section_id JOIN classes c ON c.id=sec.class_id \
         LEFT JOIN enrollments e ON e.student_id=st.id AND e.session_id=$3 WHERE sr.result_set_id=$1 AND sr.revision=$2 ORDER BY e.roll_no").bind(id).bind(rev).bind(session).fetch_all(&s.db).await?;
    let names: std::collections::HashMap<String, String> = sqlx::query_as::<_, (Uuid, String)>("SELECT id, name FROM subjects").fetch_all(&s.db).await?.into_iter().map(|(i, n)| (i.to_string(), n)).collect();
    let mut made = 0; let mut users = vec![];
    for (sid, uid, name, code, cls, roll, total, gpa, grade, passed, pos, subjects) in rows {
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM report_cards WHERE result_set_id=$1 AND student_id=$2 AND revision=$3)").bind(id).bind(sid).bind(rev).fetch_one(&s.db).await?;
        if exists { continue; }
        let subs: Vec<(String, Value)> = subjects.as_array().cloned().unwrap_or_default().into_iter().map(|x| (names.get(x["subjectId"].as_str().unwrap_or("")).cloned().unwrap_or("Subject".into()), x)).collect();
        let bytes = report_card_pdf(&sc, &exam, &(name, code.clone(), cls, roll), &(total, gpa, grade, passed, pos, rev, Value::Null), &subs);
        let fid = store_pdf(&s, ctx.user_id, "REPORT_CARD", &format!("report-card-{code}-r{rev}.pdf"), bytes).await?;
        sqlx::query("INSERT INTO report_cards (result_set_id, student_id, revision, file_id, generated_by) VALUES ($1,$2,$3,$4,$5)").bind(id).bind(sid).bind(rev).bind(fid).bind(ctx.user_id).execute(&s.db).await?;
        made += 1; users.push(uid);
    }
    audit::log(&mut *s.db.acquire().await?, &ctx, "report_cards.generated", "result_set", &id.to_string(), None, Some(json!({ "generated": made }))).await?;
    let _ = Outbox::new();
    Ok(ok(json!({ "resultSetId": id, "revision": rev, "generated": made })))
}

async fn get_report_card(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    let r: Option<(Uuid, Uuid, i32, Uuid, Uuid)> = sqlx::query_as("SELECT rc.student_id, rc.result_set_id, rc.revision, rc.file_id, st.user_id FROM report_cards rc JOIN students st ON st.id=rc.student_id WHERE rc.id=$1").bind(id).fetch_optional(&s.db).await?;
    let (student, rs, rev, file, user) = r.ok_or_else(ApiError::not_found)?;
    if ctx.role == Role::Student { if user != ctx.user_id { return Err(ApiError::not_found()); } ctx.require("reportcards.read_own")?; } else { ctx.require("reportcards.generate")?; }
    Ok(ok(json!({ "id": id, "studentId": student, "resultSetId": rs, "revision": rev, "fileId": file })))
}

async fn student_report_cards(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    scope::can_view_student(&s.db, &ctx, id).await?;
    if ctx.role == Role::Student { ctx.require("reportcards.read_own")?; } else { ctx.require("reportcards.generate")?; }
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT rc.id, rc.result_set_id, ex.name AS exam_name, rc.revision, rc.file_id, rc.created_at FROM report_cards rc JOIN result_sets rs ON rs.id=rc.result_set_id AND rs.status='PUBLISHED' AND rc.revision=rs.published_revision JOIN exams ex ON ex.id=rs.exam_id WHERE rc.student_id=$1 ORDER BY rc.created_at DESC) t").bind(id).fetch_all(&s.db).await?;
    Ok(ok(Value::Array(rows)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Issue { student_id: Uuid, #[serde(rename = "type")] ty: String, remarks: Option<String> }

async fn issue_cert(State(s): State<AppState>, ctx: Ctx, Json(r): Json<Issue>) -> ApiResult<Response> {
    ctx.require("certificates.issue")?;
    if !matches!(r.ty.as_str(), "CHARACTER" | "TRANSFER" | "STUDYING" | "BONAFIDE" | "OTHER") { return Err(ApiError::field("type", "INVALID_VALUE", "Unknown certificate type")); }
    if let Some(x) = &r.remarks { v::text("remarks", x, 0, 500)?; }
    let stu: Option<(String, String, String)> = sqlx::query_as("SELECT full_name, student_code, guardian_name FROM students WHERE id=$1").bind(r.student_id).fetch_optional(&s.db).await?;
    let (name, code, guardian) = stu.ok_or_else(|| ApiError::field("studentId", "NOT_FOUND", "Student not found"))?;
    let cls: Option<String> = sqlx::query_scalar("SELECT c.name || '-' || sec.name FROM enrollments e JOIN classes c ON c.id=e.class_id JOIN sections sec ON sec.id=e.section_id JOIN academic_sessions s ON s.id=e.session_id AND s.is_current WHERE e.student_id=$1 AND e.status='ACTIVE'").bind(r.student_id).fetch_optional(&s.db).await?;
    let sc = school(&s.db).await?;
    let seq: i64 = sqlx::query_scalar("SELECT nextval('certificate_serial')").fetch_one(&s.db).await?;
    let serial = format!("CERT-{}-{:06}", chrono::Utc::now().format("%Y"), seq);
    let title = match r.ty.as_str() { "CHARACTER" => "Character Certificate", "TRANSFER" => "Transfer Certificate", "STUDYING" => "Certificate of Enrollment", "BONAFIDE" => "Bonafide Certificate", _ => "Certificate" };
    let mut pdf = Pdf::new();
    let p = pdf.page();
    p.rect(30.0, 30.0, 535.0, 782.0);
    p.text(60.0, 760.0, 20.0, true, &sc.name);
    p.text(60.0, 742.0, 10.0, false, &sc.address);
    p.text(60.0, 690.0, 18.0, true, title);
    p.text(60.0, 650.0, 12.0, false, &format!("This is to certify that {name} (ID {code}), ward of {guardian},"));
    p.text(60.0, 632.0, 12.0, false, &format!("{} is a student of this school{}.", "", cls.map(|c| format!(" in {c}")).unwrap_or_default()));
    if let Some(x) = &r.remarks { p.text(60.0, 604.0, 11.0, false, x); }
    p.text(60.0, 120.0, 10.0, false, &format!("Serial: {serial}   Issued: {}", chrono::Utc::now().format("%Y-%m-%d")));
    p.text(380.0, 100.0, 11.0, false, "Authorized signature");
    p.line(380.0, 112.0, 540.0, 112.0);
    let fid = store_pdf(&s, ctx.user_id, "CERTIFICATE", &format!("{serial}.pdf"), pdf.finish()).await?;
    let id: Uuid = sqlx::query_scalar("INSERT INTO certificates (student_id, type, serial_no, issued_by, file_id, remarks) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id").bind(r.student_id).bind(&r.ty).bind(&serial).bind(ctx.user_id).bind(fid).bind(&r.remarks).fetch_one(&s.db).await?;
    audit::log(&mut *s.db.acquire().await?, &ctx, "certificate.issued", "certificate", &id.to_string(), None, Some(json!({ "serialNo": serial, "type": r.ty }))).await?;
    Ok(created(json!({ "id": id, "serialNo": serial, "fileId": fid, "type": r.ty })))
}

async fn list_certs(State(s): State<AppState>, ctx: Ctx, Query(q): Query<PageQuery>) -> ApiResult<Response> {
    let student_only = ctx.role == Role::Student;
    if !student_only { ctx.require("certificates.issue")?; }
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT c.id, c.student_id, st.full_name, c.type, c.serial_no, c.issued_at, c.file_id FROM certificates c JOIN students st ON st.id=c.student_id WHERE (NOT $1 OR st.user_id=$2) ORDER BY c.issued_at DESC, c.id LIMIT $3 OFFSET $4) t").bind(student_only).bind(ctx.user_id).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(crate::http::list(rows, &q))
}

async fn get_cert(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    let r: Option<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT c.id, c.student_id, st.user_id, c.type, c.serial_no, c.issued_at, c.file_id, c.remarks FROM certificates c JOIN students st ON st.id=c.student_id WHERE c.id=$1) t").bind(id).fetch_optional(&s.db).await?;
    let mut r = r.ok_or_else(ApiError::not_found)?;
    let owner = r["user_id"].as_str() == Some(&ctx.user_id.to_string());
    if !owner && !ctx.has("certificates.issue") { return Err(ApiError::not_found()); }
    r.as_object_mut().unwrap().remove("user_id");
    Ok(ok(r))
}
