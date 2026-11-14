import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { tool, stepCountIs, streamText, type ModelMessage, type ToolSet } from 'ai';
import { composables } from '@mrchar/cumquat';
import { z } from 'zod';
import { computed, ref } from 'vue';
import { poolReady, reloadSpacePoolDoc, spaceClient, spacePool } from './pools';
import { currentView, dataVersion, domainId, domains, spaceId, spaces } from '../store/app';
import { accessToken } from '../store/auth';

/** 服务端裸对象的最小类型（仅工具执行消费字段） */
interface ResourceTypeRow { id: string; code: string; name: string; status: string; domainName?: string; resourceCount?: number }
interface GroupRow { id: string; code: string; name: string; parentId?: string | null }
interface ReservationRow { id: string; amount: number; status: string; purpose?: string; createdAt?: string }
interface LedgerEntryRow { kind: string; totalDelta: number; reservedDelta: number; consumedDelta: number; reason?: string; occurredAt?: string }

/**
 * 前端智能体（单文件三层）：契约层（工具 schema / 系统提示 / 工具集）、
 * 执行层（client-side tools 的浏览器端落地）、会话层（streamText 多步循环 + 确认环 + 弹窗状态）。
 * 智能体循环直接在浏览器端运行，经 OpenAI 兼容代理调用模型；后端仅做字节级转发。
 *
 * 双工具 + 参数路由：query（只读查询）/ execute（执行操作），
 * 具体行为由 target（一级路由）× action（二级路由）决定；
 * 能力扩展 = 新增枚举值 + 新增路由分支，工具数量恒定。
 */

const { message } = composables;

/* ==================== 工具执行层 ==================== */

/** 工具执行输出：回传给模型的结构化结果，text 为人类可读的过程描述 */
export interface ToolOutput {
  ok: boolean;
  text: string;
}

export interface ToolDefinition {
  /** 执行：调用真实前端能力 */
  execute: (input: Record<string, unknown>) => Promise<ToolOutput>;
  /** 存在即视为可确认工具：返回确认文案（弹窗裁决）；返回 null 表示该参数组合免确认（自动执行） */
  confirm?: (input: Record<string, unknown>) => string | null | Promise<string | null>;
}

const VIEW_NAMES = { pool: '资源池', types: '资源类型', org: '组织' } as const;

const FLOW_ACTION_NAMES = {
  inject: '注入',
  reserve: '占用',
  release: '释放',
  settle: '结算',
  consume: '花费',
} as const;

type FlowAction = keyof typeof FLOW_ACTION_NAMES;

const TARGET_NAMES: Record<string, string> = {
  resource: '资源实例',
  resource_type: '资源类型',
  domain: '领域',
  group: '群组',
};

interface ExecuteInput {
  target?: string;
  action?: string;
  view?: string;
  typeName?: string;
  resourceName?: string;
  newName?: string;
  id?: string;
  name?: string;
  code?: string;
  parentId?: string;
  unit?: string;
  domainId?: string;
  amount?: number;
  count?: number;
  reason?: string;
  description?: string;
}

/**
 * 获取就绪的空间资源池（services/pools.ts 共享单例，随空间切换自动重建）。
 * names/has 是同步读取——元数据未就绪时为空，必须先等 poolReady。
 */
async function currentPool() {
  const pool = spacePool();
  await poolReady(pool);
  return pool;
}

/** 归一化列表返回：数组 / { list, total } / 单值三形态 → { list, total } */
function toList<T>(result: unknown): { list: T[]; total: number } {
  if (Array.isArray(result)) return { list: result, total: result.length };
  if (result && typeof result === 'object' && 'list' in result) {
    const r = result as { list: T[]; total?: number };
    return { list: r.list, total: r.total ?? r.list.length };
  }
  return { list: result ? [result as T] : [], total: result ? 1 : 0 };
}

/** 按名称定位资源实例：精确匹配优先，其次包含关系 */
async function findResource(
  pool: Awaited<ReturnType<typeof currentPool>>,
  typeName: string,
  keyword: string,
): Promise<{ id: string; name: string } | null> {
  const res = await pool.client(typeName).list({ pagination: { currentPage: 1, pageSize: 20 }, keyword });
  const { list } = toList<{ id: string; name: string }>(res);
  const exact = list.find((r) => r.name === keyword);
  return exact ?? list[0] ?? null;
}

/* ---------- query：只读查询路由表 ---------- */

type QueryInput = { target?: string; typeName?: string; resourceName?: string; keyword?: string };

