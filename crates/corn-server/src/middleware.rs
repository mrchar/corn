//! 多租户与鉴权中间件

use crate::error::ApiError;
use crate::state::AppState;
use axum::extract::{Request, State};
use axum::http::header;
use axum::middleware::Next;
use axum::response::Response;
use corn_core::TenantId;

/// 请求级租户上下文（由中间件注入）
#[derive(Debug, Clone, Copy)]
pub struct TenantContext {
    pub id: TenantId,
}

/// 解析租户：有 `X-Tenant-Id` 用之，否则用默认租户
pub async fn tenant_resolver(
    State(st): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let tenant: TenantId = req
        .headers()
        .get("x-tenant-id")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.parse().ok())
        .unwrap_or(st.config.default_tenant);
    req.extensions_mut().insert(TenantContext { id: tenant });
    Ok(next.run(req).await)
}

/// Bearer Token 鉴权；`auth_token` 为空时跳过。
/// `/health`、`/swagger-ui`、`/api-docs` 不鉴权，便于健康检查与文档访问。
pub async fn auth_guard(
    State(st): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, ApiError> {
    if let Some(token) = &st.config.auth_token {
        let path = req.uri().path();
        let exempt = path == "/health"
            || path.starts_with("/swagger-ui")
            || path.starts_with("/api-docs");
        if !exempt {
            let ok = req
                .headers()
                .get(header::AUTHORIZATION)
                .and_then(|h| h.to_str().ok())
                .and_then(|s| s.strip_prefix("Bearer "))
                .map(|t| t == token)
                .unwrap_or(false);
            if !ok {
                return Err(ApiError::Unauthorized);
            }
        }
    }
    Ok(next.run(req).await)
}
