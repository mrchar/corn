import { Injectable } from '@nestjs/common';
import { AttributeDef, normalizeAttrSchema } from '../../common/attribute';
import { AppError, ErrorCodes } from '../../common/errors';
import { parseJson, stringifyJson } from '../../common/json';
import { listResult, ListResult } from '../../common/response';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainService } from '../domain/domain.service';
import { assertKindsAllowed, assertTypeCodeAvailable, SINK_KINDS, SOURCE_KINDS } from './resource-type.constants';
import { DeriveFromTemplateDto } from './resource-type.dto';
import { ResourceTypeService, ResourceTypeView } from './resource-type.service';

export interface BuiltinTemplateView {
  id: string;
  code: string;
  name: string;
  description: string;
  projectionSubject: string;
  unit: string;
  numericScale: number;
  divisible: boolean;
  allowNegative: boolean;
  attrSchema: AttributeDef[];
  sourceKinds: string[];
  sinkKinds: string[];
  recommendedTagKeys: string[];
  enabled: boolean;
  derivedTypeIds: string[];
}

@Injectable()
export class TemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domains: DomainService,
    private readonly types: ResourceTypeService,
  ) {}

  async list(spaceId: string): Promise<ListResult<BuiltinTemplateView>> {
    const [templates, settings, derived] = await Promise.all([
      this.prisma.builtinTemplate.findMany({ orderBy: { code: 'asc' } }),
      this.prisma.spaceTemplateSetting.findMany({ where: { spaceId } }),
      this.prisma.resourceType.findMany({ where: { spaceId, templateId: { not: null } } }),
    ]);
    const enabledMap = new Map(settings.map((row) => [row.templateId, row.enabled]));
    return listResult(
      templates.map((template) => ({
        id: template.id,
        code: template.code,
        name: template.name,
        description: template.description,
        projectionSubject: template.projectionSubject,
        unit: template.unit,
        numericScale: template.numericScale,
        divisible: template.divisible,
        allowNegative: template.allowNegative,
        attrSchema: parseJson<AttributeDef[]>(template.attrSchema, []),
        sourceKinds: parseJson<string[]>(template.sourceKinds, []),
        sinkKinds: parseJson<string[]>(template.sinkKinds, []),
        recommendedTagKeys: parseJson<string[]>(template.recommendedTagKeys, []),
        enabled: enabledMap.get(template.id) ?? false,
        derivedTypeIds: derived.filter((row) => row.templateId === template.id).map((row) => row.id),
      })),
      templates.length,
    );
  }

  async detail(spaceId: string, templateId: string): Promise<BuiltinTemplateView> {
    const all = await this.list(spaceId);
    const target = all.list.find((item) => item.id === templateId);
    if (!target) throw new AppError(ErrorCodes.NOT_FOUND, '内建模板不存在', { templateId }, 404);
    return target;
  }

  async setEnabled(spaceId: string, templateId: string, enabled: boolean): Promise<BuiltinTemplateView> {
    await this.requireTemplate(templateId);
    await this.prisma.spaceTemplateSetting.upsert({
      where: { spaceId_templateId: { spaceId, templateId } },
      create: { spaceId, templateId, enabled },
      update: { enabled },
    });
    const all = await this.list(spaceId);
    const target = all.list.find((item) => item.id === templateId);
    if (!target) throw new AppError(ErrorCodes.NOT_FOUND, '内建模板不存在', { templateId }, 404);
    return target;
  }

  /**
   * 据内建模板在领域内生成资源类型：
   * inherit —— 沿用模板定义；rewrite —— 在模板基础上改写，形成本领域自己的定义。
   */
  async derive(spaceId: string, templateId: string, dto: DeriveFromTemplateDto): Promise<ResourceTypeView> {
    const template = await this.requireTemplate(templateId);
    const setting = await this.prisma.spaceTemplateSetting.findUnique({
      where: { spaceId_templateId: { spaceId, templateId } },
    });
    if (!setting?.enabled) {
      throw new AppError(ErrorCodes.TYPE_DISABLED, '该内建模板在本空间未启用', { templateId }, 409);
    }
    await this.domains.require(spaceId, dto.domainId);

    const rewrite = dto.mode === 'rewrite';
    const code = rewrite ? dto.code ?? template.code : template.code;
    assertTypeCodeAvailable(code);

    const templateSchema = parseJson<AttributeDef[]>(template.attrSchema, []);
    let attrSchema = templateSchema;
    if (rewrite && dto.attrSchema !== undefined) {
      const normalized = normalizeAttrSchema(dto.attrSchema);
      if (normalized.issues.length > 0) {
        throw new AppError(ErrorCodes.INVALID_ATTRIBUTE, '属性模式定义不合法', { issues: normalized.issues });
      }
      attrSchema = normalized.schema;
    }
    if (!rewrite && dto.attrSchema !== undefined) {
      throw new AppError(ErrorCodes.VALIDATION_FAILED, '继承模式下不可覆盖模板定义，请改用改写模式', {});
    }

    const sourceKinds = rewrite ? dto.sourceKinds ?? parseJson<string[]>(template.sourceKinds, []) : parseJson<string[]>(template.sourceKinds, []);
    const sinkKinds = rewrite ? dto.sinkKinds ?? parseJson<string[]>(template.sinkKinds, []) : parseJson<string[]>(template.sinkKinds, []);
    assertKindsAllowed(sourceKinds, SOURCE_KINDS, '来源方式');
    assertKindsAllowed(sinkKinds, SINK_KINDS, '去向方式');

    const entity = await this.types.insertType(spaceId, {
      code,
      name: rewrite ? dto.name ?? `${template.name}（改写）` : template.name,
      domainId: dto.domainId,
      description: template.description,
      unit: rewrite ? dto.unit ?? template.unit : template.unit,
      numericScale: rewrite ? dto.numericScale ?? template.numericScale : template.numericScale,
      divisible: rewrite ? dto.divisible ?? template.divisible : template.divisible,
      allowNegative: rewrite ? dto.allowNegative ?? template.allowNegative : template.allowNegative,
      attrSchema,
      sourceKinds,
      sinkKinds,
      recommendedTagKeys: parseJson<string[]>(template.recommendedTagKeys, []),
      origin: rewrite ? 'builtin-rewritten' : 'builtin-inherited',
      templateId: rewrite ? null : template.id,
    });

    return this.types.detail(spaceId, entity.id);
  }

  private async requireTemplate(templateId: string) {
    const template = await this.prisma.builtinTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new AppError(ErrorCodes.NOT_FOUND, '内建模板不存在', { templateId }, 404);
    return template;
  }
}
