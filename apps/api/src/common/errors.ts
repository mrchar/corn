export interface ErrorDetail {
  [key: string]: unknown;
}

/**
 * 业务错误：携带稳定的机器可读 code 与供前端定位的 detail。
 * HTTP 状态码在此声明，最终由 AppErrorFilter 统一序列化。
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail: ErrorDetail = {},
    readonly httpStatus = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const ErrorCodes = {
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  CONFLICT: 'CONFLICT',
  INVALID_ATTRIBUTE: 'INVALID_ATTRIBUTE',
  TYPE_DISABLED: 'RESOURCE_TYPE_DISABLED',
  TYPE_IN_USE: 'RESOURCE_TYPE_IN_USE',
  SOURCE_NOT_ALLOWED: 'SOURCE_KIND_NOT_ALLOWED',
  SINK_NOT_ALLOWED: 'SINK_KIND_NOT_ALLOWED',
  INSUFFICIENT_AVAILABLE: 'INSUFFICIENT_AVAILABLE',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  RESERVATION_CLOSED: 'RESERVATION_NOT_ACTIVE',
  RESERVATION_EXCEEDED: 'RESERVATION_AMOUNT_EXCEEDED',
  INTERNAL: 'INTERNAL_ERROR',
} as const;
