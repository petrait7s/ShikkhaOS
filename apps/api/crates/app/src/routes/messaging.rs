use std::collections::HashMap;
use axum::{extract::{Path, Query, State}, response::Response, routing::{delete, get, patch, post}, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use shikkhaos_domain::{messaging as policy, permissions::Role, validation as v};
use uuid::Uuid;

use crate::{audit, auth::Ctx, error::*, http::*, notify::Outbox, scope, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/conversations", get(list_conversations).post(create_direct))
        .route("/conversations/{id}", patch(patch_conversation))
        .route("/conversations/{id}/messages", get(list_messages).post(post_message))
        .route("/conversations/{id}/read", post(mark_read))
        .route("/messages/{id}", delete(delete_message))
        .route("/messages/{id}/report", post(report))
        .route("/moderation/reports", get(list_reports))
        .route("/moderation/reports/{id}/resolve", post(resolve_report))
        .route("/messaging/recipients", get(recipients))
        .route("/channels", get(list_channels))
        .route("/channels/{id}/posts", post(post_message))
}

struct Features { teacher: bool, admin: bool }
async fn features(db: &sqlx::PgPool) -> ApiResult<Features> {
    let f: Value = sqlx::query_scalar("SELECT features FROM school_profile WHERE id=1").fetch_optional(db).await?.unwrap_or(json!({}));
    Ok(Features { teacher: f["studentToTeacherMessaging"].as_bool().unwrap_or(true), admin: f["studentToAdminMessaging"].as_bool().unwrap_or(true) })
}

/// Does a teacher (by user id) teach the student (by user id) in the current session?
async fn teaches(db: &sqlx::PgPool, teacher_user: Uuid, student_user: Uuid) -> ApiResult<bool> {
    Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM teachers t JOIN teacher_assignments a ON a.teacher_id=t.id JOIN academic_sessions s ON s.id=a.session_id AND s.is_current JOIN enrollments e ON e.section_id=a.section_id AND e.session_id=s.id AND e.status='ACTIVE' JOIN students st ON st.id=e.student_id WHERE t.user_id=$1 AND st.user_id=$2)")
        .bind(teacher_user).bind(student_user).fetch_one(db).await?)
}

async fn check_dm(db: &sqlx::PgPool, sender: &Ctx, other: Uuid) -> ApiResult<()> {
    let row: Option<(String, String)> = sqlx::query_as("SELECT role, status FROM users WHERE id=$1").bind(other).fetch_optional(db).await?;
    let (role, status) = row.ok_or_else(ApiError::not_found)?;
    if status != "ACTIVE" { return Err(ApiError::not_found()); }
    let rr = Role::parse(&role).ok_or_else(ApiError::internal)?;
    let f = features(db).await?;
    let (teacher_u, student_u) = match (sender.role, rr) { (Role::Teacher, Role::Student) => (Some(sender.user_id), Some(other)), (Role::Student, Role::Teacher) => (Some(other), Some(sender.user_id)), _ => (None, None) };
    let teaches_ = match (teacher_u, student_u) { (Some(t), Some(s)) => teaches(db, t, s).await?, _ => false };
    policy::can_start_direct(&policy::DmContext { sender: sender.role, recipient: rr, same_user: sender.user_id == other, teacher_teaches_student: teaches_, student_to_teacher_enabled: f.teacher, student_to_admin_enabled: f.admin })
        .map_err(|d| ApiError::forbidden_code(d.code(), "You are not allowed to message this person"))
}