const QUERY_HANDLERS: Record<string, (input: QueryInput) => Promise<ToolOutput>> = {
  /** 资源类型清单与计数（含停用，模型可感知状态） */
  async resource_types(input) {
    const res = await (await spaceClient('resource-types')).list({
      pagination: { currentPage: 1, pageSize: 20 },
      keyword: input.keyword?.trim() || undefined,
    });
    const rows = (res.list as unknown as ResourceTypeRow[]).map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      status: t.status,
      domainName: t.domainName,
      resourceCount: t.resourceCount,
    }));
    return { ok: true, text: JSON.stringify({ types: rows, total: res.total }) };
  },

  /** 某类型下的资源实例清单 */
  async resources(input) {
    const pool = await currentPool();
    if (!input.typeName) return { ok: false, text: '缺少资源类型名称（typeName）' };
    if (!pool.has(input.typeName)) {
      return { ok: false, text: `空间中不存在名为「${input.typeName}」的资源类型（或已停用）` };
    }
    const res = await pool
      .client(input.typeName)
      .list({ pagination: { currentPage: 1, pageSize: 20 }, keyword: input.keyword?.trim() || undefined });
    const { list, total } = toList<Record<string, unknown>>(res);
    const rows = list.map((r) => ({
      id: r.id,
      name: r.name,
      total: r.total,
      occupied: r.occupied,
      consumed: r.consumed,
      available: r.available,
    }));
    return { ok: true, text: JSON.stringify({ resources: rows, total }) };
  },

  /** 领域清单（store 同源，随切换即时更新） */
  async domains(input) {
    const kw = input.keyword?.trim();
    const rows = domains.value
      .filter((d) => !kw || d.name.includes(kw))
      .map((d) => ({ id: d.id, name: d.name }));
    return { ok: true, text: JSON.stringify({ domains: rows, total: rows.length }) };
  },

  /** 群组清单（平表含 parentId，模型据此理解嵌套） */
  async groups(input) {
    const res = await (await spaceClient('groups')).list({ pagination: { currentPage: 1, pageSize: 200 } });
    const kw = input.keyword?.trim();
    const rows = (res.list as unknown as GroupRow[])
      .filter((g) => !kw || g.name.includes(kw) || g.code.includes(kw))
      .map((g) => ({ id: g.id, name: g.name, code: g.code, parentId: g.parentId }));
    return { ok: true, text: JSON.stringify({ groups: rows, total: rows.length }) };
  },

  /** 某资源的占用记录 */
  async reservations(input) {
    const pool = await currentPool();
    const target = await locateResource(pool, input);
    if (!target) return { ok: false, text: locateFailureText(input) };
    const res = await (await spaceClient('reservations')).list({
      pagination: { currentPage: 1, pageSize: 20 },
      filters: { resourceId: target.id },
    });
    const rows = (res.list as unknown as ReservationRow[]).map((r) => ({
      id: r.id,
      amount: r.amount,
      status: r.status,
      purpose: r.purpose,
      createdAt: r.createdAt,
    }));
    return { ok: true, text: JSON.stringify({ resource: target.name, reservations: rows, total: res.total }) };
  },

  /** 某资源的流转明细 */
  async ledger(input) {
    const pool = await currentPool();
    const target = await locateResource(pool, input);
    if (!target) return { ok: false, text: locateFailureText(input) };
    const res = await (await spaceClient('ledger')).list({
      pagination: { currentPage: 1, pageSize: 20 },
      filters: { resourceId: target.id },
    });
    const rows = (res.list as unknown as LedgerEntryRow[]).map((e) => ({
      kind: e.kind,
      totalDelta: e.totalDelta,
      reservedDelta: e.reservedDelta,
      consumedDelta: e.consumedDelta,
      reason: e.reason,
      occurredAt: e.occurredAt,
    }));
    return { ok: true, text: JSON.stringify({ resource: target.name, entries: rows, total: res.total }) };
  },
};

/** 流转/记录类查询的公共前置：定位资源实例 */
async function locateResource(
  pool: Awaited<ReturnType<typeof currentPool>>,
  input: QueryInput,
): Promise<{ id: string; name: string } | null> {
  if (!input.typeName || !input.resourceName) return null;
  if (!pool.has(input.typeName)) return null;
  return findResource(pool, input.typeName, input.resourceName);
}

function locateFailureText(input: QueryInput): string {
  if (!input.typeName || !input.resourceName) return '缺少资源类型名称（typeName）或资源实例名称（resourceName）';
  return `在「${input.typeName}」下未找到资源「${input.resourceName}」（或类型不存在/已停用）`;
}

/* ---------- execute：执行操作路由表 ---------- */

async function executeView(input: ExecuteInput): Promise<ToolOutput> {
  if (input.action !== 'switch') return { ok: false, text: `视图目标仅支持 switch，收到：${input.action}` };
  const view = input.view as keyof typeof VIEW_NAMES;
  if (!view || !(view in VIEW_NAMES)) return { ok: false, text: `未知视图：${String(input.view)}` };
  currentView.value = view;
  return { ok: true, text: `已切换到${VIEW_NAMES[view]}` };
}

