//! Corn 业务逻辑内核
//!
//! 提供领域模型、数据库仓储与业务服务，供 `corn-server`（HTTP）与
//! `corn-tauri`（桌面）两种入口复用。

pub mod model;
pub mod repo;
pub mod schema;
pub mod service;

pub use model::{Label, TenantId};
pub use repo::{Repo, RepoError, RepoResult};
pub use service::Services;

/// 默认租户 ID（本地独立运行 / 单租户形态使用）
pub const DEFAULT_TENANT: TenantId = 1;

/// 注册 sqlx::any 的默认后端驱动（PostgreSQL + SQLite）。
/// 必须在首次 `AnyPool::connect` 前调用一次。
pub fn install_drivers() {
    sqlx::any::install_default_drivers();
}

/// 根据连接字符串建立任意后端连接池并返回 `Repo`。
///
/// 支持：
/// - `postgres://...`、`postgresql://...`
/// - `sqlite://...`、`sqlite::memory:`
///
/// 对于 `sqlite::memory:`（即 SQLite 内存库），会限制连接池为单连接，
/// 否则每个连接都会得到独立的内存库，导致建表无法跨连接可见。
pub async fn connect(url: &str) -> RepoResult<Repo> {
    install_drivers();
    let is_postgres = url.starts_with("postgres://") || url.starts_with("postgresql://");

    let mut opts = sqlx::any::AnyPoolOptions::new();
    // 内存 SQLite 需要固定单连接，保证 schema 与查询落在同一连接上。
    if url == "sqlite::memory:" {
        opts = opts.max_connections(1);
    }
    let pool = opts.connect(url).await?;
    Ok(Repo::new(pool, is_postgres))
}
