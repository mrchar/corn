import { Injectable } from '@nestjs/common';
import { parseJson } from '../../common/json';
import { roundTo } from '../../common/amount';
import { AppError, ErrorCodes } from '../../common/errors';
import { newId } from '../../common/ids';
import { ListQuery, resolvePaging } from '../../common/pagination';
import { listResult, ListResult } from '../../common/response';
import { PrismaService } from '../../prisma/prisma.service';
import { ResourceService } from '../resource/resource.service';
import { ResourceTypeService } from '../resource-type/resource-type.service';
import {
  CreateConsumptionDto,
  CreateCreationDto,
  CreateReservationDto,
  ReleaseReservationDto,
  SettleReservationDto,
} from './ledger.dto';

export interface LedgerEntryView {
  id: string;
  spaceId: string;
  resourceId: string;
  resourceName: string;
  kind: string;
  amount: number;
  totalDelta: number;
  reservedDelta: number;
  consumedDelta: number;
  sourceKind: string | null;
  sinkKind: string | null;
  triggerKind: string;
  actorId: string | null;
  reason: string | null;
  reservationId: string | null;
  idempotencyKey: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface ReservationView {
  id: string;
  spaceId: string;
  resourceId: string;
  amount: number;
  status: string;
  holderId: string | null;
  purpose: string | null;
  holdUntil: string | null;
  releasedAmount: number;
  settledAmount: number;
  createdAt: string;
  updatedAt: string;
}

/** 账本层只需要资源类型的口径与允许的来源/去向类别。 */
interface ResourceTypeRuntime {
  numericScale: number;
  allowNegative: boolean;
  sourceKinds: string[];
  sinkKinds: string[];
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resources: ResourceService,
    private readonly types: ResourceTypeService,
  ) {}