async function executeResource(input: ExecuteInput): Promise<ToolOutput> {
  const pool = await currentPool();
  const { action, typeName, resourceName, newName, amount, count, reason, domainId: domIdInput } = input;

  /* 创建实例：领域优先取显式指定，其次当前筛选，最后首个领域 */
  if (action === 'create') {
    if (!typeName || !pool.has(typeName)) {
      return { ok: false, text: `空间中不存在名为「${typeName ?? '?'}」的资源类型` };
    }
    const domId = domIdInput || domainId.value || domains.value[0]?.id;
    if (!domId) return { ok: false, text: '当前空间没有可用领域，请先在组织页创建领域' };
    const n = Math.min(Math.max(1, Math.trunc(count ?? 1)), 50);
    const base = (newName ?? '资源').trim() || '资源';
    const created: string[] = [];
    for (let i = 0; i < n; i++) {
      const name = n > 1 ? `${base}${i + 1}` : base;
      await pool.client(typeName).create({ name, domainId: domId });
      created.push(name);
    }
    return { ok: true, text: `已在「${typeName}」下创建 ${created.length} 个资源：${created.join('、')}` };
  }

  /* 流转操作：按名称定位资源实例 */
  if (!action || !(action in FLOW_ACTION_NAMES)) {
    return { ok: false, text: `资源实例不支持操作：${String(action)}` };
  }
  if (!resourceName) return { ok: false, text: '缺少资源名称（resourceName）' };
  if (amount == null || amount <= 0) return { ok: false, text: '缺少流转数量（amount）' };
  if (!typeName || !pool.has(typeName)) {
    return { ok: false, text: `空间中不存在名为「${typeName ?? '?'}」的资源类型` };
  }
  const target = await findResource(pool, typeName, resourceName);
  if (!target) return { ok: false, text: `在「${typeName}」下未找到资源「${resourceName}」` };

  switch (action as FlowAction) {
    case 'inject':
      await (await spaceClient('creations')).create({ resourceId: target.id, amount, sourceKind: 'manual', reason });
      return { ok: true, text: `已向资源「${target.name}」注入 ${amount}` };
    case 'reserve':
      await (await spaceClient('reservations')).create({ resourceId: target.id, amount, purpose: reason });
      return { ok: true, text: `已占用资源「${target.name}」${amount}` };
    case 'consume':
      await (await spaceClient('consumptions')).create({ resourceId: target.id, amount, sinkKind: 'manual', reason });
      return { ok: true, text: `已花费资源「${target.name}」${amount}` };
    case 'release':
    case 'settle': {
      // 释放/结算 = 更新占用记录的状态属性，作用于该资源最近的活跃占用
      const res = await (await spaceClient('reservations')).list({
        pagination: { currentPage: 1, pageSize: 20 },
        filters: { resourceId: target.id },
      });
      const active = (res.list as unknown as ReservationRow[]).find((r) => r.status === 'active');
      if (!active) return { ok: false, text: `资源「${target.name}」没有进行中的占用` };
      await (await spaceClient('reservations')).update(active.id, {
        status: action === 'release' ? 'released' : 'settled',
        amount,
        reason,
      });
      return action === 'release'
        ? { ok: true, text: `已释放资源「${target.name}」的占用 ${amount}` }
        : { ok: true, text: `已将资源「${target.name}」的占用结算为花费 ${amount}` };
    }
    default:
      return { ok: false, text: `未支持的操作：${action}` };
  }
}

async function executeResourceType(input: ExecuteInput): Promise<ToolOutput> {
  const { action, id, name, code, unit, description, domainId: domIdInput } = input;
  if (action === 'create') {
    if (!code) return { ok: false, text: '缺少类型编码（code）：小写字母开头，仅含小写字母、数字、连字符' };
    if (!name) return { ok: false, text: '缺少类型名称（name）' };
    if (!unit) return { ok: false, text: '缺少计量单位（unit）' };
    const domId = domIdInput || domainId.value || domains.value[0]?.id;
    if (!domId) return { ok: false, text: '缺少所属领域（domainId），当前空间也没有可用领域' };
    const created = (await (await spaceClient('resource-types')).create({ code, name, unit, domainId: domId, description })) as { name?: string };
    return { ok: true, text: `已创建资源类型「${created?.name ?? name}」（编码 ${code}）` };
  }
  /** 宽容解析：id/code/name 任一命中（模型常以 code 或 name 指称对象，不强迫先 query 换 uuid） */
  const key = id ?? code ?? name;
  if (!key) return { ok: false, text: '缺少目标标识（id/code/name 任一，可先 query resource_types 获取）' };
  const typeRes = await (await spaceClient('resource-types')).list({ pagination: { currentPage: 1, pageSize: 100 } });
  const target = (typeRes.list as unknown as ResourceTypeRow[]).find(
    (t) => t.id === key || t.code === key || t.name === key,
  );
  if (!target) return { ok: false, text: `未找到资源类型「${String(key)}」（id/code/name 均不匹配，可先 query 核对）` };
  if (action === 'rename') {
    if (!name) return { ok: false, text: '缺少新名称（name）' };
    await (await spaceClient('resource-types')).update(target.id, { name });
    return { ok: true, text: '已更新资源类型名称' };
  }
  if (action === 'disable' || action === 'enable') {
    const status = action === 'disable' ? 'disabled' : 'active';
    await (await spaceClient('resource-types')).update(target.id, { status });
    return { ok: true, text: action === 'disable' ? '已停用该资源类型' : '已启用该资源类型' };
  }
  return { ok: false, text: `资源类型不支持操作：${String(action)}` };
}

