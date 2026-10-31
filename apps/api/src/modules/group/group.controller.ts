import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ListQuery } from '../../common/pagination';
import { success } from '../../common/response';
import { CreateGroupDto, UpdateGroupDto } from './group.dto';
import { GroupService } from './group.service';

@Controller('spaces/:spaceId/groups')
export class GroupController {
  constructor(private readonly groups: GroupService) {}

  @Get()
  async list(@Param('spaceId') spaceId: string, @Query() query: ListQuery) {
    return this.groups.list(spaceId, query);
  }

  @Post()
  async create(@Param('spaceId') spaceId: string, @Body() dto: CreateGroupDto) {
    return success('群组已创建', await this.groups.create(spaceId, dto));
  }

  @Get(':groupId')
  async detail(@Param('spaceId') spaceId: string, @Param('groupId') groupId: string) {
    return success('查询成功', await this.groups.detail(spaceId, groupId));
  }

  @Patch(':groupId')
  async update(
    @Param('spaceId') spaceId: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return success('群组已更新', await this.groups.update(spaceId, groupId, dto));
  }

  @Delete(':groupId')
  async remove(@Param('spaceId') spaceId: string, @Param('groupId') groupId: string) {
    await this.groups.remove(spaceId, groupId);
    return success('群组已删除');
  }
}
