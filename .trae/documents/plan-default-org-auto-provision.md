# 计划：注册自动开通默认组织 + 空间/领域/群组按需显隐

## Context

当前系统用空间（人员隔离）、领域（资源隔离）、群组（权限分级）做组织管理，但普通用户不需要理解这些概念。目标（用户已确认的最终语义：企业制度通常公司统一管理，**领域与群组开关都是空间级**）：

1. **注册时自动创建**默认空间、默认领域、默认群组，用户无感。
2. **默认全程隐藏**这些概念字眼：组织视图分区、侧栏空间选择器、资源类型「归属领域」列/表单项/派生弹窗、资源池「领域筛选」/表单 domainId 项/详情「领域」行。
3. **开关层级**：
   - 「使用空间」：**用户级**。关闭 = 只有默认一个空间；打开 = 可创建多个空间。
   - 「使用领域」：**空间级**（每个空间单独控制）。关闭时领域概念全空间不可见，所有领域选项自动落在默认领域。
   - 「使用群组」：**空间级**（每个空间单独控制）。关闭时群组概念全空间不可见，所有群组选项自动落在默认群组。
   - **约束**：空间内已有多个领域（>1）时禁止关闭「使用领域」；空间内已有多个群组（>1）时禁止关闭「使用群组」；用户已有多个空间（>1）时禁止关闭「使用空间」（服务端强校验 + 前端禁用态提示）。
4. 开关入口在组织视图顶部开关区，双向可切换。

## 后端（apps/api）

### 1. Prisma schema（`apps/api/prisma/schema.prisma`）

- `User` 增加：`enableSpace Boolean @default(false)`
- `Space` 增加：`enableDomain Boolean @default(false)`、`enableGroup Boolean @default(false)`
- Group/Domain 模型不动（群组保持空间级）
- 执行 `prisma db push`（项目惯例：SQLite 无 migrations 目录）+ `prisma generate`

### 2. 注册自动开通（`apps/api/src/modules/auth/auth.service.ts`）

`register()` 改为 `prisma.$transaction` 一次性创建（复用 `newId`）：

- User（现状不变）
- 默认 Space：`ownerId=user.id`、`name='个人空间'`、`code='u-' + user.id.slice(3)`（userId 为 `us_`+20位hex，派生 code 匹配 `/^[a-z][a-z0-9-]*$/` 且全局唯一）
- 默认 Domain：`code='default'`、`name='默认领域'`
- 默认 Group：`code='default'`、`name='默认群组'`

直接用 prisma 事务（跨模块注入服务反而增加耦合）。

### 3. 用户级开关接口（新增 `modules/users/`：users.module/controller/service，注册进 `app.module.ts` 固定路径区，参照 space.controller.ts 的 `AuthenticatedRequest` 模式）

- `GET /users/me` → `{ id, username, enableSpace }`
- `PATCH /users/me`，body `{ enableSpace?: boolean }`（`@IsOptional() @IsBoolean()`）
  - 服务端约束：`enableSpace=false` 时该用户空间数 > 1 → `AppError(ErrorCodes.CONFLICT, '已创建多个空间，无法关闭使用空间', {}, 409)`

### 4. 空间级开关（`modules/space/`）

- `UpdateSpaceDto` 增加可选 `enableDomain?: boolean`、`enableGroup?: boolean`（`@IsOptional() @IsBoolean()`）
- `SpaceService.update`：
  - `enableDomain=false` 时统计该空间 domain 数，>1 抛 CONFLICT（『已创建多个领域，无法关闭使用领域』）
  - `enableGroup=false` 时统计该空间 group 数，>1 抛 CONFLICT（『已创建多个群组，无法关闭使用群组』）
- `SpaceView` / `toView` 增加 `enableDomain`、`enableGroup`

### 5. 新建空间附带默认子对象（`SpaceService.create`）

事务内自动建默认领域（`code='default'`、`name='默认领域'`）与默认群组（`code='default'`、`name='默认群组'`）——资源类型必须有归属领域、领域/群组开关关闭时选项兜底到默认对象，保证任意新空间开箱可用。

## 前端（apps/web）

### 6. api.ts