async function executeDomain(input: ExecuteInput): Promise<ToolOutput> {
  const { action, id, name, code } = input;
  if (action === 'create') {
    if (!code) return { ok: false, text: '缺少领域编码（code）：小写字母开头，仅含小写字母、数字、连字符' };
    if (!name) return { ok: false, text: '缺少领域名称（name）' };
    await (await spaceClient('domains')).create({ code, name });
    return { ok: true, text: `已创建领域「${name}」` };
  }
  /** 宽容解析：id/name 任一命中（Domain 类型无对外 code 字段） */
  const key = id ?? name;
  if (!key) return { ok: false, text: '缺少目标标识（id/name 任一，可先 query domains 获取）' };
  const target = domains.value.find((d) => d.id === key || d.name === key);
  if (!target) return { ok: false, text: `未找到领域「${String(key)}」（id/name 均不匹配，可先 query 核对）` };
  if (action === 'rename') {
    if (!name) return { ok: false, text: '缺少新名称（name）' };
    await (await spaceClient('domains')).update(target.id, { name });
    return { ok: true, text: '已更新领域名称' };
  }
  if (action === 'delete') {
    await (await spaceClient('domains')).remove(target.id);
    return { ok: true, text: '已删除该领域（其下类型与资源已级联清理）' };
  }
  return { ok: false, text: `领域不支持操作：${String(action)}` };
}

async function executeGroup(input: ExecuteInput): Promise<ToolOutput> {
  const { action, id, name, code, parentId } = input;
  if (action === 'create') {
    if (!code) return { ok: false, text: '缺少群组编码（code）：小写字母开头，仅含小写字母、数字、连字符' };
    if (!name) return { ok: false, text: '缺少群组名称（name）' };
    await (await spaceClient('groups')).create({ code, name, parentId: parentId || undefined });
    return { ok: true, text: parentId ? '已在该上级群组下创建群组' : '已创建顶级群组' };
  }
  if (!id && !code && !name) return { ok: false, text: '缺少目标标识（id/code/name 任一，可先 query groups 获取）' };
  const gkey = id ?? code ?? name;
  const gRes = await (await spaceClient('groups')).list({ pagination: { currentPage: 1, pageSize: 200 } });
  const gtarget = (gRes.list as unknown as GroupRow[]).find(
    (g) => g.id === gkey || g.code === gkey || g.name === gkey,
  );
  if (!gtarget) return { ok: false, text: `未找到群组「${String(gkey)}」（id/code/name 均不匹配，可先 query 核对）` };
  if (action === 'rename') {
    if (!name) return { ok: false, text: '缺少新名称（name）' };
    await (await spaceClient('groups')).update(gtarget.id, { name });
    return { ok: true, text: '已更新群组名称' };
  }
  if (action === 'move') {
    await (await spaceClient('groups')).update(gtarget.id, { parentId: parentId || null });
    return { ok: true, text: parentId ? '已移动该群组到新的上级' : '已将该群组提升为顶级群组' };
  }
  if (action === 'delete') {
    await (await spaceClient('groups')).remove(gtarget.id);
    return { ok: true, text: '已删除该群组（子群组已提升为顶级）' };
  }
  return { ok: false, text: `群组不支持操作：${String(action)}` };
}

const EXECUTE_HANDLERS: Record<string, (input: ExecuteInput) => Promise<ToolOutput>> = {
  view: executeView,
  resource: executeResource,
  resource_type: executeResourceType,
  domain: executeDomain,
  group: executeGroup,
};

/* ---------- 确认文案：按 target × action 路由生成 ---------- */

/** 解析操作目标的展示名称（确认文案要给人看；模型可能传 id/code/name 任一标识） */
async function resolveTargetLabel(target: string, id?: string, code?: string, name?: string): Promise<string> {
  const key = id ?? code ?? name;
  if (!key) return '?';
  const match = <T extends { id: string; name: string; code?: string }>(list: T[]) =>
    list.find((t) => t.id === key || (t.code && t.code === key) || t.name === key);
  if (target === 'domain') return domains.value.find((d) => d.id === key || d.name === key)?.name ?? key;
  if (target === 'group') {
    const res = await (await spaceClient('groups')).list({ pagination: { currentPage: 1, pageSize: 200 } });
    return match(res.list as Array<{ id: string; name: string; code?: string }>)?.name ?? key;
  }
  if (target === 'resource_type') {
    const res = await (await spaceClient('resource-types')).list({ pagination: { currentPage: 1, pageSize: 100 } });
    return match(res.list as Array<{ id: string; name: string; code?: string }>)?.name ?? key;
  }
  return key;
}

