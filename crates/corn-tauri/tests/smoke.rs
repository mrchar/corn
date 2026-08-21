//! corn-tauri 内核冒烟测试
//!
//! 验证桌面 / 本地独立运行入口的内核启动逻辑：
//! - `run_local_kernel` 成功初始化 schema 与默认数据
//! - 默认空间、类别可被内核服务查询
//! - 后续 Tauri 命令调用所需的 Services 实例可用

use corn_core::DEFAULT_TENANT;

#[tokio::test]
async fn local_kernel_initializes_defaults() {
    let services = corn_tauri::run_local_kernel().await.unwrap();

    // 默认空间存在
    let spaces = services.list_spaces(DEFAULT_TENANT).await.unwrap();
    assert_eq!(spaces.len(), 1);
    assert_eq!(spaces[0].code, "default");

    // 默认类别存在
    let categories = services.list_categories(DEFAULT_TENANT).await.unwrap();
    assert_eq!(categories.len(), 2);
    let codes: Vec<&str> = categories.iter().map(|c| c.code.as_str()).collect();
    assert!(codes.contains(&"human"));
    assert!(codes.contains(&"money"));
}

#[tokio::test]
async fn local_kernel_supports_full_business_flow() {
    // 内核应可独立完成「预算 → 活动 → 配额 → 记录」全链路
    let services = corn_tauri::run_local_kernel().await.unwrap();
    let t = DEFAULT_TENANT;

    let _b = services
        .create_budget(t, 1, 1, 1000.0, vec![])
        .await
        .unwrap();
    let a = services
        .create_action(t, 1, None, "act".into(), vec![])
        .await
        .unwrap();
    let q = services
        .create_quota(t, 1, a.id, 100.0)
        .await
        .unwrap();
    let _r = services.create_record(t, q.id, 50.0).await.unwrap();

    let bal = services.quota_balance(t, q.id).await.unwrap();
    assert_eq!(bal.amount, 100.0);
    assert_eq!(bal.consumed, 50.0);
    assert_eq!(bal.balance, 50.0);
}

#[tokio::test]
async fn local_kernel_isolation_between_runs() {
    // 两次独立的 run_local_kernel 应有独立的内存数据库
    let s1 = corn_tauri::run_local_kernel().await.unwrap();
    let s2 = corn_tauri::run_local_kernel().await.unwrap();

    // 在 s1 创建空间，s2 不应感知
    s1.create_space(DEFAULT_TENANT, "a".into(), "A".into())
        .await
        .unwrap();
    let s1_spaces = s1.list_spaces(DEFAULT_TENANT).await.unwrap();
    let s2_spaces = s2.list_spaces(DEFAULT_TENANT).await.unwrap();
    assert_eq!(s1_spaces.len(), 2);
    assert_eq!(s2_spaces.len(), 1);
}
