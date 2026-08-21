//! corn-server HTTP 集成测试
//!
//! 通过 `tower::ServiceExt::oneshot` 直接调用 `routes::app()` 构造的 Router，
//! 无需绑定真实端口即可验证：
//! - 所有 REST 端点的 happy path 与 4xx 错误
//! - 多租户中间件：`X-Tenant-Id` 解析与默认租户回退
//! - Bearer Token 鉴权与免鉴权白名单（`/health`、`/swagger-ui`、`/api-docs`）
//! - OpenAPI 文档可访问性
//! - 业务规则在 HTTP 层的端到端表现

use std::sync::Arc;

use axum::body::Body;
use corn_core::{schema, Services, DEFAULT_TENANT};
use corn_server::state::{AppState, Config};
use corn_server::routes;
use http::Request;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

const T: i64 = DEFAULT_TENANT;

/// 构造一份测试用 AppState（内存 SQLite + 默认数据）。
async fn fresh_state(multi_tenant: bool, auth_token: Option<&str>) -> AppState {
    let repo = corn_core::connect("sqlite::memory:").await.unwrap();
    schema::ensure_schema(&repo).await.unwrap();
    let services = Services::new(repo);
    services.ensure_defaults(T).await.unwrap();
    let cfg = Arc::new(Config {
        database_url: "sqlite::memory:".into(),
        addr: "127.0.0.1:0".into(),
        auth_token: auth_token.map(str::to_string),
        multi_tenant,
        default_tenant: T,
    });
    AppState::new(services, cfg)
}

/// 构造 Router。
fn build_app(st: &AppState) -> axum::Router {
    routes::app(st.clone())
}

/// 发起一次请求并返回 (status, body JSON)。
async fn send(
    app: axum::Router,
    method: &str,
    path: &str,
    headers: &[(&str, &str)],
    body: Option<&str>,
) -> (http::StatusCode, Value) {
    let mut req_builder = Request::builder().method(method).uri(path);
    for (k, v) in headers {
        req_builder = req_builder.header(*k, *v);
    }
    let req = if let Some(b) = body {
        req_builder
            .header("content-type", "application/json")
            .body(Body::from(b.to_string()))
            .unwrap()
    } else {
        req_builder.body(Body::empty()).unwrap()
    };
    let resp = app.oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::String(String::from_utf8_lossy(&bytes).to_string()))
    };
    (status, json)
}

// ---------- 健康检查 ----------

#[tokio::test]
async fn health_returns_ok_without_auth() {
    let st = fresh_state(true, Some("secret")).await;
    let app = build_app(&st);
    let (status, body) = send(app, "GET", "/health", &[], None).await;
    assert_eq!(status, http::StatusCode::OK);
    assert_eq!(body, Value::String("ok".into()));
}

// ---------- 鉴权 ----------

#[tokio::test]
async fn auth_rejects_missing_token() {
    let st = fresh_state(true, Some("secret")).await;
    let app = build_app(&st);
    let (status, body) = send(app, "GET", "/v1/spaces", &[("X-Tenant-Id", "1")], None).await;
    assert_eq!(status, http::StatusCode::UNAUTHORIZED);
    assert_eq!(body["error"], "未授权");
}

