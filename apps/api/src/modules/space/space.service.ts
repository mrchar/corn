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

  async create(dto: CreateSpaceDto, ownerId: string): Promise<SpaceView> {
    const entity = await this.prisma.space.create({
      data: { id: newId('sp'), ownerId, code: dto.code, name: dto.name },
    });
    return this.toView(entity);
  }

  async update(spaceId: string, dto: UpdateSpaceDto): Promise<SpaceView> {
    await this.detail(spaceId);
    const entity = await this.prisma.space.update({
      where: { id: spaceId },
      data: { name: dto.name },
    });
    return this.toView(entity);
  }

  private toView(entity: {
    id: string;
    code: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  }): SpaceView {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
