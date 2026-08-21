//! 应用状态与运行配置

use corn_core::Services;
use std::sync::Arc;

/// 运行配置（来自环境变量）
#[derive(Debug, Clone)]
pub struct Config {
    /// 数据库连接串
    pub database_url: String,
    /// 监听地址
    pub addr: String,
    /// 可选鉴权 Bearer Token；为空则不鉴权
    pub auth_token: Option<String>,
    /// 是否启用多租户（解析 X-Tenant-Id）
    pub multi_tenant: bool,
    /// 默认租户 ID（本地独立 / 单租户形态）
    pub default_tenant: corn_core::TenantId,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "sqlite::memory:".into()),
            addr: std::env::var("CORN_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into()),
            auth_token: std::env::var("AUTH_TOKEN").ok().filter(|s| !s.is_empty()),
            multi_tenant: std::env::var("MULTI_TENANT")
                .map(|v| v == "true" || v == "1")
                .unwrap_or(false),
            default_tenant: std::env::var("DEFAULT_TENANT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(corn_core::DEFAULT_TENANT),
        }
    }
}

/// 贯穿请求生命周期的共享状态
#[derive(Clone)]
pub struct AppState {
    pub services: Services,
    pub config: Arc<Config>,
}

impl AppState {
    pub fn new(services: Services, config: Arc<Config>) -> Self {
        Self { services, config }
    }
}
