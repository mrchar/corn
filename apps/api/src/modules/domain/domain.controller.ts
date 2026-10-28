import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ListQuery } from '../../common/pagination';
import { success } from '../../common/response';
import { CreateDomainDto } from './domain.dto';
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
}
