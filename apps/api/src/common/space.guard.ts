import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AppError, ErrorCodes } from './errors';
import type { AuthenticatedRequest } from './auth.guard';

export interface SpaceScopedRequest extends AuthenticatedRequest {
  space?: { id: string; name: string; code: string };
  actorId?: string;
}

/**
 * 空间隔离的第二道闸门：凡路径中出现 spaceId 的请求，
 * 先确认该空间存在且归属当前登录用户（不归属一律 404，避免探测他人空间），
 * 再把空间实体挂到请求上，供后续模块复用；操作者身份由 JWT sub 注入 actorId。
 */
@Injectable()
export class SpaceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SpaceScopedRequest>();
    request.actorId = request.user?.id;

    const rawSpaceId = request.params?.spaceId;
    const spaceId = Array.isArray(rawSpaceId) ? rawSpaceId[0] : rawSpaceId;
    if (!spaceId) return true;

    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });
    if (!space || !space.ownerId || space.ownerId !== request.user?.id) {
      throw new AppError(ErrorCodes.NOT_FOUND, '空间不存在', { spaceId }, 404);
    }
    request.space = { id: space.id, name: space.name, code: space.code };
    return true;
  }
}