#[tokio::test]
async fn auth_rejects_wrong_token() {
    let st = fresh_state(true, Some("secret")).await;
    let app = build_app(&st);
    let (status, _body) = send(
        app,
        "GET",
        "/v1/spaces",
        &[("X-Tenant-Id", "1"), ("Authorization", "Bearer wrong")],
        None,
    )
    .await;
    assert_eq!(status, http::StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn auth_accepts_correct_token() {
    let st = fresh_state(true, Some("secret")).await;
    let app = build_app(&st);
    let (status, body) = send(
        app,
        "GET",
        "/v1/spaces",
        &[("X-Tenant-Id", "1"), ("Authorization", "Bearer secret")],
        None,
    )
    .await;
    assert_eq!(status, http::StatusCode::OK);
    assert!(body.is_array());
}

#[tokio::test]
async fn auth_is_optional_when_token_unset() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    let (status, _body) = send(app, "GET", "/v1/spaces", &[("X-Tenant-Id", "1")], None).await;
    assert_eq!(status, http::StatusCode::OK);
}

// ---------- 多租户 ----------

#[tokio::test]
async fn tenant_resolver_uses_x_tenant_id_header() {
    let st = fresh_state(true, None).await;
    // 租户 1 有默认空间，租户 999 没有
    let app = build_app(&st);
    let (s1, b1) = send(app.clone(), "GET", "/v1/spaces", &[("X-Tenant-Id", "1")], None).await;
    assert_eq!(s1, http::StatusCode::OK);
    assert!(!b1.as_array().unwrap().is_empty());

    let app2 = build_app(&st);
    let (s2, b2) = send(app2, "GET", "/v1/spaces", &[("X-Tenant-Id", "999")], None).await;
    assert_eq!(s2, http::StatusCode::OK);
    assert!(b2.as_array().unwrap().is_empty());
}

#[tokio::test]
async fn tenant_resolver_falls_back_to_default_when_not_multi_tenant() {
    let st = fresh_state(false, None).await;
    let app = build_app(&st);
    // 不传 X-Tenant-Id 也应使用默认租户
    let (status, body) = send(app, "GET", "/v1/spaces", &[], None).await;
    assert_eq!(status, http::StatusCode::OK);
    assert!(!body.as_array().unwrap().is_empty());
    // 所有数据都属于默认租户
    assert_eq!(body[0]["tenant_id"], T);
}

// ---------- Category ----------

#[tokio::test]
async fn list_categories_returns_defaults() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    let (status, body) = send(app, "GET", "/v1/categories", &[("X-Tenant-Id", "1")], None).await;
    assert_eq!(status, http::StatusCode::OK);
    let arr = body.as_array().unwrap();
    assert_eq!(arr.len(), 2);
    let codes: Vec<&str> = arr.iter().map(|c| c["code"].as_str().unwrap()).collect();
    assert!(codes.contains(&"human"));
    assert!(codes.contains(&"money"));
}

#[tokio::test]
async fn create_category_returns_201_and_persists() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    let (status, body) = send(
        app.clone(),
        "POST",
        "/v1/categories",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"code":"new","name":"新","unit":"个"}"#),
    )
    .await;
    assert_eq!(status, http::StatusCode::CREATED);
    assert_eq!(body["code"], "new");

    let (s2, b2) = send(app, "GET", "/v1/categories", &[("X-Tenant-Id", "1")], None).await;
    assert_eq!(s2, http::StatusCode::OK);
    assert_eq!(b2.as_array().unwrap().len(), 3);
}

#[tokio::test]
async fn create_category_duplicate_returns_409() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    let (status, _body) = send(
        app,
        "POST",
        "/v1/categories",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"code":"human","name":"dup","unit":"个"}"#),
    )
    .await;
    assert_eq!(status, http::StatusCode::CONFLICT);
}

#[tokio::test]
async fn create_category_invalid_json_returns_400() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    let (status, _body) = send(
        app,
        "POST",
        "/v1/categories",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"code":""}"#),
    )
    .await;
    assert!(status.is_client_error());
}

#[tokio::test]
async fn delete_category_returns_204_and_404_for_missing() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    // 删除已存在的类别
    let (status, _body) = send(app.clone(), "DELETE", "/v1/categories/1", &[("X-Tenant-Id", "1")], None).await;
    assert_eq!(status, http::StatusCode::NO_CONTENT);
    // 再次删除应返回 404
    let (status2, body2) = send(app, "DELETE", "/v1/categories/1", &[("X-Tenant-Id", "1")], None).await;
    assert_eq!(status2, http::StatusCode::NOT_FOUND);
    assert!(body2["error"].as_str().unwrap().contains("category"));
}

