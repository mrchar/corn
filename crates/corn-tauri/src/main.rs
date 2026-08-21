//! corn-tauri 占位入口
//!
//! M4 阶段将引入 Tauri 外壳与嵌入式 SQLite，通过 `tauri::command`
//! 直接调用 `corn-core` 的 service，无需 HTTP 服务。
//! 当前为占位二进制，保证 workspace 可编译。

use corn_core::{schema, Services};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing::info!("corn-tauri（占位）：本地独立运行入口尚未接入 Tauri 外壳");

    // 演示内核可用性：连接内存 SQLite 并初始化默认数据
    let repo = corn_core::connect("sqlite::memory:").await?;
    schema::ensure_schema(&repo).await?;
    let services = Services::new(repo);
    services.ensure_defaults(corn_core::DEFAULT_TENANT).await?;

    let spaces = services.list_spaces(corn_core::DEFAULT_TENANT).await?;
    println!("corn-tauri 本地内核就绪：{} 个默认空间", spaces.len());
    Ok(())
}
