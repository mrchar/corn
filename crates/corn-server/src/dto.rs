//! 请求 / 响应 DTO（带 utoipa schema 注解）

use corn_core::model::Label;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub struct CreateCategory {
    pub code: String,
    pub name: String,
    pub unit: String,
}

#[derive(Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub struct CreateSpace {
    pub code: String,
    pub name: String,
}

#[derive(Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub struct CreateBudget {
    pub category_id: i64,
    pub space_id: i64,
    pub amount: f64,
    #[serde(default)]
    pub labels: Vec<Label>,
}

#[derive(Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub struct CreateAction {
    pub space_id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    #[serde(default)]
    pub labels: Vec<Label>,
}

#[derive(Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub struct CreateQuota {
    pub budget_id: i64,
    pub action_id: i64,
    pub amount: f64,
}

#[derive(Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub struct CreateRecord {
    pub quota_id: i64,
    pub amount: f64,
}

#[derive(Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub struct CreateRecorder {
    pub category_id: i64,
    pub space_id: i64,
    pub action_id: Option<i64>,
    #[serde(default)]
    pub budget_labels: Vec<Label>,
    #[serde(default)]
    pub action_labels: Vec<Label>,
    #[serde(default = "default_config")]
    pub config: serde_json::Value,
}

fn default_config() -> serde_json::Value {
    serde_json::json!({})
}
