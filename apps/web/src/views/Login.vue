<script setup lang="ts">
import { ref } from 'vue';
import { components } from '@mrchar/cumquat';
import { loginApi, registerApi } from '../api';
import { setAuth } from '../store/auth';

const { Button, Input, Typography } = components;

const emit = defineEmits<{ success: [] }>();

/** mode：login 登录 / register 注册（注册成功即自动登录） */
const mode = ref<'login' | 'register'>('login');
const username = ref('');
const password = ref('');
const errorText = ref('');
const submitting = ref(false);

function switchMode(next: 'login' | 'register') {
  mode.value = next;
  errorText.value = '';
}

async function submit() {
  errorText.value = '';
  const name = username.value.trim();
  if (name.length < 3) {
    errorText.value = '用户名至少 3 个字符';
    return;
  }
  if (password.value.length < 6) {
    errorText.value = '密码至少 6 位';
    return;
  }
  submitting.value = true;
  try {
    const tokens = mode.value === 'login'
      ? await loginApi(name, password.value)
      : await registerApi(name, password.value);
    setAuth(tokens);
    emit('success');
  } catch (e) {
    errorText.value = e instanceof Error ? e.message : '操作失败，请稍后重试';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <Typography :level="2" style="margin: 0 0 4px; text-align: center">资源管理云服务</Typography>
      <Typography :level="0" style="margin: 0 0 20px; text-align: center; color: #6b7280">
        {{ mode === 'login' ? '登录以继续' : '创建新账号' }}
      </Typography>
      <form class="login-form" @submit.prevent="submit">
        <Input v-model="username" placeholder="用户名（3-32 位字母、数字、下划线或连字符）" />
        <Input v-model="password" type="password" placeholder="密码（至少 6 位）" />
        <p v-if="errorText" class="login-error">{{ errorText }}</p>
        <Button :disabled="submitting" style="width: 100%">
          {{ submitting ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录' }}
        </Button>
      </form>
      <div class="login-switch">
        <template v-if="mode === 'login'">
          还没有账号？
          <a href="#" @click.prevent="switchMode('register')">注册一个</a>
        </template>
        <template v-else>
          已有账号？
          <a href="#" @click.prevent="switchMode('login')">直接登录</a>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f5f7fa;
  padding: 16px;
}
.login-card {
  width: min(380px, 100%);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 32px 28px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.login-error {
  margin: 0;
  font-size: 13px;
  color: #dc2626;
}
.login-switch {
  margin-top: 16px;
  font-size: 13px;
  color: #6b7280;
  text-align: center;
}
.login-switch a {
  color: var(--color-cumquat-primary-600, #4f46e5);
  text-decoration: none;
}
</style>
