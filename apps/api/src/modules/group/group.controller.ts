import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListQuery } from '../../common/pagination';
import { CreateGroupDto, GroupListResponse, GroupResponse, UpdateGroupDto } from './group.dto';
import { GroupService } from './group.service';

/** 群组资源：标准 CRUD，响应裸对象/裸列表（无信封）。 */
@ApiTags('groups')
@Controller('spaces/:spaceId/groups')
export class GroupController {
  constructor(private readonly groups: GroupService) {}

  @Get()
  @ApiOperation({ summary: '查询群组列表' })
  @ApiOkResponse({ type: GroupListResponse })
  async list(@Param('spaceId') spaceId: string, @Query() query: ListQuery) {
    return this.groups.list(spaceId, query);
  }

  @Post()
  @ApiOperation({ summary: '创建群组' })
  @ApiOkResponse({ type: GroupResponse })
  async create(@Param('spaceId') spaceId: string, @Body() dto: CreateGroupDto) {
    return this.groups.create(spaceId, dto);
  }

  @Get(':groupId')
  @ApiOperation({ summary: '查询群组详情' })
  @ApiOkResponse({ type: GroupResponse })
  async detail(@Param('spaceId') spaceId: string, @Param('groupId') groupId: string) {
    return this.groups.detail(spaceId, groupId);
  }

  @Patch(':groupId')
  @ApiOperation({ summary: '更新群组' })
  @ApiOkResponse({ type: GroupResponse })
  async update(
    @Param('spaceId') spaceId: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groups.update(spaceId, groupId, dto);
  }

  @Delete(':groupId')
  @ApiOperation({ summary: '删除群组' })
  @ApiOkResponse({ description: '删除成功' })
  async remove(@Param('spaceId') spaceId: string, @Param('groupId') groupId: string) {
    await this.groups.remove(spaceId, groupId);
  }
}
