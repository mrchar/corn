import { AppError } from '../../common/errors';
import { ErrorCodes } from '../../common/errors';

/**
 * 与固定端点冲突的路径段：资源类型的编码会直接成为接口路径段，
 * 因此这些编码必须被占用（如 /spaces/{spaceId}/creations 是创建端点）。
 */
export const RESERVED_TYPE_CODES: readonly string[] = [
  'spaces',
  'domains',
  'groups',
  'resource-types',
  'builtin-templates',
  'resources',
  'creations',
  'reservations',
  'consumptions',
  'ledger',
  'events',
  'openapi.json',
];

export function assertTypeCodeAvailable(code: string): void {
  if (RESERVED_TYPE_CODES.includes(code)) {
    throw new AppError(ErrorCodes.CONFLICT, `编码 ${code} 为系统保留段，不可用作资源类型编码`, {
      code,
      reserved: RESERVED_TYPE_CODES,
    }, 409);
  }
}

export const SOURCE_KINDS = ['manual', 'timed', 'event', 'builtin'] as const;
export const SINK_KINDS = ['manual', 'wear', 'event', 'builtin'] as const;

export function assertKindsAllowed(
  kinds: string[],
  allowed: readonly string[],
  label: string,
): void {
  const invalid = kinds.filter((kind) => !allowed.includes(kind));
  if (invalid.length > 0) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, `${label}包含未知类别：${invalid.join('、')}`, {
      invalid,
      allowed,
    });
  }
}
