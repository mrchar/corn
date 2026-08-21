//! HTTP 路由与 handler
//!
//! 薄薄一层：协议适配 + 鉴权/租户上下文 → 调用 corn-core service。

use crate::dto::{
    CreateAction, CreateBudget, CreateCategory, CreateQuota, CreateRecord, CreateRecorder,
    CreateSpace,
};
use crate::error::ApiError;
use crate::middleware::TenantContext;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::routing::{delete, get, post};
use axum::{Extension, Json, Router};
use axum::http::StatusCode;
use corn_core::model::{
    Action, Budget, Category, Quota, QuotaBalance, Record, Recorder, Space,
};

// ---------- Category ----------

#[utoipa::path(
    get, path = "/v1/categories",
    responses((status = 200, body = Vec<Category>, description = "类别列表")),
    tag = "category"
)]
async fn list_categories(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
) -> Result<Json<Vec<Category>>, ApiError> {
    Ok(Json(st.services.list_categories(tc.id).await?))
}

#[utoipa::path(
    post, path = "/v1/categories",
    request_body = CreateCategory,
    responses((status = 201, body = Category, description = "创建类别")),
    tag = "category"
)]
async fn create_category(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Json(body): Json<CreateCategory>,
) -> Result<(StatusCode, Json<Category>), ApiError> {
    let cat = st
        .services
        .create_category(tc.id, body.code, body.name, body.unit)
        .await?;
    Ok((StatusCode::CREATED, Json(cat)))
}

#[utoipa::path(
    delete, path = "/v1/categories/{id}",
    responses((status = 204, description = "删除类别")),
    tag = "category",
    params(("id" = i64, Path, description = "类别 ID"))
)]
async fn delete_category(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Path(id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    st.services.delete_category(tc.id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ---------- Space ----------

#[utoipa::path(
    get, path = "/v1/spaces",
    responses((status = 200, body = Vec<Space>, description = "空间列表")),
    tag = "space"
)]
async fn list_spaces(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
) -> Result<Json<Vec<Space>>, ApiError> {
    Ok(Json(st.services.list_spaces(tc.id).await?))
}

#[utoipa::path(
    post, path = "/v1/spaces",
    request_body = CreateSpace,
    responses((status = 201, body = Space, description = "创建空间")),
    tag = "space"
)]
async fn create_space(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Json(body): Json<CreateSpace>,
) -> Result<(StatusCode, Json<Space>), ApiError> {
    let sp = st
        .services
        .create_space(tc.id, body.code, body.name)
        .await?;
    Ok((StatusCode::CREATED, Json(sp)))
}

#[utoipa::path(
    get, path = "/v1/spaces/{id}/budgets",
    responses((status = 200, body = Vec<Budget>, description = "空间下的预算")),
    tag = "space",
    params(("id" = i64, Path, description = "空间 ID"))
)]
async fn list_budgets_by_space(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Path(id): Path<i64>,
) -> Result<Json<Vec<Budget>>, ApiError> {
    Ok(Json(st.services.list_budgets_by_space(tc.id, id).await?))
}

// ---------- Budget ----------

#[utoipa::path(
    get, path = "/v1/budgets",
    responses((status = 200, body = Vec<Budget>, description = "预算列表")),
    tag = "budget"
)]
async fn list_budgets(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
) -> Result<Json<Vec<Budget>>, ApiError> {
    Ok(Json(st.services.list_budgets(tc.id).await?))
}

#[utoipa::path(
    post, path = "/v1/budgets",
    request_body = CreateBudget,
    responses((status = 201, body = Budget, description = "创建预算")),
    tag = "budget"
)]
async fn create_budget(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Json(body): Json<CreateBudget>,
) -> Result<(StatusCode, Json<Budget>), ApiError> {
    let b = st
        .services
        .create_budget(tc.id, body.category_id, body.space_id, body.amount, body.labels)
        .await?;
    Ok((StatusCode::CREATED, Json(b)))
}

