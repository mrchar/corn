import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  BuiltinTemplateListResponse,
  BuiltinTemplateResponse,
  UpdateBuiltinTemplateSettingDto,
} from './resource-type.dto';
import { TemplateService } from './template.service';

/**
 * 内建模板资源：只读集合 + 启用状态属性更新（PATCH）。
 * 派生不再是动词端点，已并入 POST /resource-types（创建资源类型的一种形态）。
 */
@ApiTags('builtin-templates')
@Controller('spaces/:spaceId/builtin-templates')
export class TemplateController {
  constructor(private readonly templates: TemplateService) {}

  @Get()
  @ApiOperation({ summary: '查询内建模板列表' })
  @ApiOkResponse({ type: BuiltinTemplateListResponse })
  async list(@Param('spaceId') spaceId: string) {
    return this.templates.list(spaceId);
  }

  @Get(':templateId')
  @ApiOperation({ summary: '查询内建模板详情' })
  @ApiOkResponse({ type: BuiltinTemplateResponse })
  async detail(@Param('spaceId') spaceId: string, @Param('templateId') templateId: string) {
    return this.templates.detail(spaceId, templateId);
  }

  @Patch(':templateId')
  @ApiOperation({ summary: '更新内建模板启用状态' })
  @ApiOkResponse({ type: BuiltinTemplateResponse })
  async setEnabled(
    @Param('spaceId') spaceId: string,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateBuiltinTemplateSettingDto,
  ) {
    return this.templates.setEnabled(spaceId, templateId, dto.enabled);
  }
}
