import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ListQuery } from '../../common/pagination';
import { success } from '../../common/response';
import type { SpaceScopedRequest } from '../../common/space.guard';
import {
  CreateConsumptionDto,
  CreateCreationDto,
  CreateReservationDto,
  ReleaseReservationDto,
  SettleReservationDto,
} from './ledger.dto';
import { LedgerService } from './ledger.service';

@Controller('spaces/:spaceId')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Post('creations')
  async createCreation(@Param('spaceId') spaceId: string, @Req() req: SpaceScopedRequest, @Body() dto: CreateCreationDto) {
    return success('资源已注入', await this.ledger.createCreation(spaceId, req.actorId, dto));
  }

  @Post('reservations')
  async createReservation(@Param('spaceId') spaceId: string, @Req() req: SpaceScopedRequest, @Body() dto: CreateReservationDto) {
    return success('占用已创建', await this.ledger.createReservation(spaceId, req.actorId, dto));
  }

  @Post('reservations/:id/release')
  async releaseReservation(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Req() req: SpaceScopedRequest,
    @Body() dto: ReleaseReservationDto,
  ) {
    return success('占用已释放', await this.ledger.releaseReservation(spaceId, req.actorId, id, dto));
  }

  @Post('reservations/:id/settle')
  async settleReservation(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Req() req: SpaceScopedRequest,
    @Body() dto: SettleReservationDto,
  ) {
    return success('占用已结算为花费', await this.ledger.settleReservation(spaceId, req.actorId, id, dto));
  }

  @Post('consumptions')
  async createConsumption(@Param('spaceId') spaceId: string, @Req() req: SpaceScopedRequest, @Body() dto: CreateConsumptionDto) {
    return success('花费已登记', await this.ledger.createConsumption(spaceId, req.actorId, dto));
  }

  @Get('resources/:resourceId/ledger')
  async listEntries(
    @Param('spaceId') spaceId: string,
    @Param('resourceId') resourceId: string,
    @Query() query: ListQuery,
  ) {
    return this.ledger.listEntries(spaceId, resourceId, query);
  }

  @Get('resources/:resourceId/reservations')
  async listReservations(
    @Param('spaceId') spaceId: string,
    @Param('resourceId') resourceId: string,
    @Query() query: ListQuery,
  ) {
    return this.ledger.listReservations(spaceId, resourceId, query);
  }
}
