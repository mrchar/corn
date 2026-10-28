import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { AppError, ErrorCodes, ErrorDetail } from './errors';

interface ErrorEnvelope {
  status: 'error';
  message: string;
  error: { code: string; detail: ErrorDetail };
}

/**
 * 统一错误体：
 * { status: 'error', message: '可用量不足', error: { code: 'INSUFFICIENT_AVAILABLE', detail: {...} } }
 */
@Catch()
export class AppErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('AppError');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const normalized = this.normalize(exception);
    if (normalized.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    }
    response.status(normalized.status).json({
      status: 'error',
      message: normalized.message,
      error: { code: normalized.code, detail: normalized.detail },
    } satisfies ErrorEnvelope);
  }

  private normalize(exception: unknown): {
    status: number;
    code: string;
    message: string;
    detail: ErrorDetail;
  } {
    if (exception instanceof AppError) {
      return {
        status: exception.httpStatus,
        code: exception.code,
        message: exception.message,
        detail: exception.detail,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCodes.CONFLICT,
          message: '对象已存在，存在唯一性冲突',
          detail: { target: exception.meta?.target ?? null },
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          code: ErrorCodes.NOT_FOUND,
          message: '对象不存在',
          detail: {},
        };
      }
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCodes.VALIDATION_FAILED,
        message: '数据访问失败',
        detail: { prismaCode: exception.code },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'object' && payload !== null && Array.isArray((payload as { message?: unknown }).message)) {
        return {
          status,
          code: ErrorCodes.VALIDATION_FAILED,
          message: '请求参数校验未通过',
          detail: { issues: (payload as { message: string[] }).message },
        };
      }
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string }).message ?? exception.message);
      return {
        status,
        code: status === HttpStatus.NOT_FOUND ? ErrorCodes.NOT_FOUND : `HTTP_${status}`,
        message,
        detail: {},
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCodes.INTERNAL,
      message: '服务内部错误',
      detail: {},
    };
  }
}
