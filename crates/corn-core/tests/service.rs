//! corn-core 服务层集成测试
//!
//! 覆盖 `Services` 暴露的所有业务规则：
//! - 默认数据初始化（幂等）
//! - 类别 / 空间的输入校验与冲突
//! - 预算金额校验、跨实体存在性
//! - 活动父子同空间约束
//! - 配额：负数、跨空间、子配额之和 ≤ 父配额
//! - 记录：金额必须 > 0、不可超额
//! - 记录器：关联实体的存在性

use corn_core::{
    schema, Services, DEFAULT_TENANT,
};

/// 构造一份全新的内存 SQLite 内核服务（每个用例独立数据库）。
async fn fresh_services() -> Services {
    let repo = corn_core::connect("sqlite::memory:").await.unwrap();
    schema::ensure_schema(&repo).await.unwrap();
    let services = Services::new(repo);
    services.ensure_defaults(DEFAULT_TENANT).await.unwrap();
    services
}

const T: i64 = DEFAULT_TENANT;

#[tokio::test]
async fn ensure_defaults_is_idempotent() {
    let s = fresh_services().await;
    // 二次调用不应报错且不应产生重复数据
    s.ensure_defaults(T).await.unwrap();
    let spaces = s.list_spaces(T).await.unwrap();
    assert_eq!(spaces.len(), 1);
    assert_eq!(spaces[0].code, "default");
    let cats = s.list_categories(T).await.unwrap();
    assert_eq!(cats.len(), 2);
    let codes: Vec<_> = cats.iter().map(|c| c.code.as_str()).collect();
    assert!(codes.contains(&"human"));
    assert!(codes.contains(&"money"));
}

#[tokio::test]
async fn create_category_rejects_empty_code() {
    let s = fresh_services().await;
    let err = s
        .create_category(T, "  ".into(), "x".into(), "u".into())
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::Conflict(_)));
}

#[tokio::test]
async fn create_category_rejects_duplicate_code() {
    let s = fresh_services().await;
    s.create_category(T, "dup".into(), "1".into(), "u".into())
        .await
        .unwrap();
    let err = s
        .create_category(T, "dup".into(), "2".into(), "u".into())
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::Conflict(_)));
}

#[tokio::test]
async fn delete_category_returns_not_found_for_missing() {
    let s = fresh_services().await;
    let err = s.delete_category(T, 9999).await.unwrap_err();
    assert!(matches!(err, corn_core::RepoError::NotFound(_)));
}

#[tokio::test]
async fn delete_category_succeeds_and_isolates_tenant() {
    let s = fresh_services().await;
    let c = s
        .create_category(T, "tmp".into(), "tmp".into(), "u".into())
        .await
        .unwrap();
    s.delete_category(T, c.id).await.unwrap();
    // 已删除
    assert!(s.repo().get_category(T, c.id).await.is_err());
    // 其它租户看不到该类别
    assert!(s.repo().get_category(T + 1, c.id).await.is_err());
}

#[tokio::test]
async fn create_space_rejects_empty_code() {
    let s = fresh_services().await;
    let err = s
        .create_space(T, "".into(), "x".into())
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::Conflict(_)));
}

#[tokio::test]
async fn create_budget_rejects_negative_amount() {
    let s = fresh_services().await;
    let err = s
        .create_budget(T, 1, 1, -1.0, vec![])
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::Conflict(_)));
}

#[tokio::test]
async fn create_budget_validates_category_and_space_existence() {
    let s = fresh_services().await;
    // category_id 不存在
    let err = s
        .create_budget(T, 9999, 1, 100.0, vec![])
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::NotFound(_)));
    // space_id 不存在
    let err = s
        .create_budget(T, 1, 9999, 100.0, vec![])
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::NotFound(_)));
}

#[tokio::test]
async fn create_action_rejects_empty_name() {
    let s = fresh_services().await;
    let err = s
        .create_action(T, 1, None, "  ".into(), vec![])
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::Conflict(_)));
}

