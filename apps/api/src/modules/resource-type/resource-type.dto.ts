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
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ListQuery } from '../../common/pagination';

export class CreateResourceTypeDto {
  /** 携带 templateId 时按模板派生（此时 mode 必填、code/name/domainId/unit 可为覆盖项） */
  @ApiPropertyOptional({ description: '内建模板 ID（携带时按模板派生）' })
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({ description: '派生模式（继承/改写）', enum: ['inherit', 'rewrite'] })
  @IsOptional()
  @IsIn(['inherit', 'rewrite'])
  mode?: 'inherit' | 'rewrite';

  @ApiProperty({ description: '编码（小写字母开头，仅含小写字母/数字/连字符）' })
  @ValidateIf((o: CreateResourceTypeDto) => !o.templateId)
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z][a-z0-9-]*$/, { message: '类型编码只能由小写字母、数字与连字符组成，且以字母开头' })
  code!: string;

  @ApiProperty({ description: '类型名称' })
  @ValidateIf((o: CreateResourceTypeDto) => !o.templateId)
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiProperty({ description: '归属领域 ID' })
  @ValidateIf((o: CreateResourceTypeDto) => !o.templateId)
  @IsString()
  domainId!: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: '计量单位' })
  @ValidateIf((o: CreateResourceTypeDto) => !o.templateId)
  @IsString()
  @Length(1, 20)
  unit!: string;

  @ApiPropertyOptional({ description: '数值精度' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  numericScale?: number;

  @ApiPropertyOptional({ description: '可分割' })
  @IsOptional()
  @IsBoolean()
  divisible?: boolean;

  @ApiPropertyOptional({ description: '允许负值' })
  @IsOptional()
  @IsBoolean()
  allowNegative?: boolean;

  @ApiPropertyOptional({ description: '自定义属性模式', type: 'array', items: { type: 'object' } })
  @IsOptional()
  @IsArray()
  attrSchema?: unknown[];

  @ApiPropertyOptional({ description: '来源类别', type: 'array', items: { type: 'string' } })
  @IsOptional()
  @IsArray()
  sourceKinds?: string[];

  @ApiPropertyOptional({ description: '去向类别', type: 'array', items: { type: 'string' } })
  @IsOptional()
  @IsArray()
  sinkKinds?: string[];

  @ApiPropertyOptional({ description: '推荐标签键', type: 'array', items: { type: 'string' } })
  @IsOptional()
  @IsArray()
  recommendedTagKeys?: string[];
}

export class UpdateResourceTypeDto {
  @ApiPropertyOptional({ description: '类型名称' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '数值精度' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  numericScale?: number;

  @ApiPropertyOptional({ description: '可分割' })
  @IsOptional()
  @IsBoolean()
  divisible?: boolean;

  @ApiPropertyOptional({ description: '允许负值' })
  @IsOptional()
  @IsBoolean()
  allowNegative?: boolean;

  @ApiPropertyOptional({ description: '计量单位' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  unit?: string;

  @ApiPropertyOptional({ description: '自定义属性模式', type: 'array', items: { type: 'object' } })
  @IsOptional()
  @IsArray()
  attrSchema?: unknown[];

  @ApiPropertyOptional({ description: '来源类别', type: 'array', items: { type: 'string' } })
  @IsOptional()
  @IsArray()
  sourceKinds?: string[];

  @ApiPropertyOptional({ description: '去向类别', type: 'array', items: { type: 'string' } })
  @IsOptional()
  @IsArray()
  sinkKinds?: string[];

  @ApiPropertyOptional({ description: '推荐标签键', type: 'array', items: { type: 'string' } })
  @IsOptional()
  @IsArray()
  recommendedTagKeys?: string[];

  @ApiPropertyOptional({ description: '状态', enum: ['active', 'disabled'] })
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}

export class UpdateBuiltinTemplateSettingDto {
  @ApiProperty({ description: '本空间是否启用' })
  @IsBoolean()
  enabled: boolean;
}

export class DeriveFromTemplateDto {
  @ApiProperty({ description: '归属领域 ID' })
  @IsString()
  domainId: string;

  @ApiProperty({ description: '派生模式', enum: ['inherit', 'rewrite'] })
  @IsIn(['inherit', 'rewrite'])
  mode: 'inherit' | 'rewrite';

  @ApiPropertyOptional({ description: '编码（默认沿用模板）' })
  @IsOptional()
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z][a-z0-9-]*$/, { message: '类型编码只能由小写字母、数字与连字符组成，且以字母开头' })
  code?: string;

  @ApiPropertyOptional({ description: '类型名称' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @ApiPropertyOptional({ description: '计量单位' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  unit?: string;

  @ApiPropertyOptional({ description: '数值精度' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  @Type(() => Number)
  numericScale?: number;

  @ApiPropertyOptional({ description: '可分割' })
  @IsOptional()
  @IsBoolean()
  divisible?: boolean;

  @ApiPropertyOptional({ description: '允许负值' })
  @IsOptional()
  @IsBoolean()
  allowNegative?: boolean;

  @ApiPropertyOptional({ description: '自定义属性模式', type: 'array', items: { type: 'object' } })
  @IsOptional()
  @IsArray()
  attrSchema?: unknown[];

  @ApiPropertyOptional({ description: '来源类别', type: 'array', items: { type: 'string' } })
  @IsOptional()
  @IsArray()
  sourceKinds?: string[];

  @ApiPropertyOptional({ description: '去向类别', type: 'array', items: { type: 'string' } })
  @IsOptional()
  @IsArray()
  sinkKinds?: string[];
}

/** 资源类型列表筛选 */
export class ResourceTypeListQuery extends ListQuery {
  @ApiPropertyOptional({ description: '按领域筛选' })
  @IsOptional()
  @IsString()
  domainId?: string;

  @ApiPropertyOptional({ description: '按状态筛选', enum: ['active', 'disabled'] })
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: string;
}

/** 资源类型（响应） */
export class ResourceTypeResponse {
  @ApiProperty({ description: 'ID' })
  id: string;

  @ApiProperty({ description: '空间 ID' })
  spaceId: string;

  @ApiProperty({ description: '归属领域 ID' })
  domainId: string;

  @ApiProperty({ description: '归属领域名称' })
  domainName: string;

  @ApiProperty({ description: '编码' })
  code: string;

  @ApiProperty({ description: '名称' })
  name: string;

  @ApiProperty({ description: '描述' })
  description: string;

  @ApiProperty({ description: '计量单位' })
  unit: string;

  @ApiProperty({ description: '数值精度' })
  numericScale: number;

  @ApiProperty({ description: '可分割' })
  divisible: boolean;

  @ApiProperty({ description: '允许负值' })
  allowNegative: boolean;

  @ApiProperty({ description: '来源', enum: ['custom', 'builtin-inherited', 'builtin-rewritten'] })
  origin: string;

  @ApiProperty({ description: '状态', enum: ['active', 'disabled'] })
  status: string;

  @ApiProperty({ description: '是否已被实例使用' })
  inUse: boolean;

  @ApiProperty({ description: '实例数' })
  resourceCount: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt: string;
}

/** 资源类型列表项：仅声明列表展示字段，列定义由文档投影到前端（运行时仍返回完整对象） */
export class ResourceTypeListItem {
  @ApiProperty({ description: '类型名称' })
  name: string;

  @ApiProperty({ description: '编码' })
  code: string;

  @ApiProperty({ description: '归属领域名称' })
  domainName: string;

  @ApiProperty({ description: '计量单位' })
  unit: string;

  @ApiProperty({ description: '来源', enum: ['custom', 'builtin-inherited', 'builtin-rewritten'] })
  origin: string;

  @ApiProperty({ description: '状态', enum: ['active', 'disabled'] })
  status: string;

  @ApiProperty({ description: '自定义字段数' })
  fieldCount: number;

  @ApiProperty({ description: '实例数' })
  resourceCount: number;
}

export class ResourceTypeListResponse {
  @ApiProperty({ description: '资源类型列表', type: [ResourceTypeListItem] })
  list: ResourceTypeListItem[];

  @ApiProperty({ description: '总数', type: 'integer' })
  total: number;
}

/** 内建模板（响应） */
export class BuiltinTemplateResponse {
  @ApiProperty({ description: 'ID' })
  id: string;

  @ApiProperty({ description: '编码' })
  code: string;

  @ApiProperty({ description: '名称' })
  name: string;

  @ApiProperty({ description: '描述' })
  description: string;

  @ApiProperty({ description: '计量单位' })
  unit: string;

  @ApiProperty({ description: '本空间是否启用' })
  enabled: boolean;
}

export class BuiltinTemplateListResponse {
  @ApiProperty({ description: '模板列表', type: [BuiltinTemplateResponse] })
  list: BuiltinTemplateResponse[];

  @ApiProperty({ description: '总数', type: 'integer' })
  total: number;
}
