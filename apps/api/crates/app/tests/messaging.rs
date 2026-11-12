mod common;
use axum::http::StatusCode;
use common::TestApp;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use shikkhaos_app::{build_app, seed};
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

fn data(v: &Value) -> &Value { &v["data"] }

async fn uid(t: &TestApp, username: &str) -> String { sqlx::query_scalar("SELECT id::text FROM users WHERE username=$1::citext").bind(username).fetch_one(&t.db).await.unwrap() }

#[tokio::test]
async fn messaging_policy_groups_and_moderation() {
    let t = TestApp::new().await;
    seed::demo_small(&t.db).await.unwrap();
    let (hm, reg, rahim, ayesha, farhan, tahmid_b) = (t.login("headmaster").await, t.login("registrar").await, t.login("teacher.rahim").await, t.login("student.ayesha").await, t.login("student.farhan").await, t.login("student.sabbir").await);
    let (farhan_id, rahim_id, reg_id) = (uid(&t, "student.farhan").await, uid(&t, "teacher.rahim").await, uid(&t, "registrar").await);

    // student -> student private DM is always rejected
    let (s, v) = t.request("POST", "/conversations", Some(&ayesha), Some(json!({ "type": "DIRECT", "recipientId": farhan_id }))).await;
    assert_eq!(s, StatusCode::FORBIDDEN, "{v}");
    assert_eq!(v["error"]["code"], "STUDENT_DM_DISABLED");
    // even with the feature flag forced on in the DB
    sqlx::query("UPDATE school_profile SET features = features || '{\"studentDirectMessaging\": true}'").execute(&t.db).await.unwrap();
    assert_eq!(t.request("POST", "/conversations", Some(&ayesha), Some(json!({ "type": "DIRECT", "recipientId": farhan_id }))).await.0, StatusCode::FORBIDDEN);

    // student -> own teacher OK; recipients list excludes other students
    let (s, v) = t.request("GET", "/messaging/recipients", Some(&ayesha), None).await;
    assert_eq!(s, StatusCode::OK);
    assert!(data(&v).as_array().unwrap().iter().all(|r| r["role"] != "STUDENT"), "{v}");
    let (s, v) = t.request("POST", "/conversations", Some(&ayesha), Some(json!({ "type": "DIRECT", "recipientId": rahim_id }))).await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    let conv = data(&v)["id"].as_str().unwrap().to_string();
    let (s, v) = t.request("POST", &format!("/conversations/{conv}/messages"), Some(&ayesha), Some(json!({ "body": "Sir, is homework due Monday?", "clientMessageId": Uuid::new_v4() }))).await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    let mid = data(&v)["id"].as_str().unwrap().to_string();
    // idempotent resend
    let cm = Uuid::new_v4();
    let (_, a) = t.request("POST", &format!("/conversations/{conv}/messages"), Some(&rahim), Some(json!({ "body": "Yes", "clientMessageId": cm }))).await;
    let (s, b) = t.request("POST", &format!("/conversations/{conv}/messages"), Some(&rahim), Some(json!({ "body": "Yes", "clientMessageId": cm }))).await;
    assert_eq!(s, StatusCode::OK); assert_eq!(data(&a)["id"], data(&b)["id"]);
    // outsiders cannot read it (404), including other students
    assert_eq!(t.request("GET", &format!("/conversations/{conv}/messages"), Some(&farhan), None).await.0, StatusCode::NOT_FOUND);
    assert_eq!(t.request("GET", &format!("/conversations/{conv}/messages"), Some(&reg), None).await.0, StatusCode::NOT_FOUND);
    // teacher got a notification; unread count visible
    let (_, n) = t.request("GET", "/notifications", Some(&rahim), None).await;
    assert!(data(&n).as_array().unwrap().iter().any(|x| x["type"] == "MESSAGE_RECEIVED"));

    // student -> student in a different section is irrelevant; student -> unassigned teacher is rejected
    let (s, _) = t.request("POST", "/teachers", Some(&reg), Some(json!({ "employeeCode": "T-099", "fullName": "Karim Sir", "username": "teacher.karim", "phone": "01712345678" }))).await;
    assert_eq!(s, StatusCode::CREATED);
    let karim = uid(&t, "teacher.karim").await;
    let (s, v) = t.request("POST", "/conversations", Some(&ayesha), Some(json!({ "type": "DIRECT", "recipientId": karim }))).await;
    assert_eq!(s, StatusCode::FORBIDDEN, "{v}");
    assert_eq!(v["error"]["code"], "RECIPIENT_NOT_PERMITTED");
    // student -> registrar allowed by default, disabled by headmaster switch
    assert_eq!(t.request("POST", "/conversations", Some(&ayesha), Some(json!({ "type": "DIRECT", "recipientId": reg_id }))).await.0, StatusCode::CREATED);
    let re = t.reauth(&hm).await;
    assert_eq!(t.request_h("PATCH", "/settings", Some(&hm), Some(json!({ "studentToAdminMessaging": false })), &[("x-reauth-token", re)]).await.0, StatusCode::OK);
    assert_eq!(t.request("POST", "/conversations", Some(&farhan), Some(json!({ "type": "DIRECT", "recipientId": reg_id }))).await.0, StatusCode::FORBIDDEN);

    // class group derived from enrollment: students are read-only until teacher enables posting
    let (_, v) = t.request("GET", "/conversations", Some(&ayesha), None).await;
    let group = data(&v).as_array().unwrap().iter().find(|c| c["type"] == "CLASS_GROUP").expect("class group").clone();
    let gid = group["id"].as_str().unwrap().to_string();
    let (s, v) = t.request("POST", &format!("/conversations/{gid}/messages"), Some(&ayesha), Some(json!({ "body": "hi all" }))).await;
    assert_eq!(s, StatusCode::FORBIDDEN, "{v}");
    assert_eq!(v["error"]["code"], "POSTING_NOT_ALLOWED");
    assert_eq!(t.request("POST", &format!("/conversations/{gid}/messages"), Some(&rahim), Some(json!({ "body": "Welcome to Class 6A" }))).await.0, StatusCode::CREATED);
    // student in section B is not a member of section A's group
    assert_eq!(t.request("GET", &format!("/conversations/{gid}/messages"), Some(&tahmid_b), None).await.0, StatusCode::NOT_FOUND);
    assert_eq!(t.request("PATCH", &format!("/conversations/{gid}"), Some(&ayesha), Some(json!({ "studentsCanPost": true }))).await.0, StatusCode::NOT_FOUND);
    assert_eq!(t.request("PATCH", &format!("/conversations/{gid}"), Some(&rahim), Some(json!({ "studentsCanPost": true }))).await.0, StatusCode::OK);
    assert_eq!(t.request("POST", &format!("/conversations/{gid}/messages"), Some(&ayesha), Some(json!({ "body": "thanks sir" }))).await.0, StatusCode::CREATED);

    // official channel: students read, cannot post; headmaster posts
    let (_, ch) = t.request("GET", "/channels", Some(&ayesha), None).await;
    let ann = data(&ch).as_array().unwrap().iter().find(|c| c["channel_kind"] == "ANNOUNCEMENTS" || c["channelKind"] == "ANNOUNCEMENTS").unwrap()["id"].as_str().unwrap().to_string();
    assert_eq!(t.request("POST", &format!("/channels/{ann}/posts"), Some(&ayesha), Some(json!({ "body": "x" }))).await.0, StatusCode::FORBIDDEN);
    assert_eq!(t.request("POST", &format!("/channels/{ann}/posts"), Some(&rahim), Some(json!({ "body": "x" }))).await.0, StatusCode::FORBIDDEN);
    assert_eq!(t.request("POST", &format!("/channels/{ann}/posts"), Some(&hm), Some(json!({ "body": "School closed Friday" }))).await.0, StatusCode::CREATED);
    let (s, v) = t.request("GET", &format!("/conversations/{ann}/messages"), Some(&ayesha), None).await;
    assert_eq!(s, StatusCode::OK); assert_eq!(data(&v).as_array().unwrap().len(), 1);

    // reporting + moderation: hide message; moderator read is audit-logged; non-moderator staff cannot list reports
    let (s, v) = t.request("POST", &format!("/messages/{mid}/report"), Some(&rahim), Some(json!({ "reason": "Inappropriate content" }))).await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    let rid = data(&v)["id"].as_str().unwrap().to_string();
    assert_eq!(t.request("GET", "/moderation/reports", Some(&rahim), None).await.0, StatusCode::FORBIDDEN);
    assert_eq!(t.request("GET", "/moderation/reports", Some(&reg), None).await.0, StatusCode::FORBIDDEN);
    let (s, v) = t.request("GET", "/moderation/reports?status=OPEN", Some(&hm), None).await;
    assert_eq!(s, StatusCode::OK); assert_eq!(data(&v).as_array().unwrap().len(), 1);
    assert_eq!(t.request("GET", &format!("/conversations/{conv}/messages"), Some(&hm), None).await.0, StatusCode::OK);
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM audit_logs WHERE action='conversation.read_by_moderator'").fetch_one(&t.db).await.unwrap();
    assert_eq!(n, 1);
    let (s, v) = t.request("POST", &format!("/moderation/reports/{rid}/resolve"), Some(&hm), Some(json!({ "action": "HIDE", "note": "removed" }))).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let (_, v) = t.request("GET", &format!("/conversations/{conv}/messages"), Some(&ayesha), None).await;
    assert!(data(&v).as_array().unwrap().iter().any(|m| m["body"] == "[message removed by moderator]"), "{v}");
    t.drop_db().await;
}

