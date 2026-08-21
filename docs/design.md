# 设计文档

> 玉米（CORN）—— 简易通用资源管理系统总体设计

## 1. 设计目标

- **统一逻辑内核**：业务逻辑集中在 `corn-core` crate，三种部署形态共享。
- **契约驱动**：utoipa 自动产出 OpenAPI 3.1，前端 SDK 自动生成。
- **多端入口**：React 系全栈（Web=Next.js、Mobile=React Native、Desktop=Tauri）。
- **多部署形态**：SaaS（多租户）/ 私有化 / 本地独立运行。

## 2. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│  corn-core（业务逻辑 crate：领域模型 + 服务 + 仓储接口）       │
└─────────────────────────────────────────────────────────────┘
        ▲                            ▲
        │                            │
   ┌────┴──────────┐         ┌──────┴──────────────┐
   │ corn-server   │         │ corn-tauri          │
   │ (axum HTTP)   │         │ (Tauri + 本地 SQLite) │
   │  → SaaS/私有化│          │  → 本地独立运行       │
   └────┬──────────┘         └──────┬──────────────┘
        │                           │
   ┌────┴────┐                 ┌────┴────┐
   │ PG/H2   │                 │ SQLite  │
   └─────────┘                 └─────────┘
        │
        ▼
  OpenAPI 3.1 (utoipa)
        │
        ▼ openapi-generator
┌───────────────────────────────────────┐
│  TS SDK（@corn/sdk）                    │
└───────────────────────────────────────┘
        ▲           ▲           ▲
        │           │           │
  Next.js Web   React Native  Tauri React 前端
```

## 3. 代码组织（Cargo workspace + pnpm monorepo）

```
/workspace/
├── docs/                       # VitePress 文档站点
├── crates/                     # Rust workspace
│   ├── corn-core/              # 业务逻辑 crate
│   │   ├── src/
│   │   │   ├── domain/         # 领域模型（实体）
│   │   │   ├── repo/           # 仓储 trait + sqlx 实现
│   │   │   └── service/        # 业务服务
│   │   └── Cargo.toml
│   ├── corn-server/           # axum HTTP 服务（SaaS/私有化）
│   │   ├── src/
│   │   │   ├── routes/         # 路由 + DTO + utoipa 注解
│   │   │   ├── middleware/     # 多租户、鉴权
│   │   │   └── openapi.rs
│   │   └── Cargo.toml
│   └── corn-tauri/            # Tauri 桌面应用
│       ├── src-tauri/
│       └── Cargo.toml
├── migrations/                # sqlx 迁移脚本
├── frontend/                  # pnpm monorepo
│   ├── packages/sdk/          # openapi-generator 产出的 TS SDK
│   ├── apps/web/              # Next.js Web 端
│   ├── apps/desktop/          # Tauri React 前端
│   └── apps/mobile/           # React Native
├── Cargo.toml                 # workspace 根配置
├── pnpm-workspace.yaml
└── docs/                      # 文档站点
```

## 4. 领域模型设计

### 4.1 实体关系图

```
 ┌──────────┐    tenant ┌──────────┐
 │ Category │           │  Space   │
 └────┬─────┘           └────┬─────┘
      │                      │
      │ 1                    │ 1
      │                      │
      ▼ n                    ▼ n
 ┌──────────┐  space  ┌──────────┐
 │  Budget  │◀───────│  Action  │  parent_id (self-ref)
 └────┬─────┘         └────┬─────┘
      │ 1                  │ 1
      │                    │
      ▼ n                  ▼ n
 ┌──────────┐  action  ┌──────────┐
 │  Quota   │◀────────│  Record  │
 └────┬─────┘         └──────────┘
      │ 1
      │
      ▼ n
 ┌──────────┐
 │  Record  │
 └──────────┘

 ┌──────────┐
 │ Recorder │  → 关联 Category/Space/Action，按 config 自动产 Record
 └──────────┘
