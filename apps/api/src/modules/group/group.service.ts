import { Injectable } from '@nestjs/common';
import { AppError, ErrorCodes } from '../../common/errors';
import { newId } from '../../common/ids';
import { ListQuery, resolvePaging, resolveSort } from '../../common/pagination';
import { listResult, ListResult } from '../../common/response';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGroupDto, UpdateGroupDto } from './group.dto';

export interface GroupView {
  id: string;
  spaceId: string;
  parentId: string | null;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class GroupService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 校验上级群组合法性：必须同空间存在，且不能是自身或自身的后代（防止循环嵌套）
   */
  private async assertParent(spaceId: string, groupId: string | null, parentId: string): Promise<void> {
    if (parentId === groupId) {
      throw new AppError(ErrorCodes.VALIDATION_FAILED, '上级群组不能是自身', { groupId }, 400);
    }
    let cursor = await this.prisma.group.findFirst({ where: { id: parentId, spaceId } });
    if (!cursor) throw new AppError(ErrorCodes.NOT_FOUND, '上级群组不存在', { parentId }, 404);
    while (cursor) {
      if (cursor.id === groupId) {
        throw new AppError(ErrorCodes.VALIDATION_FAILED, '不能将自身的后代群组设为上级（会造成循环嵌套）', { groupId }, 400);
      }
      cursor = cursor.parentId
        ? await this.prisma.group.findUnique({ where: { id: cursor.parentId } })
        : null;
    }
  }

  async list(spaceId: string, query: ListQuery): Promise<ListResult<GroupView>> {
    const paging = resolvePaging(query);
    const keyword = String(query.keyword ?? '').trim();
    const where = {
      spaceId,
      ...(keyword ? { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }] } : {}),
    };
    const orderBy = resolveSort(query.sorter, ['createdAt', 'name', 'code'] as const, { createdAt: 'asc' });

    const [rows, total] = await Promise.all([
      this.prisma.group.findMany({ where, orderBy, skip: paging.skip, take: paging.take }),
      this.prisma.group.count({ where }),
    ]);
    return listResult(rows.map((row) => this.toView(row)), total);
  }

  async require(spaceId: string, groupId: string) {
    const group = await this.prisma.group.findFirst({ where: { id: groupId, spaceId } });
    if (!group) throw new AppError(ErrorCodes.NOT_FOUND, '群组不存在', { groupId }, 404);
    return group;
  }

  async detail(spaceId: string, groupId: string): Promise<GroupView> {
    return this.toView(await this.require(spaceId, groupId));
  }

  async create(spaceId: string, dto: CreateGroupDto): Promise<GroupView> {
    if (dto.parentId) await this.assertParent(spaceId, null, dto.parentId);
    const entity = await this.prisma.group.create({
      data: { id: newId('gp'), spaceId, code: dto.code, name: dto.name, parentId: dto.parentId ?? null },
    });
    return this.toView(entity);
  }

  async update(spaceId: string, groupId: string, dto: UpdateGroupDto): Promise<GroupView> {
    await this.require(spaceId, groupId);
    const data: { name?: string; parentId?: string | null } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.parentId !== undefined) {
      if (dto.parentId === null || dto.parentId === '') {
        data.parentId = null;
      } else {
        await this.assertParent(spaceId, groupId, dto.parentId);
        data.parentId = dto.parentId;
      }
    }
    const entity = await this.prisma.group.update({ where: { id: groupId }, data });
    return this.toView(entity);
  }

  /** 删除群组：子群组提升为顶级（parentId 置空），归属资源的 groupId 置空，资源本身保留 */
  async remove(spaceId: string, groupId: string): Promise<void> {
    await this.require(spaceId, groupId);
    await this.prisma.group.delete({ where: { id: groupId } });
  }

  private toView(entity: {
    id: string;
    spaceId: string;
    parentId: string | null;
    code: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  }): GroupView {
    return {
      id: entity.id,
      spaceId: entity.spaceId,
      parentId: entity.parentId,
      code: entity.code,
      name: entity.name,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
