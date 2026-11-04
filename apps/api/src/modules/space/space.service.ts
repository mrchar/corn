import { Injectable } from '@nestjs/common';
import { newId } from '../../common/ids';
import { AppError, ErrorCodes } from '../../common/errors';
import { ListQuery, resolvePaging, resolveSort } from '../../common/pagination';
import { listResult, ListResult } from '../../common/response';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSpaceDto, UpdateSpaceDto } from './space.dto';

export interface SpaceView {
  id: string;
  code: string;
  name: string;
  enableDomain: boolean;
  enableGroup: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class SpaceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListQuery, ownerId: string): Promise<ListResult<SpaceView>> {
    const paging = resolvePaging(query);
    const keyword = String(query.keyword ?? '').trim();
    const where = {
      ownerId,
      ...(keyword
        ? { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }] }
        : {}),
    };
    const orderBy = resolveSort(query.sorter, ['createdAt', 'name', 'code'] as const, { createdAt: 'asc' });

    const [rows, total] = await Promise.all([
      this.prisma.space.findMany({ where, orderBy, skip: paging.skip, take: paging.take }),
      this.prisma.space.count({ where }),
    ]);
    return listResult(rows.map((row) => this.toView(row)), total);
  }

  async detail(spaceId: string): Promise<SpaceView> {
    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });
    if (!space) throw new AppError(ErrorCodes.NOT_FOUND, '空间不存在', { spaceId }, 404);
    return this.toView(space);
  }

  /**
   * 创建空间并附带默认领域与默认群组（同一事务）：
   * 资源类型必须有归属领域、组织开关关闭时选项兜底到默认对象，保证新空间开箱可用。
   * 未开启「使用空间」的用户不允许创建空间（前端入口已隐藏，此处服务端兜底）。
   */
  async create(dto: CreateSpaceDto, ownerId: string): Promise<SpaceView> {
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner?.enableSpace) {
      // 无空间的存量账号保留创建首个空间的兜底入口；已有空间且未开启使用空间则拒绝
      const spaceCount = await this.prisma.space.count({ where: { ownerId } });
      if (spaceCount > 0) {
        throw new AppError(ErrorCodes.CONFLICT, '未开启使用空间，无法创建空间', {}, 409);
      }
    }
    const spaceId = newId('sp');
    const domainId = newId('dm');
    const entity = await this.prisma.$transaction(async (tx) => {
      const space = await tx.space.create({
        data: { id: spaceId, ownerId, code: dto.code, name: dto.name },
      });
      await tx.domain.create({
        data: { id: domainId, spaceId, code: 'default', name: '默认领域' },
      });
      await tx.group.create({
        data: { id: newId('gp'), spaceId, code: 'default', name: '默认群组' },
      });
      return space;
    });
    return this.toView(entity);
  }

  async update(spaceId: string, dto: UpdateSpaceDto): Promise<SpaceView> {
    await this.detail(spaceId);
    // 组织开关关闭约束：已有多个领域/群组时禁止关闭对应开关（企业统一管理，避免概念被静默隐藏）
    if (dto.enableDomain === false) {
      const domainCount = await this.prisma.domain.count({ where: { spaceId } });
      if (domainCount > 1) {
        throw new AppError(
          ErrorCodes.CONFLICT,
          '已创建多个领域，无法关闭使用领域',
          { domainCount },
          409,
        );
      }
    }
    if (dto.enableGroup === false) {
      const groupCount = await this.prisma.group.count({ where: { spaceId } });
      if (groupCount > 1) {
        throw new AppError(
          ErrorCodes.CONFLICT,
          '已创建多个群组，无法关闭使用群组',
          { groupCount },
          409,
        );
      }
    }
    const entity = await this.prisma.space.update({
      where: { id: spaceId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.enableDomain !== undefined ? { enableDomain: dto.enableDomain } : {}),
        ...(dto.enableGroup !== undefined ? { enableGroup: dto.enableGroup } : {}),
      },
    });
    return this.toView(entity);
  }

  private toView(entity: {
    id: string;
    code: string;
    name: string;
    enableDomain: boolean;
    enableGroup: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): SpaceView {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      enableDomain: entity.enableDomain,
      enableGroup: entity.enableGroup,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
