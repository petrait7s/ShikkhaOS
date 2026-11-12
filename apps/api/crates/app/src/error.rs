use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug)]
pub struct FieldErr {
    pub field: String,
    pub code: String,
    pub message: String,
}

#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: String,
    pub fields: Vec<FieldErr>,
    pub details: serde_json::Value,
    pub retry_after: Option<u64>,
}

pub type ApiResult<T> = Result<T, ApiError>;

impl ApiError {
    pub fn new(status: u16, code: &'static str, msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::from_u16(status).unwrap(),
            code,
            message: msg.into(),
            fields: vec![],
            details: json!({}),
            retry_after: None,
        }
    }
    pub fn bad_request(m: impl Into<String>) -> Self {
        Self::new(400, "BAD_REQUEST", m)
    }
    pub fn unauthenticated(m: impl Into<String>) -> Self {
        Self::new(401, "UNAUTHENTICATED", m)
    }
    pub fn token_expired() -> Self {
        Self::new(401, "TOKEN_EXPIRED", "Access token expired")
    }
    pub fn token_revoked() -> Self {
        Self::new(401, "TOKEN_REVOKED", "Session revoked")
    }
    pub fn forbidden(m: impl Into<String>) -> Self {
        Self::new(403, "FORBIDDEN", m)
    }
    pub fn forbidden_code(code: &'static str, m: impl Into<String>) -> Self {
        Self::new(403, code, m)
    }
    pub fn not_found() -> Self {
        Self::new(404, "NOT_FOUND", "Resource not found")
    }
    pub fn conflict(code: &'static str, m: impl Into<String>) -> Self {
        Self::new(409, code, m)
    }
    pub fn invalid_transition(m: impl Into<String>) -> Self {
        Self::new(409, "INVALID_STATE_TRANSITION", m)
    }
    pub fn version_conflict() -> Self {
        Self::new(
            409,
            "VERSION_CONFLICT",
            "The record was changed by someone else; reload and retry",
        )
    }
    pub fn validation(fields: Vec<FieldErr>) -> Self {
        let mut e = Self::new(422, "VALIDATION_FAILED", "Validation failed");
        e.fields = fields;
        e
    }
    pub fn field(field: &str, code: &str, message: &str) -> Self {
        Self::validation(vec![FieldErr {
            field: field.into(),
            code: code.into(),
            message: message.into(),
        }])
    }
    pub fn internal() -> Self {
        Self::new(500, "INTERNAL", "Internal server error")
    }
}

impl From<shikkhaos_domain::validation::FieldError> for ApiError {
    fn from(e: shikkhaos_domain::validation::FieldError) -> Self {
        ApiError::field(e.field, e.code, &e.message)
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        if let sqlx::Error::Database(d) = &e {
            match d.code().as_deref() {
                Some("23505") => {
                    return ApiError::conflict(
                        "DUPLICATE",
                        "A record with the same unique value already exists",
                    )
                }
                Some("23503") => {
                    return ApiError::conflict(
                        "CONFLICT",
                        "Referenced record does not exist or is still in use",
                    )
                }
                Some("23514") => {
                    return ApiError::field("value", "CONSTRAINT_VIOLATION", d.message())
                }
                Some("55000") => {
                    return ApiError::conflict("IMMUTABLE", "This record is immutable")
                }
                _ => {}
            }
        }
        if matches!(e, sqlx::Error::RowNotFound) {
            return ApiError::not_found();
        }
        tracing::error!(error = %e, "database error");
        ApiError::internal()
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut body = json!({ "error": { "code": self.code, "message": self.message, "details": self.details } });
        if !self.fields.is_empty() {
            body["error"]["fieldErrors"] = self
                .fields
                .iter()
                .map(|f| json!({"field": f.field, "code": f.code, "message": f.message}))
                .collect();
        }
        let mut r = (self.status, Json(body)).into_response();
        if let Some(s) = self.retry_after {
            r.headers_mut().insert("retry-after", s.into());
        }
        r
    }
}
