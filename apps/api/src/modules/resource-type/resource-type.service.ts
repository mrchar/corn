import { Injectable } from '@nestjs/common';
import { AttributeDef, normalizeAttrSchema } from '../../common/attribute';
import { AppError, ErrorCodes } from '../../common/errors';
import { newId } from '../../common/ids';
import { parseJson, stringifyJson } from '../../common/json';
import { ListQuery, resolvePaging, resolveSort } from '../../common/pagination';
import { listResult, ListResult } from '../../common/response';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainService } from '../domain/domain.service';
import {
  assertKindsAllowed,
  assertTypeCodeAvailable,
  SINK_KINDS,
  SOURCE_KINDS,
} from './resource-type.constants';
import { CreateResourceTypeDto, UpdateResourceTypeDto } from './resource-type.dto';

export interface ResourceTypeView {
  id: string;
  spaceId: string;
  domainId: string;
  domainName: string;
  code: string;
  name: string;
  description: string;
  unit: string;
  numericScale: number;
  divisible: boolean;
  allowNegative: boolean;
  attrSchema: AttributeDef[];
  sourceKinds: string[];
  sinkKinds: string[];
  recommendedTagKeys: string[];
  origin: string;
  templateId: string | null;
  status: string;
  inUse: boolean;
  resourceCount: number;
  fieldCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ResourceTypeRow {
  id: string;
  spaceId: string;
  domainId: string;
  code: string;
  name: string;
  description: string;
  unit: string;
  numericScale: number;
  divisible: boolean;
  allowNegative: boolean;
  attrSchema: string;
  sourceKinds: string;
  sinkKinds: string;
  recommendedTagKeys: string;
  origin: string;
  templateId: string | null;
  status: string;
  inUse: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ResourceTypeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domains: DomainService,
  ) {}

