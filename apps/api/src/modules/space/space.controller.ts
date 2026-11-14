import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth.guard';
import { ListQuery } from '../../common/pagination';
import { CreateSpaceDto, SpaceListResponse, SpaceResponse, UpdateSpaceDto } from './space.dto';
import { SpaceService } from './space.service';

/** 空间资源：标准 CRUD，响应裸对象/裸列表（无信封）。 */
@ApiTags('spaces')
@Controller('spaces')
export class SpaceController {
  constructor(private readonly spaces: SpaceService) {}

  @Get()
  @ApiOperation({ summary: '查询空间列表' })
  @ApiOkResponse({ type: SpaceListResponse })
  async list(@Query() query: ListQuery, @Req() req: AuthenticatedRequest) {
    return this.spaces.list(query, req.user!.id);
  }

  @Post()
  @ApiOperation({ summary: '创建空间' })
  @ApiOkResponse({ type: SpaceResponse })
  async create(@Body() dto: CreateSpaceDto, @Req() req: AuthenticatedRequest) {
    return this.spaces.create(dto, req.user!.id);
  }

  @Get(':spaceId')
  @ApiOperation({ summary: '查询空间详情' })
  @ApiOkResponse({ type: SpaceResponse })
  async detail(@Param('spaceId') spaceId: string) {
    return this.spaces.detail(spaceId);
  }

  @Patch(':spaceId')
  @ApiOperation({ summary: '更新空间' })
  @ApiOkResponse({ type: SpaceResponse })
  async update(@Param('spaceId') spaceId: string, @Body() dto: UpdateSpaceDto) {
    return this.spaces.update(spaceId, dto);
  }
}