#[utoipa::path(
    get, path = "/v1/budgets/{id}",
    responses((status = 200, body = Budget, description = "预算详情")),
    tag = "budget",
    params(("id" = i64, Path, description = "预算 ID"))
)]
async fn get_budget(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Path(id): Path<i64>,
) -> Result<Json<Budget>, ApiError> {
    Ok(Json(st.services.get_budget(tc.id, id).await?))
}

// ---------- Action ----------

#[utoipa::path(
    get, path = "/v1/actions",
    responses((status = 200, body = Vec<Action>, description = "活动列表")),
    tag = "action"
)]
async fn list_actions(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
) -> Result<Json<Vec<Action>>, ApiError> {
    Ok(Json(st.services.list_actions(tc.id).await?))
}

#[utoipa::path(
    post, path = "/v1/actions",
    request_body = CreateAction,
    responses((status = 201, body = Action, description = "创建活动")),
    tag = "action"
)]
async fn create_action(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Json(body): Json<CreateAction>,
) -> Result<(StatusCode, Json<Action>), ApiError> {
    let a = st
        .services
        .create_action(tc.id, body.space_id, body.parent_id, body.name, body.labels)
        .await?;
    Ok((StatusCode::CREATED, Json(a)))
}

#[utoipa::path(
    get, path = "/v1/actions/{id}",
    responses((status = 200, body = Action, description = "活动详情")),
    tag = "action",
    params(("id" = i64, Path, description = "活动 ID"))
)]
async fn get_action(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Path(id): Path<i64>,
) -> Result<Json<Action>, ApiError> {
    Ok(Json(st.services.get_action(tc.id, id).await?))
}

#[utoipa::path(
    get, path = "/v1/actions/{id}/children",
    responses((status = 200, body = Vec<Action>, description = "子活动列表")),
    tag = "action",
    params(("id" = i64, Path, description = "父活动 ID"))
)]
async fn list_child_actions(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Path(id): Path<i64>,
) -> Result<Json<Vec<Action>>, ApiError> {
    Ok(Json(st.services.list_child_actions(tc.id, id).await?))
}

#[utoipa::path(
    get, path = "/v1/actions/{id}/quotas",
    responses((status = 200, body = Vec<Quota>, description = "活动下的配额")),
    tag = "action",
    params(("id" = i64, Path, description = "活动 ID"))
)]
async fn list_quotas_by_action(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Path(id): Path<i64>,
) -> Result<Json<Vec<Quota>>, ApiError> {
    Ok(Json(st.services.list_quotas_by_action(tc.id, id).await?))
}

// ---------- Quota ----------

#[utoipa::path(
    get, path = "/v1/quotas",
    responses((status = 200, body = Vec<Quota>, description = "配额列表")),
    tag = "quota"
)]
async fn list_quotas(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
) -> Result<Json<Vec<Quota>>, ApiError> {
    Ok(Json(st.services.list_quotas(tc.id).await?))
}

#[utoipa::path(
    post, path = "/v1/quotas",
    request_body = CreateQuota,
    responses((status = 201, body = Quota, description = "创建配额")),
    tag = "quota"
)]
async fn create_quota(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Json(body): Json<CreateQuota>,
) -> Result<(StatusCode, Json<Quota>), ApiError> {
    let q = st
        .services
        .create_quota(tc.id, body.budget_id, body.action_id, body.amount)
        .await?;
    Ok((StatusCode::CREATED, Json(q)))
}

#[utoipa::path(
    get, path = "/v1/quotas/{id}",
    responses((status = 200, body = Quota, description = "配额详情")),
    tag = "quota",
    params(("id" = i64, Path, description = "配额 ID"))
)]
async fn get_quota(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Path(id): Path<i64>,
) -> Result<Json<Quota>, ApiError> {
    Ok(Json(st.services.get_quota(tc.id, id).await?))
}

