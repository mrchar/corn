/**
 * 前端文档 → 资源池的转换函数（调用 useResources 时通过 parse 显式传入）。
 *
 * 后端文档由注解生成（静态资源）与元数据库生成（自定义资源类型），
 * 路径参数名会随控制器实现变化（:spaceId / :domainId / :typeId …），
 * 而资源池的单项地址只替换 {id}，因此在这一层统一归一化占位符名，
 * 其余语义（集合/单项、请求体、响应信封、query 过滤）沿用标准 OpenAPI 解析。
 */

import { parseOpenApi } from '@mrchar/cumquat/composables';
import type { ResourceSchema } from '@mrchar/cumquat/composables';

interface OpenApiDoc {
  paths?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 任意路径参数一律归一为 {id} */
export function convertSwagger(doc: unknown, ctx: { server: string }) {
  const source = (doc ?? {}) as OpenApiDoc;
  const paths: Record<string, unknown> = {};
  for (const [path, item] of Object.entries(source.paths ?? {})) {
    paths[path.replace(/\{[^}]+\}/g, '{id}')] = item;
  }
  return localizeEnumLabels(parseOpenApi({ ...source, paths }, ctx) as ResourceSchema);
}

/** 枚举值中文化：文档只声明枚举值，列/筛选项标签在此按「资源名 + 字段名」映射 */
const ENUM_LABELS: Record<string, Record<string, Record<string, string>>> = {
  'resource-types': {
    origin: { custom: '自定义', 'builtin-inherited': '模板继承', 'builtin-rewritten': '模板改写' },
    status: { active: '启用', disabled: '停用' },
  },
  reservations: {
    status: { active: '有效', released: '已释放', settled: '已结算' },
  },
  ledger: {
    kind: { creation: '注入', reservation: '占用', release: '释放', settle: '结算', consumption: '花费' },
  },
};

/** 自定义资源类型（资源名不固定）的状态枚举 */
const RESOURCE_STATUS_LABELS: Record<string, string> = { active: '正常', archived: '已归档' };

function localizeEnumLabels(schema: ResourceSchema): ResourceSchema {
  for (const [name, definition] of Object.entries(schema.resources)) {
    for (const field of definition.fields ?? []) {
      const mapping = ENUM_LABELS[name]?.[field.name]
        ?? (field.name === 'status' ? RESOURCE_STATUS_LABELS : undefined);
      if (!mapping || !field.options) continue;
      field.options = field.options.map((option) => ({
        ...option,
        label: mapping[String(option.value)] ?? option.label,
      }));
    }
  }
  return schema;
}
