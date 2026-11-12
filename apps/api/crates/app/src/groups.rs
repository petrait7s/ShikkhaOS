//! Class-group membership follows enrollments + teacher assignments (contract C13).
use sqlx::PgConnection;
use uuid::Uuid;
use crate::error::ApiResult;

/// Ensure a CLASS_GROUP conversation exists for the section and its members match current enrollments/assignments.
pub async fn sync_class_group(conn: &mut PgConnection, section: Uuid) -> ApiResult<()> {
    let info: Option<(String, Uuid)> = sqlx::query_as("SELECT c.name || '-' || s.name, c.id FROM sections s JOIN classes c ON c.id = s.class_id WHERE s.id = $1").bind(section).fetch_optional(&mut *conn).await?;
    let Some((title, class_id)) = info else { return Ok(()) };
    let conv: Uuid = sqlx::query_scalar("INSERT INTO conversations (type, title, class_id, section_id) VALUES ('CLASS_GROUP', $1, $2, $3) ON CONFLICT (section_id) WHERE type = 'CLASS_GROUP' DO UPDATE SET title = EXCLUDED.title RETURNING id")
        .bind(&title).bind(class_id).bind(section).fetch_one(&mut *conn).await?;
    sqlx::query("DELETE FROM conversation_members m WHERE m.conversation_id = $1 AND m.user_id NOT IN (
            SELECT st.user_id FROM enrollments e JOIN students st ON st.id = e.student_id JOIN academic_sessions s ON s.id = e.session_id AND s.is_current WHERE e.section_id = $2 AND e.status = 'ACTIVE'
            UNION SELECT t.user_id FROM teacher_assignments a JOIN teachers t ON t.id = a.teacher_id JOIN academic_sessions s ON s.id = a.session_id AND s.is_current WHERE a.section_id = $2 AND t.status <> 'INACTIVE')")
        .bind(conv).bind(section).execute(&mut *conn).await?;
    sqlx::query("INSERT INTO conversation_members (conversation_id, user_id) SELECT $1, u FROM (
            SELECT st.user_id AS u FROM enrollments e JOIN students st ON st.id = e.student_id JOIN academic_sessions s ON s.id = e.session_id AND s.is_current WHERE e.section_id = $2 AND e.status = 'ACTIVE'
            UNION SELECT t.user_id FROM teacher_assignments a JOIN teachers t ON t.id = a.teacher_id JOIN academic_sessions s ON s.id = a.session_id AND s.is_current WHERE a.section_id = $2 AND t.status <> 'INACTIVE') x ON CONFLICT DO NOTHING")
        .bind(conv).bind(section).execute(&mut *conn).await?;
    Ok(())
}
