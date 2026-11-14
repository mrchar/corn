import { Injectable } from '@nestjs/common';
import { AttributeDef } from '../../common/attribute';
import { PrismaService } from '../../prisma/prisma.service';
import { ResourceTypeService } from '../resource-type/resource-type.service';
import { baseDocument } from './base-document';

type Json = Record<string, unknown>;

/**
 * 空间级 OpenAPI 文档 = 注解生成的基础文档（SwaggerModule 产出）按空间裁剪
 * + 数据库元数据描述的用户自定义资源类型。
 *
 * 前者不手写：控制器/数据模型的注解即文档；后者只能在运行期由元数据派生，
 * 因此仍以 JSON 结构拼装（且统一挂在同一套 REST 约定下）。
 */
@Injectable()
export class MetadataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly types: ResourceTypeService,
  ) {}

  async generate(spaceId: string): Promise<Record<string, unknown>> {
    const base = this.cloneBase();
    const prefix = `/spaces/${spaceId}`;
    const sourcePaths = (base.paths ?? {}) as Record<string, Json>;
    const paths: Record<string, Json> = {};
    const schemas: Record<string, Json> = { ...(base.componentsSchemas ?? {}) };
    const tags: Json[] = [...((base.tags as Json[] | undefined) ?? [])];

    /* 基础文档中的空间级静态资源路径：/spaces/{spaceId}/xxx → /spaces/{实际空间}/xxx */
    for (const [path, item] of Object.entries(sourcePaths)) {
      if (!path.startsWith('/spaces/{spaceId}/')) continue;
      const tail = path.slice('/spaces/{spaceId}'.length);
      if (tail.startsWith('/{typeCode}') || tail === '/openapi.json') continue;
      paths[prefix + tail] = item;
    }

    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });

    /* 动态资源类型：元数据 → 路径/模型/tag */
    if (space) {
      const { list } = await this.types.list(spaceId, { pageSize: 200 });
      for (const type of list) {
        if (type.status !== 'active') continue;
        const code = type.code;
        this.appendDynamic(paths, schemas, tags, prefix, type);
      }
    }

    return {
      ...base,
      info: { ...(base.info as Json), title: `资源管理云服务 · ${space?.name ?? spaceId}` },
      servers: [{ url: '/' }],
      tags,
      paths,
      components: { ...(base.components as Json), schemas },
    };
  }

  /** 全局文档：顶层资源（spaces/users/sessions），直接取自注解文档的对应路径。 */
  generateGlobal(): Record<string, unknown> {
    const base = this.cloneBase();
    const allow = new Set(['/spaces', '/spaces/{spaceId}', '/users', '/users/{id}', '/sessions', '/sessions/{id}']);
    const paths = Object.fromEntries(
      Object.entries((base.paths ?? {}) as Record<string, Json>).filter(([path]) => allow.has(path)),
    );
    return {
      ...base,
      info: { ...(base.info as Json), title: '资源管理云服务 · 全局' },
      servers: [{ url: '/' }],
      paths,
    };
  }

  /** 深拷贝基础文档，避免调用方改写缓存；components.schemas 拍平到组件层内部使用 */
  private cloneBase(): Json & { componentsSchemas: Record<string, Json> } {
    const cloned = JSON.parse(JSON.stringify(baseDocument())) as Json;
    const components = (cloned.components ?? {}) as Json;
    return { ...cloned, componentsSchemas: (components.schemas ?? {}) as Record<string, Json> };
  }

  /** 单个资源类型的一组 REST 路径（集合/单项），tag 中文名即前端资源名 */
  private appendDynamic(
    paths: Record<string, Json>,
    schemas: Record<string, Json>,
    tags: Json[],
    prefix: string,
    type: { code: string; name: string; description: string; unit: string; attrSchema: AttributeDef[] },
  ) {
    const code = type.code;
    tags.push({ name: type.name, description: type.description || `${type.name}（${code}）` });

    const requestSchema = this.buildRequestSchema(type);
    const responseSchema = this.buildResponseSchema(type);
    const listSchema = this.buildListSchema(type);
    schemas[`${code}_CreateBody`] = requestSchema;
    schemas[`${code}_Resource`] = responseSchema;
    schemas[`${code}_ListItem`] = listSchema;
    schemas[`${code}_List`] = {
      type: 'object',
      properties: {
        list: { type: 'array', items: { $ref: `#/components/schemas/${code}_ListItem` } },
        total: { type: 'integer' },
      },
    };

    const resourceRef = { $ref: `#/components/schemas/${code}_Resource` };
    const bodyRef = { $ref: `#/components/schemas/${code}_CreateBody` };
    const ok = (schema: unknown) => ({ description: '成功', content: { 'application/json': { schema } } });

    paths[`${prefix}/${code}`] = {
      get: {
        tags: [type.name],
        summary: `查询${type.name}列表`,
        parameters: this.listParameters(type),
        responses: { '200': ok({ $ref: `#/components/schemas/${code}_List` }) },
      },
      post: {
        tags: [type.name],
        summary: `创建${type.name}`,
        requestBody: { required: true, content: { 'application/json': { schema: bodyRef } } },
        responses: { '200': ok(resourceRef) },
      },
    };

    paths[`${prefix}/${code}/{id}`] = {
      get: {
        tags: [type.name],
        summary: `查询${type.name}详情`,
        parameters: [this.idParameter()],
        responses: { '200': ok(resourceRef) },
      },
      patch: {
        tags: [type.name],
        summary: `更新${type.name}`,
        parameters: [this.idParameter()],
        requestBody: { content: { 'application/json': { schema: bodyRef } } },
        responses: { '200': ok(resourceRef) },
      },
      delete: {
        tags: [type.name],
        summary: `归档${type.name}`,
        parameters: [this.idParameter()],
        responses: { '200': ok(resourceRef) },
      },
    };
  }

  private buildRequestSchema(type: { attrSchema: AttributeDef[] }) {
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

  /** 列表项投影：仅声明列表展示字段（运行时仍返回完整对象），前端列定义由此生成 */
  private buildListSchema(type: { attrSchema: AttributeDef[] }) {
    const props: Record<string, unknown> = {
      name: { type: 'string', description: '资源名称' },
      typeName: { type: 'string', description: '类型名称', readOnly: true },
      unit: { type: 'string', description: '计量单位', readOnly: true },
      domainName: { type: 'string', description: '归属领域名称', readOnly: true },
      status: { type: 'string', enum: ['active', 'archived'], description: '状态' },
      total: { type: 'number', description: '总量', readOnly: true },
      reserved: { type: 'number', description: '已占用', readOnly: true },
      consumed: { type: 'number', description: '已消耗', readOnly: true },
      available: { type: 'number', description: '可用量', readOnly: true },
    };
    for (const def of type.attrSchema) {
      props[def.key] = this.attrToSchema(def);
    }
    return { type: 'object', properties: props };
  }

  private buildResponseSchema(type: { attrSchema: AttributeDef[] }) {
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
}
