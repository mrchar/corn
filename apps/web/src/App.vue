<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { components } from '@mrchar/cumquat';
import { createSpace } from './api';
import { currentView, initApp, reloadSpaces, spaceId } from './store/app';
import { isAuthed, loadAuth } from './store/auth';
import Login from './views/Login.vue';
import ResourcePool from './views/ResourcePool.vue';
import ResourceTypes from './views/ResourceTypes.vue';
import Organizations from './views/Organizations.vue';

const { Button, Dialog, Input, Loading, MessageContainer, Typography } = components;

const loading = ref(true);

onMounted(async () => {
  loadAuth();
  if (!isAuthed.value) {
    loading.value = false;
    return;
  }
  try {
    await initApp();
  } finally {
    loading.value = false;
  }
});

/** 登录/注册成功：进入主界面并加载空间列表 */
async function handleLoginSuccess() {
  loading.value = true;
  try {
    await initApp();
  } finally {
    loading.value = false;
  }
}

/* ---------- 空态创建空间（新账号首入口） ---------- */

const createOpen = ref(false);
const createForm = ref({ code: '', name: '' });
const createError = ref('');
const creating = ref(false);

const CODE_RULE = /^[a-z][a-z0-9-]*$/;

async function submitCreate() {
  createError.value = '';
  const code = createForm.value.code.trim();
  if (!CODE_RULE.test(code)) {
    createError.value = '空间编码只能由小写字母、数字与连字符组成，且以字母开头';
    return;
  }
  if (!createForm.value.name.trim()) {
    createError.value = '请输入空间名称';
    return;
  }
  creating.value = true;
  try {
    await createSpace({ code, name: createForm.value.name.trim() });
    createOpen.value = false;
    await reloadSpaces();
  } catch (e) {
    createError.value = e instanceof Error ? e.message : '创建失败，请稍后重试';
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div v-if="loading" style="min-height: 100vh; display: grid; place-items: center">
    <Loading />
  </div>
  <!-- 登录门禁：未登录整页替换为登录/注册 -->
  <Login v-else-if="!isAuthed" @success="handleLoginSuccess" />
  <template v-else-if="spaceId">
    <ResourcePool v-if="currentView === 'pool'" />
    <ResourceTypes v-else-if="currentView === 'types'" />
    <Organizations v-else />
  </template>
  <div v-else style="min-height: 100vh; display: grid; place-items: center">
    <div style="display: flex; flex-direction: column; align-items: center; gap: 16px">
      <Typography :level="0" style="color: #6b7280">暂无可用空间，先创建一个属于自己的空间吧</Typography>
      <Button @click="createOpen = true; createForm = { code: '', name: '' }; createError = ''">创建空间</Button>
    </div>
  </div>
  <Dialog v-model:open="createOpen" title="创建空间" :action="submitCreate">
    <div style="display: flex; flex-direction: column; gap: 12px">
      <Input v-model="createForm.code" placeholder="空间编码（如 my-space）" />
      <Input v-model="createForm.name" placeholder="空间名称" />
      <p v-if="createError" style="margin: 0; font-size: 13px; color: #dc2626">{{ createError }}</p>
    </div>
  </Dialog>
  <MessageContainer />
</template>
