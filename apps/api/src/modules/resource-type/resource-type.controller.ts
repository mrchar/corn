import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateResourceTypeDto, ResourceTypeListQuery, ResourceTypeListResponse, ResourceTypeResponse, UpdateResourceTypeDto } from './resource-type.dto';
import { ResourceTypeService } from './resource-type.service';
import { TemplateService } from './template.service';

/** 资源类型：标准 CRUD；派生 = 创建时携带模板 ID，不设独立动词端点。 */
@ApiTags('resource-types')
@Controller('spaces/:spaceId/resource-types')
export class ResourceTypeController {
  constructor(
    private readonly types: ResourceTypeService,
    private readonly templates: TemplateService,
  ) {}

  @Get()
  @ApiOperation({ summary: '查询资源类型列表' })
  @ApiOkResponse({ type: ResourceTypeListResponse })
  async list(@Param('spaceId') spaceId: string, @Query() query: ResourceTypeListQuery) {
    return this.types.list(spaceId, query);
  }

  @Post()
  @ApiOperation({ summary: '创建资源类型（携带 templateId 时按模板派生）' })
  @ApiOkResponse({ type: ResourceTypeResponse })
  async create(@Param('spaceId') spaceId: string, @Body() dto: CreateResourceTypeDto) {
    if (dto.templateId) {
      return this.templates.derive(spaceId, dto.templateId, { ...dto, mode: dto.mode ?? 'inherit' });
    }
    return this.types.create(spaceId, dto);
  }

  @Get(':typeId')
  @ApiOperation({ summary: '查询资源类型详情' })
  @ApiOkResponse({ type: ResourceTypeResponse })
  async detail(@Param('spaceId') spaceId: string, @Param('typeId') typeId: string) {
    return this.types.detail(spaceId, typeId);
  }

  @Patch(':typeId')
  @ApiOperation({ summary: '更新资源类型' })
  @ApiOkResponse({ type: ResourceTypeResponse })
  async update(
    @Param('spaceId') spaceId: string,
    @Param('typeId') typeId: string,
    @Body() dto: UpdateResourceTypeDto,
  ) {
    return this.types.update(spaceId, typeId, dto);
  }
}
