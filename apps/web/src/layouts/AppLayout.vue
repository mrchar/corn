<script setup lang="ts">
import { ref, watch } from 'vue';
import { components, composables } from '@mrchar/cumquat';
import {
  activeMenuItem,
  currentView,
  menuItems,
  spaceId,
  spaceOptions,
} from '../store/app';

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
</script>

<template>
  <!-- 桌面：ERP 常见布局，左侧固定侧栏 -->
  <Layout v-if="!isMobile" has-sider style="min-height: 100vh">
    <template #sider>
      <div class="app-sider">
        <Typography :level="3" style="margin: 0; font-size: 16px">资源管理云服务</Typography>
        <Select v-model="spaceId" :options="spaceOptions" placeholder="选择空间" />
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
      </div>
    </template>
    <div class="page-shell">
      <header class="page-toolbar">
        <div class="page-toolbar__title"><slot name="title" /></div>
        <div v-if="$slots.filters" class="page-toolbar__filters"><slot name="filters" /></div>
        <div v-if="$slots['primary-action']" class="page-toolbar__actions"><slot name="primary-action" /></div>
      </header>
      <div class="page-body"><slot /></div>
    </div>
  </Layout>

  <!-- 手机：顶条 + 左侧抽屉 + 底部导航 + 主按钮靠下 -->
  <template v-else>
    <header class="app-mobile-header">
      <Button class="app-mobile-header__burger" @click="drawerOpen = true">☰</Button>
      <Typography :level="3" style="margin: 0">{{ activeMenuItem.label }}</Typography>
    </header>
    <Drawer v-model:open="drawerOpen" direction="left" size="280px" title="资源管理云服务">
      <div class="app-drawer-body">
        <Select v-model="spaceId" :options="spaceOptions" placeholder="选择空间" />
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
      </div>
    </Drawer>
    <div class="app-mobile-body"><slot /></div>
    <nav class="app-tabbar">
      <button
        v-for="item in menuItems"
        :key="item.key"
        type="button"
        class="app-tabbar__item"
        :class="{ 'app-tabbar__item--active': item.key === currentView }"
        @click="selectMenu(item.key)"
      >
        {{ item.label }}
      </button>
    </nav>
    <div v-if="$slots['primary-action']" class="app-fab"><slot name="primary-action" /></div>
  </template>
</template>