#[tokio::test]
async fn create_action_validates_space_and_parent_same_space() {
    let s = fresh_services().await;
    // space_id 不存在
    let err = s
        .create_action(T, 9999, None, "x".into(), vec![])
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::NotFound(_)));

    // 创建第二个空间 + 一个属于空间1的父活动
    let sp2 = s
        .create_space(T, "sp2".into(), "sp2".into())
        .await
        .unwrap();
    let parent = s
        .create_action(T, 1, None, "p".into(), vec![])
        .await
        .unwrap();
    // 子活动放进空间2，应被拒绝
    let err = s
        .create_action(T, sp2.id, Some(parent.id), "c".into(), vec![])
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::Conflict(_)));
}

#[tokio::test]
async fn create_quota_rejects_negative_amount() {
    let s = fresh_services().await;
    let b = s
        .create_budget(T, 1, 1, 100.0, vec![])
        .await
        .unwrap();
    let a = s
        .create_action(T, 1, None, "a".into(), vec![])
        .await
        .unwrap();
    let err = s
        .create_quota(T, b.id, a.id, -1.0)
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::Conflict(_)));
}

#[tokio::test]
async fn create_quota_validates_budget_and_action_existence() {
    let s = fresh_services().await;
    let a = s
        .create_action(T, 1, None, "a".into(), vec![])
        .await
        .unwrap();
    // budget_id 不存在
    let err = s
        .create_quota(T, 9999, a.id, 10.0)
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::NotFound(_)));
}

#[tokio::test]
async fn create_quota_rejects_cross_space_budget_and_action() {
    let s = fresh_services().await;
    let sp2 = s
        .create_space(T, "sp2".into(), "sp2".into())
        .await
        .unwrap();
    let b_in_sp1 = s
        .create_budget(T, 1, 1, 100.0, vec![])
        .await
        .unwrap();
    let a_in_sp2 = s
        .create_action(T, sp2.id, None, "a".into(), vec![])
        .await
        .unwrap();
    let err = s
        .create_quota(T, b_in_sp1.id, a_in_sp2.id, 10.0)
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::Conflict(_)));
}

#[tokio::test]
async fn create_quota_child_sum_cannot_exceed_parent() {
    let s = fresh_services().await;
    let b = s
        .create_budget(T, 1, 1, 100.0, vec![])
        .await
        .unwrap();
    let parent = s
        .create_action(T, 1, None, "p".into(), vec![])
        .await
        .unwrap();
    // 父配额 100
    s.create_quota(T, b.id, parent.id, 100.0).await.unwrap();
    let child = s
        .create_action(T, 1, Some(parent.id), "c".into(), vec![])
        .await
        .unwrap();
    // 子配额 1：允许（≤ 100）
    s.create_quota(T, b.id, child.id, 1.0).await.unwrap();
    // 子配额 100：应被拒绝（1 + 100 > 100）
    let err = s
        .create_quota(T, b.id, child.id, 100.0)
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::Conflict(_)));
    // 子配额 99：允许（1 + 99 = 100）
    s.create_quota(T, b.id, child.id, 99.0).await.unwrap();
}

#[tokio::test]
async fn create_record_rejects_non_positive_amount() {
    let s = fresh_services().await;
    let b = s
        .create_budget(T, 1, 1, 100.0, vec![])
        .await
        .unwrap();
    let a = s
        .create_action(T, 1, None, "a".into(), vec![])
        .await
        .unwrap();
    let q = s
        .create_quota(T, b.id, a.id, 50.0)
        .await
        .unwrap();
    let err = s
        .create_record(T, q.id, 0.0)
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::Conflict(_)));
    let err = s
        .create_record(T, q.id, -1.0)
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::Conflict(_)));
}

#[tokio::test]
async fn create_record_cannot_overspend_quota() {
    let s = fresh_services().await;
    let b = s
        .create_budget(T, 1, 1, 100.0, vec![])
        .await
        .unwrap();
    let a = s
        .create_action(T, 1, None, "a".into(), vec![])
        .await
        .unwrap();
    let q = s
        .create_quota(T, b.id, a.id, 100.0)
        .await
        .unwrap();
    // 60 允许
    s.create_record(T, q.id, 60.0).await.unwrap();
    // 50 超过余额 40 → 拒绝
    let err = s
        .create_record(T, q.id, 50.0)
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::Conflict(_)));
    // 40 刚好用完 → 允许
    s.create_record(T, q.id, 40.0).await.unwrap();
    // 余额归零后任意小金额都应被拒绝
    let err = s
        .create_record(T, q.id, 0.01)
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::Conflict(_)));
}

