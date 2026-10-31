import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ListQuery } from '../../common/pagination';
import { success } from '../../common/response';
import { CreateDomainDto, UpdateDomainDto } from './domain.dto';
import { DomainService } from './domain.service';

@Controller('spaces/:spaceId/domains')
export class DomainController {
  constructor(private readonly domains: DomainService) {}

  @Get()
  async list(@Param('spaceId') spaceId: string, @Query() query: ListQuery) {
    return this.domains.list(spaceId, query);
  }

  @Post()
  async create(@Param('spaceId') spaceId: string, @Body() dto: CreateDomainDto) {
    return success('领域已创建', await this.domains.create(spaceId, dto));
  }

  @Get(':domainId')
  async detail(@Param('spaceId') spaceId: string, @Param('domainId') domainId: string) {
    return success('查询成功', await this.domains.detail(spaceId, domainId));
  }

  @Patch(':domainId')
  async update(
    @Param('spaceId') spaceId: string,
    @Param('domainId') domainId: string,
    @Body() dto: UpdateDomainDto,
  ) {
    return success('领域已更新', await this.domains.update(spaceId, domainId, dto));
  }

  @Delete(':domainId')
  async remove(@Param('spaceId') spaceId: string, @Param('domainId') domainId: string) {
    await this.domains.remove(spaceId, domainId);
    return success('领域已删除');
  }
}
