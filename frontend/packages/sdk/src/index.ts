/**
 * @corn/sdk —— 玉米资源管理系统 TypeScript SDK
 *
 * 与 corn-server 的 REST API（/v1/*）一一对应。
 *
 * 类型当前与 corn-core 的领域模型手写对齐；后续可改用
 * `openapi-typescript` 从 `/api-docs/openapi.json` 自动生成类型，
 * 实现与后端 OpenAPI 契约的完全同步。
 */

export interface Label {
  key: string;
  value: string;
}

export interface Category {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  unit: string;
  created?: string | null;
  modified?: string | null;
}

export interface Space {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  created?: string | null;
  modified?: string | null;
}

export interface Budget {
  id: number;
  tenant_id: number;
  category_id: number;
  space_id: number;
  amount: number;
  labels: Label[];
  created?: string | null;
  modified?: string | null;
}

export interface Action {
  id: number;
  tenant_id: number;
  space_id: number;
  parent_id: number | null;
  name: string;
  labels: Label[];
  created?: string | null;
  modified?: string | null;
}

export interface Quota {
  id: number;
  tenant_id: number;
  budget_id: number;
  action_id: number;
  amount: number;
  created?: string | null;
  modified?: string | null;
}

export interface QuotaBalance {
  quota_id: number;
  amount: number;
  consumed: number;
  balance: number;
}

export interface Record {
  id: number;
  tenant_id: number;
  quota_id: number;
  amount: number;
  created?: string | null;
  modified?: string | null;
}

export interface Recorder {
  id: number;
  tenant_id: number;
  category_id: number;
  space_id: number;
  action_id: number | null;
  budget_labels: Label[];
  action_labels: Label[];
  config: unknown;
  created?: string | null;
  modified?: string | null;
}

// 请求体
export interface CreateCategory {
  code: string;
  name: string;
  unit: string;
}
export interface CreateSpace {
  code: string;
  name: string;
}
export interface CreateBudget {
  category_id: number;
  space_id: number;
  amount: number;
  labels?: Label[];
}
export interface CreateAction {
  space_id: number;
  parent_id?: number | null;
  name: string;
  labels?: Label[];
}
export interface CreateQuota {
  budget_id: number;
  action_id: number;
  amount: number;
}
export interface CreateRecord {
  quota_id: number;
  amount: number;
}
export interface CreateRecorder {
  category_id: number;
  space_id: number;
  action_id?: number | null;
  budget_labels?: Label[];
  action_labels?: Label[];
  config?: unknown;
}

export class CornApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "CornApiError";
    this.status = status;
    this.body = body;
  }
}

export interface CornClientOptions {
  baseUrl: string;
  /** Bearer Token（SaaS/私有化鉴权） */
  token?: string;
  /** 多租户头 X-Tenant-Id */
  tenantId?: number;
  /** fetch 实现（默认全局 fetch） */
  fetch?: typeof fetch;
}

export class CornClient {
  private baseUrl: string;
  private token?: string;
  private tenantId?: number;
  private fetchImpl: typeof fetch;

  constructor(opts: CornClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
    this.tenantId = opts.tenantId;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: { [k: string]: string } = {
      "Content-Type": "application/json",
      ...((init?.headers as { [k: string]: string }) ?? {}),
    };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    if (this.tenantId !== undefined) headers["X-Tenant-Id"] = String(this.tenantId);

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg =
        (body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : res.statusText) || `HTTP ${res.status}`;
      throw new CornApiError(msg, res.status, body);
    }
    return body as T;
  }

  // ---------- Category ----------
  listCategories() {
    return this.req<Category[]>("/v1/categories");
  }
  createCategory(body: CreateCategory) {
    return this.req<Category>("/v1/categories", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  deleteCategory(id: number) {
    return this.req<void>(`/v1/categories/${id}`, { method: "DELETE" });
  }

  // ---------- Space ----------
  listSpaces() {
    return this.req<Space[]>("/v1/spaces");
  }
  createSpace(body: CreateSpace) {
    return this.req<Space>("/v1/spaces", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // ---------- Budget ----------
  listBudgets() {
    return this.req<Budget[]>("/v1/budgets");
  }
  listBudgetsBySpace(spaceId: number) {
    return this.req<Budget[]>(`/v1/spaces/${spaceId}/budgets`);
  }
  createBudget(body: CreateBudget) {
    return this.req<Budget>("/v1/budgets", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  getBudget(id: number) {
    return this.req<Budget>(`/v1/budgets/${id}`);
  }

  // ---------- Action ----------
  listActions() {
    return this.req<Action[]>("/v1/actions");
  }
  createAction(body: CreateAction) {
    return this.req<Action>("/v1/actions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  getAction(id: number) {
    return this.req<Action>(`/v1/actions/${id}`);
  }
  listChildActions(parentId: number) {
    return this.req<Action[]>(`/v1/actions/${parentId}/children`);
  }
  listQuotasByAction(actionId: number) {
    return this.req<Quota[]>(`/v1/actions/${actionId}/quotas`);
  }

  // ---------- Quota ----------
  listQuotas() {
    return this.req<Quota[]>("/v1/quotas");
  }
  createQuota(body: CreateQuota) {
    return this.req<Quota>("/v1/quotas", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  getQuota(id: number) {
    return this.req<Quota>(`/v1/quotas/${id}`);
  }
  quotaBalance(id: number) {
    return this.req<QuotaBalance>(`/v1/quotas/${id}/balance`);
  }
  listRecordsByQuota(quotaId: number) {
    return this.req<Record[]>(`/v1/quotas/${quotaId}/records`);
  }

  // ---------- Record ----------
  listRecords() {
    return this.req<Record[]>("/v1/records");
  }
  createRecord(body: CreateRecord) {
    return this.req<Record>("/v1/records", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // ---------- Recorder ----------
  listRecorders() {
    return this.req<Recorder[]>("/v1/recorders");
  }
  createRecorder(body: CreateRecorder) {
    return this.req<Recorder>("/v1/recorders", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
}

/** 从环境变量构造客户端（Next.js 服务端/客户端通用） */
export function createCornClient(
  opts: { baseUrl?: string; token?: string; tenantId?: number } = {},
): CornClient {
  const baseUrl =
    opts.baseUrl ??
    (typeof process !== "undefined" ? process.env.CORN_API_URL : undefined) ??
    "http://localhost:8080";
  const token =
    opts.token ?? (typeof process !== "undefined" ? process.env.AUTH_TOKEN : undefined);
  return new CornClient({
    baseUrl,
    token: token ?? undefined,
    tenantId: opts.tenantId,
  });
}