#[tokio::test]
async fn quota_balance_reflects_consumption() {
    let s = fresh_services().await;
    let b = s
        .create_budget(T, 1, 1, 100.0, vec![])
        .await
        .unwrap();
    let a = s
        .create_action(T, 1, None, "a".into(), vec![])
        .await
        .unwrap();
    let q = s
        .create_quota(T, b.id, a.id, 100.0)
        .await
        .unwrap();
    let bal0 = s.quota_balance(T, q.id).await.unwrap();
    assert_eq!(bal0.amount, 100.0);
    assert_eq!(bal0.consumed, 0.0);
    assert_eq!(bal0.balance, 100.0);

    s.create_record(T, q.id, 30.0).await.unwrap();
    s.create_record(T, q.id, 20.0).await.unwrap();
    let bal1 = s.quota_balance(T, q.id).await.unwrap();
    assert_eq!(bal1.consumed, 50.0);
    assert!((bal1.balance - 50.0).abs() < 1e-9);
}

#[tokio::test]
async fn create_recorder_validates_associated_entities() {
    let s = fresh_services().await;
    // category 不存在
    let err = s
        .create_recorder(T, 9999, 1, None, vec![], vec![], serde_json::json!({}))
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::NotFound(_)));
    // space 不存在
    let err = s
        .create_recorder(T, 1, 9999, None, vec![], vec![], serde_json::json!({}))
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::NotFound(_)));
    // action 不存在
    let err = s
        .create_recorder(T, 1, 1, Some(9999), vec![], vec![], serde_json::json!({}))
        .await
        .unwrap_err();
    assert!(matches!(err, corn_core::RepoError::NotFound(_)));
}

#[tokio::test]
async fn recorder_persists_labels_and_config() {
    let s = fresh_services().await;
    let labels = vec![
        corn_core::Label {
            key: "k".into(),
            value: "v".into(),
        },
        corn_core::Label {
            key: "k2".into(),
            value: "v2".into(),
        },
    ];
    let config = serde_json::json!({ "kind": "interval", "interval_seconds": 60 });
    let r = s
        .create_recorder(T, 1, 1, None, labels.clone(), labels.clone(), config.clone())
        .await
        .unwrap();
    assert_eq!(r.budget_labels, labels);
    assert_eq!(r.action_labels, labels);
    assert_eq!(r.config, config);
}

#[tokio::test]
async fn action_persists_parent_id_null_and_non_null() {
    let s = fresh_services().await;
    let p = s
        .create_action(T, 1, None, "p".into(), vec![])
        .await
        .unwrap();
    assert!(p.parent_id.is_none());
    let c = s
        .create_action(T, 1, Some(p.id), "c".into(), vec![])
        .await
        .unwrap();
    assert_eq!(c.parent_id, Some(p.id));
    // 列表查询时 NULL 与非 NULL 都能正确解码
    let actions = s.list_actions(T).await.unwrap();
    assert_eq!(actions.len(), 2);
    let fetched_p = actions.iter().find(|a| a.id == p.id).unwrap();
    assert!(fetched_p.parent_id.is_none());
    let fetched_c = actions.iter().find(|a| a.id == c.id).unwrap();
    assert_eq!(fetched_c.parent_id, Some(p.id));
    // 子活动列表
    let children = s.list_child_actions(T, p.id).await.unwrap();
    assert_eq!(children.len(), 1);
    assert_eq!(children[0].id, c.id);
}

#[tokio::test]
async fn tenant_isolation_in_service_layer() {
    let s = fresh_services().await;
    // 租户 1 已有 default 空间；租户 2 应看不到
    let spaces_t2 = s.list_spaces(T + 1).await.unwrap();
    assert!(spaces_t2.is_empty());
    // 租户 2 创建空间不应影响租户 1
    s.create_space(T + 1, "t2".into(), "t2".into())
        .await
        .unwrap();
    let spaces_t1 = s.list_spaces(T).await.unwrap();
    assert_eq!(spaces_t1.len(), 1);
    let spaces_t2 = s.list_spaces(T + 1).await.unwrap();
    assert_eq!(spaces_t2.len(), 1);
    assert_eq!(spaces_t2[0].code, "t2");
}
