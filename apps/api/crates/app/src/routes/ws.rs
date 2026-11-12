//! WebSocket endpoint (contract C11): ticket auth, JSON envelope, heartbeat, per-event authorization.
use crate::{auth::ctx_for_user, error::*, routes::messaging, state::AppState};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::Response,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;
use uuid::Uuid;

pub fn router() -> Router<AppState> {
    Router::new().route("/ws", get(upgrade))
}

#[derive(Deserialize)]
struct Q {
    ticket: String,
}

async fn upgrade(
    State(s): State<AppState>,
    Query(q): Query<Q>,
    ws: WebSocketUpgrade,
) -> ApiResult<Response> {
    let user = s
        .hub
        .redeem_ticket(&q.ticket)
        .ok_or_else(|| ApiError::unauthenticated("Invalid or expired ticket"))?;
    if s.hub.connections(user) >= 5 {
        return Err(ApiError::new(
            429,
            "RATE_LIMITED",
            "Too many open connections",
        ));
    }
    ctx_for_user(&s.db, user).await?;
    Ok(ws
        .max_message_size(64 * 1024)
        .on_upgrade(move |sock| run(s, user, sock)))
}

fn envelope(ty: &str, payload: Value) -> String {
    json!({ "id": Uuid::new_v4(), "type": ty, "ts": chrono::Utc::now().to_rfc3339(), "payload": payload }).to_string()
}

async fn run(s: AppState, user: Uuid, sock: WebSocket) {
    let (conn, mut rx) = s.hub.register(user);
    let (mut tx, mut rcv) = sock.split();
    let mut beat = tokio::time::interval(Duration::from_secs(25));
    let mut last_seen = tokio::time::Instant::now();
    loop {
        tokio::select! {
            out = rx.recv() => match out { Some(m) => { if tx.send(Message::Text(m.into())).await.is_err() { break; } } None => break },
            _ = beat.tick() => {
                if last_seen.elapsed() > Duration::from_secs(75) { break; }
                if tx.send(Message::Ping(Vec::new().into())).await.is_err() { break; }
            }
            inc = rcv.next() => match inc {
                Some(Ok(Message::Text(t))) => {
                    last_seen = tokio::time::Instant::now();
                    if let Some(reply) = handle(&s, user, &t).await { if tx.send(Message::Text(reply.into())).await.is_err() { break; } }
                }
                Some(Ok(Message::Pong(_))) | Some(Ok(Message::Ping(_))) => { last_seen = tokio::time::Instant::now(); }
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                _ => {}
            }
        }
    }
    s.hub.unregister(user, conn);
}

fn err_event(e: &ApiError, ref_id: Option<&str>) -> String {
    envelope(
        "error",
        json!({ "code": e.code, "message": e.message, "refId": ref_id }),
    )
}

async fn handle(s: &AppState, user: Uuid, text: &str) -> Option<String> {
    let v: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return Some(err_event(&ApiError::bad_request("Invalid JSON"), None)),
    };
    let ty = v["type"].as_str().unwrap_or("");
    let id = v["id"].as_str();
    let p = &v["payload"];
    // Re-resolve permissions for every action: revoked permissions take effect immediately.
    let ctx = match ctx_for_user(&s.db, user).await {
        Ok(c) => c,
        Err(e) => return Some(err_event(&e, id)),
    };
    let conv = p["conversationId"]
        .as_str()
        .and_then(|x| Uuid::parse_str(x).ok());
    match ty {
        "ping" => Some(envelope("pong", json!({}))),
        "message.send" => {
            let Some(conv) = conv else {
                return Some(err_event(
                    &ApiError::field("conversationId", "REQUIRED", "Required"),
                    id,
                ));
            };
            let files: Vec<Uuid> = p["attachmentFileIds"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().and_then(|s| Uuid::parse_str(s).ok()))
                        .collect()
                })
                .unwrap_or_default();
            let client = p["clientMessageId"]
                .as_str()
                .and_then(|x| Uuid::parse_str(x).ok());
            match messaging::send_message(
                s,
                &ctx,
                conv,
                p["body"].as_str().unwrap_or("").to_string(),
                client,
                files,
                None,
            )
            .await
            {
                Ok((m, _dup)) => Some(envelope(
                    "message.ack",
                    json!({ "clientMessageId": client, "messageId": m["id"], "conversationId": conv, "createdAt": m["created_at"] }),
                )),
                Err(e) => Some(err_event(&e, id)),
            }
        }
        "typing.start" | "typing.stop" => {
            let conv = conv?;
            let members: Vec<Uuid> = sqlx::query_scalar(
                "SELECT user_id FROM conversation_members WHERE conversation_id=$1",
            )
            .bind(conv)
            .fetch_all(&s.db)
            .await
            .ok()?;
            if !members.contains(&user) {
                return Some(err_event(&ApiError::not_found(), id));
            }
            let others: Vec<Uuid> = members.into_iter().filter(|m| *m != user).collect();
            s.hub.send_many(
                &others,
                "typing",
                &json!({ "conversationId": conv, "userId": user, "typing": ty == "typing.start" }),
            );
            None
        }
        "conversation.read" => {
            let conv = conv?;
            match messaging::set_read(
                s,
                &ctx,
                conv,
                p["messageId"]
                    .as_str()
                    .and_then(|x| Uuid::parse_str(x).ok()),
            )
            .await
            {
                Ok(_) => None,
                Err(e) => Some(err_event(&e, id)),
            }
        }
        _ => Some(err_event(&ApiError::bad_request("Unknown event type"), id)),
    }
}
