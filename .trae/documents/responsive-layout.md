# 响应式双端布局重构（布局组件 + 具名插槽架构）

## Context

当前 App.vue 是单一顶栏布局（标题 + Tabs + 空间/领域 Select），仅在电脑视窗可用。需要原生适应电脑与手机两种视窗，并且采用**布局组件 + 具名插槽**架构：新建独立布局文件，各页面用具名插槽插入标题、筛选器、主按钮和主体内容。

- **电脑端**：ERP 常见布局 —— 左侧固定侧栏（应用名 + 空间选择 + 菜单）+ 内容区页头（标题 + 筛选器 + 主操作按钮）+ 主体
- **手机端**：顶部薄条（汉堡按钮 + 页面标题），空间与菜单收进左侧抽屉，底部导航切换视图，页面主操作按钮靠下（固定在底部导航右上方的 FAB 容器）

视窗断点：`768px`。

## 架构

```
store/app.ts（新建，单例响应式 store）
  spaces / spaceId / domains / domainId / currentView / menuItems / init()
     ↑ inject 式共享                 App.vue（变薄：init + Loading + 视图分发）
                                      │
              ┌───────────────────────┴───────────────────────┐
              │  layouts/AppLayout.vue（新建，双端骨架）         │
              │  桌面：Layout(has-sider)                        │
              │    aside：应用名 + 空间Select + 菜单nav           │
              │    内容页头：<slot name="title"> + <slot name="filters"> │
              │             + <slot name="primary-action">      │
              │  手机：fixed 顶条（汉堡 + <slot name="title">）    │
              │    Drawer(left)：空间 + 菜单 + <slot name="filters"> │
              │    main：<slot/>                                │
              │    底部导航（fixed）+ FAB 容器（<slot name="primary-action">）│
              └───────────────────────┬───────────────────────┘
                                      │ 各页面使用具名插槽
        ResourcePool.vue            ResourceTypes.vue
        #title 资源池                #title 资源类型
        #filters 领域Select          #primary-action 从模板派生/新建类型
        #primary-action +新建        <default> 配置内容
        <default> 资源池内容
```

插槽契约（AppLayout 对页面暴露）：
- `title`：页面标题（桌面页头左侧 / 手机顶条）
- `filters`（可选）：页面级筛选器（桌面页头右侧 / 手机抽屉内标题下方与内容区顶部）
- `primary-action`（可选）：页面主操作按钮（桌面页头按钮 / 手机端 FAB 容器内原样渲染）
- `default`：页面主体

全局内容（应用名、空间选择、菜单、底部导航）由 AppLayout 内部从 store 读取，不走插槽。

关键取舍：手机端 FAB 用自写容器（约 10 行 CSS）而非 cumquat `FloatButton`——FloatButton 吃 `actions` 数组（数据模型），与「页面以插槽提供内容」的架构不一致，保持单一内容来源。已知组件库缺口：Drawer `direction="left"` 的 CSS 无 `--left` 变体（panel 恒 `right:0`）——**项目侧不做覆盖 hack**，代码按 `direction="left"` 正确调用，抽屉位于左侧的效果待组件库修复发版后再回来验证。

## 文件改动

### 1. 新建 `apps/web/src/store/app.ts`

从 App.vue 平移全局状态为单例响应式 store（普通模块级 `ref` 导出，页面直接 import 即共享）：
- `spaces / spaceId / domains / domainId / currentView('pool'|'types')`
- `menuItems = [{ key: 'pool', label: '资源池' }, { key: 'types', label: '资源类型' }]`
- `initApp()`：加载 listSpaces 并默认选中，watch spaceId 联动 listDomains（原 App.vue onMounted/watch 逻辑）
- `activeMenuItem` computed（menuItems 中 key === currentView 的项，供布局显示标题兜底）

### 2. 新建 `apps/web/src/layouts/AppLayout.vue`

```ts
const { Layout, Drawer, Select, Button, Typography, Loading } = components;
const { useMediaQuery } = composables;
const isMobile = useMediaQuery('(max-width: 767px)');
const drawerOpen = ref(false);
watch(currentView, () => { if (isMobile.value) drawerOpen.value = false; }); // 手机端选菜单后收抽屉
```

- **桌面（!isMobile）**：`<Layout has-sider breakpoint="md">`
  - `#sider`：应用名「资源管理云服务」+ 空间 Select（width 100%）+ 菜单 nav（`.app-menu`，点击设 currentView，active 高亮）
  - default：页头工具条 `.page-toolbar`（`<slot name="title">` + `<slot name="filters">` + `<slot name="primary-action">`）+ `<main><slot/></main>`
- **手机（isMobile）**：
  - fixed 顶条 `.app-mobile-header`：汉堡 Button（开抽屉）+ `<slot name="title">`
  - `<Drawer v-model:open="drawerOpen" direction="left" size="280px">`：空间 Select、菜单列表、`<slot name="filters">`
  - `<main>`（上下 padding 避让 fixed 顶条/底部导航）+ `<slot/>`
  - `.app-tabbar` 底部导航（fixed，两项，高亮 currentView，含 safe-area-inset-bottom）
  - `.app-fab`（fixed 右下、底部导航上方）+ `<slot name="primary-action">`

### 3. 修改 `apps/web/src/App.vue`（变薄）

- `onMounted(initApp())`；Loading 分支保留
- 模板仅剩：`<ResourcePool v-if="currentView==='pool'"/>` / `<ResourceTypes v-else/>` + `<MessageContainer/>`（空间/领域 Select、Tabs、header 全部移出）

### 4. 修改 `apps/web/src/views/ResourcePool.vue`

- 顶层套 `<AppLayout>`：`#title`「资源池」；`#filters` 领域 Select（选项来自 store.domains，v-model store.domainId，从原 App.vue 迁移）；`#primary-action`「+ 新建」Button；默认插槽放原 Tabs/表格/弹窗/详情抽屉
- 原「+ 新建」不再需要 page-primary-action 媒体查询（显隐由布局控制）

### 5. 修改 `apps/web/src/views/ResourceTypes.vue`

- 同上：`#title`「资源类型」；`#primary-action`「从模板派生」「+ 新建类型」两个 Button（手机端 FAB 容器内纵排）；默认插槽放原配置页内容

### 6. 追加 `apps/web/src/style.css`

- `.app-menu / .app-menu-item / .app-menu-item--active`：侧栏与抽屉共用菜单样式
- `.page-toolbar`：桌面内容页头（flex，标题/筛选/主按钮排布）
- `.app-mobile-header / .app-tabbar`：手机 fixed 顶条与底部导航
- `.app-fab`：fixed 右下 FAB 容器（bottom 避让 tabbar，flex column gap，z-index 低于 Drawer）
- 组件库缺口（Drawer `--left` 变体）不做项目侧覆盖，等组件库修复后验证

## 验证

1. 前端 dev server（5173）+ 后端（4000）已运行
2. 桌面视窗（≥768px）：左侧固定侧栏（应用名/空间选择/菜单）、内容页头（标题+领域筛选+新建按钮）；切换视图与功能回归（新建/注入/占用弹窗、抽屉详情）
3. 手机视窗（375×812）：汉堡打开左侧抽屉（面板在左）、选空间/菜单后自动收起；底部导航切换视图；主按钮位于底部导航上方且可点开对应弹窗
4. 拖动视窗跨 768px：双端骨架正确切换