async function buildConfirmText(input: ExecuteInput): Promise<string | null> {
  const { target, action, typeName, resourceName, amount, count, newName, name, code, unit, parentId } = input;

  if (target === 'view') return null; // 视图切换无副作用，免确认
  if (!target) return '未知操作目标';

  if (target === 'resource') {
    if (action === 'create') {
      const n = count ?? 1;
      const base = newName ?? '资源';
      const scope = n > 1 ? `${base}1 ~ ${base}${n}` : base;
      return `将在「${typeName}」下创建 ${n} 个资源：${scope}`;
    }
    const actionName = action && action in FLOW_ACTION_NAMES ? FLOW_ACTION_NAMES[action as FlowAction] : String(action ?? '未知操作');
    const amountText = amount != null ? `数量 ${amount}` : '未指定数量';
    return `将对「${typeName}」的资源「${resourceName ?? '?'}」执行${actionName}（${amountText}）`;
  }

  const targetName = TARGET_NAMES[target] ?? target;

  if (target === 'resource_type' && action === 'create') {
    return `将创建资源类型「${name ?? '?'}」（编码 ${code ?? '?'}，单位 ${unit ?? '?'}）`;
  }
  if (action === 'create') {
    return `将创建${targetName}「${name ?? '?'}」（编码 ${code ?? '?'}）`;
  }

  const label = await resolveTargetLabel(target, input.id, input.code, input.name);

  if (action === 'rename') return `将把${targetName}「${label}」改名为「${name ?? '?'}」`;
  if (action === 'move') {
    const parentLabel = parentId ? await resolveTargetLabel('group', parentId) : '顶级';
    return `将把群组「${label}」移动到「${parentLabel}」之下`;
  }
  if (action === 'delete') return `将删除${targetName}「${label}」（不可恢复）`;
  if (action === 'disable') return `将停用资源类型「${label}」（已有实例仍可读，仅不可再创建）`;
  if (action === 'enable') return `将启用资源类型「${label}」`;

  return `将对${targetName}执行 ${String(action ?? '未知操作')}`;
}

/* ---------- 工具定义出口 ---------- */

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  query: {
    async execute(input) {
      const { target } = input as QueryInput;
      const handler = target ? QUERY_HANDLERS[target] : undefined;
      if (!handler) return { ok: false, text: `未知查询目标：${String(target)}（支持：${Object.keys(QUERY_HANDLERS).join('/')}）` };
      return safe(() => handler(input as QueryInput));
    },
  },

  execute: {
    confirm: buildConfirmText,
    async execute(input) {
      const { target } = input as ExecuteInput;
      const handler = target ? EXECUTE_HANDLERS[target] : undefined;
      if (!handler) return { ok: false, text: `未知操作目标：${String(target)}（支持：${Object.keys(EXECUTE_HANDLERS).join('/')}）` };
      const output = await safe(() => handler(input as ExecuteInput));
      if (output.ok) {
        dataVersion.value++; // 写库成功后递增全局版本号，驱动受影响视图自动刷新
        // 资源类型写操作改变动态资源集合，须重拉空间池元数据（Tab/表单字段来源）
        if (target === 'resource_type') reloadSpacePoolDoc();
      }
      return output;
    },
  },
};

/** 执行包装：任何异常都转为结构化失败结果回传模型（不把异常抛进对话流） */
async function safe(fn: () => Promise<ToolOutput>): Promise<ToolOutput> {
  try {
    return await fn();
  } catch (err) {
    return { ok: false, text: `执行失败：${err instanceof Error ? err.message : String(err)}` };
  }
}

/* ==================== 契约层：工具 schema / 工具集 / 系统提示 ==================== */

export const querySchema = z.object({
  target: z
    .enum(['resource_types', 'resources', 'domains', 'groups', 'reservations', 'ledger'])
    .describe(
      'resource_types=资源类型清单与计数，resources=某类型下的资源实例，domains=领域清单，groups=群组清单，reservations=某资源的占用记录，ledger=某资源的流转明细',
    ),
  typeName: z
    .string()
    .optional()
    .describe('target 为 resources/reservations/ledger 时必填：资源类型名称'),
  resourceName: z
    .string()
    .optional()
    .describe('target 为 reservations/ledger 时必填：资源实例名称'),
  keyword: z.string().optional().describe('按名称筛选关键词（resource_types/resources/domains/groups 有效）'),
});

export const executeSchema = z.object({
  target: z
    .enum(['view', 'resource', 'resource_type', 'domain', 'group'])
    .describe('view=前端视图，resource=资源实例，resource_type=资源类型，domain=领域，group=群组'),
  action: z
    .enum([
      'switch',
      'create',
      'rename',
      'move',
      'delete',
      'disable',
      'enable',
      'inject',
      'reserve',
      'release',
      'settle',
      'consume',
    ])
    .describe(
      'switch=切换（仅 target=view），create=创建，rename=改名，move=移动（仅 group），delete=删除，disable=停用，enable=启用（后两者仅 resource_type），inject/reserve/release/settle/consume=资源流转（仅 target=resource）',
    ),
  view: z
    .enum(['pool', 'types', 'org'])
    .optional()
    .describe('target=view 时必填：pool=资源池，types=资源类型，org=组织'),
  typeName: z.string().optional().describe('target=resource 时必填：资源类型名称'),
  resourceName: z
    .string()
    .optional()
    .describe('target=resource 的流转操作（inject/reserve/release/settle/consume）必填：资源实例名称'),
  newName: z.string().optional().describe('创建资源实例时的名称（批量创建时作为名称前缀）'),
  id: z
    .string()
    .optional()
    .describe('resource_type/domain/group 操作目标：id/code/name 任一即可定位（rename 中 resource_type 的 name 字段表示新名称，定位目标请用 id 或 code），取自 query 结果'),
  name: z.string().optional().describe('resource_type/domain/group 创建或改名后的名称'),
  code: z
    .string()
    .optional()
    .describe('resource_type/domain/group 创建时的编码：小写字母开头，仅含小写字母、数字、连字符'),
  parentId: z.string().optional().describe('group 创建（缺省为顶级）或 move 时的上级群组 id'),
  unit: z.string().optional().describe('resource_type 创建时的计量单位（如：个、枚、点）'),
  domainId: z
    .string()
    .optional()
    .describe('resource_type 创建时所属领域 id（取自 query 结果，缺省用当前筛选领域）'),
  amount: z.number().positive().optional().describe('流转数量：inject/reserve/release/settle/consume 必填'),
  count: z.number().int().positive().max(50).optional().describe('创建资源实例的数量，默认 1'),
  reason: z.string().optional().describe('流转备注原因'),
  description: z.string().optional().describe('resource_type 创建时的描述'),
});

