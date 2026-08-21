//! corn-tauri 库入口
//!
//! 提供内核启动逻辑的可测试封装，避免 `main.rs` 中无法单元测试的问题。
//! M4 阶段接入 Tauri 外壳时，桌面命令将直接调用 `run_local_kernel`。

use corn_core::{schema, Services, DEFAULT_TENANT};

/// 本地独立运行内核：连接内存 SQLite → 初始化 schema → 注入默认数据。
///
/// 返回就绪的 `Services`，由调用方决定后续交互方式（HTTP 命令 / Tauri IPC）。
pub async fn run_local_kernel() -> anyhow::Result<Services> {
    let repo = corn_core::connect("sqlite::memory:").await?;
    schema::ensure_schema(&repo).await?;
    let services = Services::new(repo);
    services.ensure_defaults(DEFAULT_TENANT).await?;
    Ok(services)
}