  async list(spaceId: string, query: ListQuery): Promise<ListResult<ResourceTypeView>> {
    const paging = resolvePaging(query);
    const keyword = String(query.keyword ?? '').trim();
    const where = {
      spaceId,
      ...(query.domainId ? { domainId: String(query.domainId) } : {}),
      ...(query.status ? { status: String(query.status) } : {}),
      ...(keyword ? { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }] } : {}),
    };
    const orderBy = resolveSort(query.sorter, ['createdAt', 'name', 'code'] as const, { createdAt: 'asc' });

    const [rows, total, counts] = await Promise.all([
      this.prisma.resourceType.findMany({ where, orderBy, skip: paging.skip, take: paging.take }),
      this.prisma.resourceType.count({ where }),
      this.prisma.resource.groupBy({ by: ['typeId'], where: { spaceId }, _count: { _all: true } }),
    ]);
    const domainNames = await this.domainNameMap(spaceId);
    const countMap = new Map(counts.map((row) => [row.typeId, row._count._all]));
    return listResult(
      rows.map((row) => this.toView(row, domainNames.get(row.domainId) ?? '', countMap.get(row.id) ?? 0)),
      total,
    );
  }

  async detail(spaceId: string, typeId: string): Promise<ResourceTypeView> {
    const row = await this.require(spaceId, typeId);
    const [domainNames, count] = await Promise.all([
      this.domainNameMap(spaceId),
      this.prisma.resource.count({ where: { spaceId, typeId: row.id } }),
    ]);
    return this.toView(row, domainNames.get(row.domainId) ?? '', count);
  }

  /** 依路径段编码定位资源类型；停用类型仍可定位（已有实例可读），仅创建实例时校验启用。 */
  async requireByCode(spaceId: string, code: string): Promise<ResourceTypeRow> {
    const row = await this.prisma.resourceType.findFirst({ where: { spaceId, code } });
    if (!row) throw new AppError(ErrorCodes.NOT_FOUND, '资源类型不存在', { code }, 404);
    return row;
  }

  /** 依路径段编码定位资源类型，且要求处于启用状态；用于创建资源实例等写入路径。 */
  async requireActiveByCode(spaceId: string, code: string): Promise<ResourceTypeRow> {
    const row = await this.requireByCode(spaceId, code);
    if (row.status !== 'active') {
      throw new AppError(ErrorCodes.TYPE_DISABLED, `资源类型「${row.name}」已停用`, { code, status: row.status }, 409);
    }
    return row;
  }

  /** 不抛错地查找类型（含停用），供动态路由判断是否让请求穿透到固定端点。 */
  async findByCode(spaceId: string, code: string): Promise<ResourceTypeRow | null> {
    return this.prisma.resourceType.findFirst({ where: { spaceId, code } });
  }

  async require(spaceId: string, typeId: string): Promise<ResourceTypeRow> {
    const row = await this.prisma.resourceType.findFirst({ where: { id: typeId, spaceId } });
    if (!row) throw new AppError(ErrorCodes.NOT_FOUND, '资源类型不存在', { typeId }, 404);
    return row;
  }

  async create(spaceId: string, dto: CreateResourceTypeDto): Promise<ResourceTypeView> {
    assertTypeCodeAvailable(dto.code);
    await this.domains.require(spaceId, dto.domainId);
    const { schema, issues } = normalizeAttrSchema(dto.attrSchema);
    if (issues.length > 0) {
      throw new AppError(ErrorCodes.INVALID_ATTRIBUTE, '属性模式定义不合法', { issues });
    }
    const sourceKinds = dto.sourceKinds ?? ['manual'];
    const sinkKinds = dto.sinkKinds ?? ['manual'];
    assertKindsAllowed(sourceKinds, SOURCE_KINDS, '来源方式');
    assertKindsAllowed(sinkKinds, SINK_KINDS, '去向方式');
    const entity = await this.insertType(spaceId, {
      code: dto.code,
      name: dto.name,
      domainId: dto.domainId,
      description: dto.description,
      unit: dto.unit,
      numericScale: dto.numericScale,
      divisible: dto.divisible,
      allowNegative: dto.allowNegative,
      attrSchema: schema,
      sourceKinds,
      sinkKinds,
      recommendedTagKeys: dto.recommendedTagKeys,
      origin: 'custom',
      templateId: null,
    });
    return this.detail(spaceId, entity.id);
  }

  async update(spaceId: string, typeId: string, dto: UpdateResourceTypeDto): Promise<ResourceTypeView> {
    const current = await this.require(spaceId, typeId);
    const data: Record<string, unknown> = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.recommendedTagKeys !== undefined) data.recommendedTagKeys = stringifyJson(dto.recommendedTagKeys);

    const freezesMeasure = (['unit', 'numericScale', 'divisible', 'allowNegative'] as const).filter(
      (field) => dto[field] !== undefined,
    );
    if (current.inUse && freezesMeasure.length > 0) {
      throw new AppError(
        ErrorCodes.TYPE_IN_USE,
        '该类型已有资源实例，影响既有数据口径的要素不可修改，只能停用旧类型并新建',
        { fields: freezesMeasure },
        409,
      );
    }
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.numericScale !== undefined) data.numericScale = dto.numericScale;
    if (dto.divisible !== undefined) data.divisible = dto.divisible;
    if (dto.allowNegative !== undefined) data.allowNegative = dto.allowNegative;

    if (dto.sourceKinds !== undefined) {
      assertKindsAllowed(dto.sourceKinds, SOURCE_KINDS, '来源方式');
      data.sourceKinds = stringifyJson(dto.sourceKinds);
    }
    if (dto.sinkKinds !== undefined) {
      assertKindsAllowed(dto.sinkKinds, SINK_KINDS, '去向方式');
      data.sinkKinds = stringifyJson(dto.sinkKinds);
    }

    if (dto.attrSchema !== undefined) {
      const currentSchema = parseJson<AttributeDef[]>(current.attrSchema, []);
      const { schema, issues } = normalizeAttrSchema(dto.attrSchema);
      if (issues.length > 0) {
        throw new AppError(ErrorCodes.INVALID_ATTRIBUTE, '属性模式定义不合法', { issues });
      }
      if (current.inUse) this.assertAttributesEvolvable(currentSchema, schema);
      data.attrSchema = stringifyJson(schema);
    }

    const entity = await this.prisma.resourceType.update({ where: { id: typeId }, data });
    const domainNames = await this.domainNameMap(spaceId);
    const count = await this.prisma.resource.count({ where: { spaceId, typeId } });
    return this.toView(entity, domainNames.get(entity.domainId) ?? '', count);
  }

  /** 供模板派生流程复用：直接落库并返回实体。 */
  async insertType(
    spaceId: string,
    input: {
      code: string;
      name: string;
      domainId: string;
      description?: string;
      unit: string;
      numericScale?: number;
      divisible?: boolean;
      allowNegative?: boolean;
      attrSchema?: AttributeDef[];
      sourceKinds?: string[];
      sinkKinds?: string[];
      recommendedTagKeys?: string[];
      origin?: string;
      templateId?: string | null;
    },
  ) {
    return this.prisma.resourceType.create({
      data: {
        id: newId('rt'),
        spaceId,
        domainId: input.domainId,
        code: input.code,
        name: input.name,
        description: input.description ?? '',
        unit: input.unit,
        numericScale: input.numericScale ?? 0,
        divisible: input.divisible ?? true,
        allowNegative: input.allowNegative ?? false,
        attrSchema: stringifyJson(input.attrSchema ?? []),
        sourceKinds: stringifyJson(input.sourceKinds ?? ['manual']),
        sinkKinds: stringifyJson(input.sinkKinds ?? ['manual']),
        recommendedTagKeys: stringifyJson(input.recommendedTagKeys ?? []),
        origin: input.origin ?? 'custom',
        templateId: input.templateId ?? null,
      },
    });
  }

  /** 标记类型已被使用，冻结影响口径的要素。 */
  async markInUse(typeId: string): Promise<void> {
    await this.prisma.resourceType.update({ where: { id: typeId }, data: { inUse: true } });
  }

  private assertAttributesEvolvable(current: AttributeDef[], next: AttributeDef[]): void {
    const frozen = current.map((def) => def.key);
    const removed = frozen.filter((key) => !next.some((def) => def.key === key));
    if (removed.length > 0) {
      throw new AppError(ErrorCodes.TYPE_IN_USE, '已有资源实例的类型只能新增属性，不能删除既有属性', {
        removed,
      }, 409);
    }
    const changed = current
      .filter((def) => {
        const target = next.find((item) => item.key === def.key);
        return !target || target.valueType !== def.valueType;
      })
      .map((def) => def.key);
    if (changed.length > 0) {
      throw new AppError(ErrorCodes.TYPE_IN_USE, '已有资源实例的类型不能改变既有属性的值类型', {
        changed,
      }, 409);
    }
  }

  private async domainNameMap(spaceId: string): Promise<Map<string, string>> {
    const domains = await this.prisma.domain.findMany({ where: { spaceId } });
    return new Map(domains.map((domain) => [domain.id, domain.name]));
  }

  toView(row: ResourceTypeRow, domainName: string, resourceCount: number): ResourceTypeView {
    const attrSchema = parseJson<AttributeDef[]>(row.attrSchema, []);
    return {
      id: row.id,
      spaceId: row.spaceId,
      domainId: row.domainId,
      domainName,
      code: row.code,
      name: row.name,
      description: row.description,
      unit: row.unit,
      numericScale: row.numericScale,
      divisible: row.divisible,
      allowNegative: row.allowNegative,
      attrSchema,
      sourceKinds: parseJson<string[]>(row.sourceKinds, []),
      sinkKinds: parseJson<string[]>(row.sinkKinds, []),
      recommendedTagKeys: parseJson<string[]>(row.recommendedTagKeys, []),
      origin: row.origin,
      templateId: row.templateId,
      status: row.status,
      inUse: row.inUse,
      resourceCount,
      fieldCount: attrSchema.length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
