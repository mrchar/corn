# 架构总览

## 单代码库多目标编译

利用「**业务逻辑独立 crate + 多个可执行入口**」，同一份 Rust 代码适配三种部署形态：

```
corn/
├── crates/
│   ├── corn-core/      # 业务逻辑 crate（实体、服务、仓储）
│   ├── corn-server/    # axum HTTP 服务 → SaaS/私有化部署
│   └── corn-tauri/     # Tauri 应用 → 本地独立运行
├── migrations/         # sqlx 迁移脚本
└── frontend/           # pnpm monorepo（SDK + Web/Desktop/Mobile）
```

| 形态 | 入口 | 业务逻辑 | 数据库 |
|------|------|---------|--------|
| SaaS | corn-server 二进制 | corn-core crate | PostgreSQL + 行级多租户 |
| 私有化 | corn-server 二进制（Docker） | corn-core crate | PostgreSQL |
| 本地独立 | Tauri 安装包 | corn-core crate 直接嵌入 Tauri 进程 | SQLite 文件 |

## 数据流

```
                  ┌─────────────────────────┐
                  │   corn-core（业务逻辑）   │
                  └─────────────────────────┘
                       ▲               ▲
                       │               │
       ┌───────────────┴──┐     ┌──────┴──────────────┐
       │  corn-server     │     │  corn-tauri         │
       │  (axum HTTP)     │     │  (Tauri + SQLite)   │
       │  SaaS / 私有化    │     │  本地独立运行        │
       └────────┬─────────┘     └─────────────────────┘
                │
                ▼
       PostgreSQL / H2
                │
                ▼
       OpenAPI 3.1 (utoipa)
                │
                ▼ openapi-generator
        ┌───────────────┐
        │  @corn/sdk    │
        └───────────────┘
        ▲      ▲      ▲
        │      │      │
   Next.js  React Native  Tauri 前端
```

## 多租户（仅 SaaS 形态）

- 所有领域表追加 `tenant_id`，复合索引 `(tenant_id, ...)`。
- 请求级 `TenantContext` 由中间件注入。
- 仓储层所有查询带 `WHERE tenant_id = $1`。

## 契约驱动

- `utoipa` 通过 `#[derive(ToSchema)]` + `#[endpoint]` 自动产出 OpenAPI 3.1。
- 前端通过 `openapi-generator-cli` 生成 TypeScript SDK，pnpm workspace 共享。
