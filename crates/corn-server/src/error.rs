//! HTTP 错误转换
//!
//! 把 `corn-core` 的领域错误映射为合适的 HTTP 状态码。

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use corn_core::RepoError;
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error(transparent)]
    Repo(#[from] RepoError),
    #[error("JSON 处理错误：{0}")]
    Json(#[from] serde_json::Error),
    #[error("未授权")]
    Unauthorized,
    #[error("参数错误：{0}")]
    BadRequest(String),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            ApiError::Repo(e) => match e {
                RepoError::NotFound(m) => (StatusCode::NOT_FOUND, m.clone()),
                RepoError::Conflict(m) => (StatusCode::CONFLICT, m.clone()),
                RepoError::Db(m) => (StatusCode::INTERNAL_SERVER_ERROR, m.to_string()),
            },
            ApiError::Json(e) => (StatusCode::BAD_REQUEST, e.to_string()),
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, "未授权".into()),
            ApiError::BadRequest(m) => (StatusCode::BAD_REQUEST, m.clone()),
        };
        let body = Json(json!({ "error": message, "status": status.as_u16() }));
        (status, body).into_response()
    }
}
