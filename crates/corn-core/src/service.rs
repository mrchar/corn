//! 业务服务
//!
//! 编排仓储，封装业务规则：
//! - 默认数据初始化（默认空间 + 人力/资金类别）；
//! - 子活动配额之和 ≤ 父活动配额；
//! - 消耗记录不可超额。

use crate::model::{
    Action, Budget, Category, Label, Quota, QuotaBalance, Record, Recorder, Space, TenantId,
};
use crate::repo::{Repo, RepoError, RepoResult};
use serde_json::json;

/// 业务服务聚合：所有领域操作的统一入口
#[derive(Clone)]
pub struct Services {
    repo: Repo,
}

impl Services {
    pub fn new(repo: Repo) -> Self {
        Self { repo }
    }

    pub fn repo(&self) -> &Repo {
        &self.repo
    }

    /// 初始化默认数据：默认空间 + 人力 / 资金类别（幂等）
    pub async fn ensure_defaults(&self, tenant: TenantId) -> RepoResult<()> {
        if self.repo.count_spaces(tenant).await? == 0 {
            self.repo.create_space(tenant, "default", "默认").await?;
        }
        if self.repo.find_category_by_code(tenant, "human").await?.is_none() {
            self.repo
                .create_category(tenant, "human", "人力", "人天")
                .await?;
        }
        if self.repo.find_category_by_code(tenant, "money").await?.is_none() {
            self.repo
                .create_category(tenant, "money", "资金", "元")
                .await?;
        }
        Ok(())
    }
}

// 业务规则违反统一映射为 RepoError::Conflict，由 HTTP 层转换为 409。

// ---------- Category ----------

impl Services {
    pub async fn list_categories(&self, tenant: TenantId) -> RepoResult<Vec<Category>> {
        self.repo.list_categories(tenant).await
    }

    pub async fn create_category(
        &self,
        tenant: TenantId,
        code: String,
        name: String,
        unit: String,
    ) -> RepoResult<Category> {
        if code.trim().is_empty() {
            return Err(RepoError::Conflict("code 不能为空".into()));
        }
        if self
            .repo
            .find_category_by_code(tenant, &code)
            .await?
            .is_some()
        {
            return Err(RepoError::Conflict(format!("类别 code 已存在：{code}")));
        }
        self.repo
            .create_category(tenant, &code, &name, &unit)
            .await
    }

    pub async fn delete_category(&self, tenant: TenantId, id: i64) -> RepoResult<u64> {
        let n = self.repo.delete_category(tenant, id).await?;
        if n == 0 {
            return Err(RepoError::NotFound(format!("category #{id}")));
        }
        Ok(n)
    }
}

// ---------- Space ----------

impl Services {
    pub async fn list_spaces(&self, tenant: TenantId) -> RepoResult<Vec<Space>> {
        self.repo.list_spaces(tenant).await
    }

    pub async fn create_space(
        &self,
        tenant: TenantId,
        code: String,
        name: String,
    ) -> RepoResult<Space> {
        if code.trim().is_empty() {
            return Err(RepoError::Conflict("code 不能为空".into()));
        }
        self.repo.create_space(tenant, &code, &name).await
    }

    pub async fn get_space(&self, tenant: TenantId, id: i64) -> RepoResult<Space> {
        self.repo.get_space(tenant, id).await
    }
}

// ---------- Budget ----------

impl Services {
    pub async fn list_budgets(&self, tenant: TenantId) -> RepoResult<Vec<Budget>> {
        self.repo.list_budgets(tenant).await
    }

    pub async fn list_budgets_by_space(
        &self,
        tenant: TenantId,
        space_id: i64,
    ) -> RepoResult<Vec<Budget>> {
        self.repo.list_budgets_by_space(tenant, space_id).await
    }

    pub async fn create_budget(
        &self,
        tenant: TenantId,
        category_id: i64,
        space_id: i64,
        amount: f64,
        labels: Vec<Label>,
    ) -> RepoResult<Budget> {
        if amount < 0.0 {
            return Err(RepoError::Conflict("预算金额不能为负".into()));
        }
        // 校验类别与空间存在且属于本租户
        self.repo.get_category(tenant, category_id).await?;
        self.repo.get_space(tenant, space_id).await?;
        self.repo
            .create_budget(tenant, category_id, space_id, amount, &labels)
            .await
    }

    pub async fn get_budget(&self, tenant: TenantId, id: i64) -> RepoResult<Budget> {
        self.repo.get_budget(tenant, id).await
    }
}

// ---------- Action ----------

impl Services {
    pub async fn list_actions(&self, tenant: TenantId) -> RepoResult<Vec<Action>> {
        self.repo.list_actions(tenant).await
    }

    pub async fn list_child_actions(
        &self,
        tenant: TenantId,
        parent_id: i64,
    ) -> RepoResult<Vec<Action>> {
        self.repo.list_child_actions(tenant, parent_id).await
    }

