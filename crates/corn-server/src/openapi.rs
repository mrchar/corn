//! OpenAPI 3.1 规范生成

use crate::dto::*;
use crate::routes::*;
use corn_core::model::*;
use utoipa::OpenApi;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "玉米 CORN API",
        version = "0.1.0",
        description = "简易通用资源管理系统：预算 · 配额 · 消耗"
    ),
    paths(
        list_categories, create_category, delete_category,
        list_spaces, create_space, list_budgets_by_space,
        list_budgets, create_budget, get_budget,
        list_actions, create_action, get_action, list_child_actions, list_quotas_by_action,
        list_quotas, create_quota, get_quota, quota_balance, list_records_by_quota,
        list_records, create_record,
        list_recorders, create_recorder,
    ),
    components(schemas(
        Label, Category, Space, Budget, Action, Quota, QuotaBalance, Record, Recorder,
        CreateCategory, CreateSpace, CreateBudget, CreateAction, CreateQuota,
        CreateRecord, CreateRecorder,
    )),
    tags(
        (name = "category", description = "资源类别"),
        (name = "space", description = "活动空间"),
        (name = "budget", description = "预算"),
        (name = "action", description = "活动"),
        (name = "quota", description = "配额"),
        (name = "record", description = "消耗记录"),
        (name = "recorder", description = "自动记录器"),
    )
)]
pub struct ApiDoc;
