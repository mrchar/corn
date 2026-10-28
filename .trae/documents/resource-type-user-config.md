# 资源类型用户化 + 配置页面实施计划

## Context

当前 MVP 的资源类型全部由 `seed.ts` 从 6 个内建模板派生（`rt_demo_*`），页面上 6 个 Tab 是预置的，用户无法创建自己的类型。设计文档（design.md 第 6 章）本意是「元模型 + 使用者自行定义资源类型，内建模板仅作快速创建辅助」。

本次改造：**资源类型完全由用户创建（含自定义字段 attrSchema），新增资源类型配置页面**。用户已确认：
1. 内建模板保留为「快捷预设」（走已实现的 derive 派生端点）
2. 配置页面含自定义字段编辑器
3. seed 清空重来（只建模板 + 演示空间/领域，不再派生 rt_demo_*）

**关键现状**：后端创建 API 已存在（`POST spaces/:spaceId/resource-types`，origin 强制 `custom`）；metadata 按 active 类型动态生成 openapi.json —— 新类型自动成为资源池新 Tab，链路现成。缺口在：前端页面/API 封装、停用类型读路径 bug、seed 简化。

## 一、后端改动（小）

### 1. 修复「类型停用后已有实例不可读」
- [resource-type.service.ts](c:/Users/12230/Documents/Projects/corn/apps/api/src/modules/resource-type/resource-type.service.ts)：`requireByCode()`（:107）去掉 TYPE_DISABLED 抛错只留 404；新增 `requireActiveByCode()`（保留 active 校验，抛 TYPE_DISABLED 409）
- [resource.service.ts](c:/Users/12230/Documents/Projects/corn/apps/api/src/modules/resource/resource.service.ts)：共 4 处调用（:47 list、:82 detail、:99 create、:140 update）—— create 改调 `requireActiveByCode()`，list/detail/update 用宽松版。效果：停用类型后已有实例仍可读，仅禁止新建实例；openapi.json 已按 active 过滤，停用类型的 Tab 自动消失，无需改 metadata

### 2. seed 简化
- [seed.ts](c:/Users/12230/Documents/Projects/corn/apps/api/src/seed.ts)：删除 rt_demo_* 派生段，仅保留 6 条 BuiltinTemplate + 演示空间 + 演示领域
- 顺带核实派生 origin 统一为 `'builtin-inherited'`（seed 里曾写 `'builtin'`，删掉派生段后此问题消失；template.service.ts:129 已是正确值）

## 二、前端改动（主要工作）

### 3. api.ts 补封装
- [api.ts](c:/Users/12230/Documents/Projects/corn/apps/web/src/api.ts)：新增 `listResourceTypes`（domainId/status/keyword 过滤）、`createResourceType`、`updateResourceType`、`listBuiltinTemplates`、`deriveTemplate`，复用现有 fetch 信封解析模式

### 4. 新增 views/ResourceTypes.vue
- **列表**：cumquat Table（名称/编码/来源 Tag/状态 Tag/计量单位/字段数/inUse/操作），操作含「编辑」「停用|启用」；顶部「从模板派生」入口（Select 选模板 + Button 调 deriveTemplate，落库为 builtin-inherited）
- **创建/编辑 Dialog**：
  - 基础信息：code、name、domainId（下拉）、description、unit、numericScale、divisible、allowNegative、sourceKinds/sinkKinds
  - **attrSchema 动态编辑器**：表单模型 `rows: Array<{key,label,valueType,required,optionsText,min,max,unit}>`，提交时 map 成 `AttributeDef[]`；valueType=enum 时显示 options 逗号分隔输入（失焦 split+trim+去空）；key 手动输入（正则 `/^[a-z][a-z0-9_]*$/` 校验），label 为英文时自动 slugify 预填 key
  - **编辑态对齐后端冻结规则**：`inUse=true` 时禁改 unit/数值字段；已有 attr 行只读、仅可追加新行（后端 attrSchema 只能加不能删改）

### 5. App.vue 视图切换
- [App.vue](c:/Users/12230/Documents/Projects/corn/apps/web/src/App.vue)：header 加「资源池 / 资源类型」切换（cumquat Tabs 或 Button 组），`currentView: 'pool' | 'types'` ref 条件渲染，不引 vue-router

## 三、验证

1. **单测**：`pnpm --filter @corn/api test`（attribute.spec）
2. **e2e**：现有 e2e 已自建类型不依赖 rt_demo_* 种子，补一例回归 —— PATCH 停用类型后：GET 实例列表/详情 200、POST 新实例 409 TYPE_DISABLED
3. **重置数据**：重跑 seed（清空 rt_demo_*）
4. **前端构建**：`pnpm --filter @corn/web build`
5. **浏览器端到端主线**：
   - 切「资源类型」→ 手动创建带 enum 字段的自定义类型
   - 切回「资源池」→ 出现新 Tab → 创建资源实例 → 注入验证四口径
   - 从模板派生一个类型 → 验证 openapi 自动更新
   - 停用自定义类型 → 资源池 Tab 消失，但通过 API 确认已有实例仍可读
