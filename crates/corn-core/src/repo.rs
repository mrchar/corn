//! 数据库仓储
//!
//! 基于 `sqlx::Any`，同一份实现兼容 PostgreSQL 与 SQLite。
//! INSERT 按后端分发：PG 用 `RETURNING id`，SQLite 用 `last_insert_rowid()`。
//! 后端类型在 `connect` 时由 URL scheme 判定（postgres / sqlite）。

use crate::model::{
    Action, Budget, Category, Label, Quota, QuotaBalance, Record, Recorder, Space, TenantId,
};
use sqlx::any::AnyRow;
use sqlx::{Pool, Row};
use thiserror::Error;

/// 任意后端连接池类型
pub type AnyPool = Pool<sqlx::Any>;

pub type RepoResult<T> = Result<T, RepoError>;

#[derive(Debug, Error)]
pub enum RepoError {
    #[error("未找到：{0}")]
    NotFound(String),
    #[error("数据冲突：{0}")]
    Conflict(String),
    #[error("数据库错误：{0}")]
    Db(#[from] sqlx::Error),
}

/// 仓储：所有领域实体的数据访问入口
#[derive(Clone)]
pub struct Repo {
    pool: AnyPool,
    is_postgres: bool,
}

impl Repo {
    pub fn new(pool: AnyPool, is_postgres: bool) -> Self {
        Self { pool, is_postgres }
    }

    pub fn pool(&self) -> &AnyPool {
        &self.pool
    }

    /// 是否为 PostgreSQL 后端
    pub fn is_postgres(&self) -> bool {
        self.is_postgres
    }
}

/// INSERT 宏：PG 走 RETURNING，SQLite 走 last_insert_rowid()
macro_rules! insert {
    ($self:ident, $pg:expr, $sqlite:expr, $($bind:expr),* $(,)?) => {{
        let pool = &$self.pool;
        if $self.is_postgres {
            let mut q = sqlx::query_scalar::<_, i64>($pg);
            $( q = q.bind($bind); )*
            q.fetch_one(pool).await
        } else {
            let mut q = sqlx::query($sqlite);
            $( q = q.bind($bind); )*
            q.execute(pool).await?;
            sqlx::query_scalar::<_, i64>("SELECT last_insert_rowid()")
                .fetch_one(pool)
                .await
        }
        .map_err(RepoError::Db)
    }};
}

// ---------- 标签解析 ----------

fn parse_labels(raw: Option<String>) -> Vec<Label> {
    match raw {
        Some(s) if !s.is_empty() => serde_json::from_str(&s).unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn labels_json(labels: &[Label]) -> String {
    serde_json::to_string(labels).unwrap_or_else(|_| "[]".into())
}

// ---------- Category ----------

fn row_to_category(row: &AnyRow) -> Category {
    Category {
        id: row.get("id"),
        tenant_id: row.get("tenant_id"),
        code: row.get("code"),
        name: row.get("name"),
        unit: row.get("unit"),
        created: row.get("created"),
        modified: row.get("modified"),
    }
}

const CATEGORY_COLS: &str = "id, tenant_id, code, name, unit, created, modified";

impl Repo {
    pub async fn list_categories(&self, tenant: TenantId) -> RepoResult<Vec<Category>> {
        let sql = format!("SELECT {CATEGORY_COLS} FROM category WHERE tenant_id = $1 ORDER BY id");
        let rows = sqlx::query(&sql)
            .bind(tenant)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.iter().map(row_to_category).collect())
    }

    pub async fn create_category(
        &self,
        tenant: TenantId,
        code: &str,
        name: &str,
        unit: &str,
    ) -> RepoResult<Category> {
        let id = insert!(
            self,
            "INSERT INTO category (tenant_id, code, name, unit) VALUES ($1, $2, $3, $4) RETURNING id",
            "INSERT INTO category (tenant_id, code, name, unit) VALUES ($1, $2, $3, $4)",
            tenant,
            code,
            name,
            unit,
        )?;
        self.get_category(tenant, id).await
    }

    pub async fn get_category(&self, tenant: TenantId, id: i64) -> RepoResult<Category> {
        let sql = format!(
            "SELECT {CATEGORY_COLS} FROM category WHERE tenant_id = $1 AND id = $2"
        );
        let row = sqlx::query(&sql)
            .bind(tenant)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref()
            .map(row_to_category)
            .ok_or_else(|| RepoError::NotFound(format!("category #{id}")))
    }

    pub async fn delete_category(&self, tenant: TenantId, id: i64) -> RepoResult<u64> {
        let res = sqlx::query("DELETE FROM category WHERE tenant_id = $1 AND id = $2")
            .bind(tenant)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected())
    }

    pub async fn find_category_by_code(
        &self,
        tenant: TenantId,
        code: &str,
    ) -> RepoResult<Option<Category>> {
        let sql = format!(
            "SELECT {CATEGORY_COLS} FROM category WHERE tenant_id = $1 AND code = $2"
        );
        let row = sqlx::query(&sql)
            .bind(tenant)
            .bind(code)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.as_ref().map(row_to_category))
    }
}