#[utoipa::path(
    get, path = "/v1/quotas/{id}/balance",
    responses((status = 200, body = QuotaBalance, description = "配额余额")),
    tag = "quota",
    params(("id" = i64, Path, description = "配额 ID"))
)]
async fn quota_balance(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Path(id): Path<i64>,
) -> Result<Json<QuotaBalance>, ApiError> {
    Ok(Json(st.services.quota_balance(tc.id, id).await?))
}

#[utoipa::path(
    get, path = "/v1/quotas/{id}/records",
    responses((status = 200, body = Vec<Record>, description = "配额下的消耗记录")),
    tag = "quota",
    params(("id" = i64, Path, description = "配额 ID"))
)]
async fn list_records_by_quota(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Path(id): Path<i64>,
) -> Result<Json<Vec<Record>>, ApiError> {
    Ok(Json(st.services.list_records_by_quota(tc.id, id).await?))
}

// ---------- Record ----------

#[utoipa::path(
    get, path = "/v1/records",
    responses((status = 200, body = Vec<Record>, description = "消耗记录列表")),
    tag = "record"
)]
async fn list_records(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
) -> Result<Json<Vec<Record>>, ApiError> {
    Ok(Json(st.services.list_records(tc.id).await?))
}

#[utoipa::path(
    post, path = "/v1/records",
    request_body = CreateRecord,
    responses((status = 201, body = Record, description = "创建消耗记录")),
    tag = "record"
)]
async fn create_record(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Json(body): Json<CreateRecord>,
) -> Result<(StatusCode, Json<Record>), ApiError> {
    let r = st
        .services
        .create_record(tc.id, body.quota_id, body.amount)
        .await?;
    Ok((StatusCode::CREATED, Json(r)))
}

// ---------- Recorder ----------

#[utoipa::path(
    get, path = "/v1/recorders",
    responses((status = 200, body = Vec<Recorder>, description = "记录器列表")),
    tag = "recorder"
)]
async fn list_recorders(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
) -> Result<Json<Vec<Recorder>>, ApiError> {
    Ok(Json(st.services.list_recorders(tc.id).await?))
}

#[utoipa::path(
    post, path = "/v1/recorders",
    request_body = CreateRecorder,
    responses((status = 201, body = Recorder, description = "创建记录器")),
    tag = "recorder"
)]
async fn create_recorder(
    State(st): State<AppState>,
    Extension(tc): Extension<TenantContext>,
    Json(body): Json<CreateRecorder>,
) -> Result<(StatusCode, Json<Recorder>), ApiError> {
    let r = st
        .services
        .create_recorder(
            tc.id,
            body.category_id,
            body.space_id,
            body.action_id,
            body.budget_labels,
            body.action_labels,
            body.config,
        )
        .await?;
    Ok((StatusCode::CREATED, Json(r)))
}

// ---------- Health ----------

async fn health() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

/// 构建带鉴权与租户中间件的应用路由
pub fn app(st: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/categories", get(list_categories).post(create_category))
        .route("/v1/categories/:id", delete(delete_category))
        .route("/v1/spaces", get(list_spaces).post(create_space))
        .route("/v1/spaces/:id/budgets", get(list_budgets_by_space))
        .route("/v1/budgets", get(list_budgets).post(create_budget))
        .route("/v1/budgets/:id", get(get_budget))
        .route("/v1/actions", get(list_actions).post(create_action))
        .route("/v1/actions/:id", get(get_action))
        .route("/v1/actions/:id/children", get(list_child_actions))
        .route("/v1/actions/:id/quotas", get(list_quotas_by_action))
        .route("/v1/quotas", get(list_quotas).post(create_quota))
        .route("/v1/quotas/:id", get(get_quota))
        .route("/v1/quotas/:id/balance", get(quota_balance))
        .route("/v1/quotas/:id/records", get(list_records_by_quota))
        .route("/v1/records", get(list_records).post(create_record))
        .route("/v1/recorders", get(list_recorders).post(create_recorder))
        .layer(axum::middleware::from_fn_with_state(st.clone(), crate::middleware::tenant_resolver))
        .layer(axum::middleware::from_fn_with_state(st.clone(), crate::middleware::auth_guard))
        .with_state(st)
}
