import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ListQuery } from '../../common/pagination';
import { success } from '../../common/response';
import { CreateResourceTypeDto, UpdateResourceTypeDto } from './resource-type.dto';
import { ResourceTypeService } from './resource-type.service';

@Controller('spaces/:spaceId/resource-types')
export class ResourceTypeController {
  constructor(private readonly types: ResourceTypeService) {}

  @Get()
  async list(@Param('spaceId') spaceId: string, @Query() query: ListQuery) {
    return this.types.list(spaceId, query);
  }

  @Post()
  async create(@Param('spaceId') spaceId: string, @Body() dto: CreateResourceTypeDto) {
    return success('资源类型已创建', await this.types.create(spaceId, dto));
  }

  @Get(':typeId')
  async detail(@Param('spaceId') spaceId: string, @Param('typeId') typeId: string) {
    return success('查询成功', await this.types.detail(spaceId, typeId));
  }

  @Patch(':typeId')
  async update(
    @Param('spaceId') spaceId: string,
    @Param('typeId') typeId: string,
    @Body() dto: UpdateResourceTypeDto,
  ) {
    return success('资源类型已更新', await this.types.update(spaceId, typeId, dto));
  }
}