/** 确认等待回调：写操作生成确认文案后交由会话层挂起，Promise 以用户裁决结果（真实工具输出）决议 */
type AwaitConfirmHandler = (
  toolCallId: string,
  input: Record<string, unknown>,
  title: string,
) => Promise<ToolOutput>;

/**
 * 构建智能体工具集：execute 路由到执行层的工具定义。
 * 确认环：confirm 文案非空 → await 用户裁决（流挂起，框架自动续跑），
 * 免确认 → 直接执行。
 */
function createAgentTools(awaitConfirm: AwaitConfirmHandler) {
  return {
    query: tool({
      description: '查询系统数据：资源类型、资源实例、领域、群组、占用记录、流转明细。只读操作，不改变任何数据。',
      inputSchema: querySchema,
      execute: (input) => TOOL_DEFINITIONS.query.execute(input as Record<string, unknown>),
    }),
    execute: tool({
      description:
        '执行操作：切换前端视图或变更数据（创建/改名/移动/删除/停用/启用/注入/占用/释放/结算/花费）。变更数据的操作会先请求用户确认。',
      inputSchema: executeSchema,
      execute: async (input, { toolCallId }) => {
        const def = TOOL_DEFINITIONS.execute;
        const title = await def.confirm?.(input as Record<string, unknown>);
        if (title) return awaitConfirm(toolCallId, input as Record<string, unknown>, title);
        return def.execute(input as Record<string, unknown>);
      },
    }),
  };
}

export interface AgentPromptContext {
  spaceName: string;
  view?: string;
  domainName?: string;
}

export function buildSystemPrompt(ctx: AgentPromptContext): string {
  const viewName = ctx.view ? ((VIEW_NAMES as Record<string, string>)[ctx.view] ?? ctx.view) : '未知';
  return [
    '你是「corn」资源管理系统的操作助手。用户通过文字或语音下达指令，你通过调用工具完成操作。',
    '',
    '当前上下文：',
    `- 空间：${ctx.spaceName}`,
    `- 所在视图：${viewName}`,
    `- 领域筛选：${ctx.domainName ?? '全部领域'}`,
    '',
    '你只有两个工具：query（只读查询）与 execute（执行操作），行为由参数路由决定：',
    '- target=view：仅 action=switch（需 view 参数），切换视图自动执行。',
    '- target=resource_types：query 查类型清单与数量；execute 支持 create（需 code/name/unit）、rename、disable、enable（后三者需 id）。',
    '- target=resources：query 查某类型下的资源实例（需 typeName，可 keyword）。',
    '- target=resource：execute 对资源实例做 create（批量创建，需 typeName）与 inject/reserve/release/settle/consume（需 typeName、resourceName、amount）。',
    '- target=domains：query 查领域清单；execute 支持 create（需 code/name）、rename、delete（需 id）。',
    '- target=groups：query 查群组清单（含 parentId 嵌套关系）；execute 支持 create（需 code/name，可 parentId）、rename、move（需 id 与 parentId）、delete（需 id）。',
    '- target=reservations / ledger：query 查某资源的占用记录 / 流转明细（需 typeName 与 resourceName）。',
    '',
    '使用规则：',
    '1. query 直接执行；execute 除 target=view 外都会先请求用户确认，调用前先用一句话向用户复述将要执行的操作（动作、数量、对象），参数必须完整明确。',
    '2. 每次只调用一个 execute，等该操作完成后再决定下一步，禁止在同一回复里并行发起多个。',
    '3. 定位操作目标（类型/领域/群组）优先传 code 或名称，两者都能直接命中；仅当 query 结果刚返回该对象的 id 时才传 id，严禁编造或凭记忆复述 id。',
    '4. 创建 resource_type/domain/group 需要 code：小写字母开头，仅含小写字母、数字、连字符；name 用中文；创建 resource_type 建议先 query domains 拿领域 id。',
    '5. 用户指令不明确（缺数量、缺名称）时先询问，不要猜测。',
    '6. 说到做到：凡是宣布要执行的操作，必须在同一回复中实际调用 execute 工具发起执行；禁止只在文本中描述操作而不调用工具。',
    '7. 执行失败时，按错误提示修正参数立即重试一次（例如目标未命中就改传 code 或名称），不要就此结束。',
    '8. 用简短中文回复，直接说明做了什么或需要什么补充信息。',
  ].join('\n');
}

