<script setup lang="ts">
import { ref, watch } from 'vue';
import { components, composables } from '@mrchar/cumquat';
import {
  activeMenuItem,
  currentView,
  menuItems,
  spaceId,
  spaceOptions,
  userPrefs,
} from '../store/app';
import { currentUser, clearAuth } from '../store/auth';
import { logoutApi } from '../api';
import CommandBar from '../components/CommandBar.vue';

const { Layout, Drawer, Select, Button, Typography } = components;
const { useMediaQuery } = composables;

const isMobile = useMediaQuery('(max-width: 767px)');
const drawerOpen = ref(false);

/** 手机端选中菜单后自动收起抽屉 */
watch(currentView, () => {
  if (isMobile.value) drawerOpen.value = false;
});

function selectMenu(key: string) {
  currentView.value = key as 'pool' | 'types';
}

/** 登出：吊销服务端凭据 → 清除本地登录态 → 整页刷新复位全部状态（门禁自动接管） */
async function handleLogout() {
  await logoutApi();
  clearAuth();
  window.location.reload();
}
</script>

<template>
  <!-- 桌面：ERP 常见布局，左侧固定侧栏 -->
  <Layout v-if="!isMobile" has-sider style="min-height: 100vh">
    <template #sider>
      <div class="app-sider">
        <Typography :level="3" style="margin: 0; font-size: 16px">资源管理云服务</Typography>
        <!-- 使用空间关闭（用户级开关）时不展示空间概念，静默使用默认空间 -->
        <Select v-if="userPrefs.enableSpace" v-model="spaceId" :options="spaceOptions" placeholder="选择空间" />
        <nav class="app-menu">
          <button
            v-for="item in menuItems"
            :key="item.key"
            type="button"
            class="app-menu-item"
            :class="{ 'app-menu-item--active': item.key === currentView }"
            @click="selectMenu(item.key)"
          >
            {{ item.label }}
          </button>
        </nav>
        <div class="app-sider-footer">
          <Typography :level="0" style="color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
            {{ currentUser?.username }}
          </Typography>
          <Button size="sm" @click="handleLogout">退出登录</Button>
        </div>
      </div>
    </template>
    <div class="app-desktop-main">
      <div class="page-shell">
        <header class="page-toolbar">
          <div class="page-toolbar__title"><slot name="title" /></div>
          <div v-if="$slots.filters" class="page-toolbar__filters"><slot name="filters" /></div>
          <div v-if="$slots['primary-action']" class="page-toolbar__actions"><slot name="primary-action" /></div>
        </header>
        <div class="page-body"><slot /></div>
      </div>
      <!-- 指令条：流内 sticky 悬浮于内容区底部，长页面滚动中保持在场 -->
      <CommandBar />
    </div>
  </Layout>

  <!-- 手机：顶条 + 左侧抽屉 + 底部指令条（取代导航栏，视图切换走指令） -->
  <template v-else>
    <header class="app-mobile-header">
      <Button class="app-mobile-header__burger" @click="drawerOpen = true">☰</Button>
      <Typography :level="3" style="margin: 0">{{ activeMenuItem.label }}</Typography>
    </header>
    <Drawer v-model:open="drawerOpen" direction="left" size="280px" title="资源管理云服务">
      <div class="app-drawer-body">
        <Select v-if="userPrefs.enableSpace" v-model="spaceId" :options="spaceOptions" placeholder="选择空间" />
        <nav class="app-menu">
          <button
            v-for="item in menuItems"
            :key="item.key"
            type="button"
            class="app-menu-item"
            :class="{ 'app-menu-item--active': item.key === currentView }"
            @click="selectMenu(item.key)"
          >
            {{ item.label }}
          </button>
        </nav>
        <div v-if="$slots.filters" class="app-drawer-filters">
          <Typography :level="0" style="font-weight: 600">筛选</Typography>
          <slot name="filters" />
        </div>
        <div class="app-sider-footer">
          <Typography :level="0" style="color: #374151">{{ currentUser?.username }}</Typography>
          <Button size="sm" @click="handleLogout">退出登录</Button>
        </div>
      </div>
    </Drawer>
    <div class="app-mobile-body"><slot /></div>
    <CommandBar />
  </template>
</template>
