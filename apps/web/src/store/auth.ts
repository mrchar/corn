import { computed, ref } from 'vue';

/**
 * 登录态单例：双令牌与用户信息，localStorage 单键持久化。
 * 页面刷新后 loadAuth() 恢复；api.ts 的请求封装注入 Authorization 头并负责静默续期。
 */

export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

const STORAGE_KEY = 'corn.auth';

export const accessToken = ref('');
export const refreshToken = ref('');
export const currentUser = ref<AuthUser | null>(null);

export const isAuthed = computed(() => accessToken.value !== '');

export function setAuth(tokens: AuthTokens): void {
  accessToken.value = tokens.accessToken;
  refreshToken.value = tokens.refreshToken;
  currentUser.value = tokens.user;
  persist();
}

/** 静默续期后仅更新令牌（用户信息不变） */
export function setTokens(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>): void {
  accessToken.value = tokens.accessToken;
  refreshToken.value = tokens.refreshToken;
  persist();
}

export function clearAuth(): void {
  accessToken.value = '';
  refreshToken.value = '';
  currentUser.value = null;
  localStorage.removeItem(STORAGE_KEY);
}

export function loadAuth(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<AuthTokens>;
    accessToken.value = saved.accessToken ?? '';
    refreshToken.value = saved.refreshToken ?? '';
    currentUser.value = saved.user ?? null;
  } catch {
    clearAuth();
  }
}

function persist(): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      accessToken: accessToken.value,
      refreshToken: refreshToken.value,
      user: currentUser.value,
    }),
  );
}
