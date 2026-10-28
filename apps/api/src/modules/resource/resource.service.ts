import { Injectable } from '@nestjs/common';
import { AttributeDef, pickAttributes, validateAttributes } from '../../common/attribute';
import { AppError, ErrorCodes } from '../../common/errors';
import { newId } from '../../common/ids';
import { parseJson, stringifyJson } from '../../common/json';
import { ListQuery, resolvePaging, resolveSort } from '../../common/pagination';
import { listResult, ListResult } from '../../common/response';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainService } from '../domain/domain.service';
import { ResourceTypeService } from '../resource-type/resource-type.service';
import { CreateResourceDto, UpdateResourceDto } from './resource.dto';
import { Measures, MeasureService } from './measure.service';

export interface ResourceView {
  id: string;
  spaceId: string;
  typeId: string;
  typeCode: string;
  typeName: string;
  unit: string;
  domainId: string;
  domainName: string;
  groupId: string | null;
  name: string;
  status: string;
  /** 业务属性：展开为对象，键值依类型的属性模式 */
  attrs: Record<string, unknown>;
  /** 数量四口径，由流转派生 */
  total: number;
  reserved: number;
  consumed: number;
  available: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ResourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly types: ResourceTypeService,
    private readonly domains: DomainService,
    private readonly measures: MeasureService,
  ) {}

  async list(spaceId: string, typeCode: string, query: ListQuery): Promise<ListResult<ResourceView>> {
    const type = await this.types.requireByCode(spaceId, typeCode);
    const paging = resolvePaging(query);
    const keyword = String(query.keyword ?? '').trim();
    const where: Record<string, unknown> = { spaceId, typeId: type.id };
    if (query.domainId) where.domainId = String(query.domainId);
    if (query.status) where.status = String(query.status);
    if (keyword) where.name = { contains: keyword };
    // 业务属性过滤：以 JSON 子串匹配实现，边界见 design.md 待定项 8
    const attrSchema = parseJson<AttributeDef[]>(type.attrSchema, []);
    for (const def of attrSchema) {
      const raw = query[def.key];
      if (raw === undefined || raw === null || raw === '') continue;
      const fragment = stringifyJson(raw);
      where.attrs = { contains: `"${def.key}":${fragment}` };
    }
    const orderBy = resolveSort(query.sorter, ['createdAt', 'name'] as const, { createdAt: 'desc' });

    const [rows, total] = await Promise.all([
      this.prisma.resource.findMany({ where, orderBy, skip: paging.skip, take: paging.take }),
      this.prisma.resource.count({ where }),
    ]);
    const measureMap = await this.measures.forResources(
      spaceId,
      rows.map((row) => row.id),
    );
    const domainNames = await this.domainNameMap(spaceId);
    return listResult(
      rows.map((row) =>
        this.toView(row, type, measureMap.get(row.id) ?? { total: 0, reserved: 0, consumed: 0, available: 0 }, domainNames.get(row.domainId) ?? ''),
      ),
      total,
    );
  }

  async detail(spaceId: string, typeCode: string, resourceId: string): Promise<ResourceView> {
    const type = await this.types.requireByCode(spaceId, typeCode);
    const resource = await this.prisma.resource.findFirst({ where: { id: resourceId, spaceId, typeId: type.id } });
    if (!resource) throw new AppError(ErrorCodes.NOT_FOUND, '资源不存在', { resourceId }, 404);
    const [measures, domainNames] = await Promise.all([
      this.measures.forResource(spaceId, resourceId),
      this.domainNameMap(spaceId),
    ]);
    return this.toView(resource, type, measures, domainNames.get(resource.domainId) ?? '');
  }

  async require(spaceId: string, resourceId: string) {
    const resource = await this.prisma.resource.findFirst({ where: { id: resourceId, spaceId } });
    if (!resource) throw new AppError(ErrorCodes.NOT_FOUND, '资源不存在', { resourceId }, 404);
    return resource;
  }

  async create(spaceId: string, typeCode: string, body: Record<string, unknown>): Promise<ResourceView> {
    // 创建实例要求类型处于启用状态；停用类型的既有实例仍可读（list/detail/update 走宽松版）
    const type = await this.types.requireActiveByCode(spaceId, typeCode);
    const schema = parseJson<AttributeDef[]>(type.attrSchema, []);

    // 静态字段走 DTO 约束，这里手动取出来；其余字段视为业务属性
    const dto: CreateResourceDto = {
      domainId: String(body.domainId ?? ''),
      name: String(body.name ?? ''),
      groupId: typeof body.groupId === 'string' ? body.groupId : undefined,
      status: typeof body.status === 'string' ? body.status : undefined,
    };
    if (!dto.domainId) throw new AppError(ErrorCodes.VALIDATION_FAILED, '领域不能为空', {});
    if (!dto.name || dto.name.length > 80) throw new AppError(ErrorCodes.VALIDATION_FAILED, '资源名称长度需在 1-80 之间', {});
    await this.domains.require(spaceId, dto.domainId);

    const attrs = pickAttributes(schema, body);
    const issues = validateAttributes(schema, attrs);
    if (issues.length > 0) {
      throw new AppError(ErrorCodes.INVALID_ATTRIBUTE, '资源属性校验未通过', { issues });
    }

    const entity = await this.prisma.resource.create({
      data: {
        id: newId('rs'),
        spaceId,
        domainId: dto.domainId,
        groupId: dto.groupId ?? null,
        typeId: type.id,
        name: dto.name,
        status: dto.status ?? 'active',
        attrs: stringifyJson(attrs),
      },
    });
    if (!type.inUse) await this.types.markInUse(type.id);
    const [measures, domainNames] = await Promise.all([
      this.measures.forResource(spaceId, entity.id),
      this.domainNameMap(spaceId),
    ]);
    return this.toView(entity, type, measures, domainNames.get(entity.domainId) ?? '');
  }

  async update(spaceId: string, typeCode: string, resourceId: string, body: Record<string, unknown>): Promise<ResourceView> {
    const type = await this.types.requireByCode(spaceId, typeCode);
    const resource = await this.require(spaceId, resourceId);
    if (resource.typeId !== type.id) {
      throw new AppError(ErrorCodes.NOT_FOUND, '资源与类型不匹配', { resourceId, typeCode }, 404);
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name || body.name.length > 80) {
        throw new AppError(ErrorCodes.VALIDATION_FAILED, '资源名称长度需在 1-80 之间', {});
      }
      data.name = body.name;
    }
    if (body.status !== undefined) {
      if (!['active', 'archived'].includes(String(body.status))) {
        throw new AppError(ErrorCodes.VALIDATION_FAILED, '资源状态只能是 active 或 archived', {});
      }
      data.status = body.status;
    }
    if (body.domainId !== undefined) {
      await this.domains.require(spaceId, String(body.domainId));
      data.domainId = body.domainId;
    }

    // 若请求体中包含类型声明的业务属性键，则校验并整体覆盖 attrs
    const schema = parseJson<AttributeDef[]>(type.attrSchema, []);
    const hasAttrPayload = schema.some((def) => Object.prototype.hasOwnProperty.call(body, def.key));
    if (hasAttrPayload) {
      const attrs = pickAttributes(schema, body);
      const issues = validateAttributes(schema, attrs);
      if (issues.length > 0) {
        throw new AppError(ErrorCodes.INVALID_ATTRIBUTE, '资源属性校验未通过', { issues });
      }
      data.attrs = stringifyJson(attrs);
    }

    const entity = await this.prisma.resource.update({ where: { id: resourceId }, data });
    const [measures, domainNames] = await Promise.all([
      this.measures.forResource(spaceId, entity.id),
      this.domainNameMap(spaceId),
    ]);
    return this.toView(entity, type, measures, domainNames.get(entity.domainId) ?? '');
  }

  /** 删除即归档，保证账本完整性。 */
  async remove(spaceId: string, typeCode: string, resourceId: string): Promise<ResourceView> {
    return this.update(spaceId, typeCode, resourceId, { status: 'archived' });
  }

  private async domainNameMap(spaceId: string): Promise<Map<string, string>> {
    const domains = await this.prisma.domain.findMany({ where: { spaceId } });
    return new Map(domains.map((d) => [d.id, d.name]));
  }

  private toView(
    row: {
      id: string;
      spaceId: string;
      typeId: string;
      domainId: string;
      groupId: string | null;
      name: string;
      status: string;
      attrs: string;
      createdAt: Date;
      updatedAt: Date;
    },
    type: { code: string; name: string; unit: string },
    measures: Measures,
    domainName: string,
  ): ResourceView {
    return {
      id: row.id,
      spaceId: row.spaceId,
      typeId: row.typeId,
      typeCode: 'code' in type ? type.code : '',
      typeName: type.name,
      unit: type.unit,
      domainId: row.domainId,
      domainName,
      groupId: row.groupId,
      name: row.name,
      status: row.status,
      attrs: parseJson<Record<string, unknown>>(row.attrs, {}),
      total: measures.total,
      reserved: measures.reserved,
      consumed: measures.consumed,
      available: measures.available,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
