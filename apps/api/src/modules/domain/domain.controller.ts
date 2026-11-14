import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListQuery } from '../../common/pagination';
import { CreateDomainDto, DomainListResponse, DomainResponse, UpdateDomainDto } from './domain.dto';
import { DomainService } from './domain.service';

/** 领域资源：标准 CRUD，响应裸对象/裸列表（无信封）。 */
@ApiTags('domains')
@Controller('spaces/:spaceId/domains')
export class DomainController {
  constructor(private readonly domains: DomainService) {}

  @Get()
  @ApiOperation({ summary: '查询领域列表' })
  @ApiOkResponse({ type: DomainListResponse })
  async list(@Param('spaceId') spaceId: string, @Query() query: ListQuery) {
    return this.domains.list(spaceId, query);
  }

  @Post()
  @ApiOperation({ summary: '创建领域' })
  @ApiOkResponse({ type: DomainResponse })
  async create(@Param('spaceId') spaceId: string, @Body() dto: CreateDomainDto) {
    return this.domains.create(spaceId, dto);
  }

  @Get(':domainId')
  @ApiOperation({ summary: '查询领域详情' })
  @ApiOkResponse({ type: DomainResponse })
  async detail(@Param('spaceId') spaceId: string, @Param('domainId') domainId: string) {
    return this.domains.detail(spaceId, domainId);
  }

  @Patch(':domainId')
  @ApiOperation({ summary: '更新领域' })
  @ApiOkResponse({ type: DomainResponse })
  async update(
    @Param('spaceId') spaceId: string,
    @Param('domainId') domainId: string,
    @Body() dto: UpdateDomainDto,
  ) {
    return this.domains.update(spaceId, domainId, dto);
  }

  @Delete(':domainId')
  @ApiOperation({ summary: '删除领域' })
  @ApiOkResponse({ description: '删除成功' })
  async remove(@Param('spaceId') spaceId: string, @Param('domainId') domainId: string) {
    await this.domains.remove(spaceId, domainId);
  }
}
