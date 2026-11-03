/** 统一请求封装：自动注入登录凭据与空间前缀，401 静默续期重放，统一解析响应信封。 */

import { accessToken, clearAuth, refreshToken as storedRefreshToken, setTokens } from './store/auth';

export interface ApiList<T> {
  list: T[];
  total: number;
}

export interface ApiSuccess<T = unknown> {
  status: 'success';
  message: string;
  data?: T;
}

export interface ApiError {
  status: 'error';
  message: string;
  error: { code: string; detail?: unknown };
}

/** 认证端点自带凭据语义，不注入 Authorization */
function isAuthFreeUrl(url: string): boolean {
  return url.startsWith('/auth/');
}

/** 单飞续期：并发 401 只触发一次 /auth/refresh，成功返回 true */
let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  if (!storedRefreshToken.value) return false;
  try {
    const res = await fetch('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: storedRefreshToken.value }),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as ApiSuccess<{ accessToken: string; refreshToken: string }>;
    if (!body.data) return false;
    setTokens(body.data);
    return true;
  } catch {
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function request<T>(
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
  if (accessToken.value && !isAuthFreeUrl(url)) {
    headers.Authorization = `Bearer ${accessToken.value}`;
  }
  const res = await fetch(fullUrl, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // 登录过期：单飞续期后重放一次原请求；续期失败则清除登录态交由门禁处理
  if (res.status === 401 && !retried && !isAuthFreeUrl(url)) {
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

export async function registerApi(username: string, password: string): Promise<AuthTokensPayload> {
  const res = await request<ApiSuccess<AuthTokensPayload>>('POST', '/auth/register', { username, password });
  return res.data as AuthTokensPayload;
}

export async function loginApi(username: string, password: string): Promise<AuthTokensPayload> {
  const res = await request<ApiSuccess<AuthTokensPayload>>('POST', '/auth/login', { username, password });
  return res.data as AuthTokensPayload;
}

/** 登出：吊销服务端 refresh token（幂等，失败静默） */
export async function logoutApi(): Promise<void> {
  try {
    await request('POST', '/auth/logout', { refreshToken: storedRefreshToken.value });
  } catch {
    /* 登出尽力而为 */
  }
}

/* ---------- 空间与领域 ---------- */

export interface Space {
  id: string;
  name: string;
  description?: string;
  status: string;
}

export interface Domain {
  id: string;
  name: string;
  description?: string;
  status: string;
}

export function listSpaces() {
  return request<ApiList<Space>>('GET', '/spaces');
}

export interface SpacePayload {
  code: string;
  name: string;
}

export function createSpace(payload: SpacePayload) {
  return request<ApiSuccess<{ id: string }>>('POST', '/spaces', payload);
}

export function updateSpace(spaceId: string, name: string) {
  return request<ApiSuccess>('PATCH', `/spaces/${spaceId}`, { name });
}

export function listDomains(spaceId: string) {
  return request<ApiList<Domain>>('GET', `/spaces/${spaceId}/domains`);
}

export interface DomainPayload {
  code: string;
  name: string;
}

export function createDomain(spaceId: string, payload: DomainPayload) {
  return request<ApiSuccess<{ id: string }>>('POST', `/spaces/${spaceId}/domains`, payload);
}

export function updateDomain(spaceId: string, domainId: string, name: string) {
  return request<ApiSuccess>('PATCH', `/spaces/${spaceId}/domains/${domainId}`, { name });
}

export function deleteDomain(spaceId: string, domainId: string) {
  return request<ApiSuccess>('DELETE', `/spaces/${spaceId}/domains/${domainId}`);
}

export interface Group {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
}

export function listGroups(spaceId: string) {
  return request<ApiList<Group>>('GET', `/spaces/${spaceId}/groups`);
}

export interface GroupPayload {
  code: string;
  name: string;
  /** 上级群组 id，缺省为顶级 */
  parentId?: string;
}

export function createGroup(spaceId: string, payload: GroupPayload) {
  return request<ApiSuccess<{ id: string }>>('POST', `/spaces/${spaceId}/groups`, payload);
}

export function updateGroup(spaceId: string, groupId: string, payload: { name?: string; parentId?: string | null }) {
  return request<ApiSuccess>('PATCH', `/spaces/${spaceId}/groups/${groupId}`, payload);
}

export function deleteGroup(spaceId: string, groupId: string) {
  return request<ApiSuccess>('DELETE', `/spaces/${spaceId}/groups/${groupId}`);
}

/* ---------- 流转动作 ---------- */

export interface CreationPayload {
  resourceId: string;
  amount: number;
  sourceKind: 'manual' | 'timed' | 'event' | 'builtin';
  reason?: string;
}

export interface ReservationPayload {
  resourceId: string;
  amount: number;
  holderId?: string;
  purpose?: string;
  holdUntil?: string;
}

export interface ReleasePayload {
  amount?: number;
  reason?: string;
}

export interface SettlePayload {
  amount?: number;
  reason?: string;
}

export interface ConsumptionPayload {
  resourceId: string;
  amount: number;
  sinkKind: 'manual' | 'wear' | 'event' | 'builtin';
  reason?: string;
}

export function createCreation(spaceId: string, payload: CreationPayload) {
  return request<ApiSuccess>('POST', `/spaces/${spaceId}/creations`, payload);
}

export function createReservation(spaceId: string, payload: ReservationPayload) {
  return request<ApiSuccess>('POST', `/spaces/${spaceId}/reservations`, payload);
}

export function releaseReservation(spaceId: string, reservationId: string, payload: ReleasePayload) {
  return request<ApiSuccess>('POST', `/spaces/${spaceId}/reservations/${reservationId}/release`, payload);
}

export function settleReservation(spaceId: string, reservationId: string, payload: SettlePayload) {
  return request<ApiSuccess>('POST', `/spaces/${spaceId}/reservations/${reservationId}/settle`, payload);
}

export function createConsumption(spaceId: string, payload: ConsumptionPayload) {
  return request<ApiSuccess>('POST', `/spaces/${spaceId}/consumptions`, payload);
}

/* ---------- 流转明细 ---------- */

export interface LedgerEntry {
  id: string;
  resourceId: string;
  resourceName: string;
  kind: string;
  totalDelta: number;
  reservedDelta: number;
  consumedDelta: number;
  sourceKind: string | null;
  sinkKind: string | null;
  reason: string | null;
  createdAt: string;
}

export function listLedger(spaceId: string, resourceId: string, page = 1, pageSize = 20) {
  return request<ApiList<LedgerEntry>>(
    'GET',
    `/spaces/${spaceId}/resources/${resourceId}/ledger`,
    undefined,
    { page, pageSize },
  );
}

/* ---------- 占用记录 ---------- */

export interface Reservation {
  id: string;
  resourceId: string;
  amount: number;
  status: 'active' | 'released' | 'settled';
  holderId: string | null;
  purpose: string | null;
  holdUntil: string | null;
  releasedAmount: number;
  settledAmount: number;
  createdAt: string;
  updatedAt: string;
}

export function listReservations(spaceId: string, resourceId: string, page = 1, pageSize = 20) {
  return request<ApiList<Reservation>>(
    'GET',
    `/spaces/${spaceId}/resources/${resourceId}/reservations`,
    undefined,
    { page, pageSize },
  );
}

/* ---------- 资源类型配置 ---------- */

/** 属性模式定义，与后端 AttributeDef 对齐 */
export interface AttributeDef {
  key: string;
  label: string;
  valueType: 'text' | 'number' | 'enum' | 'boolean';
  required?: boolean;
  options?: string[];
  description?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  unit?: string;
}

export interface ResourceType {
  id: string;
  spaceId: string;
  domainId: string;
  domainName: string;
  code: string;
  name: string;
  description: string;
  unit: string;
  numericScale: number;
  divisible: boolean;
  allowNegative: boolean;
  attrSchema: AttributeDef[];
  sourceKinds: string[];
  sinkKinds: string[];
  recommendedTagKeys: string[];
  origin: string;
  templateId: string | null;
  status: 'active' | 'disabled';
  inUse: boolean;
  resourceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceTypePayload {
  code: string;
  name: string;
  domainId: string;
  description?: string;
  unit: string;
  numericScale?: number;
  divisible?: boolean;
  allowNegative?: boolean;
  attrSchema?: AttributeDef[];
  sourceKinds?: string[];
  sinkKinds?: string[];
  recommendedTagKeys?: string[];
  status?: 'active' | 'disabled';
}

export function listResourceTypes(
  spaceId: string,
  query?: { domainId?: string; status?: string; keyword?: string; page?: number; pageSize?: number },
) {
  return request<ApiList<ResourceType>>('GET', `/spaces/${spaceId}/resource-types`, undefined, { ...query });
}

export function createResourceType(spaceId: string, payload: ResourceTypePayload) {
  return request<ApiSuccess<ResourceType>>('POST', `/spaces/${spaceId}/resource-types`, payload);
}

export function updateResourceType(spaceId: string, typeId: string, payload: Partial<ResourceTypePayload>) {
  return request<ApiSuccess<ResourceType>>('PATCH', `/spaces/${spaceId}/resource-types/${typeId}`, payload);
}

/* ---------- 内建模板（快捷预设） ---------- */

export interface BuiltinTemplate {
  id: string;
  code: string;
  name: string;
  description: string;
  unit: string;
  enabled?: boolean;
}

export function listBuiltinTemplates(spaceId: string) {
  return request<ApiList<BuiltinTemplate>>('GET', `/spaces/${spaceId}/builtin-templates`);
}

export interface DerivePayload {
  mode: 'inherit' | 'rewrite';
  domainId: string;
  code?: string;
  name?: string;
  unit?: string;
}

export function deriveFromTemplate(spaceId: string, templateId: string, payload: DerivePayload) {
  return request<ApiSuccess<ResourceType>>('POST', `/spaces/${spaceId}/builtin-templates/${templateId}/derive`, payload);
}
