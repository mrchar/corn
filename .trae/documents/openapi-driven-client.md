# OpenAPI 驱动客户端：URL 纯资源化（无动词）+ 前端 useResources 全面替代手写 api.ts

## Context

前端 `api.ts` 手写约 30 个请求函数，与后端路由双份维护。目标：后端 URL 严格抽象为名词性资源（**不含动词**，动作一律表达为「创建记录」或「更新资源属性」），导出完整 OpenAPI 文档；前端全部资源操作由 cumquat `useResources` 从文档生成 client，`api.ts` 仅保留认证基础设施。

### 用户确立的 URL 原则

- URL 只含名词（资源集合/单项），不出现动词
- 动作端点抽象为：①创建一条记录资源（注入/占用/花费）；②更新资源的属性（释放/结算 = 更新占用记录的状态；模板启用 = 更新模板属性；注册 = 创建用户；登录 = 创建会话）
- 后端惯例可调整以适应 useResources 解析机制

### parseOpenApi 硬约束（cumquat 实现，决定后端文档与路由形状）

- 资源名 = 操作首个 tag；同 tag 多路径合并（同 key 后者覆盖）→ 每个资源独立 tag
- 操作分类：GET 无占位符→list、GET 有 `{...}`→detail、POST 无占位符→create、PUT/PATCH 有占位符→update、DELETE 有占位符→remove；**POST 带占位符直接忽略**
- `itemUrl` 只替换 `{id}` → 空间池路径只允许 `{id}` 一个占位符（空间前缀由 server 参数携带）
- list 响应识别：schema 顶层 properties 中找「数组属性 + total 整数属性」，**不识别嵌套信封** → list 必须裸返回 `{list,total}`；写操作返回裸资源对象
- 非 2xx 抛 `ResourceHttpError(method,url,status,body)`，body 即 `{status,message,code}`，前端 toast 取 `err.body?.message`

## 后端改动（apps/api）

### 1. 路由资源化重构（动词全部消除）

| 现状（动词） | 改为（资源语义） |
|---|---|
| POST /spaces/:sid/reservations/:id/release | PATCH /spaces/:sid/reservations/:id `{status:'released', amount?, reason?}` |
| POST /spaces/:sid/reservations/:id/settle | 同上 PATCH `{status:'settled', amount?, reason?}` |
| GET /spaces/:sid/resources/:rid/ledger | GET /spaces/:sid/ledger?resourceId=&page=&pageSize= |
| GET /spaces/:sid/resources/:rid/reservations | GET /spaces/:sid/reservations?resourceId=&status= |
| POST /spaces/:sid/builtin-templates/:id/derive | 并入 POST /spaces/:sid/resource-types（body `{templateId}` 派生 / 完整字段创建，二选一） |
| POST /auth/register | POST /users（创建用户，无鉴权） |
| POST /auth/login | POST /sessions（创建会话，返回双 token） |
| POST /auth/refresh | PATCH /sessions/current（body `{refreshToken}` 换新） |
| POST /auth/logout | DELETE /sessions/current（携带凭据即定位会话） |