// ---------- Space ----------

fn row_to_space(row: &AnyRow) -> Space {
    Space {
        id: row.get("id"),
        tenant_id: row.get("tenant_id"),
        code: row.get("code"),
        name: row.get("name"),
        created: row.get("created"),
        modified: row.get("modified"),
    }
}

const SPACE_COLS: &str = "id, tenant_id, code, name, created, modified";

impl Repo {
    pub async fn list_spaces(&self, tenant: TenantId) -> RepoResult<Vec<Space>> {
        let sql = format!("SELECT {SPACE_COLS} FROM space WHERE tenant_id = $1 ORDER BY id");
        let rows = sqlx::query(&sql)
            .bind(tenant)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.iter().map(row_to_space).collect())
    }

    pub async fn create_space(&self, tenant: TenantId, code: &str, name: &str) -> RepoResult<Space> {
        let id = insert!(
            self,
            "INSERT INTO space (tenant_id, code, name) VALUES ($1, $2, $3) RETURNING id",
            "INSERT INTO space (tenant_id, code, name) VALUES ($1, $2, $3)",
            tenant,
            code,
            name,
        )?;
        self.get_space(tenant, id).await
    }

    pub async fn get_space(&self, tenant: TenantId, id: i64) -> RepoResult<Space> {
        let sql = format!("SELECT {SPACE_COLS} FROM space WHERE tenant_id = $1 AND id = $2");
        let row = sqlx::query(&sql)
            .bind(tenant)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref()
            .map(row_to_space)
            .ok_or_else(|| RepoError::NotFound(format!("space #{id}")))
    }

    pub async fn count_spaces(&self, tenant: TenantId) -> RepoResult<i64> {
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM space WHERE tenant_id = $1")
            .bind(tenant)
            .fetch_one(&self.pool)
            .await?;
        Ok(n)
    }
}

// ---------- Budget ----------

fn row_to_budget(row: &AnyRow) -> Budget {
    Budget {
        id: row.get("id"),
        tenant_id: row.get("tenant_id"),
        category_id: row.get("category_id"),
        space_id: row.get("space_id"),
        amount: row.get("amount"),
        labels: parse_labels(row.get("labels")),
        created: row.get("created"),
        modified: row.get("modified"),
    }
}

const BUDGET_COLS: &str =
    "id, tenant_id, category_id, space_id, amount, labels, created, modified";

impl Repo {
    pub async fn list_budgets(&self, tenant: TenantId) -> RepoResult<Vec<Budget>> {
        let sql = format!("SELECT {BUDGET_COLS} FROM budget WHERE tenant_id = $1 ORDER BY id");
        let rows = sqlx::query(&sql).bind(tenant).fetch_all(&self.pool).await?;
        Ok(rows.iter().map(row_to_budget).collect())
    }

    pub async fn list_budgets_by_space(
        &self,
        tenant: TenantId,
        space_id: i64,
    ) -> RepoResult<Vec<Budget>> {
        let sql = format!(
            "SELECT {BUDGET_COLS} FROM budget WHERE tenant_id = $1 AND space_id = $2 ORDER BY id"
        );
        let rows = sqlx::query(&sql)
            .bind(tenant)
            .bind(space_id)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.iter().map(row_to_budget).collect())
    }

    pub async fn create_budget(
        &self,
        tenant: TenantId,
        category_id: i64,
        space_id: i64,
        amount: f64,
        labels: &[Label],
    ) -> RepoResult<Budget> {
        let labels_str = labels_json(labels);
        let id = insert!(
            self,
            "INSERT INTO budget (tenant_id, category_id, space_id, amount, labels) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            "INSERT INTO budget (tenant_id, category_id, space_id, amount, labels) VALUES ($1, $2, $3, $4, $5)",
            tenant,
            category_id,
            space_id,
            amount,
            labels_str,
        )?;
        self.get_budget(tenant, id).await
    }

    pub async fn get_budget(&self, tenant: TenantId, id: i64) -> RepoResult<Budget> {
        let sql = format!("SELECT {BUDGET_COLS} FROM budget WHERE tenant_id = $1 AND id = $2");
        let row = sqlx::query(&sql)
            .bind(tenant)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref()
            .map(row_to_budget)
            .ok_or_else(|| RepoError::NotFound(format!("budget #{id}")))
    }
}