/* ==================== 会话层 ==================== */

/**
 * OpenAI 兼容代理端点工厂（大模型配置与凭据由代理在后端注入，前端不持有、不透传）；
 * provider 内部用 new URL() 拼地址，须绝对路径。每次会话取当前登录凭据构造，
 * token 静默续期后新会话自动携带新凭据。
 */
function createProvider() {
  return createOpenAICompatible({
    name: 'corn-agent',
    baseURL: `${window.location.origin}/agent/v1`,
    headers: { Authorization: `Bearer ${accessToken.value}` },
  });
}

/** 框架多步上限：防御模型循环调用 */
const MAX_STEPS = 10;

/** 待确认的写操作工具调用：由确认弹窗渲染，用户裁决后决议对应工具的等待 Promise */
export interface PendingConfirmation {
  toolCallId: string;
  /** 确认文案（描述将要执行的动作） */
  title: string;
  input: Record<string, unknown>;
}

/** 过程日志条目：全程弹窗中展示 AI 思考与工具调用进展 */
export interface AgentActivity {
  id: string;
  kind: 'thought' | 'tool';
  /** thought 的正文 / 工具的「做什么」摘要 */
  text: string;
  /** 工具执行结果摘要（完成才有） */
  detail?: string;
  state: 'running' | 'done';
}

/** 全程弹窗的工作阶段：思考 → 确认（可多次）→ 执行 → 完成 */
export type AgentPhase = 'thinking' | 'confirming' | 'executing' | 'done';

/** 探测后端代理是否可达（/agent/status 公开可探） */
async function probeConfigured(): Promise<boolean> {
  try {
    const res = await fetch('/agent/status');
    if (!res.ok) return false;
    const data = (await res.json()) as { configured?: boolean };
    return Boolean(data.configured);
  } catch {
    return false;
  }
}

/** 过程日志中工具条目的「做什么」摘要（参数路由工具：按 target/action 生成可读文案） */
function toolSummary(input: Record<string, unknown>): string {
  const target = String(input.target ?? '?');
  if (target === 'view') return `切换视图（${String(input.view ?? '?')}）`;
  const labels: Record<string, string> = {
    resource_types: '资源类型',
    resources: '资源实例',
    domains: '领域',
    groups: '群组',
    reservations: '占用记录',
    ledger: '流转明细',
  };
  const action = String(input.action ?? '');
  if (action in TARGET_NAMES) return `${action}${TARGET_NAMES[action]}`;
  const actionNames: Record<string, string> = {
    create: '创建',
    rename: '改名',
    move: '移动',
    delete: '删除',
    disable: '停用',
    enable: '启用',
    inject: '注入',
    reserve: '占用',
    release: '释放',
    settle: '结算',
    consume: '花费',
  };
  if (action in actionNames) return `${actionNames[action]}${TARGET_NAMES[target] ?? target}`;
  return `查询${labels[target] ?? target}`;
}

/** 工具输出的人类可读摘要（兼容 SDK 的 output 包装与工具直出两种形态） */
function toolDetail(output: unknown): string | undefined {
  const raw = (output as { value?: unknown } | undefined)?.value ?? output;
  if (raw && typeof raw === 'object' && 'text' in raw) {
    const text = String((raw as { text?: unknown }).text ?? '').trim();
    if (text) return text.length > 100 ? `${text.slice(0, 100)}…` : text;
  }
  return undefined;
}

/**
 * 智能体会话：完全运行在浏览器端，机制全部基于 AI SDK 原生能力——
 * streamText 多步循环（stopWhen）+ 工具 execute + 确认 Promise 挂起。
 * 会话层只负责：系统提示上下文、确认队列裁决、过程日志与弹窗状态。
 */
