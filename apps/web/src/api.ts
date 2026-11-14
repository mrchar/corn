/**
 * 认证基础设施：双令牌请求封装（401 静默续期重放）+ 名词化认证端点。
 * 业务资源请求一律由 useResources 生成的客户端承担（见 services/pools.ts），此处仅保留
 * 认证链路：注册 = POST /users，登录 = POST /sessions，续期 = PATCH /sessions/current，登出 = DELETE /sessions/current。
 */

import { accessToken, clearAuth, refreshToken as storedRefreshToken, setTokens } from './store/auth';

export interface ApiError {
  status: 'error';
  message: string;
  error: { code: string; detail?: unknown };
}

/** 公开端点（凭据自证，不注入 Authorization）：会话全量 + 创建用户 */
function isPublicUrl(url: string): boolean {
  return url.startsWith('/sessions') || url === '/users';
}

/** 单飞续期：并发 401 只触发一次 PATCH /sessions/current，成功返回 true */
let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  if (!storedRefreshToken.value) return false;
  try {
    const res = await fetch('/sessions/current', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: storedRefreshToken.value }),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { accessToken: string; refreshToken: string };
    setTokens(body);
    return true;
  } catch {
    return false;
  }
}

export function refreshOnce(): Promise<boolean> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/** 统一请求：注入凭据、401 静默续期重放、错误抛出中文 message（后端响应均为裸对象/裸列表） */
export async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  query?: Record<string, unknown>,
  retried = false,
): Promise<T> {
  const search = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      search.set(k, String(v));
    }
  }
  const fullUrl = search.toString() ? `${url}?${search.toString()}` : url;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken.value && !isPublicUrl(url)) {
    headers.Authorization = `Bearer ${accessToken.value}`;
  }
  const res = await fetch(fullUrl, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // 登录过期：单飞续期后重放一次原请求；续期失败则清除登录态交由门禁处理
  if (res.status === 401 && !retried && !isPublicUrl(url)) {
    if (await refreshOnce()) {
      return request<T>(method, url, body, query, true);
    }
    clearAuth();
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = (data as ApiError) ?? { status: 'error', message: res.statusText, error: { code: 'HTTP_ERROR' } };
    throw new Error(err.message);
  }
  return data as T;
}

/* ---------- 认证 ---------- */

export interface AuthTokensPayload {
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string };
}

/** 注册 = 创建用户（公开） */
export function registerApi(username: string, password: string): Promise<AuthTokensPayload> {
  return request<AuthTokensPayload>('POST', '/users', { username, password });
}

/** 登录 = 创建会话（公开） */
export function loginApi(username: string, password: string): Promise<AuthTokensPayload> {
  return request<AuthTokensPayload>('POST', '/sessions', { username, password });
}

/** 登出 = 删除当前会话（幂等，失败静默） */
export async function logoutApi(): Promise<void> {
  try {
    await request('DELETE', '/sessions/current', { refreshToken: storedRefreshToken.value });
  } catch {
    /* 登出尽力而为 */
  }
}