- 新增 `getMe()`（GET /users/me）、`updateMe(patch)`（PATCH /users/me）
- `Space` 接口增加 `enableDomain?: boolean; enableGroup?: boolean`
- `updateSpace(spaceId, payload: { name?; enableDomain?; enableGroup? })` 签名扩展

### 7. store/app.ts（全局状态）

- `userPrefs = ref({ enableSpace: false })`；`initApp()` 中经 `getMe()` 加载；`saveUserPrefs(patch)` PATCH 后回写
- `currentSpace = computed(() => spaces.value.find(s => s.id === spaceId.value))`
- `domainEnabled = computed(() => currentSpace.value?.enableDomain ?? false)`
- `groupEnabled = computed(() => currentSpace.value?.enableGroup ?? false)`
- `reloadSpaces()` 无需改（空间列表自带新字段）

### 8. AppLayout.vue

桌面 sider 与手机 Drawer 中的空间 `Select` 均加 `v-if="userPrefs.enableSpace"`。

### 9. Organizations.vue（开关区 + 分区显隐）

- 引入 cumquat `Switch`；页头下方新增开关区（三个开关 + 一句话说明）：
  - **使用空间**（用户级）：绑定 `userPrefs.enableSpace` → `saveUserPrefs`；`spaces.length > 1` 时禁用（提示已创建多个空间）
  - **使用领域**（空间级）：绑定 `currentSpace.enableDomain` → `updateSpace(spaceId, { enableDomain })` 后 `reloadSpaces()`；`domains.length > 1` 时禁用
  - **使用群组**（空间级）：绑定 `currentSpace.enableGroup` → `updateSpace(spaceId, { enableGroup })` 后 `reloadSpaces()`；`groups.length > 1` 时禁用
- 三个分区分别 `v-if`（空间=userPrefs.enableSpace，领域=domainEnabled，群组=groupEnabled）
- `fabActions` 改 computed 按分区可见性过滤
- 开关切换失败 try/catch 回滚 Switch 状态 + `message.error` 提示原因

### 10. ResourceTypes.vue（领域字眼隐藏）

- `columns` 改 computed：`!domainEnabled` 时过滤 `domainName` 列
- 创建/编辑弹窗「归属领域」label+Select 加 `v-if="domainEnabled"`（openCreate 已默认 `domainId=domains[0]`，编辑保留原值）
- 模板派生弹窗「归属领域」同样 `v-if`；隐藏时自动填 `domains[0]?.id`，跳过「请选择归属领域」校验

### 11. ResourcePool.vue（领域字眼隐藏）

- 筛选区「领域」Select 加 `v-if="domainEnabled"`（关闭时清空 domainId 筛选值）
- `formProperties`：`!domainEnabled` 时过滤 `f.name === 'domainId'` 的属性项（表单不渲染，`formValues.domainId` 仍随 openCreate/openUpdate 携带提交）
- `detailItems`：`!domainEnabled` 时过滤「领域」行

### 12. 不改动项

- App.vue「暂无可用空间」空态保留（仅存量无空间账号可见，新账号必有默认空间）
- 存量账号不做数据迁移（已有空间照常使用，开关默认关闭需手动打开）
- 智能体（agent.ts）：群组/领域均为空间级查询，工具契约不动

## 验证

1. **后端**：`nest build` 通过；curl 注册新用户 → 查 SQLite 确认 space/domain/group 三条记录落库；`PATCH /users/me`、`PATCH /spaces/:id` 开关切换；多领域空间关「使用领域」、多群组空间关「使用群组」均返回 409；新建空间自动带默认领域与默认群组。
2. **前端**：`vue-tsc` 通过；重启 dev server（必要时清 `.vite`）。
3. **浏览器**（browser_use 子代理）：
   - 注册全新账号 → 默认进入资源池；侧栏无空间选择器；组织视图只见三个开关、无分区内容
   - 打开「使用群组」→ 群组分区出现且含「默认群组」
   - 打开「使用领域」→ 领域分区出现且含「默认领域」；资源类型视图出现「归属领域」
   - 打开「使用空间」→ 侧栏出现空间选择器；新建第二个空间后「使用空间」开关禁用，新空间含默认领域与默认群组
   - 新空间内创建第二个领域/群组后对应开关禁用
   - 全程截图取证 + DB 落库核对