    pub async fn create_action(
        &self,
        tenant: TenantId,
        space_id: i64,
        parent_id: Option<i64>,
        name: String,
        labels: Vec<Label>,
    ) -> RepoResult<Action> {
        if name.trim().is_empty() {
            return Err(RepoError::Conflict("name 不能为空".into()));
        }
        // 校验空间
        let space = self.repo.get_space(tenant, space_id).await?;
        // 校验父级：必须同空间、同租户
        if let Some(pid) = parent_id {
            let parent = self.repo.get_action(tenant, pid).await?;
            if parent.space_id != space.id {
                return Err(RepoError::Conflict("父活动必须与子活动同空间".into()));
            }
        }
        self.repo
            .create_action(tenant, space_id, parent_id, &name, &labels)
            .await
    }

    pub async fn get_action(&self, tenant: TenantId, id: i64) -> RepoResult<Action> {
        self.repo.get_action(tenant, id).await
    }
}

// ---------- Quota ----------

impl Services {
    pub async fn list_quotas(&self, tenant: TenantId) -> RepoResult<Vec<Quota>> {
        self.repo.list_quotas(tenant).await
    }

    pub async fn list_quotas_by_action(
        &self,
        tenant: TenantId,
        action_id: i64,
    ) -> RepoResult<Vec<Quota>> {
        self.repo.list_quotas_by_action(tenant, action_id).await
    }

    pub async fn create_quota(
        &self,
        tenant: TenantId,
        budget_id: i64,
        action_id: i64,
        amount: f64,
    ) -> RepoResult<Quota> {
        if amount < 0.0 {
            return Err(RepoError::Conflict("配额金额不能为负".into()));
        }
        // 校验预算、活动存在
        let budget = self.repo.get_budget(tenant, budget_id).await?;
        let action = self.repo.get_action(tenant, action_id).await?;
        // 预算与活动须同空间
        if budget.space_id != action.space_id {
            return Err(RepoError::Conflict("预算与活动必须同空间".into()));
        }
        // 子配额之和 ≤ 父配额总额
        if let Some(parent_id) = action.parent_id {
            let parent_total = self
                .repo
                .sum_quota_amount_by_action(tenant, parent_id)
                .await?;
            let child_total = self.repo.sum_child_quota_amount(tenant, parent_id).await?;
            if child_total + amount > parent_total + 1e-9 {
                return Err(RepoError::Conflict(format!(
                    "子配额之和 {child_total:.2} + 新增 {amount:.2} 超过父配额 {parent_total:.2}"
                )));
            }
        }
        self.repo
            .create_quota(tenant, budget_id, action_id, amount)
            .await
    }

    pub async fn get_quota(&self, tenant: TenantId, id: i64) -> RepoResult<Quota> {
        self.repo.get_quota(tenant, id).await
    }

    pub async fn quota_balance(&self, tenant: TenantId, quota_id: i64) -> RepoResult<QuotaBalance> {
        self.repo.quota_balance(tenant, quota_id).await
    }
}

// ---------- Record ----------

impl Services {
    pub async fn list_records(&self, tenant: TenantId) -> RepoResult<Vec<Record>> {
        self.repo.list_records(tenant).await
    }

    pub async fn list_records_by_quota(
        &self,
        tenant: TenantId,
        quota_id: i64,
    ) -> RepoResult<Vec<Record>> {
        self.repo.list_records_by_quota(tenant, quota_id).await
    }

    pub async fn create_record(
        &self,
        tenant: TenantId,
        quota_id: i64,
        amount: f64,
    ) -> RepoResult<Record> {
        if amount <= 0.0 {
            return Err(RepoError::Conflict("消耗金额必须大于 0".into()));
        }
        // 超额检测：余额不足则拒绝
        let balance = self.repo.quota_balance(tenant, quota_id).await?;
        if amount > balance.balance + 1e-9 {
            return Err(RepoError::Conflict(format!(
                "消耗 {amount:.2} 超出配额余额 {balance:.2}",
                balance = balance.balance
            )));
        }
        self.repo.create_record(tenant, quota_id, amount).await
    }

    /// 记录器配置模板（M5 实现规则引擎时使用）
    pub fn recorder_config_template() -> serde_json::Value {
        json!({
            "kind": "interval",
            "interval_seconds": 86400,
            "amount_per_tick": 1.0
        })
    }
}

// ---------- Recorder ----------

impl Services {
    pub async fn list_recorders(&self, tenant: TenantId) -> RepoResult<Vec<Recorder>> {
        self.repo.list_recorders(tenant).await
    }

    pub async fn create_recorder(
        &self,
        tenant: TenantId,
        category_id: i64,
        space_id: i64,
        action_id: Option<i64>,
        budget_labels: Vec<Label>,
        action_labels: Vec<Label>,
        config: serde_json::Value,
    ) -> RepoResult<Recorder> {
        self.repo.get_category(tenant, category_id).await?;
        self.repo.get_space(tenant, space_id).await?;
        if let Some(aid) = action_id {
            self.repo.get_action(tenant, aid).await?;
        }
        self.repo
            .create_recorder(
                tenant,
                category_id,
                space_id,
                action_id,
                &budget_labels,
                &action_labels,
                &config,
            )
            .await
    }
}
