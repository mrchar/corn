import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AppError, ErrorCodes } from './errors';
import { IS_PUBLIC_KEY } from './public.decorator';

/** 已认证用户的最小身份（JWT payload 摘要），挂到请求上供各层使用 */
export interface AuthenticatedUser {
  id: string;
  username: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * 登录鉴权的第一道闸门：除 @Public() 标记的端点外，
 * 一律要求 Authorization: Bearer <accessToken>，校验通过后把用户身份挂到请求上。
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, '未登录或登录已过期', {}, 401);
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; username: string }>(token);
      request.user = { id: payload.sub, username: payload.username };
    } catch {
      throw new AppError(ErrorCodes.UNAUTHORIZED, '未登录或登录已过期', {}, 401);
    }
    return true;
  }
}