#[tokio::test]
async fn websocket_realtime_flow() {
    let t = TestApp::new().await;
    let ids = seed::demo_small(&t.db).await.unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = build_app(t.state.clone());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap(); });
    let (rahim, ayesha) = (t.login("teacher.rahim").await, t.login("student.ayesha").await);
    let rahim_id = uid(&t, "teacher.rahim").await;
    let (_, v) = t.request("POST", "/conversations", Some(&ayesha), Some(json!({ "type": "DIRECT", "recipientId": rahim_id }))).await;
    let conv = data(&v)["id"].as_str().unwrap().to_string();
    async fn connect(t: &TestApp, tok: &str, addr: std::net::SocketAddr) -> tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>> {
        let (_, v) = t.request("POST", "/ws/tickets", Some(tok), None).await;
        let ticket = v["data"]["ticket"].as_str().unwrap().to_string();
        let (ws, _) = tokio_tungstenite::connect_async(format!("ws://{addr}/api/v1/ws?ticket={ticket}")).await.unwrap();
        ws
    }
    // a ticket is single-use
    let (_, tv) = t.request("POST", "/ws/tickets", Some(&ayesha), None).await;
    let used = tv["data"]["ticket"].as_str().unwrap().to_string();
    let _ = tokio_tungstenite::connect_async(format!("ws://{addr}/api/v1/ws?ticket={used}")).await.unwrap();
    assert!(tokio_tungstenite::connect_async(format!("ws://{addr}/api/v1/ws?ticket={used}")).await.is_err());
    assert!(tokio_tungstenite::connect_async(format!("ws://{addr}/api/v1/ws?ticket=bogus")).await.is_err());

    let mut a = connect(&t, &ayesha, addr).await;
    let mut r = connect(&t, &rahim, addr).await;
    let cmid = Uuid::new_v4();
    a.send(Message::Text(json!({ "id": Uuid::new_v4(), "type": "message.send", "ts": "x", "payload": { "conversationId": conv, "body": "hello sir", "clientMessageId": cmid } }).to_string().into())).await.unwrap();
    async fn until<S>(ws: &mut S, ty: &str) -> Value where S: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin {
        tokio::time::timeout(std::time::Duration::from_secs(5), async { loop { if let Some(Ok(Message::Text(m))) = ws.next().await { let v: Value = serde_json::from_str(&m).unwrap(); if v["type"] == ty { return v; } } } }).await.unwrap_or_else(|_| panic!("timeout waiting for {ty}"))
    }
    let ack = until(&mut a, "message.ack").await;
    assert_eq!(ack["payload"]["clientMessageId"], cmid.to_string());
    let created = until(&mut r, "message.created").await;
    assert_eq!(created["payload"]["body"], "hello sir");
    let (got_ack, got_created) = (true, true);
    assert!(got_ack && got_created);
    // unauthorized send: a student cannot post into a conversation she is not in
    let group: String = sqlx::query_scalar("SELECT id::text FROM conversations WHERE type='CLASS_GROUP' AND section_id=$1").bind(ids.sec6a).fetch_one(&t.db).await.unwrap();
    a.send(Message::Text(json!({ "id": "e1", "type": "message.send", "payload": { "conversationId": group, "body": "spam" } }).to_string().into())).await.unwrap();
    let m = tokio::time::timeout(std::time::Duration::from_secs(3), async { loop { if let Some(Ok(Message::Text(m))) = a.next().await { let v: Value = serde_json::from_str(&m).unwrap(); if v["type"] == "error" { return v; } } } }).await.unwrap();
    assert_eq!(m["payload"]["code"], "POSTING_NOT_ALLOWED");
    t.drop_db().await;
}
