import { ApiPropertyOptional } from '@nestjs/swagger';

export type SortDirection = 'asc' | 'desc';

export interface PageRequest {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/** 列表查询参数：分页/关键词/排序为所有集合资源共有，字段描述即前端列筛选标签 */
export class ListQuery {
  @ApiPropertyOptional({ description: '当前页码', default: 1 })
  page?: string | number;

  @ApiPropertyOptional({ description: '每页数量', default: 20 })
  pageSize?: string | number;

  @ApiPropertyOptional({ description: '关键词' })
  keyword?: string;

  @ApiPropertyOptional({ description: '排序，如 createdAt,desc' })
  sorter?: string;

  [key: string]: unknown;
}

export function resolvePaging(query: ListQuery, defaultPageSize = 20): PageRequest {
  const page = Math.max(1, Math.trunc(Number(query.page) || 1));
  const rawSize = Math.trunc(Number(query.pageSize) || defaultPageSize);
  const pageSize = Math.min(Math.max(rawSize, 1), 200);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** sorter 形如 `createdAt,desc`；仅接受白名单内的字段。 */
export function resolveSort<T extends string>(
  sorter: string | undefined,
  allowed: readonly T[],
  fallback: Record<string, SortDirection>,
): Record<string, SortDirection> {
  if (!sorter) return fallback;
  const [field, direction] = String(sorter).split(',');
  if (!allowed.includes(field as T)) return fallback;
  return { [field]: direction === 'asc' ? 'asc' : 'desc' };
}

export function toIntOrUndefined(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map((item) => String(item));
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
