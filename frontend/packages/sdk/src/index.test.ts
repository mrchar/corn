import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CornClient,
  CornApiError,
  createCornClient,
  type CornClientOptions,
} from "./index";

/**
 * 构造一个记录每次请求的 mock fetch，按配置返回固定响应。
 */
function makeFetch() {
  const calls: {
    url: string;
    init?: RequestInit;
  }[] = [];
  let nextResponse: { status: number; body: unknown } = {
    status: 200,
    body: null,
  };
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: nextResponse.status >= 200 && nextResponse.status < 300,
      status: nextResponse.status,
      statusText: `HTTP ${nextResponse.status}`,
      text: async () =>
        nextResponse.body === null ? "" : JSON.stringify(nextResponse.body),
    } as unknown as Response;
  });
  return {
    fetchImpl,
    calls,
    setNext: (status: number, body: unknown) => {
      nextResponse = { status, body };
    },
  };
}

function client(
  mock: ReturnType<typeof makeFetch>,
  opts: Partial<CornClientOptions> = {},
): CornClient {
  return new CornClient({
    baseUrl: "http://api.test",
    fetch: mock.fetchImpl as unknown as typeof fetch,
    ...opts,
  });
}

describe("CornClient 构造", () => {
  it("剥离 baseUrl 结尾斜杠", () => {
    const mock = makeFetch();
    mock.setNext(200, []);
    const c = client(mock, { baseUrl: "http://api.test/" });
    expect((c as unknown as { baseUrl: string }).baseUrl).toBe("http://api.test");
  });

  it("注入 token 与 tenantId 头", async () => {
    const mock = makeFetch();
    mock.setNext(200, []);
    const c = client(mock, { token: "abc", tenantId: 42 });
    await c.listSpaces();
    expect(mock.calls).toHaveLength(1);
    const headers = mock.calls[0].init!.headers as { [k: string]: string };
    expect(headers["Authorization"]).toBe("Bearer abc");
    expect(headers["X-Tenant-Id"]).toBe("42");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("无 token / tenantId 时不附加对应头", async () => {
    const mock = makeFetch();
    mock.setNext(200, []);
    const c = client(mock);
    await c.listSpaces();
    const headers = mock.calls[0].init!.headers as { [k: string]: string };
    expect(headers["Authorization"]).toBeUndefined();
    expect(headers["X-Tenant-Id"]).toBeUndefined();
  });
});

describe("请求 URL 与方法", () => {
  let mock: ReturnType<typeof makeFetch>;
  let c: CornClient;

  beforeEach(() => {
    mock = makeFetch();
    mock.setNext(200, []);
    c = client(mock);
  });

  it("listCategories → GET /v1/categories", async () => {
    await c.listCategories();
    expect(mock.calls[0].url).toBe("http://api.test/v1/categories");
    expect(mock.calls[0].init!.method).toBeUndefined(); // GET 不显式传 method
  });

  it("createCategory → POST /v1/categories 携带 body", async () => {
    await c.createCategory({ code: "c", name: "n", unit: "u" });
    expect(mock.calls[0].init!.method).toBe("POST");
    expect(mock.calls[0].init!.body).toBe(
      JSON.stringify({ code: "c", name: "n", unit: "u" }),
    );
  });

  it("deleteCategory → DELETE /v1/categories/{id}", async () => {
    await c.deleteCategory(7);
    expect(mock.calls[0].url).toBe("http://api.test/v1/categories/7");
    expect(mock.calls[0].init!.method).toBe("DELETE");
  });

  it("listSpaces → GET /v1/spaces", async () => {
    await c.listSpaces();
    expect(mock.calls[0].url).toBe("http://api.test/v1/spaces");
  });

  it("createSpace → POST /v1/spaces", async () => {
    await c.createSpace({ code: "s", name: "S" });
    expect(mock.calls[0].init!.method).toBe("POST");
  });

  it("listBudgets → GET /v1/budgets", async () => {
    await c.listBudgets();
    expect(mock.calls[0].url).toBe("http://api.test/v1/budgets");
  });

  it("listBudgetsBySpace → GET /v1/spaces/{id}/budgets", async () => {
    await c.listBudgetsBySpace(5);
    expect(mock.calls[0].url).toBe("http://api.test/v1/spaces/5/budgets");
  });

  it("createBudget → POST /v1/budgets 携带 labels", async () => {
    await c.createBudget({
      category_id: 1,
      space_id: 2,
      amount: 100,
      labels: [{ key: "k", value: "v" }],
    });
    const body = JSON.parse(mock.calls[0].init!.body as string);
    expect(body.labels).toEqual([{ key: "k", value: "v" }]);
  });

  it("getBudget → GET /v1/budgets/{id}", async () => {
    await c.getBudget(3);
    expect(mock.calls[0].url).toBe("http://api.test/v1/budgets/3");
  });

  it("listActions → GET /v1/actions", async () => {
    await c.listActions();
    expect(mock.calls[0].url).toBe("http://api.test/v1/actions");
  });

  it("createAction → POST /v1/actions", async () => {
    await c.createAction({ space_id: 1, name: "a" });
    expect(mock.calls[0].init!.method).toBe("POST");
  });

  it("getAction → GET /v1/actions/{id}", async () => {
    await c.getAction(9);
    expect(mock.calls[0].url).toBe("http://api.test/v1/actions/9");
  });

  it("listChildActions → GET /v1/actions/{id}/children", async () => {
    await c.listChildActions(1);
    expect(mock.calls[0].url).toBe("http://api.test/v1/actions/1/children");
  });

  it("listQuotasByAction → GET /v1/actions/{id}/quotas", async () => {
    await c.listQuotasByAction(2);
    expect(mock.calls[0].url).toBe("http://api.test/v1/actions/2/quotas");
  });

  it("listQuotas → GET /v1/quotas", async () => {
    await c.listQuotas();
    expect(mock.calls[0].url).toBe("http://api.test/v1/quotas");
  });

  it("createQuota → POST /v1/quotas", async () => {
    await c.createQuota({ budget_id: 1, action_id: 2, amount: 50 });
    expect(mock.calls[0].init!.method).toBe("POST");
  });

  it("getQuota → GET /v1/quotas/{id}", async () => {
    await c.getQuota(4);
    expect(mock.calls[0].url).toBe("http://api.test/v1/quotas/4");
  });

  it("quotaBalance → GET /v1/quotas/{id}/balance", async () => {
    await c.quotaBalance(4);
    expect(mock.calls[0].url).toBe("http://api.test/v1/quotas/4/balance");
  });

  it("listRecordsByQuota → GET /v1/quotas/{id}/records", async () => {
    await c.listRecordsByQuota(8);
    expect(mock.calls[0].url).toBe("http://api.test/v1/quotas/8/records");
  });

  it("listRecords → GET /v1/records", async () => {
    await c.listRecords();
    expect(mock.calls[0].url).toBe("http://api.test/v1/records");
  });

  it("createRecord → POST /v1/records", async () => {
    await c.createRecord({ quota_id: 1, amount: 30 });
    expect(mock.calls[0].init!.method).toBe("POST");
  });

  it("listRecorders → GET /v1/recorders", async () => {
    await c.listRecorders();
    expect(mock.calls[0].url).toBe("http://api.test/v1/recorders");
  });

  it("createRecorder → POST /v1/recorders", async () => {
    await c.createRecorder({ category_id: 1, space_id: 1 });
    expect(mock.calls[0].init!.method).toBe("POST");
  });
});

describe("响应解析与错误处理", () => {
  it("成功响应原样返回解析后的 JSON", async () => {
    const mock = makeFetch();
    mock.setNext(200, [{ id: 1, code: "x", name: "X" }]);
    const c = client(mock);
    const res = await c.listSpaces();
    expect(res).toEqual([{ id: 1, code: "x", name: "X" }]);
  });

  it("空 body 成功响应返回 null", async () => {
    const mock = makeFetch();
    mock.setNext(200, null);
    const c = client(mock);
    const res = await c.deleteCategory(1);
    expect(res).toBeNull();
  });

  it("4xx 抛出 CornApiError 携带 status 与 body", async () => {
    const mock = makeFetch();
    mock.setNext(409, { error: "冲突", status: 409 });
    const c = client(mock);
    await expect(c.createSpace({ code: "dup", name: "dup" })).rejects.toMatchObject({
      name: "CornApiError",
      status: 409,
      body: { error: "冲突", status: 409 },
      message: "冲突",
    });
  });

  it("5xx 抛出 CornApiError", async () => {
    const mock = makeFetch();
    mock.setNext(500, { error: "数据库错误", status: 500 });
    const c = client(mock);
    await expect(c.listSpaces()).rejects.toBeInstanceOf(CornApiError);
  });

  it("错误 body 无 error 字段时回退到 statusText", async () => {
    const mock = makeFetch();
    mock.setNext(403, { unrelated: "x" });
    const c = client(mock);
    try {
      await c.listSpaces();
      throw new Error("应抛错");
    } catch (e) {
      expect(e).toBeInstanceOf(CornApiError);
      expect((e as CornApiError).status).toBe(403);
      expect((e as CornApiError).message).toBe("HTTP 403");
    }
  });
});

describe("createCornClient 工厂", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
  });
  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("显式参数优先于环境变量", () => {
    process.env.CORN_API_URL = "http://env";
    process.env.AUTH_TOKEN = "env-token";
    const c = createCornClient({
      baseUrl: "http://explicit",
      token: "explicit-token",
      tenantId: 99,
    });
    const inner = c as unknown as {
      baseUrl: string;
      token?: string;
      tenantId?: number;
    };
    expect(inner.baseUrl).toBe("http://explicit");
    expect(inner.token).toBe("explicit-token");
    expect(inner.tenantId).toBe(99);
  });

  it("回退到环境变量", () => {
    process.env.CORN_API_URL = "http://env-api";
    process.env.AUTH_TOKEN = "env-token";
    const c = createCornClient();
    const inner = c as unknown as {
      baseUrl: string;
      token?: string;
    };
    expect(inner.baseUrl).toBe("http://env-api");
    expect(inner.token).toBe("env-token");
  });

  it("环境变量缺失时使用默认值", () => {
    delete process.env.CORN_API_URL;
    delete process.env.AUTH_TOKEN;
    const c = createCornClient();
    const inner = c as unknown as {
      baseUrl: string;
      token?: string;
    };
    expect(inner.baseUrl).toBe("http://localhost:8080");
    expect(inner.token).toBeUndefined();
  });

  it("空字符串 AUTH_TOKEN 视为未设置", () => {
    process.env.AUTH_TOKEN = "";
    const c = createCornClient();
    const inner = c as unknown as { token?: string };
    expect(inner.token).toBeUndefined();
  });
});
