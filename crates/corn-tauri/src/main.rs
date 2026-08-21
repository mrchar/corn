//! corn-tauri 占位入口
//!
//! M4 阶段将引入 Tauri 外壳与嵌入式 SQLite，通过 `tauri::command`
//! 直接调用 `corn-core` 的 service，无需 HTTP 服务。
//! 当前为占位二进制，保证 workspace 可编译。

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing::info!("corn-tauri（占位）：本地独立运行入口尚未接入 Tauri 外壳");

    // 演示内核可用性
    let services = corn_tauri::run_local_kernel().await?;
    let spaces = services.list_spaces(corn_core::DEFAULT_TENANT).await?;
    println!("corn-tauri 本地内核就绪：{} 个默认空间", spaces.len());
    Ok(())
}
