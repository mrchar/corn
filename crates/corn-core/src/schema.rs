//! 数据库 schema 初始化
//!
//! 同一套建表逻辑兼容 PostgreSQL 与 SQLite：
//! - 自增主键：PG 用 `BIGSERIAL`，SQLite 用 `INTEGER PRIMARY KEY AUTOINCREMENT`；
//! - 时间列：统一以 `TEXT` 存储 ISO8601 字符串，便于跨后端读取。
//!
//! 后端类型由 `Repo::is_postgres()` 判定（在 `connect` 时由 URL scheme 决定）。

use crate::repo::Repo;

/// 确保所有表存在（幂等）。启动时调用。
pub async fn ensure_schema(repo: &Repo) -> Result<(), sqlx::Error> {
    let ddl = if repo.is_postgres() { PG_DDL } else { SQLITE_DDL };
    for stmt in ddl.split("-- STATEMENT") {
        let stmt = stmt.trim();
        if stmt.is_empty() {
            continue;
        }
        sqlx::query(stmt).execute(repo.pool()).await?;
    }
    Ok(())
}

const PG_DDL: &str = "
CREATE TABLE IF NOT EXISTS category (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    created TEXT NOT NULL DEFAULT to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'),
    modified TEXT NOT NULL DEFAULT to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')
);
CREATE INDEX IF NOT EXISTS idx_category_tenant ON category(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_category_tenant_code ON category(tenant_id, code);
-- STATEMENT
CREATE TABLE IF NOT EXISTS space (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    created TEXT NOT NULL DEFAULT to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'),
    modified TEXT NOT NULL DEFAULT to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')
);
CREATE INDEX IF NOT EXISTS idx_space_tenant ON space(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_space_tenant_code ON space(tenant_id, code);
-- STATEMENT
CREATE TABLE IF NOT EXISTS budget (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    space_id BIGINT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    labels TEXT NOT NULL DEFAULT '[]',
    created TEXT NOT NULL DEFAULT to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'),
    modified TEXT NOT NULL DEFAULT to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')
);
CREATE INDEX IF NOT EXISTS idx_budget_tenant ON budget(tenant_id);
CREATE INDEX IF NOT EXISTS idx_budget_space ON budget(space_id);
-- STATEMENT
CREATE TABLE IF NOT EXISTS action (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    space_id BIGINT NOT NULL,
    parent_id BIGINT,
    name TEXT NOT NULL,
    labels TEXT NOT NULL DEFAULT '[]',
    created TEXT NOT NULL DEFAULT to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'),
    modified TEXT NOT NULL DEFAULT to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')
);
CREATE INDEX IF NOT EXISTS idx_action_tenant ON action(tenant_id);
CREATE INDEX IF NOT EXISTS idx_action_parent ON action(parent_id);
CREATE INDEX IF NOT EXISTS idx_action_space ON action(space_id);
-- STATEMENT
CREATE TABLE IF NOT EXISTS quota (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    budget_id BIGINT NOT NULL,
    action_id BIGINT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    created TEXT NOT NULL DEFAULT to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'),
    modified TEXT NOT NULL DEFAULT to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')
);
CREATE INDEX IF NOT EXISTS idx_quota_tenant ON quota(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quota_action ON quota(action_id);
CREATE INDEX IF NOT EXISTS idx_quota_budget ON quota(budget_id);
-- STATEMENT
CREATE TABLE IF NOT EXISTS record (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    quota_id BIGINT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    created TEXT NOT NULL DEFAULT to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'),
    modified TEXT NOT NULL DEFAULT to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')
);
CREATE INDEX IF NOT EXISTS idx_record_tenant ON record(tenant_id);
CREATE INDEX IF NOT EXISTS idx_record_quota ON record(quota_id);
-- STATEMENT
CREATE TABLE IF NOT EXISTS recorder (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    space_id BIGINT NOT NULL,
    action_id BIGINT,
    budget_labels TEXT NOT NULL DEFAULT '[]',
    action_labels TEXT NOT NULL DEFAULT '[]',
    config TEXT NOT NULL DEFAULT '{}',
    created TEXT NOT NULL DEFAULT to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'),
    modified TEXT NOT NULL DEFAULT to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')
);
CREATE INDEX IF NOT EXISTS idx_recorder_tenant ON recorder(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recorder_action ON recorder(action_id);
";

const SQLITE_DDL: &str = "
CREATE TABLE IF NOT EXISTS category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    modified TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_category_tenant ON category(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_category_tenant_code ON category(tenant_id, code);
-- STATEMENT
CREATE TABLE IF NOT EXISTS space (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    modified TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_space_tenant ON space(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_space_tenant_code ON space(tenant_id, code);
-- STATEMENT
CREATE TABLE IF NOT EXISTS budget (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    space_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    labels TEXT NOT NULL DEFAULT '[]',
    created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    modified TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_tenant ON budget(tenant_id);
CREATE INDEX IF NOT EXISTS idx_budget_space ON budget(space_id);
-- STATEMENT
CREATE TABLE IF NOT EXISTS action (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    space_id INTEGER NOT NULL,
    parent_id INTEGER,
    name TEXT NOT NULL,
    labels TEXT NOT NULL DEFAULT '[]',
    created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    modified TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_action_tenant ON action(tenant_id);
CREATE INDEX IF NOT EXISTS idx_action_parent ON action(parent_id);
CREATE INDEX IF NOT EXISTS idx_action_space ON action(space_id);
-- STATEMENT
CREATE TABLE IF NOT EXISTS quota (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    budget_id INTEGER NOT NULL,
    action_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    modified TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_quota_tenant ON quota(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quota_action ON quota(action_id);
CREATE INDEX IF NOT EXISTS idx_quota_budget ON quota(budget_id);
-- STATEMENT
CREATE TABLE IF NOT EXISTS record (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    quota_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    modified TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_record_tenant ON record(tenant_id);
CREATE INDEX IF NOT EXISTS idx_record_quota ON record(quota_id);
-- STATEMENT
CREATE TABLE IF NOT EXISTS recorder (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    space_id INTEGER NOT NULL,
    action_id INTEGER,
    budget_labels TEXT NOT NULL DEFAULT '[]',
    action_labels TEXT NOT NULL DEFAULT '[]',
    config TEXT NOT NULL DEFAULT '{}',
    created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    modified TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_recorder_tenant ON recorder(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recorder_action ON recorder(action_id);
";
