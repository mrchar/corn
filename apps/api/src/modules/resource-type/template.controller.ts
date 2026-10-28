import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { success } from '../../common/response';
import { DeriveFromTemplateDto, UpdateBuiltinTemplateSettingDto } from './resource-type.dto';
import { TemplateService } from './template.service';

@Controller('spaces/:spaceId/builtin-templates')
export class TemplateController {
  constructor(private readonly templates: TemplateService) {}

  @Get()
  async list(@Param('spaceId') spaceId: string) {
    return this.templates.list(spaceId);
  }

  @Patch(':templateId')
  async setEnabled(
    @Param('spaceId') spaceId: string,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateBuiltinTemplateSettingDto,
  ) {
    return success(dto.enabled ? '内建模板已启用' : '内建模板已停用', await this.templates.setEnabled(spaceId, templateId, dto.enabled));
  }

  @Post(':templateId/derive')
  async derive(
    @Param('spaceId') spaceId: string,
    @Param('templateId') templateId: string,
    @Body() dto: DeriveFromTemplateDto,
  ) {
    return success(dto.mode === 'rewrite' ? '已据模板改写资源类型' : '已据模板继承资源类型', await this.templates.derive(spaceId, templateId, dto));
  }
}