export function useAgentChat() {
  /** null = 探测中；false = 代理不可达，指令走本地规则降级 */
  const configured = ref<boolean | null>(null);
  /** 对话历史（宽松 Record 形态：SDK 的 ModelMessage 递归联合在展开赋值时会深层实例化；
   * 仅在与 streamText 交互的边界处断言回 ModelMessage[]） */
  const history = ref<Array<Record<string, unknown>>>([]);
  /** 确认队列：写操作工具调用逐个弹窗裁决 */
  const pendingQueue = ref<PendingConfirmation[]>([]);
  /** 弹窗当前展示的待确认项（队首） */
  const pending = computed(() => pendingQueue.value[0] ?? null);
  /** 队列深度：卡片显示「第 1 / n 项」 */
  const pendingTotal = computed(() => pendingQueue.value.length);
  /** 全程弹窗开合：发送指令打开，完成阶段由用户关闭 */
  const agentActive = ref(false);
  /** 模型多步生成进行中（含工具执行与确认挂起） */
  const running = ref(false);
  /** 写操作正在落地（确认后、决议工具 Promise 前） */
  const executing = ref(false);
  /** 过程日志：本轮指令产生的思考与工具进展（send 时重置） */
  const activity = ref<AgentActivity[]>([]);
  /** 最终回复与错误信息（弹窗结果区展示） */
  const finalText = ref('');
  const lastError = ref('');

  void probeConfigured().then((ok) => {
    configured.value = ok;
  });

  const phase = computed<AgentPhase>(() => {
    if (pending.value) return 'confirming';
    if (executing.value) return 'executing';
    if (running.value) return 'thinking';
    return 'done';
  });

  /** 确认等待中的工具 Promise 决议器（按 toolCallId 索引，非响应式） */
  const pendingResolvers = new Map<string, (output: ToolOutput) => void>();

  /** 工具集：写操作经确认环挂起，裁决后框架自动续跑 */
  const tools = createAgentTools((toolCallId, input, title) => {
    pendingQueue.value = [...pendingQueue.value, { toolCallId, title, input }];
    activity.value = [
      ...activity.value,
      { id: toolCallId, kind: 'tool', text: toolSummary(input), state: 'running' },
    ];
    return new Promise<ToolOutput>((resolve) => {
      pendingResolvers.set(toolCallId, resolve);
    });
  });

  /** 过程日志辅助 */
  function pushThought(text: string) {
    if (!text.trim()) return;
    activity.value = [...activity.value, { id: `thought-${activity.value.length}`, kind: 'thought', text, state: 'done' }];
  }

  function updateToolActivity(toolCallId: string, output: unknown) {
    activity.value = activity.value.map((item) =>
      item.id === toolCallId ? { ...item, detail: toolDetail(output), state: 'done' as const } : item,
    );
  }

  /** 生成任务：框架多步循环——工具执行（含确认挂起）由 SDK 自动驱动与续跑 */
  async function runAgent() {
    running.value = true;
    try {
      const result = streamText({
        // model 字段由代理在后端覆写（env.ARK_MODEL），前端仅传占位
        model: createProvider().chatModel('agent'),
        system: buildSystemPrompt({
          spaceName: spaces.value.find((s) => s.id === spaceId.value)?.name ?? '',
          view: currentView.value,
          domainName: domains.value.find((d) => d.id === domainId.value)?.name,
        }),
        messages: history.value as unknown as ModelMessage[],
        // ToolSet 宽化：避免 tool() 精确泛型在此处的深层实例化推断
        tools: tools as ToolSet,
        stopWhen: stepCountIs(MAX_STEPS),
        maxOutputTokens: 1024,
        onStepFinish: (step) => {
          let stepText = '';
          for (const part of step.content) {
            if (part.type === 'text') stepText += part.text;
            else if (part.type === 'tool-call') {
              activity.value = [
                ...activity.value,
                { id: part.toolCallId, kind: 'tool', text: toolSummary((part.input ?? {}) as Record<string, unknown>), state: 'running' },
              ];
            } else if (part.type === 'tool-result') {
              updateToolActivity(part.toolCallId, part.output);
            }
          }
          // 中间步文本是思考过程；最后一步文本即最终回复
          if (step.finishReason === 'tool-calls') pushThought(stepText);
          else finalText.value = stepText.trim();
        },
        onError: ({ error }) => {
          lastError.value = error instanceof Error ? error.message : String(error);
        },
      });
      history.value = [
        ...history.value,
        ...((await result.responseMessages) as unknown as Array<Record<string, unknown>>),
      ];
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      message.error(`智能体请求失败：${lastError.value}`);
    } finally {
      running.value = false;
    }
  }

  /** 确认弹窗裁决（队首出队）：确认→执行并决议工具 Promise（框架自动续跑）；取消→决议取消语义 */
  function resolvePending(approved: boolean) {
    const [p, ...rest] = pendingQueue.value;
    pendingQueue.value = rest;
    if (!p) return;
    const resolve = pendingResolvers.get(p.toolCallId);
    pendingResolvers.delete(p.toolCallId);
    if (!resolve) return;
    void (async () => {
      executing.value = true;
      try {
        const output = approved
          ? await TOOL_DEFINITIONS.execute.execute(p.input)
          : { ok: false, text: '用户取消了该操作' };
        updateToolActivity(p.toolCallId, output);
        resolve(output);
      } finally {
        executing.value = false;
      }
    })();
  }

  /** 指令入口：打开全程弹窗，追加用户消息并启动生成任务 */
  function send(text: string) {
    finalText.value = '';
    lastError.value = '';
    activity.value = [];
    agentActive.value = true;
    history.value = [...history.value, { role: 'user', content: text }];
    void runAgent();
  }

  /** 关闭弹窗：仅完成阶段可关（过程阶段 Dialog 的 closable 均已关闭） */
  function close() {
    if (phase.value === 'done') agentActive.value = false;
  }

  return { configured, pending, pendingTotal, resolvePending, agentActive, phase, activity, finalText, lastError, send, close };
}
