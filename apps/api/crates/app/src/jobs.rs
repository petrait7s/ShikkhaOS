//! In-process scheduled jobs (single instance). A Redis/Postgres queue is the documented next step for multi-instance deployments.
use crate::{notify::Outbox, state::AppState};
use serde_json::json;
use std::time::Duration;
use uuid::Uuid;

pub fn spawn(state: AppState) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(300));
        loop {
            tick.tick().await;
            if let Err(e) = run_once(&state).await {
                tracing::error!(error = %e.message, "job run failed");
            }
        }
    });
}

pub async fn run_once(s: &AppState) -> Result<(), crate::error::ApiError> {
    homework_due_soon(s).await?;
    cleanup(s).await?;
    Ok(())
}

/// Remind students without a submission about homework due in the next 24h (once per homework).
pub async fn homework_due_soon(s: &AppState) -> Result<u64, crate::error::ApiError> {
    let mut tx = s.db.begin().await?;
    let due: Vec<(Uuid, Uuid)> = sqlx::query_as("UPDATE homework SET reminder_sent_at = now() WHERE status='PUBLISHED' AND reminder_sent_at IS NULL AND due_at > now() AND due_at <= now() + interval '24 hours' RETURNING id, teacher_assignment_id").fetch_all(&mut *tx).await?;
    let mut total = 0;
    let mut ob = Outbox::new();
    for (hid, aid) in due {
        let users: Vec<Uuid> = sqlx::query_scalar("SELECT st.user_id FROM teacher_assignments a JOIN enrollments e ON e.section_id=a.section_id AND e.status='ACTIVE' JOIN academic_sessions s ON s.id=e.session_id AND s.is_current JOIN students st ON st.id=e.student_id \
            WHERE a.id=$1 AND NOT EXISTS (SELECT 1 FROM homework_submissions sb WHERE sb.homework_id=$2 AND sb.student_id=st.id)").bind(aid).bind(hid).fetch_all(&mut *tx).await?;
        total += users.len() as u64;
        ob.notify(
            &mut tx,
            &users,
            "HOMEWORK_DUE_SOON",
            "Homework due soon",
            "You have homework due within 24 hours.",
            "homework",
            &hid.to_string(),
            &format!("homework/{hid}"),
        )
        .await?;
    }
    tx.commit().await?;
    ob.flush(&s.hub);
    Ok(total)
}

async fn cleanup(s: &AppState) -> Result<(), crate::error::ApiError> {
    sqlx::query("DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'")
        .execute(&s.db)
        .await?;
    let stale: Vec<String> = sqlx::query_scalar("UPDATE files SET status='REJECTED' WHERE status='PENDING' AND created_at < now() - interval '1 hour' RETURNING storage_key").fetch_all(&s.db).await?;
    let fs = crate::routes::files::FsStorage::new(&s.cfg.storage_dir);
    for k in stale {
        fs.delete(&k).await;
    }
    let _ = json!({});
    Ok(())
}
