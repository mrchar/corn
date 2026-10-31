import { Injectable } from '@nestjs/common';
import { AppError, ErrorCodes } from '../../common/errors';
import { newId } from '../../common/ids';
import { ListQuery, resolvePaging, resolveSort } from '../../common/pagination';
import { listResult, ListResult } from '../../common/response';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDomainDto, UpdateDomainDto } from './domain.dto';

export interface DomainView {
  id: string;
  spaceId: string;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class DomainService {
  constructor(private readonly prisma: PrismaService) {}

  async list(spaceId: string, query: ListQuery): Promise<ListResult<DomainView>> {
    const paging = resolvePaging(query);
    const keyword = String(query.keyword ?? '').trim();
    const where = {
      spaceId,
      ...(keyword ? { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }] } : {}),
    };
    const orderBy = resolveSort(query.sorter, ['createdAt', 'name', 'code'] as const, { createdAt: 'asc' });

    const [rows, total] = await Promise.all([
      this.prisma.domain.findMany({ where, orderBy, skip: paging.skip, take: paging.take }),
      this.prisma.domain.count({ where }),
    ]);
    return listResult(rows.map((row) => this.toView(row)), total);
  }

  async require(spaceId: string, domainId: string) {
    const domain = await this.prisma.domain.findFirst({ where: { id: domainId, spaceId } });
    if (!domain) throw new AppError(ErrorCodes.NOT_FOUND, '领域不存在', { domainId }, 404);
    return domain;
  }

  async detail(spaceId: string, domainId: string): Promise<DomainView> {
    return this.toView(await this.require(spaceId, domainId));
  }

  async create(spaceId: string, dto: CreateDomainDto): Promise<DomainView> {
    const entity = await this.prisma.domain.create({
      data: { id: newId('dm'), spaceId, code: dto.code, name: dto.name },
    });
    return this.toView(entity);
  }

  async update(spaceId: string, domainId: string, dto: UpdateDomainDto): Promise<DomainView> {
    await this.require(spaceId, domainId);
    const entity = await this.prisma.domain.update({
      where: { id: domainId },
      data: { name: dto.name },
    });
    return this.toView(entity);
  }

  /** 删除领域：资源类型与资源随外键级联清除 */
  async remove(spaceId: string, domainId: string): Promise<void> {
    await this.require(spaceId, domainId);
    await this.prisma.domain.delete({ where: { id: domainId } });
  }

  private toView(entity: {
    id: string;
    spaceId: string;
    code: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  }): DomainView {
    return {
      id: entity.id,
      spaceId: entity.spaceId,
      code: entity.code,
      name: entity.name,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