async fn list_conversations(State(s): State<AppState>, ctx: Ctx, Query(q): Query<PageQuery>) -> ApiResult<Response> {
    ctx.require("messages.read")?;
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT c.id, c.type, c.title, c.channel_kind, c.section_id, c.students_can_post, c.is_read_only_for_students, c.last_message_at, \
        CASE WHEN c.type='DIRECT' THEN (SELECT jsonb_build_object('userId',u.id,'displayName',u.display_name,'role',u.role) FROM conversation_members m2 JOIN users u ON u.id=m2.user_id WHERE m2.conversation_id=c.id AND m2.user_id<>$1) END AS peer, \
        (SELECT to_jsonb(lm) FROM (SELECT id, sender_id, CASE WHEN moderation_state='HIDDEN' THEN '' ELSE left(body,120) END AS preview, created_at FROM messages WHERE conversation_id=c.id AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1) lm) AS last_message, \
        (SELECT count(*) FROM messages mm WHERE mm.conversation_id=c.id AND mm.sender_id<>$1 AND mm.deleted_at IS NULL AND mm.created_at > COALESCE((SELECT created_at FROM messages WHERE id=cm.last_read_message_id), 'epoch'::timestamptz)) AS unread \
        FROM conversations c LEFT JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=$1 \
        WHERE (cm.user_id IS NOT NULL OR (c.type='CHANNEL' AND (c.channel_kind='ANNOUNCEMENTS' OR ($2 AND c.channel_kind='STAFF')))) \
        AND ($3::text IS NULL OR c.title ILIKE $3) ORDER BY c.last_message_at DESC NULLS LAST, c.id LIMIT $4 OFFSET $5) t")
        .bind(ctx.user_id).bind(ctx.is_staff()).bind(q.like()).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(crate::http::list(rows, &q))
}

async fn list_channels(State(s): State<AppState>, ctx: Ctx, Query(q): Query<PageQuery>) -> ApiResult<Response> {
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT id, type, title, channel_kind, is_read_only_for_students, last_message_at FROM conversations WHERE type='CHANNEL' AND (channel_kind='ANNOUNCEMENTS' OR ($1 AND channel_kind='STAFF')) ORDER BY title LIMIT $2 OFFSET $3) t").bind(ctx.is_staff()).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(crate::http::list(rows, &q))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NewConv { #[serde(rename = "type")] ty: String, recipient_id: Uuid }

async fn create_direct(State(s): State<AppState>, ctx: Ctx, Json(r): Json<NewConv>) -> ApiResult<Response> {
    ctx.require("messages.send_direct")?;
    if r.ty != "DIRECT" { return Err(ApiError::field("type", "INVALID_VALUE", "Only DIRECT conversations can be created; groups follow enrollment")); }
    check_dm(&s.db, &ctx, r.recipient_id).await?;
    let (a, b) = if ctx.user_id < r.recipient_id { (ctx.user_id, r.recipient_id) } else { (r.recipient_id, ctx.user_id) };
    let key = format!("{a}:{b}");
    let mut tx = s.db.begin().await?;
    let existing: Option<Uuid> = sqlx::query_scalar("SELECT id FROM conversations WHERE direct_key=$1").bind(&key).fetch_optional(&mut *tx).await?;
    let (id, is_new) = match existing { Some(i) => (i, false), None => {
        let i: Uuid = sqlx::query_scalar("INSERT INTO conversations (type, direct_key) VALUES ('DIRECT',$1) RETURNING id").bind(&key).fetch_one(&mut *tx).await?;
        for u in [a, b] { sqlx::query("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1,$2,'MEMBER')").bind(i).bind(u).execute(&mut *tx).await?; }
        (i, true) } };
    tx.commit().await?;
    if is_new { s.hub.send(r.recipient_id, "conversation.created", json!({ "conversationId": id })); }
    let v: Value = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT id, type, last_message_at, created_at FROM conversations WHERE id=$1) t").bind(id).fetch_one(&s.db).await?;
    Ok(if is_new { created(v) } else { ok(v) })
}

struct Conv { ty: String, kind: Option<String>, students_can_post: bool, section: Option<Uuid> }
async fn conv(db: &sqlx::PgPool, id: Uuid) -> ApiResult<Conv> {
    let r: Option<(String, Option<String>, bool, Option<Uuid>)> = sqlx::query_as("SELECT type, channel_kind, students_can_post, section_id FROM conversations WHERE id=$1").bind(id).fetch_optional(db).await?;
    let r = r.ok_or_else(ApiError::not_found)?;
    Ok(Conv { ty: r.0, kind: r.1, students_can_post: r.2, section: r.3 })
}

async fn is_member(db: &sqlx::PgPool, conv: Uuid, user: Uuid) -> ApiResult<bool> {
    Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2)").bind(conv).bind(user).fetch_one(db).await?)
}