```

### 4.2 实体字段（PostgreSQL DDL 概要）

所有表包含审计列：`id BIGSERIAL`、`created TIMESTAMPTZ`、`modified TIMESTAMPTZ`，SaaS 形态增加 `tenant_id BIGINT NOT NULL`。

| 表 | 关键列 |
|----|--------|
| `category` | code, name, unit |
| `space` | code, name |
| `budget` | category_id, space_id, amount, labels(jsonb) |
| `action` | space_id, parent_id (self), name, labels(jsonb) |
| `quota` | budget_id, action_id, amount |
| `record` | quota_id, amount |
| `recorder` | category_id, space_id, action_id, budget_labels(jsonb), action_labels(jsonb), config(jsonb) |

标签以 PostgreSQL `jsonb`、SQLite `json_text` 存储，统一序列化为 `Vec<Label>`。

## 5. 分层设计

### 5.1 corn-core（领域层）

- **domain**：纯数据结构 + 校验逻辑，无 IO 依赖。
- **repo**：定义 `Repository` trait，提供 PG 与 SQLite 两套 sqlx 实现，通过 feature flag 切换。
- **service**：编排 domain + repo，封装业务规则（如「子配额之和 ≤ 父配额」「消耗不可超额」）。

### 5.2 corn-server（HTTP 层）

- **routes**：axum 路由 + 请求/响应 DTO + utoipa 注解，薄薄一层，仅做协议适配。
- **middleware**：
  - `tenant`：从 `X-Tenant-Id` 头解析 tenant_id 注入 `TenantContext`。
  - `auth`：Bearer Token 校验（MVP 简单实现）。
- **openapi**：聚合所有路由注解产出 `/v1/api-docs` 与 `/swagger-ui`。

### 5.3 corn-tauri（桌面层）

- 通过 `tauri::command` 直接调用 `corn-core` 的 service 函数，无需 HTTP 服务。
- 内嵌 SQLite，数据文件存放 Tauri `app_data_dir`。

## 6. API 契约设计

### 6.1 RESTful 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/v1/categories` | 类别列表 |
| POST | `/v1/categories` | 创建类别 |
| GET | `/v1/spaces` | 空间列表 |
| POST | `/v1/spaces` | 创建空间 |
| GET | `/v1/budgets` | 预算列表 |
| POST | `/v1/budgets` | 创建预算 |
| GET | `/v1/actions` | 活动列表 |
| POST | `/v1/actions` | 创建活动 |
| GET | `/v1/quotas` | 配额列表 |
| POST | `/v1/quotas` | 创建配额 |
| GET | `/v1/quotas/{id}/balance` | 配额余额 |
| GET | `/v1/records` | 消耗记录列表 |
| POST | `/v1/records` | 创建消耗记录 |
| GET | `/v1/recorders` | 记录器列表 |
| POST | `/v1/recorders` | 创建记录器 |

### 6.2 OpenAPI 生成

- `utoipa` 通过 `#[derive(ToSchema)]` + `#[endpoint]` 自动产出 OpenAPI 3.1。
- 前端通过 `openapi-generator-cli` 生成 `@corn/sdk` TypeScript SDK，pnpm workspace 共享。

## 7. 多租户设计（SaaS）

- 所有领域表追加 `tenant_id BIGINT NOT NULL`，复合索引 `(tenant_id, ...)`。
- `TenantContext`：请求级 `Extension`，由中间件注入。
- 仓储层所有查询带 `WHERE tenant_id = $1`，单测覆盖跨租户越权场景。
- 启动时可选通过 `corn seed-tenant` CLI 初始化租户的默认空间与类别。

## 8. 数据库迁移

- 使用 `sqlx migrate`，脚本置于 `migrations/`。
- 形态切换：`DATABASE_URL=postgres://...` 走 PG，`DATABASE_URL=sqlite://corn.db` 走 SQLite。
- 迁移脚本同时兼容 PG 与 SQLite 语法（避免 PG 特有类型）。

## 9. 部署设计

### 9.1 SaaS

```yaml
# docker-compose.yml
services:
  corn-server:
    image: corn/server:latest
    environment:
      DATABASE_URL: postgres://corn:***@db:5432/corn
      AUTH_MODE: bearer
      MULTI_TENANT: "true"
    depends_on: [db]
  db:
    image: postgres:16
```

### 9.2 私有化

复用 SaaS 镜像，`MULTI_TENANT=false`，单租户或带租户均可。

### 9.3 本地独立

Tauri 安装包内嵌 `corn-core` + SQLite，无需外部数据库与运行时。

## 10. 鉴权设计（MVP）

- `AUTH_MODE=bearer`：请求头 `Authorization: Bearer <token>`，token 由启动配置注入。
- `AUTH_MODE=none`：本地独立运行模式默认关闭鉴权。
- 后续可扩展为 OAuth2/OIDC。

## 11. 测试策略

- **corn-core**：纯领域逻辑单测（配额校验、消耗超额检测）。
- **corn-server**：HTTP 集成测试（axum `oneshot`），覆盖 CRUD + 跨租户隔离。
- **corn-tauri**：`tauri::command` 单测，调用 corn-core service。

## 12. 与旧实现的迁移关系

旧 Spring Boot 实现的 [domain](file:///workspace/src/main/java/net/mrchar/corn/model) 与 [README 概念定义](file:///workspace/README.md) 作为**领域契约参考**，迁移至 Rust 时按上表逐实体映射；Java 代码本身整体移除。
