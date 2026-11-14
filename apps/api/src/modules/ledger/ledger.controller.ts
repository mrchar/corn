import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SpaceScopedRequest } from '../../common/space.guard';
import {
  ConsumptionResponse,
  CreateConsumptionDto,
  CreateCreationDto,
  CreateReservationDto,
  CreationResponse,
  LedgerEntryListResponse,
  LedgerListQuery,
  ReservationListQuery,
  ReservationListResponse,
  ReservationResponse,
  UpdateReservationDto,
} from './ledger.dto';
import { LedgerService } from './ledger.service';

/**
 * 流转域的一资源一控制器：tag 即资源名，与路径一一对应，避免类名兜底 tag 污染资源名。
 * URL 纯名词、无动词：注入/占用/花费 = 创建记录资源；释放/结算 = 更新占用记录的状态属性。
 * 响应均为裸对象/裸列表（无信封）。
 */

@ApiTags('creations')
@Controller('spaces/:spaceId/creations')
export class CreationController {
  constructor(private readonly ledger: LedgerService) {}

  @Post()
  @ApiOperation({ summary: '创建注入记录' })
  @ApiOkResponse({ type: CreationResponse })
  async create(@Param('spaceId') spaceId: string, @Req() req: SpaceScopedRequest, @Body() dto: CreateCreationDto) {
    return this.ledger.createCreation(spaceId, req.actorId, dto);
  }
}

@ApiTags('reservations')
@Controller('spaces/:spaceId/reservations')
export class ReservationController {
  constructor(private readonly ledger: LedgerService) {}

  @Post()
  @ApiOperation({ summary: '创建占用记录' })
  @ApiOkResponse({ type: ReservationResponse })
  async create(@Param('spaceId') spaceId: string, @Req() req: SpaceScopedRequest, @Body() dto: CreateReservationDto) {
    return this.ledger.createReservation(spaceId, req.actorId, dto);
  }

  @Get()
  @ApiOperation({ summary: '查询占用记录列表' })
  @ApiOkResponse({ type: ReservationListResponse })
  async list(@Param('spaceId') spaceId: string, @Query() query: ReservationListQuery) {
    return this.ledger.listReservations(spaceId, query.resourceId, query, query.status);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新占用记录（释放/结算）' })
  @ApiOkResponse({ type: ReservationResponse })
  async update(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Req() req: SpaceScopedRequest,
    @Body() dto: UpdateReservationDto,
  ) {
    return this.ledger.updateReservation(spaceId, req.actorId, id, dto);
  }
}

@ApiTags('consumptions')
@Controller('spaces/:spaceId/consumptions')
export class ConsumptionController {
  constructor(private readonly ledger: LedgerService) {}

  @Post()
  @ApiOperation({ summary: '创建花费记录' })
  @ApiOkResponse({ type: ConsumptionResponse })
  async create(@Param('spaceId') spaceId: string, @Req() req: SpaceScopedRequest, @Body() dto: CreateConsumptionDto) {
    return this.ledger.createConsumption(spaceId, req.actorId, dto);
  }
}

@ApiTags('ledger')
@Controller('spaces/:spaceId/ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  @ApiOperation({ summary: '查询流转明细列表' })
  @ApiOkResponse({ type: LedgerEntryListResponse })
  async list(@Param('spaceId') spaceId: string, @Query() query: LedgerListQuery) {
    return this.ledger.listEntries(spaceId, query.resourceId, query);
  }
}