fn channel_visible(c: &Conv, ctx: &Ctx) -> bool { c.ty == "CHANNEL" && (c.kind.as_deref() == Some("ANNOUNCEMENTS") || ctx.is_staff()) }

/// Read access: member, visible channel, or a moderator (every moderator read is audit-logged).
async fn can_read(s: &AppState, ctx: &Ctx, id: Uuid, c: &Conv) -> ApiResult<bool> {
    if is_member(&s.db, id, ctx.user_id).await? || channel_visible(c, ctx) { return Ok(false); }
    if ctx.has("moderation.review") { return Ok(true); }
    Err(ApiError::not_found())
}

#[derive(Deserialize)]
struct MsgQ { before: Option<Uuid> }

async fn list_messages(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>, Query(q): Query<PageQuery>, Query(_m): Query<MsgQ>) -> ApiResult<Response> {
    ctx.require("messages.read")?;
    let c = conv(&s.db, id).await?;
    let moderator_read = can_read(&s, &ctx, id, &c).await?;
    if moderator_read { audit::log(&mut *s.db.acquire().await?, &ctx, "conversation.read_by_moderator", "conversation", &id.to_string(), None, None).await?; }
    let moderator = ctx.has("moderation.review");
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT m.id, m.conversation_id, m.sender_id, u.display_name AS sender_name, u.role AS sender_role, \
        CASE WHEN m.deleted_at IS NOT NULL THEN '[message deleted]' WHEN m.moderation_state='HIDDEN' AND NOT $2 THEN '[message removed by moderator]' ELSE m.body END AS body, m.kind, \
        CASE WHEN m.deleted_at IS NOT NULL OR (m.moderation_state='HIDDEN' AND NOT $2) THEN '{}'::uuid[] ELSE m.attachment_file_ids END AS attachment_file_ids, m.reply_to_id, m.moderation_state, m.edited_at, m.deleted_at, m.created_at \
        FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=$1 ORDER BY m.created_at DESC, m.id DESC LIMIT $3 OFFSET $4) t")
        .bind(id).bind(moderator).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(crate::http::list(rows, &q))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PostMsg { body: String, client_message_id: Option<Uuid>, #[serde(default)] attachment_file_ids: Vec<Uuid>, reply_to_id: Option<Uuid> }

async fn post_message(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>, Json(r): Json<PostMsg>) -> ApiResult<Response> {
    let (msg, dup) = send_message(&s, &ctx, id, r.body, r.client_message_id, r.attachment_file_ids, r.reply_to_id).await?;
    Ok(if dup { ok(msg) } else { created(msg) })
}

/// Shared by REST and WebSocket. Enforces membership, posting rules, DM policy, suspension, rate limit, idempotency.
pub async fn send_message(s: &AppState, ctx: &Ctx, conv_id: Uuid, body: String, client_id: Option<Uuid>, files: Vec<Uuid>, reply_to: Option<Uuid>) -> ApiResult<(Value, bool)> {
    ctx.require_any(&["messages.send_direct", "messages.send_group", "channels.post_official"])?;
    v::text("body", &body, 1, 4000)?;
    if files.len() > 5 { return Err(ApiError::field("attachmentFileIds", "OUT_OF_RANGE", "At most 5 attachments")); }
    let c = conv(&s.db, conv_id).await?;
    let member = is_member(&s.db, conv_id, ctx.user_id).await?;
    if !member && !channel_visible(&c, ctx) { return Err(ApiError::not_found()); }
    let suspended: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar("SELECT messaging_suspended_until FROM users WHERE id=$1").bind(ctx.user_id).fetch_one(&s.db).await?;
    if suspended.map(|t| t > chrono::Utc::now()).unwrap_or(false) { return Err(ApiError::forbidden_code("MESSAGING_SUSPENDED", "Your messaging has been suspended")); }
    let official = match c.kind.as_deref() { Some("ANNOUNCEMENTS") => ctx.has("channels.post_official"), Some("STAFF") => ctx.is_staff() && ctx.has("messages.send_group"), _ => false };
    if !policy::can_post(ctx.role, &c.ty, c.students_can_post, official) { return Err(ApiError::forbidden_code("POSTING_NOT_ALLOWED", "You cannot post in this conversation")); }
    if c.ty == "DIRECT" {
        ctx.require("messages.send_direct")?;
        let other: Uuid = sqlx::query_scalar("SELECT user_id FROM conversation_members WHERE conversation_id=$1 AND user_id<>$2").bind(conv_id).bind(ctx.user_id).fetch_one(&s.db).await?;
        check_dm(&s.db, ctx, other).await?;
    } else if c.ty == "CLASS_GROUP" && ctx.role != Role::Student { ctx.require("messages.send_group")?; }
    if let Some(cid) = client_id {
        if let Some(existing) = sqlx::query_scalar::<_, Value>("SELECT to_jsonb(t) FROM (SELECT id, conversation_id, sender_id, body, kind, attachment_file_ids, reply_to_id, created_at FROM messages WHERE sender_id=$1 AND client_message_id=$2) t").bind(ctx.user_id).bind(cid).fetch_optional(&s.db).await? { return Ok((existing, true)); }
    }
    let recent: i64 = sqlx::query_scalar("SELECT count(*) FROM messages WHERE sender_id=$1 AND created_at > now() - interval '60 seconds'").bind(ctx.user_id).fetch_one(&s.db).await?;
    if recent >= 30 { let mut e = ApiError::new(429, "RATE_LIMITED", "Too many messages; slow down"); e.retry_after = Some(30); return Err(e); }
    if !files.is_empty() {
        let n: i64 = sqlx::query_scalar("SELECT count(*) FROM files WHERE id = ANY($1) AND owner_id=$2 AND status='READY'").bind(&files).bind(ctx.user_id).fetch_one(&s.db).await?;
        if n != files.len() as i64 { return Err(ApiError::field("attachmentFileIds", "INVALID_FILE", "Attachments must be your own uploaded, ready files")); }
    }
    if let Some(rt) = reply_to { let ok_: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM messages WHERE id=$1 AND conversation_id=$2)").bind(rt).bind(conv_id).fetch_one(&s.db).await?; if !ok_ { return Err(ApiError::field("replyToId", "NOT_FOUND", "Reply target not in this conversation")); } }
    let mut tx = s.db.begin().await?;
    let msg: Value = sqlx::query_scalar("WITH ins AS (INSERT INTO messages (conversation_id, sender_id, body, client_message_id, attachment_file_ids, reply_to_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, conversation_id, sender_id, body, kind, attachment_file_ids, reply_to_id, created_at) SELECT to_jsonb(ins) FROM ins")
        .bind(conv_id).bind(ctx.user_id).bind(body.trim()).bind(client_id).bind(&files).bind(reply_to).fetch_one(&mut *tx).await?;
    sqlx::query("UPDATE conversations SET last_message_at=now() WHERE id=$1").bind(conv_id).execute(&mut *tx).await?;
    let members: Vec<Uuid> = if c.ty == "CHANNEL" { vec![] } else { sqlx::query_scalar("SELECT user_id FROM conversation_members WHERE conversation_id=$1").bind(conv_id).fetch_all(&mut *tx).await? };
    let mut ob = Outbox::new();
    if c.ty == "DIRECT" {
        let rec: Vec<Uuid> = members.iter().copied().filter(|u| *u != ctx.user_id).collect();
        ob.notify(&mut tx, &rec, "MESSAGE_RECEIVED", "New message", "You have a new message.", "conversation", &conv_id.to_string(), &format!("messages/{conv_id}")).await?;
    }
    tx.commit().await?;
    let mut payload = msg.clone();
    payload["senderName"] = json!(ctx.user_id); // replaced client-side by display lookup; kept minimal
    let targets: Vec<Uuid> = if c.ty == "CHANNEL" { s.hub.online_users() } else { members };
    for u in targets { ob.event(u, "message.created", crate::http::camel(msg.clone())); }
    ob.flush(&s.hub);
    Ok((msg, false))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ReadReq { message_id: Option<Uuid> }

pub async fn set_read(s: &AppState, ctx: &Ctx, conv_id: Uuid, message_id: Option<Uuid>) -> ApiResult<()> {
    let c = conv(&s.db, conv_id).await?;
    let member = is_member(&s.db, conv_id, ctx.user_id).await?;
    if !member && !channel_visible(&c, ctx) { return Err(ApiError::not_found()); }
    let latest: Option<Uuid> = match message_id { Some(m) => Some(m), None => sqlx::query_scalar("SELECT id FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC, id DESC LIMIT 1").bind(conv_id).fetch_optional(&s.db).await? };
    sqlx::query("INSERT INTO conversation_members (conversation_id, user_id, last_read_message_id) VALUES ($1,$2,$3) ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id").bind(conv_id).bind(ctx.user_id).bind(latest).execute(&s.db).await?;
    if c.ty != "CHANNEL" {
        let others: Vec<Uuid> = sqlx::query_scalar("SELECT user_id FROM conversation_members WHERE conversation_id=$1 AND user_id<>$2").bind(conv_id).bind(ctx.user_id).fetch_all(&s.db).await?;
        s.hub.send_many(&others, "conversation.read", &json!({ "conversationId": conv_id, "userId": ctx.user_id, "messageId": latest }));
    }
    Ok(())
}

async fn mark_read(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>, body: Option<Json<ReadReq>>) -> ApiResult<Response> {
    set_read(&s, &ctx, id, body.and_then(|b| b.0.message_id)).await?;
    Ok(ok(json!({ "read": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PatchConv { students_can_post: Option<bool> }

async fn patch_conversation(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>, Json(r): Json<PatchConv>) -> ApiResult<Response> {
    let c = conv(&s.db, id).await?;
    if c.ty != "CLASS_GROUP" { return Err(ApiError::bad_request("Only class groups have this setting")); }
    let sec = c.section.ok_or_else(ApiError::internal)?;
    let allowed = match ctx.role {
        Role::Headmaster => true,
        Role::Teacher => { let t = scope::require_teacher(&s.db, &ctx).await?; let ses = scope::current_session(&s.db).await?; scope::teacher_assigned(&s.db, t, ses, sec, None).await? }
        _ => false,
    };
    if !allowed { return Err(ApiError::not_found()); }
    if let Some(b) = r.students_can_post { sqlx::query("UPDATE conversations SET students_can_post=$2, version=version+1, updated_at=now() WHERE id=$1").bind(id).bind(b).execute(&s.db).await?; }
    audit::log(&mut *s.db.acquire().await?, &ctx, "conversation.updated", "conversation", &id.to_string(), None, Some(json!({ "studentsCanPost": r.students_can_post }))).await?;
    let v: Value = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT id, type, title, students_can_post, version FROM conversations WHERE id=$1) t").bind(id).fetch_one(&s.db).await?;
    Ok(ok(v))
}

async fn delete_message(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>) -> ApiResult<Response> {
    let row: Option<(Uuid, Uuid)> = sqlx::query_as("SELECT sender_id, conversation_id FROM messages WHERE id=$1 AND deleted_at IS NULL").bind(id).fetch_optional(&s.db).await?;
    let (sender, conv_id) = row.ok_or_else(ApiError::not_found)?;
    if sender != ctx.user_id { return Err(ApiError::not_found()); }
    sqlx::query("UPDATE messages SET deleted_at=now() WHERE id=$1").bind(id).execute(&s.db).await?;
    let members: Vec<Uuid> = sqlx::query_scalar("SELECT user_id FROM conversation_members WHERE conversation_id=$1").bind(conv_id).fetch_all(&s.db).await?;
    s.hub.send_many(&members, "message.deleted", &json!({ "messageId": id, "conversationId": conv_id }));
    Ok(ok(json!({ "deleted": true })))
}

#[derive(Deserialize)]
struct ReportReq { reason: String }

async fn report(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>, Json(r): Json<ReportReq>) -> ApiResult<Response> {
    ctx.require("moderation.report")?;
    v::text("reason", &r.reason, 3, 1000)?;
    let conv_id: Uuid = sqlx::query_scalar("SELECT conversation_id FROM messages WHERE id=$1").bind(id).fetch_optional(&s.db).await?.ok_or_else(ApiError::not_found)?;
    let c = conv(&s.db, conv_id).await?;
    if !is_member(&s.db, conv_id, ctx.user_id).await? && !channel_visible(&c, &ctx) { return Err(ApiError::not_found()); }
    let mut tx = s.db.begin().await?;
    let rid: Uuid = sqlx::query_scalar("INSERT INTO message_reports (message_id, reported_by, reason) VALUES ($1,$2,$3) RETURNING id").bind(id).bind(ctx.user_id).bind(r.reason.trim()).fetch_one(&mut *tx).await?;
    sqlx::query("UPDATE messages SET moderation_state='REPORTED' WHERE id=$1 AND moderation_state='OK'").bind(id).execute(&mut *tx).await?;
    audit::log(&mut tx, &ctx, "message.reported", "message", &id.to_string(), None, None).await?;
    let mods: Vec<Uuid> = sqlx::query_scalar("SELECT u.id FROM users u WHERE u.status='ACTIVE' AND (u.role='HEADMASTER' OR EXISTS (SELECT 1 FROM permission_grants g WHERE g.user_id=u.id AND g.permission='moderation.review' AND g.effect='GRANT'))").fetch_all(&mut *tx).await?;
    let mut ob = Outbox::new();
    ob.notify(&mut tx, &mods, "MESSAGE_REPORTED", "Message reported", "A message was reported for review.", "message_report", &rid.to_string(), "moderation").await?;
    for u in &mods { ob.event(*u, "moderation.report_created", json!({ "reportId": rid })); }
    tx.commit().await?;
    ob.flush(&s.hub);
    Ok(created(json!({ "id": rid, "status": "OPEN" })))
}

async fn list_reports(State(s): State<AppState>, ctx: Ctx, Query(q): Query<PageQuery>, Query(f): Query<HashMap<String, String>>) -> ApiResult<Response> {
    ctx.require("moderation.review")?;
    let rows: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT r.id, r.status, r.reason, r.created_at, r.reviewed_by, r.review_note, m.id AS message_id, m.conversation_id, m.body, m.moderation_state, m.sender_id, su.display_name AS sender_name, ru.display_name AS reporter_name \
        FROM message_reports r JOIN messages m ON m.id=r.message_id JOIN users su ON su.id=m.sender_id JOIN users ru ON ru.id=r.reported_by WHERE ($1::text IS NULL OR r.status=$1) ORDER BY r.created_at DESC, r.id LIMIT $2 OFFSET $3) t").bind(f.get("status")).bind(q.limit() + 1).bind(q.offset()).fetch_all(&s.db).await?;
    Ok(crate::http::list(rows, &q))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Resolve { action: String, note: Option<String>, suspend_sender_hours: Option<i32> }

async fn resolve_report(State(s): State<AppState>, ctx: Ctx, Path(id): Path<Uuid>, Json(r): Json<Resolve>) -> ApiResult<Response> {
    ctx.require("moderation.review")?;
    if !matches!(r.action.as_str(), "DISMISS" | "HIDE" | "ACTION") { return Err(ApiError::field("action", "INVALID_VALUE", "DISMISS, HIDE or ACTION")); }
    if r.action != "DISMISS" && r.note.as_deref().unwrap_or("").trim().is_empty() { return Err(ApiError::field("note", "REQUIRED", "A note is required")); }
    let (mid, status): (Uuid, String) = sqlx::query_as("SELECT message_id, status FROM message_reports WHERE id=$1").bind(id).fetch_optional(&s.db).await?.ok_or_else(ApiError::not_found)?;
    if status != "OPEN" { return Err(ApiError::invalid_transition("Report already resolved")); }
    let mut tx = s.db.begin().await?;
    let new_status = match r.action.as_str() { "DISMISS" => "DISMISSED", "HIDE" => "REVIEWED", _ => "ACTIONED" };
    sqlx::query("UPDATE message_reports SET status=$2, reviewed_by=$3, review_note=$4 WHERE id=$1").bind(id).bind(new_status).bind(ctx.user_id).bind(&r.note).execute(&mut *tx).await?;
    if r.action != "DISMISS" { sqlx::query("UPDATE messages SET moderation_state='HIDDEN' WHERE id=$1").bind(mid).execute(&mut *tx).await?; }
    else { sqlx::query("UPDATE messages SET moderation_state='OK' WHERE id=$1 AND moderation_state='REPORTED' AND NOT EXISTS (SELECT 1 FROM message_reports WHERE message_id=$1 AND status='OPEN')").bind(mid).execute(&mut *tx).await?; }
    if let (Some(h), "ACTION") = (r.suspend_sender_hours, r.action.as_str()) {
        if !(1..=24 * 30).contains(&h) { return Err(ApiError::field("suspendSenderHours", "OUT_OF_RANGE", "1 to 720 hours")); }
        sqlx::query("UPDATE users SET messaging_suspended_until = now() + make_interval(hours => $2) WHERE id = (SELECT sender_id FROM messages WHERE id=$1)").bind(mid).bind(h).execute(&mut *tx).await?;
    }
    audit::log(&mut tx, &ctx, &format!("moderation.{}", r.action.to_lowercase()), "message_report", &id.to_string(), None, Some(json!({ "messageId": mid, "note": r.note }))).await?;
    tx.commit().await?;
    Ok(ok(json!({ "id": id, "status": new_status })))
}

async fn recipients(State(s): State<AppState>, ctx: Ctx, Query(q): Query<PageQuery>) -> ApiResult<Response> {
    ctx.require("messages.send_direct")?;
    let f = features(&s.db).await?;
    let like = q.like();
    let rows: Vec<Value> = match ctx.role {
        Role::Student => sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT DISTINCT u.id AS user_id, u.display_name, u.role, tc.designation AS detail FROM students me JOIN enrollments e ON e.student_id=me.id AND e.status='ACTIVE' JOIN academic_sessions s ON s.id=e.session_id AND s.is_current \
            JOIN teacher_assignments a ON a.section_id=e.section_id AND a.session_id=s.id JOIN teachers tc ON tc.id=a.teacher_id AND tc.status<>'INACTIVE' JOIN users u ON u.id=tc.user_id AND u.status='ACTIVE' WHERE me.user_id=$1 AND $2 AND ($3::text IS NULL OR u.display_name ILIKE $3) \
            UNION SELECT u.id, u.display_name, u.role, CASE u.role WHEN 'HEADMASTER' THEN 'Headmaster' ELSE 'Register' END FROM users u WHERE $4 AND u.status='ACTIVE' AND u.role IN ('HEADMASTER','REGISTRAR') AND ($3::text IS NULL OR u.display_name ILIKE $3) ORDER BY display_name LIMIT 100) t")
            .bind(ctx.user_id).bind(f.teacher).bind(like).bind(f.admin).fetch_all(&s.db).await?,
        Role::Teacher => sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT u.id AS user_id, u.display_name, u.role, NULL::text AS detail FROM users u WHERE u.status='ACTIVE' AND u.role IN ('TEACHER','HEADMASTER','REGISTRAR') AND u.id<>$1 AND ($2::text IS NULL OR u.display_name ILIKE $2) \
            UNION SELECT u.id, u.display_name, u.role, c.name || '-' || sec.name FROM teachers tc JOIN teacher_assignments a ON a.teacher_id=tc.id JOIN academic_sessions s ON s.id=a.session_id AND s.is_current JOIN enrollments e ON e.section_id=a.section_id AND e.session_id=s.id AND e.status='ACTIVE' JOIN students st ON st.id=e.student_id JOIN users u ON u.id=st.user_id AND u.status='ACTIVE' JOIN sections sec ON sec.id=e.section_id JOIN classes c ON c.id=sec.class_id \
            WHERE tc.user_id=$1 AND ($2::text IS NULL OR u.display_name ILIKE $2) ORDER BY display_name LIMIT 100) t").bind(ctx.user_id).bind(like).fetch_all(&s.db).await?,
        _ => sqlx::query_scalar("SELECT to_jsonb(t) FROM (SELECT id AS user_id, display_name, role, NULL::text AS detail FROM users WHERE status='ACTIVE' AND id<>$1 AND ($2::text IS NULL OR display_name ILIKE $2) ORDER BY display_name LIMIT 100) t").bind(ctx.user_id).bind(like).fetch_all(&s.db).await?,
    };
    Ok(ok(Value::Array(rows)))
}
