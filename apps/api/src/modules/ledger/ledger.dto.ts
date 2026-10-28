import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCreationDto {
  @IsString()
  resourceId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @IsIn(['manual', 'timed', 'event', 'builtin'])
  sourceKind: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class CreateReservationDto {
  @IsString()
  resourceId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  holderId?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  holdUntil?: string;
}

export class ReleaseReservationDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class SettleReservationDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateConsumptionDto {
  @IsString()
  resourceId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @IsIn(['manual', 'wear', 'event', 'builtin'])
  sinkKind: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