// ---------- Space ----------

#[tokio::test]
async fn create_space_happy_path() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    let (status, body) = send(
        app,
        "POST",
        "/v1/spaces",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"code":"study","name":"学习"}"#),
    )
    .await;
    assert_eq!(status, http::StatusCode::CREATED);
    assert_eq!(body["code"], "study");
    assert_eq!(body["name"], "学习");
    assert_eq!(body["tenant_id"], 1);
}

// ---------- Budget ----------

#[tokio::test]
async fn create_budget_validates_category_and_space() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    // category_id 不存在
    let (status, _body) = send(
        app.clone(),
        "POST",
        "/v1/budgets",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"category_id":9999,"space_id":1,"amount":100}"#),
    )
    .await;
    assert_eq!(status, http::StatusCode::NOT_FOUND);
    // space_id 不存在
    let (status2, _body2) = send(
        app,
        "POST",
        "/v1/budgets",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"category_id":1,"space_id":9999,"amount":100}"#),
    )
    .await;
    assert_eq!(status2, http::StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn list_budgets_by_space_endpoint() {
    let st = fresh_state(true, None).await;
    // 先创建预算
    let app = build_app(&st);
    let (_, _) = send(
        app.clone(),
        "POST",
        "/v1/budgets",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"category_id":1,"space_id":1,"amount":100,"labels":[{"key":"k","value":"v"}]}"#),
    )
    .await;
    let (status, body) = send(app, "GET", "/v1/spaces/1/budgets", &[("X-Tenant-Id", "1")], None).await;
    assert_eq!(status, http::StatusCode::OK);
    let arr = body.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["amount"], 100.0);
    assert_eq!(arr[0]["labels"][0]["key"], "k");
}

// ---------- Action ----------

#[tokio::test]
async fn create_action_with_null_parent_id() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    let (status, body) = send(
        app,
        "POST",
        "/v1/actions",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"space_id":1,"name":"act","labels":[]}"#),
    )
    .await;
    assert_eq!(status, http::StatusCode::CREATED);
    assert!(body["parent_id"].is_null());
}

