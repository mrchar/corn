//! corn-core 仓储层集成测试
//!
//! 覆盖 `Repo` 暴露的基础数据访问与跨后端兼容点：
//! - 每个实体的 CRUD
//! - 多租户行级隔离
//! - NULL 列解码（action.parent_id / recorder.action_id）
//! - SUM 空集走 COALESCE 0.0
//! - 标签 JSON 双向序列化

use corn_core::{
    schema, Label, Repo, DEFAULT_TENANT,
};

/// 构造一份全新的内存 SQLite 仓储（每个用例独立数据库）。
async fn fresh_repo() -> Repo {
    let repo = corn_core::connect("sqlite::memory:").await.unwrap();
    schema::ensure_schema(&repo).await.unwrap();
    repo
}

const T: i64 = DEFAULT_TENANT;

#[tokio::test]
async fn category_crud_and_multi_tenant() {
    let r = fresh_repo().await;

    let c = r
        .create_category(T, "test".into(), "测试".into(), "件".into())
        .await
        .unwrap();
    assert!(c.id > 0);
    assert_eq!(c.tenant_id, T);
    assert_eq!(c.code, "test");

    // 单条查询
    let got = r.get_category(T, c.id).await.unwrap();
    assert_eq!(got.code, "test");

    // 列表查询
    let list = r.list_categories(T).await.unwrap();
    assert!(list.iter().any(|x| x.id == c.id));

    // 跨租户隔离：T+1 看不到 T 的类别
    assert!(r.get_category(T + 1, c.id).await.is_err());
    assert!(r.list_categories(T + 1).await.unwrap().is_empty());

    // 删除
    assert_eq!(r.delete_category(T, c.id).await.unwrap(), 1);
    assert!(r.get_category(T, c.id).await.is_err());
    // 二次删除返回 0
    assert_eq!(r.delete_category(T, c.id).await.unwrap(), 0);
}

#[tokio::test]
async fn find_category_by_code_is_tenant_scoped() {
    let r = fresh_repo().await;
    r.create_category(T, "dup".into(), "T".into(), "u".into())
        .await
        .unwrap();
    r.create_category(T + 1, "dup".into(), "T2".into(), "u".into())
        .await
        .unwrap();

    let c1 = r.find_category_by_code(T, "dup").await.unwrap().unwrap();
    assert_eq!(c1.name, "T");
    let c2 = r
        .find_category_by_code(T + 1, "dup")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(c2.name, "T2");
    assert!(r.find_category_by_code(T, "missing").await.unwrap().is_none());
}

#[tokio::test]
async fn count_spaces_is_tenant_scoped() {
    let r = fresh_repo().await;
    assert_eq!(r.count_spaces(T).await.unwrap(), 0);
    r.create_space(T, "a".into(), "A".into()).await.unwrap();
    r.create_space(T, "b".into(), "B".into()).await.unwrap();
    r.create_space(T + 1, "c".into(), "C".into())
        .await
        .unwrap();
    assert_eq!(r.count_spaces(T).await.unwrap(), 2);
    assert_eq!(r.count_spaces(T + 1).await.unwrap(), 1);
}

#[tokio::test]
async fn budget_crud_with_labels() {
    let r = fresh_repo().await;
    r.create_category(T, "money".into(), "资金".into(), "元".into())
        .await
        .unwrap();
    r.create_space(T, "s".into(), "S".into()).await.unwrap();

    let labels = vec![
        Label {
            key: "k".into(),
            value: "v".into(),
        },
        Label {
            key: "k2".into(),
            value: "v2".into(),
        },
    ];
    let b = r
        .create_budget(T, 1, 1, 100.5, &labels)
        .await
        .unwrap();
    assert_eq!(b.amount, 100.5);
    assert_eq!(b.labels, labels);

    // 按空间查询
    let by_space = r.list_budgets_by_space(T, 1).await.unwrap();
    assert_eq!(by_space.len(), 1);
    assert_eq!(by_space[0].labels, labels);

    // 跨租户隔离
    assert!(r.list_budgets_by_space(T + 1, 1).await.unwrap().is_empty());
    assert!(r.get_budget(T + 1, b.id).await.is_err());
}

