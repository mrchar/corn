/** 统一请求封装：自动注入空间前缀与 actor 头，统一解析响应信封。 */

const ACTOR_ID = 'web-client';

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

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  query?: Record<string, unknown>,
): Promise<T> {
  const search = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      search.set(k, String(v));
    }
  }
  const fullUrl = search.toString() ? `${url}?${search.toString()}` : url;
  const res = await fetch(fullUrl, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-actor-id': ACTOR_ID,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = (data as ApiError) ?? { status: 'error', message: res.statusText, error: { code: 'HTTP_ERROR' } };
    throw new Error(err.message);
  }
  return data as T;
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

export function listDomains(spaceId: string) {
  return request<ApiList<Domain>>('GET', `/spaces/${spaceId}/domains`);
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
