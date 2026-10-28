import { Injectable } from '@nestjs/common';
import { AttributeDef } from '../../common/attribute';
import { PrismaService } from '../../prisma/prisma.service';
import { ResourceTypeService } from '../resource-type/resource-type.service';

/**
 * 按空间动态生成 OpenAPI 3.0.3 文档。
 * 每个资源类型对应一组 REST 路径 + 一个 tag，tag 名为类型名称，路径段用类型编码。
 * 前端组件库据此自动派生列表列、表单字段与操作。
 */
@Injectable()
export class MetadataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly types: ResourceTypeService,
  ) {}

  async generate(spaceId: string): Promise<Record<string, unknown>> {
    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });
    if (!space) return this.emptyDoc(spaceId);

    const { list: typeList } = await this.types.list(spaceId, { pageSize: 200 });
    const paths: Record<string, unknown> = {};
    const schemas: Record<string, unknown> = {};
    const tags: { name: string; description: string }[] = [];

    for (const type of typeList) {
      if (type.status !== 'active') continue;
      const code = type.code;
      tags.push({ name: type.name, description: type.description || `${type.name}（${code}）` });

      const requestSchema = this.buildRequestSchema(type);
      const responseSchema = this.buildResponseSchema(type);
      const listSchema = {
        type: 'object',
        properties: {
          list: { type: 'array', items: { $ref: `#/components/schemas/${code}_Resource` } },
          total: { type: 'integer' },
        },
      };

      schemas[`${code}_CreateBody`] = requestSchema;
      schemas[`${code}_Resource`] = responseSchema;
      schemas[`${code}_List`] = listSchema;

      paths[`/${code}`] = {
        get: {
          tags: [type.name],
          summary: `查询${type.name}列表`,
          parameters: this.listParameters(type),
          responses: {
            '200': {
              description: '查询成功',
              content: { 'application/json': { schema: { $ref: `#/components/schemas/${code}_List` } } },
            },
          },
        },
        post: {
          tags: [type.name],
          summary: `创建${type.name}`,
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: `#/components/schemas/${code}_CreateBody` } } },
          },
          responses: {
            '200': {
              description: '创建成功',
              content: { 'application/json': { schema: this.actionResultSchema(responseSchema) } },
            },
          },
        },
      };

      paths[`/${code}/{id}`] = {
        get: {
          tags: [type.name],
          summary: `查询${type.name}详情`,
          parameters: [this.idParameter()],
          responses: {
            '200': {
              description: '查询成功',
              content: { 'application/json': { schema: this.actionResultSchema(responseSchema) } },
            },
          },
        },
        patch: {
          tags: [type.name],
          summary: `更新${type.name}`,
          parameters: [this.idParameter()],
          requestBody: {
            content: { 'application/json': { schema: { $ref: `#/components/schemas/${code}_CreateBody` } } },
          },
          responses: {
            '200': {
              description: '更新成功',
              content: { 'application/json': { schema: this.actionResultSchema(responseSchema) } },
            },
          },
        },
        delete: {
          tags: [type.name],
          summary: `归档${type.name}`,
          parameters: [this.idParameter()],
          responses: {
            '200': {
              description: '归档成功',
              content: { 'application/json': { schema: this.actionResultSchema(responseSchema) } },
            },
          },
        },
      };
    }

    this.appendActionPaths(paths, schemas);

    return {
      openapi: '3.0.3',
      info: {
        title: `资源管理云服务 · ${space.name}`,
        version: '0.1.0',
        description: '由系统按空间当前可用资源类型动态生成。',
      },
      servers: [{ url: `/spaces/${spaceId}` }],
      tags,
      paths,
      components: { schemas },
    };
  }

  private emptyDoc(spaceId: string) {
    return {
      openapi: '3.0.3',
      info: { title: `资源管理云服务 · ${spaceId}`, version: '0.1.0' },
      servers: [{ url: `/spaces/${spaceId}` }],
      paths: {},
      components: { schemas: {} },
    };
  }

  private buildRequestSchema(type: { name: string; attrSchema: AttributeDef[] }) {
    const props: Record<string, unknown> = {
      domainId: { type: 'string', description: '归属领域 ID' },
      name: { type: 'string', description: '资源名称' },
      groupId: { type: 'string', description: '归属群组 ID（可选）' },
    };
    const required: string[] = ['domainId', 'name'];
    for (const def of type.attrSchema) {
      props[def.key] = this.attrToSchema(def);
      if (def.required) required.push(def.key);
    }
    return { type: 'object', properties: props, required };
  }

  private buildResponseSchema(type: { code: string; name: string; unit: string; attrSchema: AttributeDef[] }) {
    const props: Record<string, unknown> = {
      id: { type: 'string', description: 'ID', readOnly: true },
      name: { type: 'string', description: '资源名称' },
      typeId: { type: 'string', description: '资源类型 ID', readOnly: true },
      typeCode: { type: 'string', description: '类型编码', readOnly: true },
      typeName: { type: 'string', description: '类型名称', readOnly: true },
      unit: { type: 'string', description: '计量单位', readOnly: true },
      domainId: { type: 'string', description: '归属领域 ID' },
      domainName: { type: 'string', description: '归属领域名称', readOnly: true },
      groupId: { type: 'string', description: '归属群组 ID', readOnly: true, nullable: true },
      status: { type: 'string', enum: ['active', 'archived'], description: '状态' },
      total: { type: 'number', description: '总量', readOnly: true },
      reserved: { type: 'number', description: '已占用', readOnly: true },
      consumed: { type: 'number', description: '已消耗', readOnly: true },
      available: { type: 'number', description: '可用量', readOnly: true },
      createdAt: { type: 'string', format: 'date-time', description: '创建时间', readOnly: true },
      updatedAt: { type: 'string', format: 'date-time', description: '更新时间', readOnly: true },
    };
    for (const def of type.attrSchema) {
      props[def.key] = this.attrToSchema(def);
    }
    return { type: 'object', properties: props };
  }

  private attrToSchema(def: AttributeDef): Record<string, unknown> {
    const base: Record<string, unknown> = { description: def.description || def.label };
    switch (def.valueType) {
      case 'number':
        return { type: 'number', ...base };
      case 'boolean':
        return { type: 'boolean', ...base };
      case 'enum':
        return { type: 'string', enum: def.options ?? [], ...base };
      case 'text':
      default:
        return { type: 'string', ...base };
    }
  }

  private listParameters(type: { attrSchema: AttributeDef[] }) {
    return [
      { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '页码' },
      { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20 }, description: '每页数量' },
      { name: 'keyword', in: 'query', schema: { type: 'string' }, description: '关键词' },
      { name: 'sorter', in: 'query', schema: { type: 'string' }, description: '排序，如 createdAt,desc' },
      { name: 'domainId', in: 'query', schema: { type: 'string' }, description: '按领域筛选' },
      { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'archived'] }, description: '按状态筛选' },
      ...type.attrSchema.map((def) => ({
        name: def.key,
        in: 'query',
        schema: { type: def.valueType === 'number' ? 'number' : def.valueType === 'boolean' ? 'boolean' : 'string' },
        description: def.label,
      })),
    ];
  }

  private idParameter() {
    return { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: '资源 ID' };
  }

  private actionResultSchema(dataSchema: Record<string, unknown>) {
    return {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['success', 'error'] },
        message: { type: 'string' },
        data: dataSchema,
      },
    };
  }

  /** 动作型端点：创建 / 占用 / 释放 / 结算 / 花费 / 流转明细。 */
  private appendActionPaths(paths: Record<string, unknown>, schemas: Record<string, unknown>) {
    const creationReq = {
      type: 'object',
      required: ['resourceId', 'amount', 'sourceKind'],
      properties: {
        resourceId: { type: 'string', description: '资源 ID' },
        amount: { type: 'number', description: '数量' },
        sourceKind: { type: 'string', enum: ['manual', 'timed', 'event', 'builtin'], description: '来源类别' },
        reason: { type: 'string', description: '说明' },
        idempotencyKey: { type: 'string', description: '幂等键' },
      },
    };
    const reservationReq = {
      type: 'object',
      required: ['resourceId', 'amount'],
      properties: {
        resourceId: { type: 'string', description: '资源 ID' },
        amount: { type: 'number', description: '占用数量' },
        holderId: { type: 'string', description: '持有人' },
        purpose: { type: 'string', description: '用途' },
        holdUntil: { type: 'string', format: 'date-time', description: '持有期截止' },
      },
    };
    const releaseReq = {
      type: 'object',
      properties: { amount: { type: 'number', description: '释放数量（缺省为全部）' }, reason: { type: 'string' } },
    };
    const settleReq = {
      type: 'object',
      properties: { amount: { type: 'number', description: '结算数量（缺省为全部）' }, reason: { type: 'string' } },
    };
    const consumptionReq = {
      type: 'object',
      required: ['resourceId', 'amount', 'sinkKind'],
      properties: {
        resourceId: { type: 'string', description: '资源 ID' },
        amount: { type: 'number', description: '花费数量' },
        sinkKind: { type: 'string', enum: ['manual', 'wear', 'event', 'builtin'], description: '去向类别' },
        reason: { type: 'string', description: '说明' },
        idempotencyKey: { type: 'string', description: '幂等键' },
      },
    };

    schemas.CreationRequest = creationReq;
    schemas.ReservationRequest = reservationReq;
    schemas.ReleaseRequest = releaseReq;
    schemas.SettleRequest = settleReq;
    schemas.ConsumptionRequest = consumptionReq;

    paths['/creations'] = {
      post: {
        tags: ['流转'],
        summary: '创建（注入资源）',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreationRequest' } } } },
        responses: { '200': { description: '成功' } },
      },
    };
    paths['/reservations'] = {
      post: {
        tags: ['流转'],
        summary: '创建占用',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ReservationRequest' } } } },
        responses: { '200': { description: '成功' } },
      },
    };
    paths['/reservations/{id}/release'] = {
      post: {
        tags: ['流转'],
        summary: '释放占用',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ReleaseRequest' } } } },
        responses: { '200': { description: '成功' } },
      },
    };
    paths['/reservations/{id}/settle'] = {
      post: {
        tags: ['流转'],
        summary: '结算占用为花费',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/SettleRequest' } } } },
        responses: { '200': { description: '成功' } },
      },
    };
    paths['/consumptions'] = {
      post: {
        tags: ['流转'],
        summary: '直接花费',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ConsumptionRequest' } } } },
        responses: { '200': { description: '成功' } },
      },
    };
    paths['/resources/{resourceId}/ledger'] = {
      get: {
        tags: ['流转'],
        summary: '查询流转明细',
        parameters: [
          { name: 'resourceId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { '200': { description: '查询成功' } },
      },
    };
  }
}
