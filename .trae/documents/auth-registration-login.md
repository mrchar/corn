# 注册登录与认证鉴权实施计划

## Context

项目当前无任何身份体系：无 User 模型、无登录、无鉴权，`actorId` 仅由 `x-actor-id: web-client` 请求头登记（space.guard.ts L21），LLM 代理与 ASR WebSocket 网关均无凭据校验。llm.controller 注释早已预留「Authorization 头承载本系统自有认证凭据」的接口语义，本次落地。

用户已拍板的决策：
- **空间隔离**：Space 加 ownerId，用户仅可见/操作自己创建的空间；注册后无空间（空态页提供创建入口）；存量空间 ownerId 为空不可见，不做迁移
- **JWT 双令牌**：access 短效（2h）+ refresh 长效（30 天，哈希落库、轮换、可吊销），前端 401 自动续期重放
- 密码哈希：node:crypto scrypt（零原生依赖）；JWT 用 @nestjs/jwt
- 公开端点仅：/auth/register、/auth/login、/auth/refresh、/auth/logout、/agent/status、/asr/status；其余全部要求登录（含 /openapi.json）
- `request.actorId` 改由 JWT sub 注入，前端废弃 x-actor-id 头

## 一、数据模型（apps/api/prisma/schema.prisma）

```prisma
model User {
  id            String   @id            // 应用层 newId('us')，沿用现有 id 风格
  username      String   @unique        // 3-32 字符
  passwordHash  String                  // "scrypt$salt$hash"
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  spaces        Space[]
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id        String    @id
  userId    String
  tokenHash String    @unique        // sha256(refreshToken)
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

Space 增 `ownerId String?` + `owner User @relation(...)`：**可空**，否则存量数据 `prisma db push` 失败；新建空间由业务层强制填 ownerId。执行 `prisma db push` + `prisma generate`。

## 二、后端（apps/api/src）

1. **common/errors.ts**：增 `UNAUTHORIZED`、`INVALID_CREDENTIALS`（401）
2. **common/public.decorator.ts**（新建）：`Public = () => SetMetadata(IS_PUBLIC, true)`
3. **common/auth.guard.ts**（新建，APP_GUARD）：Reflector 查 IS_PUBLIC 放行；解析 `Authorization: Bearer` → jwtService.verify → 挂 `request.user = { id, username }`；失败抛 `AppError(UNAUTHORIZED, '未登录或登录已过期', {}, 401)`（走 AppErrorFilter 统一信封）。不引入 passport
4. **modules/auth/**（新建）：auth.module / controller / service / dto（RegisterDto/LoginDto/RefreshDto，class-validator 风格与现有一致）
   - register：查重 username → 建 User → **注册即签发双 token**（自动登录）
   - login：scrypt 校验（随机 salt + timingSafeEqual）→ 双 token
   - refresh：sha256 查库，未吊销未过期 → **轮换**（旧记录 revokedAt=now，签新对）；失败 401
   - logout：@Public，凭 body 中 refreshToken 吊销，幂等永远 success
   - 响应统一 `{ accessToken, refreshToken, user: { id, username } }`；TTL 读 env：JWT_ACCESS_TTL=2h、REFRESH_TTL_DAYS=30、JWT_SECRET（缺失启动即抛错）
5. **app.module.ts** guard 顺序 = 注册顺序：**AuthGuard 在前、SpaceGuard 在后**
6. **space.guard.ts**：删 x-actor-id 行，改 `request.actorId = request.user?.id`（LedgerEntry 链路零改动）；查到空间后校验 `space.ownerId !== request.user.id → AppError(NOT_FOUND, '空间不存在', 404)`（404 防探测）
7. **space.service/controller**：list 的 where 加 `ownerId: user.id`；create 注入 ownerId
8. **公开标记**：auth 四端点、llm `@Get('status')`、asr status 控制器加 @Public()；/agent/v1/*、/openapi.json 默认受保护
9. **asr.gateway.ts**：connection 回调接收第二参数 req，从 upgrade URL 解析 `?token=` → jwtService 校验，失败 `ws.close(4401, 'unauthorized')`
10. **llm.controller.ts**：零改动（AuthGuard 已在前面校验自有 Authorization，剥离后注入 ARK_API_KEY 的现有逻辑正好衔接）

## 三、前端（apps/web/src）

1. **store/auth.ts**（新建）：`accessToken/refreshToken/user` ref + localStorage 单键 `corn.auth`（JSON 持久化）；`setAuth()/clearAuth()/loadAuth()`；`isAuthed` computed
2. **api.ts**：request 注入 `Authorization: Bearer <accessToken>`（登录/刷新端点除外，删除 ACTOR_ID/x-actor-id）；遇 401 且持有 refreshToken → **单飞刷新**（模块级 `let refreshing: Promise|null`，并发只发一次 /auth/refresh）→ 成功重放原请求一次，失败 clearAuth 抛错
3. **views/Login.vue**（新建）：全屏居中卡片，登录/注册双模式切换（Input/Button/Typography 拼装，沿用 Organizations.vue 的抛 Error 校验先例）；成功 setAuth 后通知 App.vue
4. **App.vue**：onMounted 先 loadAuth → 有 token 才 initApp()（initApp 内 401 由 api.ts 自动续期）；v-if 链变为：loading → **未登录渲染 Login** → spaceId 三视图 → 空态页加「创建空间」按钮 + Dialog 表单（成功后 reloadSpaces()）
5. **AppLayout.vue**：桌面侧栏与移动抽屉底部加「用户名 + 登出」（clearAuth + 刷新页面复位全部状态）
6. **services/agent.ts**：provider（createOpenAICompatible）传 `headers: { Authorization: Bearer <token> }`；useResources 的 headers 同样传 Authorization（覆盖 openapi.json 与资源请求），useResources 缓存键纳入 accessToken（token 轮换后重建 pool）
7. **services/asr.ts**：WebSocket 连接 URL 追加 `?token=<accessToken>`（浏览器 WS 无法自定义 header）
8. **vite.config.ts**：增 `'/auth'` 代理键 → localhost:4000

## 四、实施步骤与验证

| 步 | 内容 | 验证 |
|---|---|---|
| 1 | schema + db push + generate | push 成功、nest build 通过 |
| 2 | errors/public 装饰器/AuthGuard/app.module 顺序 | curl /spaces 无 token 得 401 统一信封 |
| 3 | auth 模块四端点 | curl 注册→登录→refresh→logout 全链路 |
| 4 | SpaceGuard 归属校验 + list/create 过滤 | 两账号互访空间得 404，列表只见自己的 |
| 5 | asr gateway token 校验 | 无 token ws 握手被 4401 关闭 |
| 6 | store/auth + api.ts 单飞续期 | vue-tsc 通过 |
| 7 | Login/App 门禁/空态建空间 | 浏览器：注册→自动登录→建空间→进主界面 |
| 8 | AppLayout 登出 + agent/asr 改造 | 端到端：资源操作→智能体→语音；登出后回登录页 |

## 五、风险清单

- **openapi.json 受保护**：useResources 的 doc 请求须带 token（其 headers 透传已确认）；门禁保证进视图前 token 就绪，token 轮换后 pool 须重建（缓存键含 token）
- **401 重放幂等性**：AuthGuard 在业务 handler 之前拒绝，被重放的 POST 从未触达写库，安全
- **刷新竞态**：单飞仅限单标签页；双标签共享同一 refreshToken 时轮换后败者需重登——MVP 接受
- **存量 dev 数据不可见**：ownerId 为空的旧空间全部不可列出/访问，按既定决策不迁移
- **WS token 走 query**：可能进入访问日志，dev/内网环境可接受
