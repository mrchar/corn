export type SortDirection = 'asc' | 'desc';

export interface PageRequest {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export class ListQuery {
  page?: string | number;
  pageSize?: string | number;
  keyword?: string;
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