// ---------- Action ----------

fn row_to_action(row: &AnyRow) -> Action {
    Action {
        id: row.get("id"),
        tenant_id: row.get("tenant_id"),
        space_id: row.get("space_id"),
        // Any 驱动在 NULL 列上返回 NULL 类型，直接 .get::<Option<i64>> 会 panic；
        // 用 try_get 把解码错误归一化为 None。
        parent_id: row.try_get("parent_id").unwrap_or(None),
        name: row.get("name"),
        labels: parse_labels(row.get("labels")),
        created: row.get("created"),
        modified: row.get("modified"),
    }
}

const ACTION_COLS: &str =
    "id, tenant_id, space_id, parent_id, name, labels, created, modified";

impl Repo {
    pub async fn list_actions(&self, tenant: TenantId) -> RepoResult<Vec<Action>> {
        let sql = format!("SELECT {ACTION_COLS} FROM action WHERE tenant_id = $1 ORDER BY id");
        let rows = sqlx::query(&sql).bind(tenant).fetch_all(&self.pool).await?;
        Ok(rows.iter().map(row_to_action).collect())
    }

    pub async fn list_child_actions(
        &self,
        tenant: TenantId,
        parent_id: i64,
    ) -> RepoResult<Vec<Action>> {
        let sql = format!(
            "SELECT {ACTION_COLS} FROM action WHERE tenant_id = $1 AND parent_id = $2 ORDER BY id"
        );
        let rows = sqlx::query(&sql)
            .bind(tenant)
            .bind(parent_id)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.iter().map(row_to_action).collect())
    }

    pub async fn create_action(
        &self,
        tenant: TenantId,
        space_id: i64,
        parent_id: Option<i64>,
        name: &str,
        labels: &[Label],
    ) -> RepoResult<Action> {
        let labels_str = labels_json(labels);
        let id = insert!(
            self,
            "INSERT INTO action (tenant_id, space_id, parent_id, name, labels) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            "INSERT INTO action (tenant_id, space_id, parent_id, name, labels) VALUES ($1, $2, $3, $4, $5)",
            tenant,
            space_id,
            parent_id,
            name,
            labels_str,
        )?;
        self.get_action(tenant, id).await
    }

    pub async fn get_action(&self, tenant: TenantId, id: i64) -> RepoResult<Action> {
        let sql = format!("SELECT {ACTION_COLS} FROM action WHERE tenant_id = $1 AND id = $2");
        let row = sqlx::query(&sql)
            .bind(tenant)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref()
            .map(row_to_action)
            .ok_or_else(|| RepoError::NotFound(format!("action #{id}")))
    }

    /// 子活动配额之和
    pub async fn sum_child_quota_amount(
        &self,
        tenant: TenantId,
        parent_id: i64,
    ) -> RepoResult<f64> {
        // SQLite 中 SUM 在空集上返回 NULL，COALESCE 走字面量 0 时为 INTEGER 类型，
        // sqlx 会拒绝把 INTEGER 解码为 f64，因此必须用 0.0 强制浮点存储类。
        let amount: f64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(q.amount), 0.0) FROM quota q JOIN action a ON a.id = q.action_id WHERE q.tenant_id = $1 AND a.parent_id = $2",
        )
        .bind(tenant)
        .bind(parent_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(amount)
    }

    /// 某活动自身的配额总额
    pub async fn sum_quota_amount_by_action(
        &self,
        tenant: TenantId,
        action_id: i64,
    ) -> RepoResult<f64> {
        let amount: f64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(amount), 0.0) FROM quota WHERE tenant_id = $1 AND action_id = $2",
        )
        .bind(tenant)
        .bind(action_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(amount)
    }
}

// ---------- Quota ----------

fn row_to_quota(row: &AnyRow) -> Quota {
    Quota {
        id: row.get("id"),
        tenant_id: row.get("tenant_id"),
        budget_id: row.get("budget_id"),
        action_id: row.get("action_id"),
        amount: row.get("amount"),
        created: row.get("created"),
        modified: row.get("modified"),
    }
}

