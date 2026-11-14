import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ListQuery } from '../../common/pagination';

export class CreateCreationDto {
  @ApiProperty({ description: '资源 ID' })
  @IsString()
  resourceId: string;

  @ApiProperty({ description: '数量' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ description: '来源类别', enum: ['manual', 'timed', 'event', 'builtin'] })
  @IsIn(['manual', 'timed', 'event', 'builtin'])
  sourceKind: string;

  @ApiPropertyOptional({ description: '说明' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: '幂等键（可选）' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class CreateReservationDto {
  @ApiProperty({ description: '资源 ID' })
  @IsString()
  resourceId: string;

  @ApiProperty({ description: '占用数量' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ description: '持有人（可选）' })
  @IsOptional()
  @IsString()
  holderId?: string;

  @ApiPropertyOptional({ description: '用途（可选）' })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({ description: '持有期截止（可选）' })
  @IsOptional()
  @IsString()
  holdUntil?: string;
}

/**
 * 占用记录的属性更新：释放/结算抽象为状态迁移（URL 纯名词、无动词）。
 * status 为目标状态，服务端按目标分流到释放或结算的领域逻辑。
 */
export class UpdateReservationDto {
  @ApiProperty({ description: '目标状态（释放/结算）', enum: ['released', 'settled'] })
  @IsIn(['released', 'settled'])
  status: 'released' | 'settled';

  @ApiPropertyOptional({ description: '数量（缺省为全部剩余）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ description: '说明（可选）' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReleaseReservationDto {
  @ApiPropertyOptional({ description: '数量（缺省为全部剩余）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ description: '说明（可选）' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SettleReservationDto {
  @ApiPropertyOptional({ description: '数量（缺省为全部剩余）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ description: '说明（可选）' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateConsumptionDto {
  @ApiProperty({ description: '资源 ID' })
  @IsString()
  resourceId: string;

  @ApiProperty({ description: '数量' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ description: '去向类别', enum: ['manual', 'wear', 'event', 'builtin'] })
  @IsIn(['manual', 'wear', 'event', 'builtin'])
  sinkKind: string;

  @ApiPropertyOptional({ description: '说明（可选）' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: '幂等键（可选）' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

/** 占用记录列表筛选 */
export class ReservationListQuery extends ListQuery {
  @ApiPropertyOptional({ description: '按资源筛选' })
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiPropertyOptional({ description: '按状态筛选', enum: ['active', 'released', 'settled'] })
  @IsOptional()
  @IsIn(['active', 'released', 'settled'])
  status?: string;
}

/** 流转明细列表筛选 */
export class LedgerListQuery extends ListQuery {
  @ApiProperty({ description: '按资源筛选' })
  @IsString()
  resourceId: string;
}

/** 占用记录（响应） */
export class ReservationResponse {
  @ApiProperty({ description: 'ID' })
  id: string;

  @ApiProperty({ description: '资源 ID' })
  resourceId: string;

  @ApiProperty({ description: '占用数量' })
  amount: number;

  @ApiProperty({ description: '状态', enum: ['active', 'released', 'settled'] })
  status: string;

  @ApiPropertyOptional({ description: '持有人' })
  holderId?: string;

  @ApiPropertyOptional({ description: '用途' })
  purpose?: string;

  @ApiProperty({ description: '已释放数量' })
  releasedAmount: number;

  @ApiProperty({ description: '已结算数量' })
  settledAmount: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt: string;
}

/** 占用记录列表项：仅声明列表展示字段，列定义由文档投影到前端（运行时仍返回完整对象） */
export class ReservationListItem {
  @ApiProperty({ description: '占用数量' })
  amount: number;

  @ApiProperty({ description: '状态', enum: ['active', 'released', 'settled'] })
  status: string;

  @ApiProperty({ description: '已释放数量' })
  releasedAmount: number;

  @ApiProperty({ description: '已结算数量' })
  settledAmount: number;

  @ApiPropertyOptional({ description: '用途' })
  purpose?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;
}

export class ReservationListResponse {
  @ApiProperty({ description: '占用记录列表', type: [ReservationListItem] })
  list: ReservationListItem[];

  @ApiProperty({ description: '总数', type: 'integer' })
  total: number;
}

/** 注入记录（响应） */
export class CreationResponse {
  @ApiProperty({ description: 'ID' })
  id: string;

  @ApiProperty({ description: '资源 ID' })
  resourceId: string;

  @ApiProperty({ description: '数量' })
  amount: number;

  @ApiProperty({ description: '来源类别', enum: ['manual', 'timed', 'event', 'builtin'] })
  sourceKind: string;

  @ApiPropertyOptional({ description: '说明' })
  reason?: string;

  @ApiProperty({ description: '发生时间' })
  occurredAt: string;
}

/** 花费记录（响应） */
export class ConsumptionResponse {
  @ApiProperty({ description: 'ID' })
  id: string;

  @ApiProperty({ description: '资源 ID' })
  resourceId: string;

  @ApiProperty({ description: '数量' })
  amount: number;

  @ApiProperty({ description: '去向类别', enum: ['manual', 'wear', 'event', 'builtin'] })
  sinkKind: string;

  @ApiPropertyOptional({ description: '说明' })
  reason?: string;

  @ApiProperty({ description: '发生时间' })
  occurredAt: string;
}

/** 流转明细（响应） */
export class LedgerEntryResponse {
  @ApiProperty({ description: 'ID' })
  id: string;

  @ApiProperty({ description: '资源 ID' })
  resourceId: string;

  @ApiProperty({ description: '流转类型', enum: ['creation', 'reservation', 'release', 'settle', 'consumption'] })
  kind: string;

  @ApiProperty({ description: '数量' })
  amount: number;

  @ApiProperty({ description: '总量变化' })
  totalDelta: number;

  @ApiProperty({ description: '占用变化' })
  reservedDelta: number;

  @ApiProperty({ description: '消耗变化' })
  consumedDelta: number;

  @ApiPropertyOptional({ description: '说明' })
  reason?: string;

  @ApiProperty({ description: '发生时间' })
  occurredAt: string;
}

/** 流转明细列表项：仅声明列表展示字段，列定义由文档投影到前端（运行时仍返回完整对象） */
export class LedgerEntryListItem {
  @ApiProperty({ description: '流转类型', enum: ['creation', 'reservation', 'release', 'settle', 'consumption'] })
  kind: string;

  @ApiProperty({ description: '数量' })
  amount: number;

  @ApiProperty({ description: '总量变化' })
  totalDelta: number;

  @ApiProperty({ description: '占用变化' })
  reservedDelta: number;

  @ApiProperty({ description: '消耗变化' })
  consumedDelta: number;

  @ApiPropertyOptional({ description: '说明' })
  reason?: string;

  @ApiProperty({ description: '发生时间' })
  occurredAt: string;
}

export class LedgerEntryListResponse {
  @ApiProperty({ description: '流转明细列表', type: [LedgerEntryListItem] })
  list: LedgerEntryListItem[];

  @ApiProperty({ description: '总数', type: 'integer' })
  total: number;
}
