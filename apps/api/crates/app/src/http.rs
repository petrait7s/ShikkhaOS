//! Response envelopes, pagination, camelCase JSON mapping.
use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use serde::Deserialize;
use serde_json::{json, Map, Value};

pub fn camel_key(k: &str) -> String {
    let mut out = String::with_capacity(k.len());
    let mut up = false;
    for c in k.chars() {
        if c == '_' { up = true } else if up { out.extend(c.to_uppercase()); up = false } else { out.push(c) }
    }
    out
}

/// Recursively convert object keys snake_case -> camelCase. Keys inside `jsonb` payloads that are
/// already camelCase pass through unchanged.
pub fn camel(v: Value) -> Value {
    match v {
        Value::Object(m) => Value::Object(m.into_iter().map(|(k, v)| (camel_key(&k), camel(v))).collect::<Map<_, _>>()),
        Value::Array(a) => Value::Array(a.into_iter().map(camel).collect()),
        o => o,
    }
}

pub fn ok(data: Value) -> Response { (StatusCode::OK, Json(json!({ "data": camel(data) }))).into_response() }
pub fn created(data: Value) -> Response { (StatusCode::CREATED, Json(json!({ "data": camel(data) }))).into_response() }

#[derive(Debug, Deserialize, Default, Clone)]
pub struct PageQuery {
    pub limit: Option<i64>,
    pub cursor: Option<String>,
    pub q: Option<String>,
}

impl PageQuery {
    pub fn limit(&self) -> i64 { self.limit.unwrap_or(25).clamp(1, 100) }
    pub fn offset(&self) -> i64 {
        self.cursor.as_deref().and_then(|c| B64.decode(c).ok()).and_then(|b| String::from_utf8(b).ok()).and_then(|s| s.strip_prefix("o:").and_then(|n| n.parse().ok())).unwrap_or(0)
    }
    pub fn like(&self) -> Option<String> {
        self.q.as_ref().map(|s| s.chars().filter(|c| !c.is_control()).collect::<String>()).filter(|s| !s.trim().is_empty()).map(|s| format!("%{}%", s.trim().replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")))
    }
}

/// Build a list response from `limit+1` fetched rows.
pub fn list(mut rows: Vec<Value>, q: &PageQuery) -> Response {
    let limit = q.limit();
    let has_more = rows.len() as i64 > limit;
    rows.truncate(limit as usize);
    let next = if has_more { Some(B64.encode(format!("o:{}", q.offset() + limit))) } else { None };
    (StatusCode::OK, Json(json!({ "data": camel(Value::Array(rows)), "meta": { "limit": limit, "nextCursor": next, "hasMore": has_more } }))).into_response()
}

pub fn parse_version(headers: &axum::http::HeaderMap, body: Option<i32>) -> Option<i32> {
    headers.get("if-match").and_then(|h| h.to_str().ok()).and_then(|s| s.trim_matches(|c| c == '"' || c == 'W' || c == '/').parse().ok()).or(body)
}

/// Build a safe `ILIKE` pattern: strips control characters and escapes `\`, `%`, `_`.
pub fn like_pattern(raw: &str) -> String {
    let clean: String = raw.chars().filter(|c| !c.is_control()).collect();
    format!("%{}%", clean.trim().replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"))
}
