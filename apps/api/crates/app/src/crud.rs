//! Spec-driven CRUD for simple reference tables. Whitelisted columns only; typed binding; optimistic concurrency.
use axum::http::HeaderMap;
use serde_json::{json, Map, Value};
use sqlx::{PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{audit, auth::Ctx, error::*, http::*, scope};

#[derive(Clone, Copy, PartialEq)]
pub enum K { Text, Int, Date, Bool, Uuid, Dec }

pub struct Col { pub key: &'static str, pub db: &'static str, pub kind: K, pub required: bool, pub immutable: bool }
pub const fn c(key: &'static str, db: &'static str, kind: K, required: bool) -> Col { Col { key, db, kind, required, immutable: false } }
pub const fn ci(key: &'static str, db: &'static str, kind: K, required: bool) -> Col { Col { key, db, kind, required, immutable: true } }

pub struct Spec {
    pub table: &'static str,
    pub entity: &'static str,
    pub cols: &'static [Col],
    /// SELECT list used for output (must include id and version)
    pub select: &'static str,
    pub order: &'static str,
    pub search_cols: &'static [&'static str],
    pub filters: &'static [(&'static str, &'static str)], // (query key, db col)
}

fn push_val<'a>(qb: &mut QueryBuilder<'a, Postgres>, col: &Col, v: &Value) -> Result<(), FieldErr> {
    let bad = |m: &str| FieldErr { field: col.key.into(), code: "INVALID_VALUE".into(), message: m.into() };
    match col.kind {
        K::Text => { let s = v.as_str().ok_or_else(|| bad("Expected string"))?; if s.chars().count() > 5000 { return Err(bad("Too long")); } qb.push_bind(s.trim().to_string()); }
        K::Int => { let n = v.as_i64().ok_or_else(|| bad("Expected integer"))?; qb.push_bind(n as i32); }
        K::Bool => { qb.push_bind(v.as_bool().ok_or_else(|| bad("Expected boolean"))?); }
        K::Date => { let d = v.as_str().and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()).ok_or_else(|| bad("Expected YYYY-MM-DD"))?; qb.push_bind(d); }
        K::Uuid => { let u = v.as_str().and_then(|s| Uuid::parse_str(s).ok()).ok_or_else(|| bad("Expected UUID"))?; qb.push_bind(u); }
        K::Dec => { let d: rust_decimal::Decimal = v.as_f64().and_then(|f| rust_decimal::Decimal::try_from(f).ok()).or_else(|| v.as_str().and_then(|s| s.parse().ok())).ok_or_else(|| bad("Expected number"))?; qb.push_bind(d.round_dp(2)); }
    }
    Ok(())
}

fn check_keys(spec: &Spec, body: &Map<String, Value>, creating: bool) -> ApiResult<()> {
    let mut errs = vec![];
    for k in body.keys() {
        if k == "version" { continue; }
        match spec.cols.iter().find(|c| c.key == k) {
            None => errs.push(FieldErr { field: k.clone(), code: "UNKNOWN_FIELD".into(), message: "Unknown field".into() }),
            Some(c) if c.immutable && !creating => errs.push(FieldErr { field: k.clone(), code: "IMMUTABLE".into(), message: "Field cannot be changed".into() }),
            _ => {}
        }
    }
    if creating { for c in spec.cols.iter().filter(|c| c.required) { if !body.contains_key(c.key) || body[c.key].is_null() { errs.push(FieldErr { field: c.key.into(), code: "REQUIRED".into(), message: "Required".into() }); } } }
    if errs.is_empty() { Ok(()) } else { Err(ApiError::validation(errs)) }
}

pub async fn get(db: &PgPool, spec: &Spec, id: Uuid) -> ApiResult<Value> {
    let q = format!("SELECT to_jsonb(t) FROM (SELECT {} FROM {} WHERE id = $1) t", spec.select, spec.table);
    sqlx::query_scalar(&q).bind(id).fetch_optional(db).await?.ok_or_else(ApiError::not_found)
}

