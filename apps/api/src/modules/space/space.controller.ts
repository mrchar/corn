import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ListQuery } from '../../common/pagination';
import { success } from '../../common/response';
import { CreateSpaceDto, UpdateSpaceDto } from './space.dto';
import { SpaceService } from './space.service';

@Controller('spaces')
export class SpaceController {
  constructor(private readonly spaces: SpaceService) {}

  @Get()
  async list(@Query() query: ListQuery) {
    return this.spaces.list(query);
  }

  @Post()
  async create(@Body() dto: CreateSpaceDto) {
    const space = await this.spaces.create(dto);
    return success('空间已创建', space);
  }

  @Get(':spaceId')
  async detail(@Param('spaceId') spaceId: string) {
    return success('查询成功', await this.spaces.detail(spaceId));
  }

  @Patch(':spaceId')
  async update(@Param('spaceId') spaceId: string, @Body() dto: UpdateSpaceDto) {
    return success('空间已更新', await this.spaces.update(spaceId, dto));
  }
}
