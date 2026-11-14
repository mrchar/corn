/**
 * 资源池单例：useResources 基于后端 OpenAPI 文档生成全部业务客户端。
 * - rootPool：全局文档（/openapi.json）→ spaces / users / sessions
 * - spacePool：空间文档（/spaces/:id/openapi.json）→ domains / groups / resource-types /
 *   builtin-templates / reservations / creations / consumptions / ledger + 动态资源类型
 * 文档 → 资源池的转换由 services/openapi.ts 的 convertSwagger 显式注入（占位符归一 + 标准解析）。
 * 传输适配器复用 api.ts 的 request（凭据注入 + 401 静默续期），错误 message 即后端中文提示。
 * 两个池均为懒创建：首次调用时登录态已就绪（loadAuth 早于 authed 渲染）。
 */

import { useResources } from '@mrchar/cumquat/composables';
import { watch } from 'vue';
import { request } from '../api';
import { spaceId } from '../store/app';
import { convertSwagger } from './openapi';

type Pool = ReturnType<typeof useResources>;

/** 传输适配：useResources 的所有请求（含元数据文档拉取）走统一封装，享受 401 续期 */
const adapter = (req: { method: string; url: string; body?: unknown; query?: Record<string, unknown> }) =>
  request<unknown>(req.method.toUpperCase(), req.url, req.body, req.query);

let cachedRoot: Pool | null = null;

/** 顶层资源池（spaces/users/sessions） */
export function rootPool(): Pool {
  if (!cachedRoot) {
    cachedRoot = useResources({ server: '', doc: '/openapi.json', parse: convertSwagger, request: adapter });
  }
  return cachedRoot;
}

let cachedSpace = '';
let cachedSpacePool: Pool | null = null;

/** 空间资源池：随 spaceId 变化重建（文档路径内含空间前缀，server 为根） */
export function spacePool(): Pool {
  if (!cachedSpacePool || cachedSpace !== spaceId.value) {
    cachedSpace = spaceId.value;
    cachedSpacePool = useResources({
      server: '',
      doc: `/spaces/${spaceId.value}/openapi.json`,
      parse: convertSwagger,
      request: adapter,
    });
  }
  return cachedSpacePool;
}

/** 等待池元数据就绪（文档异步加载，client() 仅在 success 后可用） */
export function poolReady(pool: Pool): Promise<void> {
  if (pool.state.status === 'success') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const stop = watch(
      () => pool.state.status,
      (status) => {
        if (status === 'success') {
          stop();
          resolve();
        } else if (status === 'error') {
          stop();
          reject(pool.state.error instanceof Error ? pool.state.error : new Error('元数据加载失败'));
        }
      },
    );
  });
}

/**
 * 资源客户端的实用类型：create/update 运行时返回后端裸响应（库签名 ActionResult|void 是宽容签名），
 * 这里按真实形状收紧，调用点不再需要额外断言。
 */
export interface TypedClient {
  list(query?: unknown): Promise<{ list: Record<string, unknown>[]; total: number }>;
  detail(id: string | number): Promise<Record<string, unknown>>;
  create(payload: unknown): Promise<Record<string, unknown>>;
  update(id: string | number, payload: unknown): Promise<Record<string, unknown>>;
  remove(id: string | number): Promise<void>;
}

/** 顶层资源客户端（等待就绪后取用） */
export async function rootClient(name: string): Promise<TypedClient> {
  const pool = rootPool();
  await poolReady(pool);
  return pool.client(name) as unknown as TypedClient;
}

/**
 * 重拉空间池元数据：资源类型增删改/启停后动态资源集合变化，
 * 池单例不会自动感知，须显式触发（重拉期间保留旧数据，成功后一次性替换）。
 */
export function reloadSpacePoolDoc() {
  cachedSpacePool?.state.retry?.();
}

/** 空间资源客户端（等待就绪后取用） */
export async function spaceClient(name: string): Promise<TypedClient> {
  const pool = spacePool();
  await poolReady(pool);
  return pool.client(name) as unknown as TypedClient;
}

/** 空间池中的静态资源名（文档内含但资源池视图不作为类型 Tab 展示） */
export const STATIC_RESOURCE_NAMES = new Set([
  'domains',
  'groups',
  'resource-types',
  'builtin-templates',
  'reservations',
  'creations',
  'consumptions',
  'ledger',
]);