#[tokio::test]
async fn action_parent_id_null_decodes_as_none() {
    let r = fresh_repo().await;
    r.create_space(T, "s".into(), "S".into()).await.unwrap();

    // 无父活动 → parent_id = NULL
    let a = r
        .create_action(T, 1, None, "root".into(), &[])
        .await
        .unwrap();
    assert!(a.parent_id.is_none());

    // 直接读取，确保 Any 驱动对 NULL 列不会 panic
    let fetched = r.get_action(T, a.id).await.unwrap();
    assert!(fetched.parent_id.is_none());

    // 列表查询同样不应 panic
    let list = r.list_actions(T).await.unwrap();
    assert_eq!(list.len(), 1);
    assert!(list[0].parent_id.is_none());
}

#[tokio::test]
async fn action_with_parent_decodes_correctly() {
    let r = fresh_repo().await;
    r.create_space(T, "s".into(), "S".into()).await.unwrap();
    let p = r
        .create_action(T, 1, None, "p".into(), &[])
        .await
        .unwrap();
    let c = r
        .create_action(T, 1, Some(p.id), "c".into(), &[])
        .await
        .unwrap();
    assert_eq!(c.parent_id, Some(p.id));

    // 子活动列表
    let children = r.list_child_actions(T, p.id).await.unwrap();
    assert_eq!(children.len(), 1);
    assert_eq!(children[0].id, c.id);

    // 跨租户查询子活动应隔离
    let children_t2 = r.list_child_actions(T + 1, p.id).await.unwrap();
    assert!(children_t2.is_empty());
}

#[tokio::test]
async fn quota_and_records_balance_calculation() {
    let r = fresh_repo().await;
    r.create_category(T, "money".into(), "资金".into(), "元".into())
        .await
        .unwrap();
    r.create_space(T, "s".into(), "S".into()).await.unwrap();
    r.create_budget(T, 1, 1, 1000.0, &[]).await.unwrap();
    r.create_action(T, 1, None, "a".into(), &[]).await.unwrap();
    let q = r
        .create_quota(T, 1, 1, 200.0)
        .await
        .unwrap();

    // 空集 SUM 应返回 0.0 而非 panic
    let consumed0 = r.quota_consumed(T, q.id).await.unwrap();
    assert_eq!(consumed0, 0.0);

    // 写入两条记录
    r.create_record(T, q.id, 50.0).await.unwrap();
    r.create_record(T, q.id, 75.5).await.unwrap();
    let consumed1 = r.quota_consumed(T, q.id).await.unwrap();
    assert!((consumed1 - 125.5).abs() < 1e-9);

    // balance = 200 - 125.5 = 74.5
    let bal = r.quota_balance(T, q.id).await.unwrap();
    assert_eq!(bal.quota_id, q.id);
    assert_eq!(bal.amount, 200.0);
    assert!((bal.consumed - 125.5).abs() < 1e-9);
    assert!((bal.balance - 74.5).abs() < 1e-9);

    // 跨租户查询：余额应 NotFound
    assert!(r.quota_balance(T + 1, q.id).await.is_err());
}

#[tokio::test]
async fn sum_functions_handle_empty_sets() {
    let r = fresh_repo().await;
    // 不存在的 parent_id：SUM 应返回 0.0
    let sum_child = r.sum_child_quota_amount(T, 9999).await.unwrap();
    assert_eq!(sum_child, 0.0);
    let sum_by_action = r.sum_quota_amount_by_action(T, 9999).await.unwrap();
    assert_eq!(sum_by_action, 0.0);
    // quota_consumed 同样在空集上返回 0.0
    let consumed = r.quota_consumed(T, 9999).await.unwrap();
    assert_eq!(consumed, 0.0);
}

#[tokio::test]
async fn sum_quota_amount_by_action_aggregates_correctly() {
    let r = fresh_repo().await;
    r.create_category(T, "money".into(), "资金".into(), "元".into())
        .await
        .unwrap();
    r.create_space(T, "s".into(), "S".into()).await.unwrap();
    r.create_budget(T, 1, 1, 1000.0, &[]).await.unwrap();
    r.create_action(T, 1, None, "a".into(), &[]).await.unwrap();

    // 同一 action 的多个配额应被聚合
    r.create_quota(T, 1, 1, 100.0).await.unwrap();
    r.create_quota(T, 1, 1, 200.0).await.unwrap();
    r.create_quota(T, 1, 1, 300.0).await.unwrap();
    let total = r.sum_quota_amount_by_action(T, 1).await.unwrap();
    assert!((total - 600.0).abs() < 1e-9);
}