const QUOTA_COLS: &str = "id, tenant_id, budget_id, action_id, amount, created, modified";

impl Repo {
    pub async fn list_quotas(&self, tenant: TenantId) -> RepoResult<Vec<Quota>> {
        let sql = format!("SELECT {QUOTA_COLS} FROM quota WHERE tenant_id = $1 ORDER BY id");
        let rows = sqlx::query(&sql).bind(tenant).fetch_all(&self.pool).await?;
        Ok(rows.iter().map(row_to_quota).collect())
    }

    pub async fn list_quotas_by_action(
        &self,
        tenant: TenantId,
        action_id: i64,
    ) -> RepoResult<Vec<Quota>> {
        let sql = format!(
            "SELECT {QUOTA_COLS} FROM quota WHERE tenant_id = $1 AND action_id = $2 ORDER BY id"
        );
        let rows = sqlx::query(&sql)
            .bind(tenant)
            .bind(action_id)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.iter().map(row_to_quota).collect())
    }

    pub async fn create_quota(
        &self,
        tenant: TenantId,
        budget_id: i64,
        action_id: i64,
        amount: f64,
    ) -> RepoResult<Quota> {
        let id = insert!(
            self,
            "INSERT INTO quota (tenant_id, budget_id, action_id, amount) VALUES ($1, $2, $3, $4) RETURNING id",
            "INSERT INTO quota (tenant_id, budget_id, action_id, amount) VALUES ($1, $2, $3, $4)",
            tenant,
            budget_id,
            action_id,
            amount,
        )?;
        self.get_quota(tenant, id).await
    }

    pub async fn get_quota(&self, tenant: TenantId, id: i64) -> RepoResult<Quota> {
        let sql = format!("SELECT {QUOTA_COLS} FROM quota WHERE tenant_id = $1 AND id = $2");
        let row = sqlx::query(&sql)
            .bind(tenant)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref()
            .map(row_to_quota)
            .ok_or_else(|| RepoError::NotFound(format!("quota #{id}")))
    }

    pub async fn quota_consumed(&self, tenant: TenantId, quota_id: i64) -> RepoResult<f64> {
        // 同 sum_quota_amount_by_action：用 0.0 规避 SQLite 把空集 COALESCE 解为 INTEGER。
        let amount: f64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(amount), 0.0) FROM record WHERE tenant_id = $1 AND quota_id = $2",
        )
        .bind(tenant)
        .bind(quota_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(amount)
    }

    pub async fn quota_balance(
        &self,
        tenant: TenantId,
        quota_id: i64,
    ) -> RepoResult<QuotaBalance> {
        let q = self.get_quota(tenant, quota_id).await?;
        let consumed = self.quota_consumed(tenant, quota_id).await?;
        Ok(QuotaBalance {
            quota_id,
            amount: q.amount,
            consumed,
            balance: q.amount - consumed,
        })
    }
}

// ---------- Record ----------

fn row_to_record(row: &AnyRow) -> Record {
    Record {
        id: row.get("id"),
        tenant_id: row.get("tenant_id"),
        quota_id: row.get("quota_id"),
        amount: row.get("amount"),
        created: row.get("created"),
        modified: row.get("modified"),
    }
}

const RECORD_COLS: &str = "id, tenant_id, quota_id, amount, created, modified";

impl Repo {
    pub async fn list_records(&self, tenant: TenantId) -> RepoResult<Vec<Record>> {
        let sql = format!("SELECT {RECORD_COLS} FROM record WHERE tenant_id = $1 ORDER BY id");
        let rows = sqlx::query(&sql).bind(tenant).fetch_all(&self.pool).await?;
        Ok(rows.iter().map(row_to_record).collect())
    }

