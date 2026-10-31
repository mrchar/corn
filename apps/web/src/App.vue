<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { components } from '@mrchar/cumquat';
import { currentView, initApp, spaceId } from './store/app';
import ResourcePool from './views/ResourcePool.vue';
import ResourceTypes from './views/ResourceTypes.vue';
import Organizations from './views/Organizations.vue';

const { Loading, MessageContainer, Typography } = components;

const loading = ref(true);

onMounted(async () => {
  try {
    await initApp();
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div v-if="loading" style="min-height: 100vh; display: grid; place-items: center">
    <Loading />
  </div>
  <template v-else-if="spaceId">
    <ResourcePool v-if="currentView === 'pool'" />
    <ResourceTypes v-else-if="currentView === 'types'" />
    <Organizations v-else />
  </template>
  <div v-else style="min-height: 100vh; display: grid; place-items: center">
    <Typography :level="0" style="color: #6b7280">暂无可用空间</Typography>
  </div>
  <MessageContainer />
</template>
