import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AppError, ErrorCodes } from './errors';

export interface SpaceScopedRequest extends Request {
  space?: { id: string; name: string; code: string };
  actorId?: string;
}

/**
 * 空间隔离的第一道闸门：凡路径中出现 spaceId 的请求，
 * 先确认该空间存在，再把空间实体挂到请求上，供后续模块复用。
 */
@Injectable()
export class SpaceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SpaceScopedRequest>();
    request.actorId = (request.header('x-actor-id') as string | undefined) || undefined;

    const rawSpaceId = request.params?.spaceId;
    const spaceId = Array.isArray(rawSpaceId) ? rawSpaceId[0] : rawSpaceId;
    if (!spaceId) return true;

    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });
    if (!space) {
      throw new AppError(ErrorCodes.NOT_FOUND, '空间不存在', { spaceId }, 404);
    }
    request.space = { id: space.id, name: space.name, code: space.code };
    return true;
  }
}
