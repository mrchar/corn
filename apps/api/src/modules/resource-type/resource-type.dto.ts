import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateResourceTypeDto {
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z][a-z0-9-]*$/, { message: '类型编码只能由小写字母、数字与连字符组成，且以字母开头' })
  code: string;

  @IsString()
  @Length(1, 60)
  name: string;

  @IsString()
  domainId: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @Length(1, 20)
  unit: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  numericScale?: number;

  @IsOptional()
  @IsBoolean()
  divisible?: boolean;

  @IsOptional()
  @IsBoolean()
  allowNegative?: boolean;

  @IsOptional()
  @IsArray()
  attrSchema?: unknown[];

  @IsOptional()
  @IsArray()
  sourceKinds?: string[];

  @IsOptional()
  @IsArray()
  sinkKinds?: string[];

  @IsOptional()
  @IsArray()
  recommendedTagKeys?: string[];
}

export class UpdateResourceTypeDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  numericScale?: number;

  @IsOptional()
  @IsBoolean()
  divisible?: boolean;

  @IsOptional()
  @IsBoolean()
  allowNegative?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  unit?: string;

  @IsOptional()
  @IsArray()
  attrSchema?: unknown[];

  @IsOptional()
  @IsArray()
  sourceKinds?: string[];

  @IsOptional()
  @IsArray()
  sinkKinds?: string[];

  @IsOptional()
  @IsArray()
  recommendedTagKeys?: string[];

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}

export class UpdateBuiltinTemplateSettingDto {
  @IsBoolean()
  enabled: boolean;
}

export class DeriveFromTemplateDto {
  @IsString()
  domainId: string;

  @IsIn(['inherit', 'rewrite'])
  mode: 'inherit' | 'rewrite';

  @IsOptional()
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z][a-z0-9-]*$/, { message: '类型编码只能由小写字母、数字与连字符组成，且以字母开头' })
  code?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  unit?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  @Type(() => Number)
  numericScale?: number;

  @IsOptional()
  @IsBoolean()
  divisible?: boolean;

  @IsOptional()
  @IsBoolean()
  allowNegative?: boolean;

  @IsOptional()
  @IsArray()
  attrSchema?: unknown[];

  @IsOptional()
  @IsArray()
  sourceKinds?: string[];

  @IsOptional()
  @IsArray()
  sinkKinds?: string[];
}