    pub async fn list_records_by_quota(
        &self,
        tenant: TenantId,
        quota_id: i64,
    ) -> RepoResult<Vec<Record>> {
        let sql = format!(
            "SELECT {RECORD_COLS} FROM record WHERE tenant_id = $1 AND quota_id = $2 ORDER BY id"
        );
        let rows = sqlx::query(&sql)
            .bind(tenant)
            .bind(quota_id)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.iter().map(row_to_record).collect())
    }

    pub async fn create_record(
        &self,
        tenant: TenantId,
        quota_id: i64,
        amount: f64,
    ) -> RepoResult<Record> {
        let id = insert!(
            self,
            "INSERT INTO record (tenant_id, quota_id, amount) VALUES ($1, $2, $3) RETURNING id",
            "INSERT INTO record (tenant_id, quota_id, amount) VALUES ($1, $2, $3)",
            tenant,
            quota_id,
            amount,
        )?;
        self.get_record(tenant, id).await
    }

    pub async fn get_record(&self, tenant: TenantId, id: i64) -> RepoResult<Record> {
        let sql = format!("SELECT {RECORD_COLS} FROM record WHERE tenant_id = $1 AND id = $2");
        let row = sqlx::query(&sql)
            .bind(tenant)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref()
            .map(row_to_record)
            .ok_or_else(|| RepoError::NotFound(format!("record #{id}")))
    }
}

// ---------- Recorder ----------

fn row_to_recorder(row: &AnyRow) -> Recorder {
    Recorder {
        id: row.get("id"),
        tenant_id: row.get("tenant_id"),
        category_id: row.get("category_id"),
        space_id: row.get("space_id"),
        // 同 Action::parent_id，规避 Any 驱动对 NULL 列的解码 panic。
        action_id: row.try_get("action_id").unwrap_or(None),
        budget_labels: parse_labels(row.get("budget_labels")),
        action_labels: parse_labels(row.get("action_labels")),
        config: row
            .get::<Option<String>, _>("config")
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(serde_json::Value::Object(Default::default())),
        created: row.get("created"),
        modified: row.get("modified"),
    }
}

const RECORDER_COLS: &str = "id, tenant_id, category_id, space_id, action_id, budget_labels, action_labels, config, created, modified";

impl Repo {
    pub async fn list_recorders(&self, tenant: TenantId) -> RepoResult<Vec<Recorder>> {
        let sql = format!(
            "SELECT {RECORDER_COLS} FROM recorder WHERE tenant_id = $1 ORDER BY id"
        );
        let rows = sqlx::query(&sql).bind(tenant).fetch_all(&self.pool).await?;
        Ok(rows.iter().map(row_to_recorder).collect())
    }

    pub async fn create_recorder(
        &self,
        tenant: TenantId,
        category_id: i64,
        space_id: i64,
        action_id: Option<i64>,
        budget_labels: &[Label],
        action_labels: &[Label],
        config: &serde_json::Value,
    ) -> RepoResult<Recorder> {
        let budget_labels_str = labels_json(budget_labels);
        let action_labels_str = labels_json(action_labels);
        let config_str = config.to_string();
        let id = insert!(
            self,
            "INSERT INTO recorder (tenant_id, category_id, space_id, action_id, budget_labels, action_labels, config) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
            "INSERT INTO recorder (tenant_id, category_id, space_id, action_id, budget_labels, action_labels, config) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            tenant,
            category_id,
            space_id,
            action_id,
            budget_labels_str,
            action_labels_str,
            config_str,
        )?;
        self.get_recorder(tenant, id).await
    }

    pub async fn get_recorder(&self, tenant: TenantId, id: i64) -> RepoResult<Recorder> {
        let sql =
            format!("SELECT {RECORDER_COLS} FROM recorder WHERE tenant_id = $1 AND id = $2");
        let row = sqlx::query(&sql)
            .bind(tenant)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref()
            .map(row_to_recorder)
            .ok_or_else(|| RepoError::NotFound(format!("recorder #{id}")))
    }
}

#[cfg(test)]
mod tests {
    use super::{labels_json, parse_labels};
    use crate::Label;

    #[test]
    fn parse_labels_handles_none_and_empty() {
        assert!(parse_labels(None).is_empty());
        assert!(parse_labels(Some(String::new())).is_empty());
        assert!(parse_labels(Some("garbage".into())).is_empty());
    }

    #[test]
    fn parse_labels_parses_valid_array() {
        let raw = r#"[{"key":"a","value":"1"},{"key":"b","value":"2"}]"#;
        let labels = parse_labels(Some(raw.into()));
        assert_eq!(labels.len(), 2);
        assert_eq!(labels[0].key, "a");
        assert_eq!(labels[1].value, "2");
    }

    #[test]
    fn labels_json_round_trips() {
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
        let json = labels_json(&labels);
        let parsed = parse_labels(Some(json));
        assert_eq!(parsed, labels);
    }

    #[test]
    fn labels_json_handles_empty_slice() {
        assert_eq!(labels_json(&[]), "[]");
    }
}
