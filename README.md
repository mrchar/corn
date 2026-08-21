# 玉米 CORN

> 简易通用资源管理系统 —— 预算 · 配额 · 消耗

玉米通过「预算 → 配额 → 消耗记录」的主轴，帮助你在任意活动中对时间、人力、资金等成本进行计划、分配与追踪。

## 技术栈

- **统一逻辑内核**：Rust（`corn-core` crate），三种部署形态共享同一份代码。
- **SaaS / 私有化**：`corn-server`（axum HTTP + utoipa OpenAPI 3.1 + PostgreSQL 行级多租户）。
- **本地独立运行**：`corn-tauri`（Tauri 桌面应用 + 嵌入式 SQLite）。
- **多端入口**：React 系全栈（Web=Next.js、移动=React Native、桌面=Tauri），通过 openapi-generator 产出 `@corn/sdk` 统一复用。

## 仓库结构

```
/workspace
├── docs/          # VitePress 文档站点
├── crates/        # Rust workspace
│   ├── corn-core/   # 业务逻辑（领域模型 + 服务 + 仓储）
│   ├── corn-server/ # axum HTTP 服务（SaaS/私有化）
│   └── corn-tauri/  # Tauri 桌面应用（本地独立运行）
├── migrations/    # sqlx 迁移脚本
└── frontend/      # pnpm monorepo（SDK + Web/Desktop/Mobile）
```

## 文档

完整的介绍、概念、架构、需求与设计文档位于文档站点：

```bash
cd docs && pnpm install && pnpm dev
```

详见 [指南](docs/guide/intro.md) · [需求文档](docs/requirements.md) · [设计文档](docs/design.md)。

## 部署形态

| 形态 | 入口 | 数据库 |
|------|------|--------|
| SaaS | `corn-server` 二进制 | PostgreSQL + 多租户 |
| 私有化 | `corn-server`（Docker） | PostgreSQL |
| 本地独立 | Tauri 安装包 | SQLite 文件 |
