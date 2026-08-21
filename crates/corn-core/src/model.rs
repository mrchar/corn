//! 领域模型
//!
//! 与旧 Spring Boot 实现的实体一一对应，迁移自
//! `net.mrchar.corn.model.*`。

use serde::{Deserialize, Serialize};

/// 租户 ID（行级多租户隔离）
pub type TenantId = i64;

/// 资源标签：key-value 形式，用于过滤检索
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash, utoipa::ToSchema)]
pub struct Label {
    pub key: String,
    pub value: String,
}

/// 资源类别（如「人力」单位「人天」、「资金」单位「元」）
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Category {
    pub id: i64,
    pub tenant_id: TenantId,
    pub code: String,
    pub name: String,
    pub unit: String,
    pub created: Option<String>,
    pub modified: Option<String>,
}

/// 活动空间（互斥独立，如学习 / 工作）
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Space {
    pub id: i64,
    pub tenant_id: TenantId,
    pub code: String,
    pub name: String,
    pub created: Option<String>,
    pub modified: Option<String>,
}

/// 预算：在空间内为某类别创建的资源总量计划
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Budget {
    pub id: i64,
    pub tenant_id: TenantId,
    pub category_id: i64,
    pub space_id: i64,
    pub amount: f64,
    pub labels: Vec<Label>,
    pub created: Option<String>,
    pub modified: Option<String>,
}

/// 活动：支持父子层级；子活动配额之和 ≤ 父活动配额
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Action {
    pub id: i64,
    pub tenant_id: TenantId,
    pub space_id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub labels: Vec<Label>,
    pub created: Option<String>,
    pub modified: Option<String>,
}

/// 配额：将预算金额划分给具体活动
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Quota {
    pub id: i64,
    pub tenant_id: TenantId,
    pub budget_id: i64,
    pub action_id: i64,
    pub amount: f64,
    pub created: Option<String>,
    pub modified: Option<String>,
}

/// 配额余额视图：配额金额与已消耗金额之差
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct QuotaBalance {
    pub quota_id: i64,
    pub amount: f64,
    pub consumed: f64,
    pub balance: f64,
}

/// 资源消耗记录：手动记录，记录之和等于活动消耗总额
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Record {
    pub id: i64,
    pub tenant_id: TenantId,
    pub quota_id: i64,
    pub amount: f64,
    pub created: Option<String>,
    pub modified: Option<String>,
}

/// 自动记录器：按规则自动创建消耗记录
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Recorder {
    pub id: i64,
    pub tenant_id: TenantId,
    pub category_id: i64,
    pub space_id: i64,
    pub action_id: Option<i64>,
    pub budget_labels: Vec<Label>,
    pub action_labels: Vec<Label>,
    /// 记录器配置（自由 JSON）
    pub config: serde_json::Value,
    pub created: Option<String>,
    pub modified: Option<String>,
}