#[tokio::test]
async fn create_action_with_parent_id() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    // 父
    let (_, parent) = send(
        app.clone(),
        "POST",
        "/v1/actions",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"space_id":1,"name":"parent","labels":[]}"#),
    )
    .await;
    let parent_id = parent["id"].as_i64().unwrap();
    // 子
    let (status, body) = send(
        app,
        "POST",
        "/v1/actions",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(&format!(r#"{{"space_id":1,"parent_id":{},"name":"child","labels":[]}}"#, parent_id)),
    )
    .await;
    assert_eq!(status, http::StatusCode::CREATED);
    assert_eq!(body["parent_id"], parent_id);
}

#[tokio::test]
async fn get_action_returns_404_for_missing() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    let (status, _body) = send(app, "GET", "/v1/actions/9999", &[("X-Tenant-Id", "1")], None).await;
    assert_eq!(status, http::StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn list_child_actions_endpoint() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    let (_, parent) = send(
        app.clone(),
        "POST",
        "/v1/actions",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"space_id":1,"name":"parent","labels":[]}"#),
    )
    .await;
    let parent_id = parent["id"].as_i64().unwrap();
    let _ = send(
        app.clone(),
        "POST",
        "/v1/actions",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(&format!(r#"{{"space_id":1,"parent_id":{},"name":"c1","labels":[]}}"#, parent_id)),
    )
    .await;
    let (status, body) = send(
        app,
        "GET",
        &format!("/v1/actions/{}/children", parent_id),
        &[("X-Tenant-Id", "1")],
        None,
    )
    .await;
    assert_eq!(status, http::StatusCode::OK);
    assert_eq!(body.as_array().unwrap().len(), 1);
}

// ---------- Quota ----------

#[tokio::test]
async fn create_quota_child_exceeds_parent_returns_409() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    // 预算
    let (_, _b) = send(
        app.clone(),
        "POST",
        "/v1/budgets",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"category_id":1,"space_id":1,"amount":100}"#),
    )
    .await;
    // 父活动 + 父配额 100
    let (_, p) = send(
        app.clone(),
        "POST",
        "/v1/actions",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"space_id":1,"name":"p","labels":[]}"#),
    )
    .await;
    let pid = p["id"].as_i64().unwrap();
    let _ = send(
        app.clone(),
        "POST",
        "/v1/quotas",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(&format!(r#"{{"budget_id":1,"action_id":{},"amount":100}}"#, pid)),
    )
    .await;
    // 子活动
    let (_, c) = send(
        app.clone(),
        "POST",
        "/v1/actions",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(&format!(r#"{{"space_id":1,"parent_id":{},"name":"c","labels":[]}}"#, pid)),
    )
    .await;
    let cid = c["id"].as_i64().unwrap();
    // 子配额 1000 → 应 409
    let (status, body) = send(
        app,
        "POST",
        "/v1/quotas",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(&format!(r#"{{"budget_id":1,"action_id":{},"amount":1000}}"#, cid)),
    )
    .await;
    assert_eq!(status, http::StatusCode::CONFLICT);
    assert!(body["error"].as_str().unwrap().contains("超过父配额"));
}

#[tokio::test]
async fn quota_balance_endpoint_returns_correct_calc() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    let (_, _) = send(
        app.clone(),
        "POST",
        "/v1/budgets",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"category_id":1,"space_id":1,"amount":1000}"#),
    )
    .await;
    let (_, a) = send(
        app.clone(),
        "POST",
        "/v1/actions",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"space_id":1,"name":"a","labels":[]}"#),
    )
    .await;
    let aid = a["id"].as_i64().unwrap();
    let (_, q) = send(
        app.clone(),
        "POST",
        "/v1/quotas",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(&format!(r#"{{"budget_id":1,"action_id":{},"amount":200}}"#, aid)),
    )
    .await;
    let qid = q["id"].as_i64().unwrap();
    // 写入记录 50
    let (_, _) = send(
        app.clone(),
        "POST",
        "/v1/records",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(&format!(r#"{{"quota_id":{},"amount":50}}"#, qid)),
    )
    .await;
    let (status, body) = send(
        app,
        "GET",
        &format!("/v1/quotas/{}/balance", qid),
        &[("X-Tenant-Id", "1")],
        None,
    )
    .await;
    assert_eq!(status, http::StatusCode::OK);
    assert_eq!(body["amount"], 200.0);
    assert_eq!(body["consumed"], 50.0);
    assert_eq!(body["balance"], 150.0);
}

// ---------- Record ----------

#[tokio::test]
async fn create_record_overspend_returns_409() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    let (_, _) = send(
        app.clone(),
        "POST",
        "/v1/budgets",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"category_id":1,"space_id":1,"amount":1000}"#),
    )
    .await;
    let (_, a) = send(
        app.clone(),
        "POST",
        "/v1/actions",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"space_id":1,"name":"a","labels":[]}"#),
    )
    .await;
    let aid = a["id"].as_i64().unwrap();
    let (_, q) = send(
        app.clone(),
        "POST",
        "/v1/quotas",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(&format!(r#"{{"budget_id":1,"action_id":{},"amount":100}}"#, aid)),
    )
    .await;
    let qid = q["id"].as_i64().unwrap();
    // 200 > 100 应失败
    let (status, body) = send(
        app,
        "POST",
        "/v1/records",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(&format!(r#"{{"quota_id":{},"amount":200}}"#, qid)),
    )
    .await;
    assert_eq!(status, http::StatusCode::CONFLICT);
    assert!(body["error"].as_str().unwrap().contains("超出配额余额"));
}

#[tokio::test]
async fn list_records_by_quota_endpoint() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    let (_, _) = send(
        app.clone(),
        "POST",
        "/v1/budgets",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"category_id":1,"space_id":1,"amount":1000}"#),
    )
    .await;
    let (_, a) = send(
        app.clone(),
        "POST",
        "/v1/actions",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"space_id":1,"name":"a","labels":[]}"#),
    )
    .await;
    let aid = a["id"].as_i64().unwrap();
    let (_, q) = send(
        app.clone(),
        "POST",
        "/v1/quotas",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(&format!(r#"{{"budget_id":1,"action_id":{},"amount":100}}"#, aid)),
    )
    .await;
    let qid = q["id"].as_i64().unwrap();
    let _ = send(
        app.clone(),
        "POST",
        "/v1/records",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(&format!(r#"{{"quota_id":{},"amount":30}}"#, qid)),
    )
    .await;
    let (status, body) = send(
        app,
        "GET",
        &format!("/v1/quotas/{}/records", qid),
        &[("X-Tenant-Id", "1")],
        None,
    )
    .await;
    assert_eq!(status, http::StatusCode::OK);
    assert_eq!(body.as_array().unwrap().len(), 1);
    assert_eq!(body[0]["amount"], 30.0);
}

// ---------- Recorder ----------

#[tokio::test]
async fn create_recorder_happy_path() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    let (status, body) = send(
        app,
        "POST",
        "/v1/recorders",
        &[("X-Tenant-Id", "1"), ("content-type", "application/json")],
        Some(r#"{"category_id":1,"space_id":1,"budget_labels":[{"key":"k","value":"v"}],"action_labels":[],"config":{"cron":"0 0 * * *"}}"#),
    )
    .await;
    assert_eq!(status, http::StatusCode::CREATED);
    assert_eq!(body["category_id"], 1);
    assert_eq!(body["space_id"], 1);
    assert!(body["action_id"].is_null());
    assert_eq!(body["budget_labels"][0]["key"], "k");
    assert_eq!(body["config"]["cron"], "0 0 * * *");
}

// ---------- OpenAPI ----------

#[tokio::test]
async fn openapi_doc_contains_all_paths_and_schemas() {
    use utoipa::OpenApi;
    let doc = corn_server::openapi::ApiDoc::openapi();
    let json = serde_json::to_value(&doc).unwrap();
    let paths = json["paths"].as_object().unwrap();
    // 抽样校验若干关键路径
    for path in [
        "/v1/categories",
        "/v1/spaces",
        "/v1/budgets",
        "/v1/actions",
        "/v1/quotas",
        "/v1/records",
        "/v1/recorders",
    ] {
        assert!(paths.contains_key(path), "OpenAPI 缺少路径 {}", path);
    }
    let schemas = json["components"]["schemas"].as_object().unwrap();
    for schema in [
        "Category",
        "Space",
        "Budget",
        "Action",
        "Quota",
        "QuotaBalance",
        "Record",
        "Recorder",
        "Label",
        "CreateCategory",
        "CreateSpace",
        "CreateBudget",
        "CreateAction",
        "CreateQuota",
        "CreateRecord",
        "CreateRecorder",
    ] {
        assert!(schemas.contains_key(schema), "OpenAPI 缺少 schema {}", schema);
    }
    assert_eq!(json["info"]["title"], "玉米 CORN API");
    assert_eq!(json["info"]["version"], "0.1.0");
}

// ---------- 错误响应格式 ----------

#[tokio::test]
async fn error_response_has_status_and_error_fields() {
    let st = fresh_state(true, None).await;
    let app = build_app(&st);
    let (status, body) = send(app, "GET", "/v1/budgets/9999", &[("X-Tenant-Id", "1")], None).await;
    assert_eq!(status, http::StatusCode::NOT_FOUND);
    assert_eq!(body["status"], 404);
    assert!(body["error"].as_str().unwrap().contains("budget"));
}