pub async fn list(db: &PgPool, spec: &Spec, q: &PageQuery, filters: &std::collections::HashMap<String, String>) -> ApiResult<axum::response::Response> {
    let mut qb = QueryBuilder::<Postgres>::new(format!("SELECT to_jsonb(t) FROM (SELECT {} FROM {} WHERE TRUE", spec.select, spec.table));
    for (qk, dbc) in spec.filters {
        if let Some(v) = filters.get(&format!("filter[{qk}]")).or_else(|| filters.get(*qk)) {
            qb.push(format!(" AND {dbc}::text = ")).push_bind(v.clone());
        }
    }
    if let Some(l) = q.like() {
        if !spec.search_cols.is_empty() {
            qb.push(" AND (");
            for (i, sc) in spec.search_cols.iter().enumerate() { if i > 0 { qb.push(" OR "); } qb.push(format!("{sc}::text ILIKE ")).push_bind(l.clone()); }
            qb.push(")");
        }
    }
    qb.push(format!(" ORDER BY {} LIMIT ", spec.order)).push_bind(q.limit() + 1).push(" OFFSET ").push_bind(q.offset()).push(") t");
    let rows: Vec<Value> = qb.build_query_scalar().fetch_all(db).await?;
    Ok(list_resp(rows, q))
}
fn list_resp(rows: Vec<Value>, q: &PageQuery) -> axum::response::Response { crate::http::list(rows, q) }

pub async fn create(db: &PgPool, ctx: &Ctx, spec: &Spec, body: Value, extra: Vec<(&'static str, Value, K)>) -> ApiResult<Uuid> {
    let body = body.as_object().ok_or_else(|| ApiError::bad_request("Expected JSON object"))?.clone();
    check_keys(spec, &body, true)?;
    let mut qb = QueryBuilder::<Postgres>::new(format!("INSERT INTO {} (", spec.table));
    let mut vals: Vec<(&Col, &Value)> = vec![];
    for col in spec.cols { if let Some(v) = body.get(col.key) { if !v.is_null() { vals.push((col, v)); } } }
    for (i, (col, _)) in vals.iter().enumerate() { if i > 0 { qb.push(", "); } qb.push(format!("\"{}\"", col.db)); }
    qb.push(") VALUES (");
    let mut errs = vec![];
    for (i, (col, v)) in vals.iter().enumerate() { if i > 0 { qb.push(", "); } if let Err(e) = push_val(&mut qb, col, v) { errs.push(e); qb.push("NULL"); } }
    let _ = extra;
    if !errs.is_empty() { return Err(ApiError::validation(errs)); }
    qb.push(") RETURNING id");
    let mut tx = db.begin().await?;
    let id: Uuid = qb.build_query_scalar().fetch_one(&mut *tx).await?;
    audit::log(&mut tx, ctx, &format!("{}.created", spec.entity), spec.entity, &id.to_string(), None, Some(Value::Object(body))).await?;
    tx.commit().await?;
    Ok(id)
}

pub async fn patch(db: &PgPool, ctx: &Ctx, spec: &Spec, id: Uuid, body: Value, headers: &HeaderMap) -> ApiResult<()> {
    let body = body.as_object().ok_or_else(|| ApiError::bad_request("Expected JSON object"))?.clone();
    check_keys(spec, &body, false)?;
    let ver = parse_version(headers, body.get("version").and_then(|v| v.as_i64()).map(|v| v as i32));
    let mut qb = QueryBuilder::<Postgres>::new(format!("UPDATE {} SET version = version + 1, updated_at = now()", spec.table));
    let mut errs = vec![];
    for col in spec.cols { if let Some(v) = body.get(col.key) {
        qb.push(format!(", \"{}\" = ", col.db));
        if v.is_null() { qb.push("NULL"); } else if let Err(e) = push_val(&mut qb, col, v) { errs.push(e); qb.push("NULL"); }
    } }
    if !errs.is_empty() { return Err(ApiError::validation(errs)); }
    qb.push(" WHERE id = ").push_bind(id).push(" AND (").push_bind(ver).push("::int IS NULL OR version = ").push_bind(ver).push(")");
    let before = get(db, spec, id).await.ok();
    let mut tx = db.begin().await?;
    let n = qb.build().execute(&mut *tx).await?.rows_affected();
    if n == 0 { drop(tx); return Err(scope::missing_or_conflict(db, spec.table, id).await); }
    audit::log(&mut tx, ctx, &format!("{}.updated", spec.entity), spec.entity, &id.to_string(), before, Some(Value::Object(body))).await?;
    tx.commit().await?;
    Ok(())
}

pub fn single(v: Value) -> Value { json!(v) }