- 已合规不动：domains、groups、resource-types（CRUD）、spaces（CRUD）、builtin-templates（GET list/detail + PATCH 更新启用属性）、动态资源 `spaces/:sid/:typeCode`
- PATCH /reservations/:id：service 按目标 status 分流到现有 release/settle 领域逻辑（四口径仍由流转记录派生的硬约束不变）
- users：`GET /users/me` → `GET /users/{id}`（id='me' 或本人 id 生效，其余 403），PATCH 同理 → users 成为标准资源可入文档
- 旧路由直接删除，无兼容包袱；`resource-type.constants.ts` 保留段补 `ledger`、`reservations`、`builtin-templates` 等防动态路由吞并
- asr/status、agent/* 属系统能力端点（SSE/WS），非业务资源，不入文档不改动

### 2. 响应裸化统一

- list 裸 `{list,total}`；detail/create/update/remove 裸资源对象（动态资源 list 已裸，写操作与全部静态 controller 去 `success()` 包装）
- 错误信封 `{status:'error',message,code}` + HTTP 状态码不变（app-error.filter 不动）

### 3. OpenAPI 文档（metadata.service.ts）

空间池 `/spaces/:sid/openapi.json` 在动态资源类型基础上追加静态资源声明（每资源独立英文 tag，字段中文 label 走 description）：

- `domains`、`groups`、`resource-types`：list/create/detail/update/remove
- `builtin-templates`：list/detail/update
- `reservations`：list/create/update（update schema：status enum [released,settled] + amount + reason）
- `creations`、`consumptions`：create
- `ledger`：list（query: resourceId/page/pageSize）
- 删除现有 `appendActionPaths`（「流转」tag 被上述资源取代）

新增全局文档 `GET /openapi.json`（servers url `/`）：`spaces`（list/create/detail/update）、`users`（detail/update/create）、`sessions`（create/update/remove，供文档完整性，前端认证仍走手写基础设施）。

### 4. 后端验证

`nest build`；curl 核验：两份文档资源完整、PATCH reservations 释放/结算正确派生四口径、/ledger?resourceId= 正常、POST /users 注册、POST /sessions 登录、旧动词路由 404。

## 前端改动（apps/web）

### 5. 资源池单例（新文件 `src/services/pools.ts`）

- `rootPool = useResources({ server:'', doc:'/openapi.json', headers: authHeaders })` → spaces、users
- `spacePool()`：随 spaceId 缓存重建（借鉴 agent.ts cachedSpace 模式），`server:/spaces/{sid}` → domains/groups/resource-types/builtin-templates/reservations/creations/consumptions/ledger + 动态类型
- authHeaders 复用现有「函数形式 + accessToken」模式
- ResourcePool.vue 与 agent.ts 删除各自池实例，改用 spacePool

### 6. api.ts 收敛

保留 `request()` 核心（含 401 静默刷新重试）+ 认证四函数（指向新名词路由 /users、/sessions）；删除全部业务资源函数与类型（约 300 行）。认证属客户端基础设施且依赖 401 刷新拦截，不走 client——这是唯一保留手写的边界。

### 7. 调用点切换（模式统一）

- `store/app.ts`：reloadSpaces → `rootPool.client('spaces').list(...)`；reloadDomains → `spacePool().client('domains').list(...)`；getMe/updateMe → `rootPool.client('users').detail('me')/update('me',...)`
- `Organizations.vue`：三分区 CRUD → client list/create/update/remove
- `ResourceTypes.vue`：类型 CRUD、模板列表/启用（`client('builtin-templates').update(id,{enabled})`）、派生（`client('resource-types').create({templateId})`）
- `ResourcePool.vue`：注入/占用/花费 → `client('creations'|'reservations'|'consumptions').create(...)`；释放/结算 → `client('reservations').update(id,{status:'released'|'settled',...})`；流水 → `client('ledger').list({filters:{resourceId}})`；占用列表 → `client('reservations').list({filters:{resourceId,status:'active'}})`；删除本地 refine（文档已完整）
- `store/auth.ts`：四函数指向 /users、/sessions 新路由（逻辑不变）
- 错误提示统一 `err.body?.message`；client 返回裸对象无需 `.data` 解包

### 8. 智能体适配（services/agent.ts）

- query/command 执行器改走 spacePool；command 的 action 枚举（creation/reservation/release/settle/consumption）对外契约不变，内部路由：release/settle → `client('reservations').update(id,{status})`
- 系统提示词/inspect 文案同步为「更新占用状态」语义

## 关键文件

- 后端：`modules/ledger/ledger.controller|service.ts`、`modules/resource-type/resource-type.controller.ts`、`modules/resource-type/template.controller.ts`、`modules/auth/auth.controller.ts`、`modules/users/users.controller.ts`、`modules/metadata/metadata.service|controller.ts`、各静态 controller 去信封
- 前端：`src/api.ts`、`src/services/pools.ts`（新）、`src/store/app.ts`、`src/store/auth.ts`、`src/views/Organizations.vue`、`src/views/ResourceTypes.vue`、`src/views/ResourcePool.vue`、`src/services/agent.ts`

## 验证

1. `nest build` + `vue-tsc --noEmit` 零错误
2. curl：双文档资源声明完整；PATCH reservations 两种状态流转正确；/ledger 过滤正常；注册/登录/刷新/登出新路由全通；旧动词路由 404
3. 浏览器：注册 → 组织页三分区 CRUD → 资源类型创建/模板派生 → 资源池注入/占用/释放/结算/花费/流水抽屉全链路
4. 智能体：指令条「给xx注入100」「释放xx占用」走确认环落库正确