  /** 创建 / 注入：总量与可用量同时增加。 */
  async createCreation(spaceId: string, actorId: string | undefined, dto: CreateCreationDto): Promise<LedgerEntryView> {
    const { resourceId, amount, sourceKind, reason, idempotencyKey } = dto;
    await this.resources.require(spaceId, resourceId);
    const type = await this.typeOf(spaceId, resourceId);
    this.assertSourceAllowed(type, sourceKind);

    return this.prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.ledgerEntry.findFirst({ where: { spaceId, idempotencyKey } });
        if (existing) return this.toEntryView(existing, '');
      }
      const scaled = roundTo(amount, type.numericScale);
      const entry = await tx.ledgerEntry.create({
        data: {
          id: newId('le'),
          spaceId,
          resourceId,
          kind: 'creation',
          amount: scaled,
          totalDelta: scaled,
          sourceKind,
          triggerKind: 'manual',
          actorId,
          reason,
          idempotencyKey,
        },
      });
      return this.toEntryView(entry, '');
    });
  }

  /** 占用：冻结可用量，总量不变。 */
  async createReservation(spaceId: string, actorId: string | undefined, dto: CreateReservationDto): Promise<ReservationView> {
    const { resourceId, amount, holderId, purpose, holdUntil } = dto;
    await this.resources.require(spaceId, resourceId);
    const type = await this.typeOf(spaceId, resourceId);
    const scaled = roundTo(amount, type.numericScale);

    return this.prisma.$transaction(async (tx) => {
      const measures = await this.aggregateMeasures(tx, spaceId, resourceId);
      if (!type.allowNegative && measures.available < scaled) {
        throw new AppError(ErrorCodes.INSUFFICIENT_AVAILABLE, '可用量不足', {
          available: measures.available,
          requested: scaled,
        });
      }
      const reservation = await tx.reservation.create({
        data: {
          id: newId('rv'),
          spaceId,
          resourceId,
          amount: scaled,
          status: 'active',
          holderId: holderId ?? actorId ?? null,
          purpose,
          holdUntil: holdUntil ? new Date(holdUntil) : null,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          id: newId('le'),
          spaceId,
          resourceId,
          kind: 'reservation',
          amount: scaled,
          reservedDelta: scaled,
          triggerKind: 'manual',
          actorId,
          reason: purpose,
          reservationId: reservation.id,
        },
      });
      return this.toReservationView(reservation);
    });
  }

  /** 释放占用：归还可用量。 */
  async releaseReservation(spaceId: string, actorId: string | undefined, reservationId: string, dto: ReleaseReservationDto): Promise<ReservationView> {
    const reservation = await this.requireReservation(spaceId, reservationId);
    if (reservation.status !== 'active') {
      throw new AppError(ErrorCodes.RESERVATION_CLOSED, '占用已关闭，无法释放', { status: reservation.status }, 409);
    }
    const type = await this.typeOf(spaceId, reservation.resourceId);
    const remaining = reservation.amount - reservation.releasedAmount - reservation.settledAmount;
    const scaled = dto.amount === undefined ? remaining : roundTo(dto.amount, type.numericScale);
    if (scaled > remaining + 1e-9) {
      throw new AppError(ErrorCodes.RESERVATION_EXCEEDED, '释放量超过可用余额', {
        amount: scaled,
        remaining,
      });
    }
    if (scaled <= 0) return this.toReservationView(reservation);

    return this.prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.create({
        data: {
          id: newId('le'),
          spaceId,
          resourceId: reservation.resourceId,
          kind: 'release',
          amount: scaled,
          reservedDelta: -scaled,
          triggerKind: 'manual',
          actorId,
          reason: dto.reason,
          reservationId,
        },
      });
      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: { releasedAmount: reservation.releasedAmount + scaled },
      });
      const nowClosed = updated.releasedAmount + updated.settledAmount >= updated.amount - 1e-9;
      if (nowClosed) {
        await tx.reservation.update({ where: { id: reservationId }, data: { status: 'released' } });
        return this.toReservationView({ ...updated, status: 'released' });
      }
      return this.toReservationView(updated);
    });
  }

  /** 结算占用：将冻结的占用转为花费，计入已消耗。 */
  async settleReservation(spaceId: string, actorId: string | undefined, reservationId: string, dto: SettleReservationDto): Promise<ReservationView> {
    const reservation = await this.requireReservation(spaceId, reservationId);
    if (reservation.status !== 'active') {
      throw new AppError(ErrorCodes.RESERVATION_CLOSED, '占用已关闭，无法结算', { status: reservation.status }, 409);
    }
    const type = await this.typeOf(spaceId, reservation.resourceId);
    const remaining = reservation.amount - reservation.releasedAmount - reservation.settledAmount;
    const scaled = dto.amount === undefined ? remaining : roundTo(dto.amount, type.numericScale);
    if (scaled > remaining + 1e-9) {
      throw new AppError(ErrorCodes.RESERVATION_EXCEEDED, '结算量超过可用余额', { amount: scaled, remaining });
    }
    if (scaled <= 0) return this.toReservationView(reservation);

    return this.prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.create({
        data: {
          id: newId('le'),
          spaceId,
          resourceId: reservation.resourceId,
          kind: 'settle',
          amount: scaled,
          reservedDelta: -scaled,
          consumedDelta: scaled,
          sinkKind: 'manual',
          triggerKind: 'manual',
          actorId,
          reason: dto.reason,
          reservationId,
        },
      });
      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: { settledAmount: reservation.settledAmount + scaled },
      });
      const nowClosed = updated.releasedAmount + updated.settledAmount >= updated.amount - 1e-9;
      if (nowClosed) {
        await tx.reservation.update({ where: { id: reservationId }, data: { status: 'settled' } });
        return this.toReservationView({ ...updated, status: 'settled' });
      }
      return this.toReservationView(updated);
    });
  }

  /** 直接花费：可用量与总量口径上同时减少。 */
  async createConsumption(spaceId: string, actorId: string | undefined, dto: CreateConsumptionDto): Promise<LedgerEntryView> {
    const { resourceId, amount, sinkKind, reason, idempotencyKey } = dto;
    await this.resources.require(spaceId, resourceId);
    const type = await this.typeOf(spaceId, resourceId);
    this.assertSinkAllowed(type, sinkKind);

    return this.prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.ledgerEntry.findFirst({ where: { spaceId, idempotencyKey } });
        if (existing) return this.toEntryView(existing, '');
      }
      const measures = await this.aggregateMeasures(tx, spaceId, resourceId);
      const scaled = roundTo(amount, type.numericScale);
      if (!type.allowNegative && measures.available < scaled) {
        throw new AppError(ErrorCodes.INSUFFICIENT_AVAILABLE, '可用量不足', {
          available: measures.available,
          requested: scaled,
        });
      }
      const entry = await tx.ledgerEntry.create({
        data: {
          id: newId('le'),
          spaceId,
          resourceId,
          kind: 'consumption',
          amount: scaled,
          consumedDelta: scaled,
          sinkKind,
          triggerKind: 'manual',
          actorId,
          reason,
          idempotencyKey,
        },
      });
      return this.toEntryView(entry, '');
    });
  }

  async listEntries(spaceId: string, resourceId: string, query: ListQuery): Promise<ListResult<LedgerEntryView>> {
    const paging = resolvePaging(query);
    const where = { spaceId, resourceId };
    const [rows, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: paging.skip,
        take: paging.take,
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);
    return listResult(rows.map((row) => this.toEntryView(row, '')), total);
  }

  async listReservations(spaceId: string, resourceId: string, query: ListQuery): Promise<ListResult<ReservationView>> {
    const paging = resolvePaging(query);
    const where = { spaceId, resourceId };
    const [rows, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paging.skip,
        take: paging.take,
      }),
      this.prisma.reservation.count({ where }),
    ]);
    return listResult(rows.map((row) => this.toReservationView(row)), total);
  }

  private async typeOf(spaceId: string, resourceId: string): Promise<ResourceTypeRuntime> {
    const resource = await this.resources.require(spaceId, resourceId);
    const type = await this.types.require(spaceId, resource.typeId);
    return {
      numericScale: type.numericScale,
      allowNegative: type.allowNegative,
      sourceKinds: parseJson<string[]>(type.sourceKinds, []),
      sinkKinds: parseJson<string[]>(type.sinkKinds, []),
    };
  }

  private assertSourceAllowed(type: ResourceTypeRuntime, kind: string): void {
    if (!type.sourceKinds.includes(kind)) {
      throw new AppError(ErrorCodes.SOURCE_NOT_ALLOWED, `该资源类型不允许「${kind}」来源`, {
        sourceKind: kind,
        allowed: type.sourceKinds,
      });
    }
  }

  private assertSinkAllowed(type: ResourceTypeRuntime, kind: string): void {
    if (!type.sinkKinds.includes(kind)) {
      throw new AppError(ErrorCodes.SINK_NOT_ALLOWED, `该资源类型不允许「${kind}」去向`, {
        sinkKind: kind,
        allowed: type.sinkKinds,
      });
    }
  }

  private async aggregateMeasures(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    spaceId: string,
    resourceId: string,
  ): Promise<{ total: number; reserved: number; consumed: number; available: number }> {
    const rows = await tx.ledgerEntry.groupBy({
      by: ['resourceId'],
      where: { spaceId, resourceId },
      _sum: { totalDelta: true, reservedDelta: true, consumedDelta: true },
    });
    const row = rows[0];
    const total = row?._sum.totalDelta ?? 0;
    const reserved = row?._sum.reservedDelta ?? 0;
    const consumed = row?._sum.consumedDelta ?? 0;
    return { total, reserved, consumed, available: total - reserved - consumed };
  }

  private async requireReservation(spaceId: string, reservationId: string) {
    const reservation = await this.prisma.reservation.findFirst({ where: { id: reservationId, spaceId } });
    if (!reservation) throw new AppError(ErrorCodes.NOT_FOUND, '占用记录不存在', { reservationId }, 404);
    return reservation;
  }

  private toEntryView(
    row: {
      id: string;
      spaceId: string;
      resourceId: string;
      kind: string;
      amount: number;
      totalDelta: number;
      reservedDelta: number;
      consumedDelta: number;
      sourceKind: string | null;
      sinkKind: string | null;
      triggerKind: string;
      actorId: string | null;
      reason: string | null;
      reservationId: string | null;
      idempotencyKey: string | null;
      occurredAt: Date;
      createdAt: Date;
    },
    _resourceName: string,
  ): LedgerEntryView {
    return {
      id: row.id,
      spaceId: row.spaceId,
      resourceId: row.resourceId,
      resourceName: _resourceName,
      kind: row.kind,
      amount: row.amount,
      totalDelta: row.totalDelta,
      reservedDelta: row.reservedDelta,
      consumedDelta: row.consumedDelta,
      sourceKind: row.sourceKind,
      sinkKind: row.sinkKind,
      triggerKind: row.triggerKind,
      actorId: row.actorId,
      reason: row.reason,
      reservationId: row.reservationId,
      idempotencyKey: row.idempotencyKey,
      occurredAt: row.occurredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toReservationView(row: {
    id: string;
    spaceId: string;
    resourceId: string;
    amount: number;
    status: string;
    holderId: string | null;
    purpose: string | null;
    holdUntil: Date | null;
    releasedAmount: number;
    settledAmount: number;
    createdAt: Date;
    updatedAt: Date;
  }): ReservationView {
    return {
      id: row.id,
      spaceId: row.spaceId,
      resourceId: row.resourceId,
      amount: row.amount,
      status: row.status,
      holderId: row.holderId,
      purpose: row.purpose,
      holdUntil: row.holdUntil?.toISOString() ?? null,
      releasedAmount: row.releasedAmount,
      settledAmount: row.settledAmount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
