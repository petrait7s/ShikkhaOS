use serde_json::{json, Value};
use sqlx::PgConnection;
use uuid::Uuid;
use crate::{error::ApiResult, state::Hub};

/// Collects realtime events during a transaction; call `flush` only after commit.
#[derive(Default)]
pub struct Outbox { events: Vec<(Uuid, String, Value)> }

impl Outbox {
    pub fn new() -> Self { Self::default() }
    pub fn event(&mut self, user: Uuid, ty: &str, payload: Value) { self.events.push((user, ty.to_string(), payload)); }
    pub fn flush(self, hub: &Hub) { for (u, t, p) in self.events { hub.send(u, &t, p); } }

    /// Insert a notification row per user and queue the realtime push. Push text never contains sensitive data.
    pub async fn notify(&mut self, conn: &mut PgConnection, users: &[Uuid], ty: &str, title: &str, body: &str, entity_type: &str, entity_id: &str, route: &str) -> ApiResult<()> {
        if users.is_empty() { return Ok(()); }
        let data = json!({ "entityType": entity_type, "entityId": entity_id, "deepLink": format!("shikkhaos://{route}") });
        for chunk in users.chunks(500) {
            let ids: Vec<Uuid> = chunk.to_vec();
            sqlx::query("INSERT INTO notifications (user_id, type, title, body, data) SELECT u, $2, $3, $4, $5 FROM unnest($1::uuid[]) AS u")
                .bind(&ids).bind(ty).bind(title).bind(body).bind(&data).execute(&mut *conn).await?;
        }
        for u in users { self.event(*u, "notification.created", json!({ "type": ty, "title": title, "body": body, "data": data })); }
        Ok(())
    }
}
