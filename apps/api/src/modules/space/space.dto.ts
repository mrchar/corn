import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateSpaceDto {
  @ApiProperty({ description: '编码（小写字母开头，仅含小写字母/数字/连字符）' })
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z][a-z0-9-]*$/, { message: '空间编码只能由小写字母、数字与连字符组成，且以字母开头' })
  code: string;

  @ApiProperty({ description: '名称' })
  @IsString()
  @Length(1, 60)
  name: string;
}

export class UpdateSpaceDto {
  @ApiPropertyOptional({ description: '名称' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @ApiPropertyOptional({ description: '是否使用领域' })
  @IsOptional()
  @IsBoolean()
  enableDomain?: boolean;

  @ApiPropertyOptional({ description: '是否使用群组' })
  @IsOptional()
  @IsBoolean()
  enableGroup?: boolean;
}

/** 空间资源（响应） */
export class SpaceResponse {
  @ApiProperty({ description: 'ID' })
  id: string;

  @ApiProperty({ description: '编码' })
  code: string;

  @ApiProperty({ description: '名称' })
  name: string;

  @ApiProperty({ description: '是否使用领域' })
  enableDomain: boolean;

  @ApiProperty({ description: '是否使用群组' })
  enableGroup: boolean;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt: string;
}

/** 空间列表项：仅声明列表展示字段，列定义由文档投影到前端（运行时仍返回完整对象） */
export class SpaceListItem {
  @ApiProperty({ description: '编码' })
  code: string;

  @ApiProperty({ description: '名称' })
  name: string;

  @ApiProperty({ description: '是否使用领域' })
  enableDomain: boolean;

  @ApiProperty({ description: '是否使用群组' })
  enableGroup: boolean;
}

export class SpaceListResponse {
  @ApiProperty({ description: '空间列表', type: [SpaceListItem] })
  list: SpaceListItem[];

  @ApiProperty({ description: '总数', type: 'integer' })
  total: number;
}