#[tokio::test]
async fn recorder_with_null_action_id_decodes_as_none() {
    let r = fresh_repo().await;
    r.create_category(T, "money".into(), "资金".into(), "元".into())
        .await
        .unwrap();
    r.create_space(T, "s".into(), "S".into()).await.unwrap();

    // action_id 为 None
    let rec = r
        .create_recorder(
            T,
            1,
            1,
            None,
            &[],
            &[],
            &serde_json::json!({"k": "v"}),
        )
        .await
        .unwrap();
    assert!(rec.action_id.is_none());

    // 再次读取，确保 NULL 列不会 panic
    let fetched = r.get_recorder(T, rec.id).await.unwrap();
    assert!(fetched.action_id.is_none());
    assert_eq!(fetched.config, serde_json::json!({"k": "v"}));

    // 列表查询
    let list = r.list_recorders(T).await.unwrap();
    assert_eq!(list.len(), 1);
    assert!(list[0].action_id.is_none());
}

#[tokio::test]
async fn recorder_with_action_id_decodes_correctly() {
    let r = fresh_repo().await;
    r.create_category(T, "money".into(), "资金".into(), "元".into())
        .await
        .unwrap();
    r.create_space(T, "s".into(), "S".into()).await.unwrap();
    r.create_action(T, 1, None, "a".into(), &[]).await.unwrap();

    let rec = r
        .create_recorder(
            T,
            1,
            1,
            Some(1),
            &[Label {
                key: "k".into(),
                value: "v".into(),
            }],
            &[],
            &serde_json::json!({}),
        )
        .await
        .unwrap();
    assert_eq!(rec.action_id, Some(1));
    assert_eq!(rec.budget_labels.len(), 1);
    assert!(rec.action_labels.is_empty());

    let fetched = r.get_recorder(T, rec.id).await.unwrap();
    assert_eq!(fetched.action_id, Some(1));
    assert_eq!(fetched.budget_labels[0].key, "k");
}

#[tokio::test]
async fn schema_is_idempotent() {
    let r = fresh_repo().await;
    // 二次调用 ensure_schema 不应报错
    schema::ensure_schema(&r).await.unwrap();
    schema::ensure_schema(&r).await.unwrap();
    // 表仍然可用
    r.create_space(T, "x".into(), "X".into()).await.unwrap();
}

#[tokio::test]
async fn list_records_by_quota_is_tenant_scoped() {
    let r = fresh_repo().await;
    r.create_category(T, "money".into(), "资金".into(), "元".into())
        .await
        .unwrap();
    r.create_space(T, "s".into(), "S".into()).await.unwrap();
    r.create_budget(T, 1, 1, 1000.0, &[]).await.unwrap();
    r.create_action(T, 1, None, "a".into(), &[]).await.unwrap();
    r.create_quota(T, 1, 1, 100.0).await.unwrap();
    r.create_record(T, 1, 30.0).await.unwrap();
    r.create_record(T, 1, 40.0).await.unwrap();

    // T 看到两条
    let recs = r.list_records_by_quota(T, 1).await.unwrap();
    assert_eq!(recs.len(), 2);
    // T+1 看不到
    let recs_t2 = r.list_records_by_quota(T + 1, 1).await.unwrap();
    assert!(recs_t2.is_empty());
    // 全租户记录列表
    let all = r.list_records(T).await.unwrap();
    assert_eq!(all.len(), 2);
    let all_t2 = r.list_records(T + 1).await.unwrap();
    assert!(all_t2.is_empty());
}

#[tokio::test]
async fn list_quotas_by_action_is_tenant_scoped() {
    let r = fresh_repo().await;
    r.create_category(T, "money".into(), "资金".into(), "元".into())
        .await
        .unwrap();
    r.create_space(T, "s".into(), "S".into()).await.unwrap();
    r.create_budget(T, 1, 1, 1000.0, &[]).await.unwrap();
    r.create_action(T, 1, None, "a".into(), &[]).await.unwrap();
    r.create_quota(T, 1, 1, 100.0).await.unwrap();

    let qs = r.list_quotas_by_action(T, 1).await.unwrap();
    assert_eq!(qs.len(), 1);
    let qs_t2 = r.list_quotas_by_action(T + 1, 1).await.unwrap();
    assert!(qs_t2.is_empty());
}
